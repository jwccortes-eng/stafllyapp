/**
 * StaflyCalmProcessingBanner — Premium calming processing state.
 *
 * Reusable component for long/important loading states. Communicates safety:
 * "Todo está bien con Stafly." Uses night-sky gradient + soft stars + glow.
 *
 * Variants:
 *  - inline (default): page-level banner card
 *  - compact: small inline pill for cards/rows
 *  - fullScreen: blocking overlay for long actions
 *
 * Accessibility:
 *  - role="status" + aria-live="polite" for processing/waiting
 *  - role="alert" + aria-live="assertive" for error
 *  - Respects prefers-reduced-motion (disables shimmer/twinkle)
 */
import { useMemo } from "react";
import { Shield, Sparkles, Lock, CheckCircle2, AlertTriangle, Hourglass } from "lucide-react";
import staflyIcon from "@/assets/stafly-app-icon-new.png";
import { cn } from "@/lib/utils";

export type StaflyCalmStatus = "processing" | "success" | "waiting" | "error";
export type StaflyCalmVariant = "inline" | "card" | "overlay" | "compact";

export interface StaflyCalmProcessingBannerProps {
  title?: string;
  message?: string;
  status?: StaflyCalmStatus;
  /** Preferred API. Defaults to "card". Use "compact" for inline pills, "overlay" for blocking actions, "inline" for minimal in-flow indicator. */
  variant?: StaflyCalmVariant;
  /** @deprecated use variant="compact" */
  compact?: boolean;
  /** @deprecated use variant="overlay" */
  fullScreen?: boolean;
  showLogo?: boolean;
  progress?: number | null;
  footerNote?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const DEFAULTS = {
  title: "Procesando con Stafly",
  message: "Todo está bien. Estamos preparando la información de forma segura.",
  footerNote: "Puedes continuar tranquilo; no estamos cambiando datos sin confirmación.",
};

/** Deterministic star field — no randomness on re-render */
const STARS = Array.from({ length: 28 }).map((_, i) => {
  const seed = (i * 9301 + 49297) % 233280;
  const r = seed / 233280;
  const r2 = ((i * 1103515245 + 12345) % 2147483647) / 2147483647;
  return {
    top: `${(r * 100).toFixed(2)}%`,
    left: `${(r2 * 100).toFixed(2)}%`,
    size: r > 0.85 ? 2.5 : r > 0.5 ? 1.5 : 1,
    delay: `${(r2 * 4).toFixed(2)}s`,
    opacity: 0.35 + r * 0.55,
  };
});

function StarField({ density = 1 }: { density?: number }) {
  const count = Math.floor(STARS.length * density);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {STARS.slice(0, count).map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white motion-safe:animate-pulse"
          style={{
            top: s.top,
            left: s.left,
            width: `${s.size}px`,
            height: `${s.size}px`,
            opacity: s.opacity,
            animationDelay: s.delay,
            animationDuration: "3.5s",
            boxShadow: "0 0 6px rgba(255,255,255,0.6)",
          }}
        />
      ))}
    </div>
  );
}

function StatusIcon({ status }: { status: StaflyCalmStatus }) {
  const map = {
    processing: Hourglass,
    waiting: Hourglass,
    success: CheckCircle2,
    error: AlertTriangle,
  };
  const Icon = map[status];
  return <Icon className="h-3.5 w-3.5" aria-hidden="true" />;
}

const statusLabel: Record<StaflyCalmStatus, string> = {
  processing: "Procesando",
  waiting: "En espera",
  success: "Listo",
  error: "Atención",
};

const statusAccent: Record<StaflyCalmStatus, string> = {
  processing: "from-sky-400/30 to-indigo-500/20",
  waiting: "from-amber-300/25 to-purple-500/20",
  success: "from-emerald-400/30 to-sky-500/20",
  error: "from-rose-400/30 to-orange-500/20",
};

