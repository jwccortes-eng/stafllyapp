/**
 * ShiftRouteHeader — DS3a
 *
 * Presentational, reusable header for any shift/route surface.
 * Unifies the visual identity of a shift across:
 *   - Worker portal (cards, drawers, detail pages)
 *   - Admin mobile (ops sheets, team hubs)
 *   - Admin desktop (dialogs, cards)
 *
 * Frontend-only. No data fetching, no logic, no side effects.
 *
 * Densities:
 *   - "full"    → hero treatment (Entrada protagonist, Termina aprox., meeting point row)
 *   - "compact" → mid-size, single-row Entrada · Termina aprox., optional meeting row
 *   - "list"    → one-line summary: #code · title · time–time · client + status chip
 *
 * Variants:
 *   - "worker" → tone driven by status, friendlier copy ("Entrada", "Termina aprox.")
 *   - "admin"  → adds shiftCode + coverageLabel slots, neutral surface
 *
 * Canonical worker time standard:
 *   - startTime = protagonist
 *   - endTime   = muted "Termina aprox."
 *   - meetingTime (when present) shown alongside meetingPoint
 *
 * DS3a pilot: only used by TodayBlock (compact density, worker variant).
 * Other shift surfaces will adopt this in later DS3 phases.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MapPin, Briefcase, Navigation } from "lucide-react";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { OperationalTimeBlock } from "@/components/mobile-agenda/OperationalTimeBlock";
import { AgendaMeetingPointRow } from "@/components/mobile-agenda/AgendaMeetingPointRow";

export type ShiftRouteHeaderVariant = "worker" | "admin";
export type ShiftRouteHeaderDensity = "full" | "compact" | "list";
export type ShiftRouteHeaderTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

/**
 * Typed action descriptor for ShiftRouteHeader.
 * Prefer this over the raw `actions` ReactNode slot when a header renders
 * standard button-shaped affordances — it keeps styling consistent across
 * worker/admin surfaces and unblocks future OperationalAgendaHero absorption.
 * The existing `actions` prop (ReactNode) remains supported for bespoke UI.
 */
export interface ShiftRouteHeaderAction {
  id: string;
  icon?: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "primary" | "secondary" | "danger";
}

export interface ShiftRouteHeaderProps {
  title: string;
  clientName?: string | null;
  /** @deprecated código legado. Usa `shiftRef` (referencia por empresa). */
  shiftCode?: string | null;
  /**
   * P0.2 — identidad operativa: etiqueta ya formateada (`QK-001573`).
   * Tiene prioridad sobre `shiftCode`. Los UUID/IDs internos nunca se muestran.
   */
  shiftRef?: string | null;
  date: string;
  startTime: string;
  endTime?: string | null;
  meetingPoint?: string | null;
  meetingTime?: string | null;
  jobSiteName?: string | null;
  statusLabel?: string | null;
  statusTone?: ShiftRouteHeaderTone;
  pulse?: boolean;
  coverageLabel?: string | null;
  variant?: ShiftRouteHeaderVariant;
  density?: ShiftRouteHeaderDensity;
  eyebrow?: string;
  actions?: React.ReactNode;
  /**
   * Typed, structured actions rendered as a horizontal row of buttons after
   * the body. Prefer this over `actions` for standard button affordances.
   * If both are provided, `actionItems` renders first, then `actions`.
   */
  actionItems?: ShiftRouteHeaderAction[];
  trailing?: React.ReactNode;
  onClick?: () => void;
  /** Optional href; renders as <Link> when provided and onClick is not used. */
  to?: string;
  className?: string;
}

const TONE_CHIP: Record<ShiftRouteHeaderTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  danger: "bg-destructive/15 text-destructive",
  info: "bg-primary/12 text-primary",
};

