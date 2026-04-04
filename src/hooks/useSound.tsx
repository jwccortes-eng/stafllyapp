import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { toast } from "sonner";

type SoundType = "notification" | "chat" | "alert";

interface SoundContextValue {
  isUnlocked: boolean;
  play: (type: SoundType) => void;
}

const SoundContext = createContext<SoundContextValue>({ isUnlocked: false, play: () => {} });

export function useSoundContext() {
  return useContext(SoundContext);
}

// Tone definitions per type
const TONES: Record<SoundType, { freqs: number[]; durations: number[]; gaps: number[]; volume: number }> = {
  notification: {
    freqs: [660, 880],
    durations: [0.08, 0.12],
    gaps: [0, 0.1],
    volume: 0.3,
  },
  chat: {
    freqs: [523, 659],
    durations: [0.06, 0.1],
    gaps: [0, 0.08],
    volume: 0.35,
  },
  alert: {
    freqs: [880, 1109, 1319],
    durations: [0.1, 0.1, 0.18],
    gaps: [0, 0.12, 0.24],
    volume: 0.55,
  },
};

function playTones(ctx: AudioContext, type: SoundType) {
  const cfg = TONES[type];
  const now = ctx.currentTime;

  cfg.freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = "sine";
    const start = now + cfg.gaps[i];
    const dur = cfg.durations[i];
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(cfg.volume, start + 0.015);
    gain.gain.setValueAtTime(cfg.volume, start + dur * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.start(start);
    osc.stop(start + dur);
  });
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const promptShownRef = useRef(false);

  // Unlock on first user interaction
  useEffect(() => {
    const unlock = () => {
      if (ctxRef.current) return;
      try {
        const ctx = new AudioContext();
        // Play silent buffer to fully unlock
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        ctxRef.current = ctx;
        setIsUnlocked(true);
      } catch {
        // AudioContext not available
      }
    };

    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  const play = useCallback((type: SoundType) => {
    const ctx = ctxRef.current;
    if (!ctx) {
      // Show fallback prompt once
      if (!promptShownRef.current) {
        promptShownRef.current = true;
        toast("🔇 Sonido desactivado", {
          description: "Haz click en cualquier parte para activar alertas sonoras",
          duration: 6000,
          action: {
            label: "Activar",
            onClick: () => {
              try {
                const newCtx = new AudioContext();
                const buf = newCtx.createBuffer(1, 1, 22050);
                const src = newCtx.createBufferSource();
                src.buffer = buf;
                src.connect(newCtx.destination);
                src.start(0);
                ctxRef.current = newCtx;
                setIsUnlocked(true);
                toast.success("🔊 Sonido activado");
              } catch { /* ignore */ }
            },
          },
        });
      }
      return;
    }

    // Resume if suspended
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    playTones(ctx, type);
  }, []);

  return (
    <SoundContext.Provider value={{ isUnlocked, play }}>
      {children}
    </SoundContext.Provider>
  );
}
