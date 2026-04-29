/**
 * TraceabilitySnapshot — read-only operational lineage panel.
 *
 * Phase 2 design: explains where a record comes from and how it got to its
 * current state. NO writes. NO mutations. NO impact on payroll calculations,
 * time_entries, scheduled_shifts, RLS, auth or schema.
 *
 * Inputs are intentionally loose so it can be embedded in:
 *   - Mobile Timesheet detail (per time entry / per day)
 *   - Mobile Shift Operations sheet (per shift)
 *   - Future: Payroll row detail, attendance review, etc.
 *
 * The component does NOT fetch data on its own — callers pass already-loaded
 * snapshot props. This keeps it cheap to render inside sheets and avoids
 * adding hooks that could break Rules of Hooks in parent dashboards.
 */

import { format, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  Clock,
  Link2,
  AlertTriangle,
  ShieldCheck,
  FileInput,
  PencilLine,
  Smartphone,
  KeyRound,
  Workflow,
  Database,
  Calendar,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type TraceSourceKind =
  | "real_clock"
  | "kiosk"
  | "manual_adjustment"
  | "imported"
  | "scheduled_only"
  | "unknown";

export interface TraceTimelineEvent {
  label: string;
  at: string | null | undefined;
  icon?: LucideIcon;
  tone?: "default" | "good" | "warn" | "bad";
}

export interface TraceLinkedRecord {
  label: string;
  value: string | null | undefined;
  hint?: string;
}

export interface TraceRisk {
  label: string;
  tone: "warn" | "bad" | "info";
}

export interface TraceabilitySnapshotProps {
  /** Compact card variant (no outer card chrome). Default: false. */
  compact?: boolean;
  /** Source classification for the record. */
  source?: TraceSourceKind;
  /** Free-form note about the source (e.g. "manual override by admin"). */
  sourceNote?: string;
  /** Ordered timeline events. Null `at` values are rendered as "—". */
  timeline?: TraceTimelineEvent[];
  /** Linked records (shift / assignment / pay period / client). */
  linked?: TraceLinkedRecord[];
  /** Health/risk flags surfaced to the operator. */
  risks?: TraceRisk[];
  /** Audit metadata (created_at, updated_at, batch id, hash, etc.). */
  audit?: TraceLinkedRecord[];
}

/* ─── Source config ─────────────────────────────────────────────────────── */

const SOURCE_CONFIG: Record<
  TraceSourceKind,
  { label: string; icon: LucideIcon; tone: string; hint: string }
> = {
  real_clock: {
    label: "Real clock entry",
    icon: Clock,
    tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    hint: "Worker clocked in from their device",
  },
  kiosk: {
    label: "Kiosk clock entry",
    icon: KeyRound,
    tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    hint: "Punched at a shared kiosk device",
  },
  manual_adjustment: {
    label: "Manual adjustment",
    icon: PencilLine,
    tone: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    hint: "Created or edited by an admin",
  },
  imported: {
    label: "Imported record",
    icon: FileInput,
    tone: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30",
    hint: "Came from a payroll import batch",
  },
  scheduled_only: {
    label: "Scheduled (not paid)",
    icon: Calendar,
    tone: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
    hint: "Scheduled hours — payroll uses real clock entries only",
  },
  unknown: {
    label: "Source unknown",
    icon: Database,
    tone: "text-muted-foreground bg-muted border-border/40",
    hint: "Origin could not be determined",
  },
};

const RISK_TONE: Record<TraceRisk["tone"], string> = {
  bad: "text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/30",
  warn: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
  info: "text-blue-700 dark:text-blue-400 bg-blue-500/10 border-blue-500/30",
};

/* ─── Formatters ────────────────────────────────────────────────────────── */

function formatAt(at: string | null | undefined): string {
  if (!at) return "—";
  try {
    return format(parseISO(at), "MMM d, yyyy · HH:mm", { locale: enUS });
  } catch {
    return at;
  }
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export function TraceabilitySnapshot({
  compact = false,
  source = "unknown",
  sourceNote,
  timeline = [],
  linked = [],
  risks = [],
  audit = [],
}: TraceabilitySnapshotProps) {
  const cfg = SOURCE_CONFIG[source];
  const SourceIcon = cfg.icon;

  return (
    <div
      className={cn(
        "space-y-3",
        !compact && "rounded-2xl border border-border/50 bg-card p-3.5"
      )}
    >
      {/* Header (skipped in compact mode — caller provides its own) */}
      {!compact && (
        <div className="flex items-center gap-2">
          <Workflow className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Traceability
          </h4>
        </div>
      )}

      {/* A. Source of truth */}
      <div className={cn("rounded-xl border px-3 py-2.5 flex items-start gap-2.5", cfg.tone)}>
        <SourceIcon className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold leading-tight">{cfg.label}</div>
          <div className="text-[11px] opacity-80 mt-0.5 leading-snug">
            {sourceNote || cfg.hint}
          </div>
        </div>
      </div>

      {/* D. Risks (surfaced near the top so they are not missed) */}
      {risks.length > 0 && (
        <div className="space-y-1.5">
          {risks.map((r, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 flex items-center gap-2 text-[11px] font-medium",
                RISK_TONE[r.tone]
              )}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="leading-tight">{r.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* B. Timeline */}
      {timeline.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Timeline
          </div>
          <ol className="space-y-1.5">
            {timeline.map((ev, i) => {
              const Icon = ev.icon ?? Clock;
              const muted = !ev.at;
              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-center justify-between gap-3 text-[11px]",
                    muted && "opacity-50"
                  )}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{ev.label}</span>
                  </div>
                  <span className="font-mono tabular-nums text-muted-foreground shrink-0">
                    {formatAt(ev.at)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* C. Linked records */}
      {linked.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <Link2 className="h-3 w-3" /> Linked records
          </div>
          <dl className="grid grid-cols-1 gap-y-1">
            {linked.map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 text-[11px]"
              >
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd
                  className="font-medium text-foreground truncate max-w-[60%] text-right"
                  title={row.hint || row.value || undefined}
                >
                  {row.value || <span className="text-muted-foreground">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* E. Audit metadata */}
      {audit.length > 0 && (
        <div className="pt-2 border-t border-border/40">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Audit
          </div>
          <dl className="grid grid-cols-1 gap-y-1">
            {audit.map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 text-[10px]"
              >
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd
                  className="font-mono tabular-nums text-foreground truncate max-w-[60%] text-right"
                  title={row.hint || row.value || undefined}
                >
                  {row.value || <span className="text-muted-foreground">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/* ─── Helpers for callers ───────────────────────────────────────────────── */

/**
 * Map a time_entries.entry_source value to a TraceSourceKind.
 * Defensive: unknown values fall back to "unknown".
 */
export function classifyTimeEntrySource(
  entrySource: string | null | undefined
): TraceSourceKind {
  if (!entrySource) return "real_clock"; // historical default
  const s = entrySource.toLowerCase();
  if (s.includes("kiosk")) return "kiosk";
  if (s.includes("manual") || s.includes("admin") || s.includes("adjust")) return "manual_adjustment";
  if (s.includes("import") || s.includes("payroll")) return "imported";
  if (s.includes("scheduled")) return "scheduled_only";
  if (s.includes("clock") || s.includes("mobile") || s.includes("app")) return "real_clock";
  return "unknown";
}

export const TraceIcons = {
  Clock,
  Smartphone,
  PencilLine,
  FileInput,
  KeyRound,
  Calendar,
  ShieldCheck,
  Workflow,
};