export default function StaflyCalmProcessingBanner({
  title,
  message,
  status = "processing",
  variant,
  compact = false,
  fullScreen = false,
  showLogo = true,
  progress = null,
  footerNote,
  actionLabel,
  onAction,
  className,
}: StaflyCalmProcessingBannerProps) {
  // Resolve effective variant (back-compat with compact/fullScreen)
  const effectiveVariant: StaflyCalmVariant =
    variant ?? (fullScreen ? "overlay" : compact ? "compact" : "card");

  const finalTitle = title ?? DEFAULTS.title;
  const finalMessage = message ?? DEFAULTS.message;
  const finalFooter = footerNote ?? (effectiveVariant === "card" || effectiveVariant === "overlay" ? DEFAULTS.footerNote : undefined);

  const ariaProps = useMemo(
    () =>
      status === "error"
        ? { role: "alert" as const, "aria-live": "assertive" as const }
        : { role: "status" as const, "aria-live": "polite" as const },
    [status]
  );

  // ─── INLINE (minimal in-flow loader, NOT a splash) ────────
  if (effectiveVariant === "inline") {
    return (
      <div
        {...ariaProps}
        className={cn(
          "flex items-center gap-2.5 text-sm text-muted-foreground print:hidden",
          className
        )}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="font-medium text-foreground/90">{finalTitle}</span>
        {message && <span className="hidden sm:inline text-muted-foreground/80">· {finalMessage}</span>}
      </div>
    );
  }

  // ─── COMPACT (pill, premium gradient — for action chips) ──
  if (effectiveVariant === "compact") {
    return (
      <div
        {...ariaProps}
        className={cn(
          "relative inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5",
          "bg-gradient-to-r from-[#0b1437] via-[#1a1f4d] to-[#2a1b54]",
          "border border-white/10 text-white shadow-[0_4px_20px_-8px_rgba(56,109,255,0.5)]",
          "overflow-hidden print:hidden",
          className
        )}
      >
        <span className="absolute inset-0 bg-gradient-to-r opacity-60 motion-safe:animate-pulse"
              style={{ animationDuration: "3s" }} aria-hidden="true">
          <span className={cn("absolute inset-0 bg-gradient-to-r", statusAccent[status])} />
        </span>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-sky-300 opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
        </span>
        <span className="relative text-[12px] font-medium tracking-tight">{finalTitle}</span>
      </div>
    );
  }

  // ─── BANNER CONTENT ───────────────────────────────────────
  const content = (
    <div
      {...ariaProps}
      className={cn(
        "relative w-full overflow-hidden rounded-2xl print:hidden",
        "bg-gradient-to-br from-[#070b24] via-[#121a4a] to-[#3a1d63]",
        "border border-white/10",
        "shadow-[0_20px_60px_-20px_rgba(56,109,255,0.55),0_0_120px_-40px_rgba(150,80,255,0.4)_inset]",
        effectiveVariant === "overlay" ? "max-w-lg" : "",
        className
      )}
    >
      {/* glow blobs */}
      <div className="pointer-events-none absolute -top-24 -left-20 h-64 w-64 rounded-full bg-sky-500/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" aria-hidden="true" />
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-tr opacity-60", statusAccent[status])} aria-hidden="true" />

      <StarField />

      {/* shimmer sweep */}
      <div
        className="pointer-events-none absolute inset-0 motion-safe:animate-[shimmer_4.5s_ease-in-out_infinite] opacity-40"
        style={{
          background:
            "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)",
          backgroundSize: "200% 100%",
        }}
        aria-hidden="true"
      />
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      <div className="relative px-6 py-7 sm:px-8 sm:py-9 text-white text-center">
        {/* logo / shield */}
        {showLogo && (
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 shadow-[0_0_40px_-8px_rgba(120,180,255,0.6)] motion-safe:animate-pulse"
               style={{ animationDuration: "3.2s" }}>
            <img src={staflyIcon} alt="" className="h-10 w-10 object-contain" aria-hidden="true" />
          </div>
        )}

        {/* status pill */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] mb-3">
          <StatusIcon status={status} />
          {statusLabel[status]}
        </div>

        <h3 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">{finalTitle}</h3>
        <p className="mt-2 text-sm sm:text-[15px] text-white/75 max-w-md mx-auto leading-relaxed">
          {finalMessage}
        </p>

        {/* progress */}
        {typeof progress === "number" && (
          <div className="mt-5 max-w-sm mx-auto">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-300 via-indigo-300 to-fuchsia-300 transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-white/60 tabular-nums">{Math.round(progress)}%</div>
          </div>
        )}

        {/* trust chips */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-white/70">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2.5 py-1">
            <Sparkles className="h-3 w-3" aria-hidden="true" /> Tranquilidad
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2.5 py-1">
            <Lock className="h-3 w-3" aria-hidden="true" /> Seguridad
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2.5 py-1">
            <Shield className="h-3 w-3" aria-hidden="true" /> Control
          </span>
        </div>

        {finalFooter && (
          <p className="mt-5 text-[11px] text-white/55 max-w-md mx-auto leading-relaxed border-t border-white/10 pt-4">
            {finalFooter}
          </p>
        )}

        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/15 transition border border-white/15 px-4 py-1.5 text-xs font-semibold backdrop-blur-sm"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );

  // ─── FULLSCREEN OVERLAY ───────────────────────────────────
  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#04061a]/80 backdrop-blur-md motion-safe:animate-fade-in"
        aria-modal="true"
      >
        {content}
      </div>
    );
  }

  return content;
}
