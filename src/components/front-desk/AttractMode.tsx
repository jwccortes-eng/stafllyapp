/**
 * AttractMode — Premium idle / attract screen for the Front Desk kiosk.
 *
 * Shown when the kiosk has been idle for a while. Designed to look great on
 * a reception tablet or TV: animated branded background, looping caption,
 * and "tap anywhere to start" hint. Any user interaction dismisses it.
 *
 * NOTE: when a real attract video file is available, drop it at
 *   /attract/front-desk-loop.mp4
 * and the component will play it automatically; otherwise the animated
 * gradient fallback is used.
 */
import { useEffect, useRef, useState } from "react";
import { Sparkles, Hand } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { FrontDeskAttractGallery } from "@/components/front-desk/FrontDeskArtwork";

interface AttractModeProps {
  onDismiss: () => void;
  lang?: "es" | "en";
  videoSrc?: string;
}

const COPY = {
  es: {
    title: "Bienvenido",
    sub: "Estamos aquí para ayudarte",
    rotating: [
      "Actualiza tus datos",
      "Consulta tus pagos",
      "Deja una solicitud",
      "Revisa tus pendientes",
    ],
    tap: "Toca la pantalla para comenzar",
    brand: "Stafly Front Desk",
  },
  en: {
    title: "Welcome",
    sub: "We're here to help",
    rotating: [
      "Update your info",
      "Check your payments",
      "Leave a request",
      "Review pending items",
    ],
    tap: "Tap the screen to start",
    brand: "Stafly Front Desk",
  },
};

export function AttractMode({
  onDismiss,
  lang = "es",
  videoSrc = "/attract/front-desk-loop.mp4",
}: AttractModeProps) {
  const t = COPY[lang];
  const [rotIndex, setRotIndex] = useState(0);
  const [videoOk, setVideoOk] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Rotate captions every 3.5s
  useEffect(() => {
    const id = setInterval(
      () => setRotIndex((i) => (i + 1) % t.rotating.length),
      3500
    );
    return () => clearInterval(id);
  }, [t.rotating.length]);

  // Try to autoplay the video; if it fails or 404s, fall back gracefully.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = async () => {
      try {
        await v.play();
      } catch {
        // muted autoplay should always work; if not, hide video element
        setVideoOk(false);
      }
    };
    tryPlay();
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onDismiss}
      onKeyDown={onDismiss}
      onTouchStart={onDismiss}
      onPointerDown={onDismiss}
      className="fixed inset-0 z-50 cursor-pointer overflow-hidden bg-background"
      aria-label={t.tap}
    >
      <FrontDeskAttractGallery activeIndex={rotIndex} />

      {/* Background video (optional) */}
      {videoOk && (
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          loop
          playsInline
          autoPlay
          onError={() => setVideoOk(false)}
          className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-screen"
        />
      )}

      {/* Animated gradient fallback / overlay layer */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/18 via-background/70 to-accent/10" />
      <div className="absolute inset-0 opacity-70">
        <div className="absolute -top-32 -left-32 h-[36rem] w-[36rem] rounded-full bg-primary/30 blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-32 -right-32 h-[36rem] w-[36rem] rounded-full bg-primary/20 blur-3xl animate-pulse"
          style={{ animationDelay: "1.5s" }}
        />
        <div
          className="absolute top-1/2 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl animate-pulse"
          style={{ animationDelay: "0.7s" }}
        />
      </div>

      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 flex items-center gap-3 rounded-full border border-border/60 bg-card/55 px-5 py-2 backdrop-blur-md shadow-sm">
          <StaflyLogo size={22} />
          <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            {t.brand}
          </span>
        </div>

        <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary/60 shadow-2xl shadow-primary/40">
          <Sparkles className="h-12 w-12 text-primary-foreground animate-pulse" />
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-4 bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
          {t.title}
        </h1>
        <p className="text-xl sm:text-2xl text-muted-foreground mb-12 max-w-xl">
          {t.sub}
        </p>

        {/* Rotating caption */}
        <div className="h-12 mb-12 overflow-hidden">
          <p
            key={rotIndex}
            className="text-lg sm:text-xl font-medium text-primary animate-in fade-in slide-in-from-bottom-4 duration-700"
          >
            ✦ {t.rotating[rotIndex]}
          </p>
        </div>

        {/* Tap hint */}
        <div className="inline-flex items-center gap-3 rounded-full border-2 border-primary/30 bg-card/45 px-6 py-3 backdrop-blur-md shadow-lg">
          <Hand className="h-5 w-5 text-primary animate-bounce" />
          <span className="text-sm sm:text-base font-semibold">{t.tap}</span>
        </div>
      </div>

      {/* Bottom branding bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-muted-foreground/70">
        Powered by StaflyApps · staflyapps.com
      </div>
    </div>
  );
}

export default AttractMode;
