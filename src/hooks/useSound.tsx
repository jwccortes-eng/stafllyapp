import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

type SoundType = "notification" | "chat" | "alert";
type SoundStatus = "active" | "blocked" | "disabled";

interface SoundContextValue {
  isUnlocked: boolean;
  isEnabled: boolean;
  status: SoundStatus;
  play: (type: SoundType, options?: { ignoreCooldown?: boolean }) => Promise<boolean>;
  unlockAudio: (options?: { source?: string }) => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<void>;
  testSound: (type?: SoundType) => Promise<boolean>;
}

const SOUND_ENABLED_KEY = "stafly.sound.enabled";
const SOUND_PROMPT_KEY = "stafly.sound.prompt-shown";

const SoundContext = createContext<SoundContextValue>({
  isUnlocked: false,
  isEnabled: false,
  status: "disabled",
  play: async () => false,
  unlockAudio: async () => false,
  setEnabled: async () => {},
  testSound: async () => false,
});

export function useSoundContext() {
  return useContext(SoundContext);
}

const TONES: Record<SoundType, { freqs: number[]; durations: number[]; gaps: number[]; volume: number }> = {
  notification: {
    freqs: [660, 880],
    durations: [0.08, 0.12],
    gaps: [0, 0.08],
    volume: 0.3,
  },
  chat: {
    freqs: [523, 659],
    durations: [0.06, 0.1],
    gaps: [0, 0.06],
    volume: 0.36,
  },
  alert: {
    freqs: [880, 1109, 1319],
    durations: [0.12, 0.12, 0.2],
    gaps: [0, 0.06, 0.12],
    volume: 0.62,
  },
};

const AUDIO_FILES: Record<SoundType, string> = {
  notification: "/notification.mp3",
  chat: "/chat.mp3",
  alert: "/alert.mp3",
};

const AUDIO_VOLUMES: Record<SoundType, number> = {
  notification: 0.55,
  chat: 0.65,
  alert: 1,
};

function logSound(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.info(message);
    return;
  }

  console.info(message, payload);
}

