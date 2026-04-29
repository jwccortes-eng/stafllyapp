/**
 * NextBestActionCard — single dynamic action card at the top of the portal Home.
 *
 * Pure presentational. Receives the result of `selectNextBestAction` and renders
 * a tone-aware card with primary + optional secondary CTA.
 */
import { Link } from "react-router-dom";
import {
  ArrowRight, ChevronRight, Clock, LogIn, LogOut, AlertTriangle,
  FileWarning, CalendarClock, HandMetal, Sparkles, CheckCircle2,
} from "lucide-react";
import type { NbaKind, NbaResult, NbaTone } from "@/lib/portal/next-best-action";
import { cn } from "@/lib/utils";
import { formatDisplayName } from "@/lib/format-helpers";

const toneStyles: Record<NbaTone, { wrap: string; iconWrap: string; icon: string; cta: string; subtle: string }> = {
  live: {
    wrap: "bg-[hsl(var(--status-confirmed)/0.06)] border-2 border-[hsl(var(--status-confirmed)/0.22)] shadow-[0_4px_24px_-10px_hsl(var(--status-confirmed)/0.35)]",
    iconWrap: "bg-[hsl(var(--status-confirmed)/0.14)]",
    icon: "text-[hsl(var(--status-confirmed))]",
    cta: "bg-[hsl(var(--status-confirmed))] text-white hover:bg-[hsl(var(--status-confirmed))]/90",
    subtle: "border-[hsl(var(--status-confirmed)/0.25)] text-[hsl(var(--status-confirmed))] hover:bg-[hsl(var(--status-confirmed)/0.08)]",
  },
  primary: {
    wrap: "bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-card border-2 border-primary/22 shadow-[0_4px_24px_-10px_hsl(var(--primary)/0.3)]",
    iconWrap: "bg-primary/15",
    icon: "text-primary",
    cta: "bg-primary text-primary-foreground hover:bg-primary/90",
    subtle: "border-primary/25 text-primary hover:bg-primary/8",
  },
  warning: {
    wrap: "bg-[hsl(var(--status-pending)/0.07)] border-2 border-[hsl(var(--status-pending)/0.22)] shadow-sm",
    iconWrap: "bg-[hsl(var(--status-pending)/0.14)]",
    icon: "text-[hsl(var(--status-pending))]",
    cta: "bg-[hsl(var(--status-pending))] text-white hover:bg-[hsl(var(--status-pending))]/90",
    subtle: "border-[hsl(var(--status-pending)/0.3)] text-[hsl(var(--status-pending))] hover:bg-[hsl(var(--status-pending)/0.06)]",
  },
  deduction: {
    wrap: "bg-deduction/[0.06] border-2 border-deduction/22 shadow-sm",
    iconWrap: "bg-deduction/14",
    icon: "text-deduction",
    cta: "bg-deduction text-white hover:bg-deduction/90",
    subtle: "border-deduction/25 text-deduction hover:bg-deduction/8",
  },
  neutral: {
    wrap: "bg-card border border-border/40 shadow-sm",
    iconWrap: "bg-muted/60",
    icon: "text-muted-foreground",
    cta: "bg-foreground text-background hover:bg-foreground/90",
    subtle: "border-border/50 text-foreground hover:bg-muted/40",
  },
  success: {
    wrap: "bg-earning/[0.05] border border-earning/20 shadow-sm",
    iconWrap: "bg-earning/12",
    icon: "text-earning",
    cta: "bg-earning text-white hover:bg-earning/90",
    subtle: "border-earning/25 text-earning hover:bg-earning/8",
  },
};

const iconByKind: Record<NbaKind, React.ComponentType<{ className?: string }>> = {
  clocked_in: LogOut,
  clock_in_now: LogIn,
  confirm_shift: AlertTriangle,
  next_shift_today: Clock,
  missing_docs: FileWarning,
  missing_profile: AlertTriangle,
  next_shift_future: CalendarClock,
  claim_available: HandMetal,
  all_set: Sparkles,
};

interface Props {
  nba: NbaResult;
}

export function NextBestActionCard({ nba }: Props) {
  const tone = toneStyles[nba.tone];
  const Icon = iconByKind[nba.kind] ?? CheckCircle2;
  const isLive = nba.kind === "clocked_in";

  return (
    <section
      aria-label="Next best action"
      className={cn(
        "rounded-2xl px-4 py-3.5 transition-all",
        tone.wrap,
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", tone.iconWrap)}>
          {isLive ? (
            <span className="relative flex h-3.5 w-3.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--status-confirmed))] opacity-50 animate-ping" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[hsl(var(--status-confirmed))]" />
            </span>
          ) : (
            <Icon className={cn("h-4.5 w-4.5", tone.icon)} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-foreground leading-tight">
            {formatDisplayName(nba.title)}
          </p>
          <p className="text-[11.5px] text-muted-foreground/85 mt-0.5 leading-snug line-clamp-2">
            {formatDisplayName(nba.subtitle)}
          </p>
        </div>

        {!nba.ctaLabel && (
          <CheckCircle2 className={cn("h-4 w-4 shrink-0 mt-1", tone.icon)} />
        )}
      </div>

      {nba.ctaLabel && nba.ctaHref && (
        <div className="flex items-center gap-2 mt-3">
          <Link
            to={nba.ctaHref}
            className={cn(
              "flex-1 h-11 rounded-xl flex items-center justify-center gap-1.5 font-bold text-[13px] transition-all active:scale-[0.98] shadow-sm",
              tone.cta,
            )}
          >
            {nba.ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {nba.secondaryCtaLabel && nba.secondaryCtaHref && (
            <Link
              to={nba.secondaryCtaHref}
              className={cn(
                "h-11 px-4 rounded-xl flex items-center gap-1 font-semibold text-[12px] border-2 transition-all active:scale-[0.98]",
                tone.subtle,
              )}
            >
              {nba.secondaryCtaLabel}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