function formatDayChip(iso: string): { label: string; isToday: boolean; isTomorrow: boolean } {
  const d = parseISO(iso);
  if (isToday(d)) return { label: "Hoy", isToday: true, isTomorrow: false };
  if (isTomorrow(d)) return { label: "Mañana", isToday: false, isTomorrow: true };
  return {
    label: format(d, "EEE d MMM", { locale: es }),
    isToday: false,
    isTomorrow: false,
  };
}

function trimTime(t?: string | null): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function ShiftRouteHeader({
  title,
  clientName,
  shiftCode,
  shiftRef,
  date,
  startTime,
  endTime,
  meetingPoint,
  meetingTime,
  jobSiteName,
  statusLabel,
  statusTone = "neutral",
  pulse,
  coverageLabel,
  variant = "worker",
  density = "compact",
  eyebrow,
  actions,
  actionItems,
  trailing,
  onClick,
  to,
  className,
}: ShiftRouteHeaderProps) {
  const day = formatDayChip(date);
  const start = trimTime(startTime);
  const end = trimTime(endTime);
  const isWorker = variant === "worker";
  /** Referencia operativa visible: shift_ref si existe, si no el código legado. */
  const refLabel = (shiftRef ?? "").trim() || (shiftCode ? `#${shiftCode}` : null);

  // ── Compact density (DS3a pilot target) ──────────────────────────────────
  const compactBody = (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {day.isToday && (
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-primary/12 text-primary tracking-wide">
              Hoy
            </span>
          )}
          {day.isTomorrow && (
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-accent/40 text-accent-foreground tracking-wide">
              Mañana
            </span>
          )}
          {!day.isToday && !day.isTomorrow && (
            <span className="text-[11px] font-semibold text-muted-foreground first-letter:uppercase">
              {day.label}
            </span>
          )}
          {refLabel && variant === "admin" && (
            <span className="text-[10px] font-mono text-muted-foreground/70">
              {refLabel}
            </span>
          )}
          {statusLabel && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                TONE_CHIP[statusTone],
              )}
            >
              {pulse && (
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-current opacity-60 animate-ping" />
                  <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-current" />
                </span>
              )}
              {statusLabel}
            </span>
          )}
        </div>
        {trailing ?? (
          (onClick || to) && (
            <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
          )
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
          {isWorker ? "Entrada" : "Inicio"}
        </span>
        <span className="text-[15px] font-bold text-foreground tabular-nums font-mono leading-none">
          {start}
        </span>
        {end && (
          <span className="text-[11px] text-muted-foreground/75 truncate">
            · {isWorker ? "Termina aprox." : "Termina"}{" "}
            <span className="font-mono tabular-nums">{end}</span>
          </span>
        )}
        {coverageLabel && variant === "admin" && (
          <span className="text-[11px] text-muted-foreground/75 truncate">
            · {coverageLabel}
          </span>
        )}
      </div>

      <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
        {title}
      </p>

      {(clientName || jobSiteName) && (
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
          {clientName && (
            <span className="flex items-center gap-1 truncate">
              <Briefcase className="h-3 w-3 shrink-0 text-primary/40" />
              <span className="truncate">{clientName}</span>
            </span>
          )}
          {jobSiteName && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0 text-primary/40" />
              <span className="truncate">{jobSiteName}</span>
            </span>
          )}
        </div>
      )}

      {meetingPoint && (
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-primary/80 bg-primary/[0.05] rounded-lg px-3 py-1.5">
          <Navigation className="h-3 w-3 shrink-0" />
          <span className="truncate font-medium">{meetingPoint}</span>
          {meetingTime && (
            <span className="ml-auto font-mono tabular-nums text-[11px] font-bold">
              {trimTime(meetingTime)}
            </span>
          )}
        </div>
      )}

      {actionItems && actionItems.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {actionItems.map((a) => (
            <Button
              key={a.id}
              type="button"
              size="sm"
              variant={
                a.tone === "primary"
                  ? "default"
                  : a.tone === "danger"
                    ? "destructive"
                    : "outline"
              }
              disabled={a.disabled || a.loading}
              onClick={a.onClick}
              className="h-8 text-xs gap-1"
            >
              {a.loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                a.icon
              )}
              {a.label}
            </Button>
          ))}
        </div>
      )}

      {actions && <div className="mt-2">{actions}</div>}
    </>
  );

  // ── List density (one-line summary) ─────────────────────────────────────
  const listBody = (
    <div className="flex items-center gap-2 min-w-0 w-full">
      {refLabel && (
        <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
          {refLabel}
        </span>
      )}
      <span className="text-[13px] font-semibold text-foreground truncate flex-1">
        {title}
      </span>
      <span className="text-[11px] font-mono tabular-nums text-muted-foreground shrink-0">
        {start}
        {end && `–${end}`}
      </span>
      {clientName && (
        <span className="text-[11px] text-muted-foreground truncate max-w-[40%] hidden sm:inline">
          · {clientName}
        </span>
      )}
      {statusLabel && (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0",
            TONE_CHIP[statusTone],
          )}
        >
          {statusLabel}
        </span>
      )}
      {trailing}
    </div>
  );

  // ── Full density (hero) ──────────────────────────────────────────────────
  const fullBody = (
    <>
      {(eyebrow || statusLabel) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          {eyebrow && (
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/85">
              {eyebrow}
            </span>
          )}
          {statusLabel && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                TONE_CHIP[statusTone],
              )}
            >
              {pulse && (
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-current opacity-60 animate-ping" />
                  <span className="relative inline-block h-2 w-2 rounded-full bg-current" />
                </span>
              )}
              {statusLabel}
            </span>
          )}
        </div>
      )}

      <div className="flex items-end justify-between gap-3 mb-3">
        <OperationalTimeBlock
          label={isWorker ? "Entrada" : "Inicio"}
          time={start}
          caption={day.label}
          size="hero"
          align="left"
          className="first-letter:uppercase"
        />
        {end && (
          <OperationalTimeBlock
            label={isWorker ? "Termina aprox." : "Termina"}
            time={end}
            caption={coverageLabel && variant === "admin" ? coverageLabel : null}
            size="row"
            align="right"
            className="pb-1 opacity-80"
          />
        )}
      </div>

      <div className="space-y-0.5 mb-3">
        <p className="text-[15px] font-bold text-foreground leading-tight">
          {title}
        </p>
        {(clientName || jobSiteName) && (
          <p className="text-[12px] text-muted-foreground/85 leading-snug truncate">
            {[clientName, jobSiteName].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {meetingPoint && (
        <AgendaMeetingPointRow
          point={{
            address: meetingPoint,
            time: meetingTime ? trimTime(meetingTime) : null,
            caption: null,
          }}
          density="comfortable"
          className="mb-3"
        />
      )}

      {actionItems && actionItems.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {actionItems.map((a) => (
            <Button
              key={a.id}
              type="button"
              size="sm"
              variant={
                a.tone === "primary"
                  ? "default"
                  : a.tone === "danger"
                    ? "destructive"
                    : "outline"
              }
              disabled={a.disabled || a.loading}
              onClick={a.onClick}
              className="h-8 text-xs gap-1"
            >
              {a.loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                a.icon
              )}
              {a.label}
            </Button>
          ))}
        </div>
      )}

      {actions}
    </>
  );


  const body =
    density === "full" ? fullBody : density === "list" ? listBody : compactBody;

  const baseSurface = cn(
    "block rounded-2xl bg-card border border-border/50 shadow-sm",
    density === "list" ? "px-3 py-2" : "px-4 py-3",
    (onClick || to) && "active:scale-[0.99] transition-all",
    className,
  );

  if (to && !onClick) {
    return (
      <Link to={to} className={baseSurface}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(baseSurface, "text-left w-full")}>
        {body}
      </button>
    );
  }

  return <div className={baseSurface}>{body}</div>;
}