function playTones(ctx: AudioContext, type: SoundType) {
  const cfg = TONES[type];
  const now = ctx.currentTime;

  cfg.freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type === "alert" ? "triangle" : "sine";

    const start = now + cfg.gaps[i];
    const dur = cfg.durations[i];
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(cfg.volume, start + 0.015);
    gain.gain.setValueAtTime(cfg.volume, start + dur * 0.55);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

    osc.start(start);
    osc.stop(start + dur);
  });
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const storedEnabled = typeof window !== "undefined" ? window.localStorage.getItem(SOUND_ENABLED_KEY) : null;
  const [isEnabled, setIsEnabledState] = useState(storedEnabled === "true");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [status, setStatus] = useState<SoundStatus>(storedEnabled === "true" ? "blocked" : "disabled");

  const ctxRef = useRef<AudioContext | null>(null);
  const promptShownRef = useRef(typeof window !== "undefined" && window.localStorage.getItem(SOUND_PROMPT_KEY) === "true");
  const htmlAudioRef = useRef<Record<SoundType, HTMLAudioElement | null>>({
    notification: null,
    chat: null,
    alert: null,
  });
  const lastPlayRef = useRef<{ type: SoundType; at: number } | null>(null);
  const explicitDisableRef = useRef(storedEnabled === "false");

  const ensureAudioContext = useCallback(async (source: string) => {
    if (typeof window === "undefined") return null;

    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) {
      logSound("play blocked / failed", { source, reason: "AudioContext unavailable" });
      return null;
    }

    if (!ctxRef.current) {
      ctxRef.current = new AudioContextCtor();
      logSound("audio context state", { source, state: ctxRef.current.state });
    }

    if (ctxRef.current.state === "suspended") {
      try {
        await ctxRef.current.resume();
      } catch (error) {
        logSound("play blocked / failed", { source, reason: "resume failed", error });
      }
    }

    logSound("audio context state", { source, state: ctxRef.current.state });
    return ctxRef.current;
  }, []);

  const primeHtmlAudio = useCallback(async () => {
    const results = await Promise.all(
      (Object.entries(htmlAudioRef.current) as Array<[SoundType, HTMLAudioElement | null]>).map(async ([type, audio]) => {
        if (!audio) return false;

        try {
          audio.muted = true;
          audio.currentTime = 0;
          await audio.play();
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          return true;
        } catch (error) {
          audio.muted = false;
          logSound("play blocked / failed", { type, reason: "html audio prime failed", error });
          return false;
        }
      }),
    );

    return results.some(Boolean);
  }, []);

  const showBlockedToast = useCallback(() => {
    if (promptShownRef.current) return;

    promptShownRef.current = true;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SOUND_PROMPT_KEY, "true");
    }

    toast("Activa sonido para recibir alertas", {
      description: "El navegador está bloqueando el audio o aún no se desbloqueó.",
      duration: 7000,
    });
  }, []);

  const playViaWebAudio = useCallback(async (type: SoundType) => {
    const ctx = await ensureAudioContext(`play:${type}`);
    if (!ctx || ctx.state !== "running") return false;

    try {
      playTones(ctx, type);
      return true;
    } catch (error) {
      logSound("play blocked / failed", { type, reason: "web audio failed", error });
      return false;
    }
  }, [ensureAudioContext]);

  const playViaHtmlAudio = useCallback(async (type: SoundType) => {
    const audio = htmlAudioRef.current[type];
    if (!audio) return false;

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = AUDIO_VOLUMES[type];
      audio.muted = false;
      await audio.play();
      return true;
    } catch (error) {
      logSound("play blocked / failed", { type, reason: "html audio failed", error });
      return false;
    }
  }, []);

  const unlockAudio = useCallback(async ({ source = "manual" }: { source?: string } = {}) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SOUND_ENABLED_KEY, "true");
    }

    explicitDisableRef.current = false;
    setIsEnabledState(true);

    const ctx = await ensureAudioContext(source);
    const htmlPrimed = await primeHtmlAudio();
    const unlocked = ctx?.state === "running" || htmlPrimed;

    setIsUnlocked(unlocked);
    setStatus(unlocked ? "active" : "blocked");

    if (unlocked) {
      logSound("audio unlocked", { source, ctxState: ctx?.state ?? "none", htmlPrimed });
    } else {
      logSound("play blocked / failed", { source, reason: "unlock incomplete", ctxState: ctx?.state ?? "none" });
      showBlockedToast();
    }

    return unlocked;
  }, [ensureAudioContext, primeHtmlAudio, showBlockedToast]);

  const play = useCallback(async (type: SoundType, options?: { ignoreCooldown?: boolean }) => {
    logSound(`play requested: ${type}`);
    logSound("audio context state", ctxRef.current?.state ?? "none");

    if (!isEnabled || explicitDisableRef.current) {
      setStatus("disabled");
      logSound("play blocked / failed", { type, reason: "disabled by user" });
      return false;
    }

    const now = Date.now();
    const last = lastPlayRef.current;
    if (!options?.ignoreCooldown && last) {
      const elapsed = now - last.at;
      if (elapsed < 450 && (last.type === type || type !== "alert")) {
        return false;
      }
    }

    const webOk = await playViaWebAudio(type);
    const htmlOk = webOk ? false : await playViaHtmlAudio(type);
    const played = webOk || htmlOk;

    if (played) {
      lastPlayRef.current = { type, at: now };
      setIsUnlocked(true);
      setStatus("active");
      return true;
    }

    setIsUnlocked(false);
    setStatus("blocked");
    showBlockedToast();
    return false;
  }, [isEnabled, playViaHtmlAudio, playViaWebAudio, showBlockedToast]);

  const testSound = useCallback(async (type: SoundType = "notification") => {
    if (!isEnabled || explicitDisableRef.current) {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SOUND_ENABLED_KEY, "true");
      }
      explicitDisableRef.current = false;
      setIsEnabledState(true);
    }

    await unlockAudio({ source: `test:${type}` });
    return play(type, { ignoreCooldown: true });
  }, [isEnabled, play, unlockAudio]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    setIsEnabledState(enabled);
    explicitDisableRef.current = !enabled;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
    }

    if (!enabled) {
      setStatus("disabled");
      return;
    }

    await unlockAudio({ source: "toggle-enable" });
  }, [unlockAudio]);

  useEffect(() => {
    logSound("sound provider mounted", { storedEnabled });

    (Object.entries(AUDIO_FILES) as Array<[SoundType, string]>).forEach(([type, src]) => {
      const audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = AUDIO_VOLUMES[type];
      htmlAudioRef.current[type] = audio;
    });

    const handleGesture = () => {
      if (explicitDisableRef.current) return;
      void unlockAudio({ source: "global-gesture" });
    };

    document.addEventListener("pointerdown", handleGesture, { passive: true });
    document.addEventListener("keydown", handleGesture);
    document.addEventListener("touchstart", handleGesture, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", handleGesture);
      document.removeEventListener("keydown", handleGesture);
      document.removeEventListener("touchstart", handleGesture);
    };
  }, [storedEnabled, unlockAudio]);

  const value = useMemo<SoundContextValue>(() => ({
    isUnlocked,
    isEnabled,
    status,
    play,
    unlockAudio,
    setEnabled,
    testSound,
  }), [isEnabled, isUnlocked, play, setEnabled, status, testSound, unlockAudio]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}
