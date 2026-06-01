/**
 * HistoricalShiftWorkSummary — read-only block for the portal shift drawer.
 *
 * Shows, for a past shift:
 *   - Programado (muted, reference only)
 *   - Registrado en Stafly (only if a closed time_entry exists)
 *   - Estado del periodo / pago (no amounts)
 *   - Honest copy when the day may live in Connecteam instead of Stafly.
 *
 * Strict rules (Phase H4):
 *   - No DB reads or writes here. Consumes already-fetched WorkedShiftEntry.
 *   - Never derives worked time from scheduled start/end.
 *   - Never displays a monetary amount.
 *   - Never reads historical_payroll_entries.
 */
import { Clock, CheckCircle2, AlertCircle, History } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  WORKER_STATUS_LABEL_ES,
  type WorkedShiftEntry,
} from "@/hooks/useWorkedShiftHistory";
import { cn } from "@/lib/utils";

interface Props {
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  info: WorkedShiftEntry | undefined;
  loading?: boolean;
}

function fmtClock(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "HH:mm");
  } catch {
    return "—";
  }
}

function fmtDuration(min: number): string {
  if (!min || min <= 0) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function statusTone(
  status: WorkedShiftEntry["workerStatus"] | undefined,
): { bg: string; text: string; border: string } {
  switch (status) {
    case "paid":
      return {
        bg: "bg-emerald-500/10",
        text: "text-emerald-700 dark:text-emerald-400",
        border: "border-emerald-500/25",
      };
    case "published":
      return {
        bg: "bg-sky-500/10",
        text: "text-sky-700 dark:text-sky-400",
        border: "border-sky-500/25",
      };
    case "in_review":
    case "pending_validation":
    case "no_period_yet":
      return {
        bg: "bg-amber-500/10",
        text: "text-amber-700 dark:text-amber-400",
        border: "border-amber-500/25",
      };
    case "open_clock":
      return {
        bg: "bg-rose-500/10",
        text: "text-rose-700 dark:text-rose-400",
        border: "border-rose-500/25",
      };
    default:
      return {
        bg: "bg-muted/60",
        text: "text-muted-foreground",
        border: "border-border/40",
      };
  }
}

export function HistoricalShiftWorkSummary({
  scheduledStart,
  scheduledEnd,
  info,
  loading,
}: Props) {
  const start = scheduledStart?.slice(0, 5) ?? null;
  const end = scheduledEnd?.slice(0, 5) ?? null;

  const status = info?.workerStatus;
  const tone = statusTone(status);
  const statusLabel = status ? WORKER_STATUS_LABEL_ES[status] : "Pendiente";

  const hasRealHours = !!info?.hasClosedTimeEntry;
  const isOpenClock = !!info?.hasOpenClock;

  return (
    <section className="rounded-2xl border border-border/40 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/30">
        <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
          <History className="h-3.5 w-3.5 text-muted-foreground/80" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">
            Tu trabajo este día
          </p>
          <p className="text-[12px] text-muted-foreground/70 mt-0.5">
            Resumen del turno pasado
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border",
            tone.bg,
            tone.text,
            tone.border,
          )}
        >
          {statusLabel}
        </span>
      </div>

      {/* Programado — reference only */}
      {(start || end) && (
        <div className="px-4 py-3 border-b border-border/30">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">
            Programado
          </p>
          <p className="text-[12.5px] text-muted-foreground/85 mt-0.5 tabular-nums">
            Clock In {start ?? "—"}
            {end ? ` · Ends approx. ${end}` : ""}
          </p>
          <p className="text-[10.5px] text-muted-foreground/55 mt-0.5 italic">
            Solo referencia. No es la hora trabajada.
          </p>
        </div>
      )}

      {/* Registrado en Stafly */}
      <div className="px-4 py-3 space-y-1.5">
        <div className="flex items-center gap-2">
          {hasRealHours ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : isOpenClock ? (
            <AlertCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-muted-foreground/55 shrink-0" />
          )}
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">
            Registrado en Stafly
          </p>
        </div>

        {loading ? (
          <p className="text-[12.5px] text-muted-foreground/60 italic">
            Cargando…
          </p>
        ) : hasRealHours ? (
          <>
            <p className="text-[14px] font-bold text-foreground tabular-nums">
              Trabajado {fmtDuration(info!.workedMinutes)}
            </p>
            <p className="text-[11.5px] text-muted-foreground/75 tabular-nums">
              {fmtClock(info!.clockIn)} → {fmtClock(info!.clockOut)}
              {info!.breakMinutes > 0 && ` · descanso ${info!.breakMinutes}m`}
            </p>
          </>
        ) : isOpenClock ? (
          <>
            <p className="text-[13px] font-semibold text-rose-700 dark:text-rose-400">
              Reloj sin cerrar desde {fmtClock(info!.clockIn)}
            </p>
            <p className="text-[10.5px] text-muted-foreground/65 italic">
              Avisa al admin para cerrar tu turno.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-foreground/85">
              Sin horas en Stafly todavía
            </p>
            <p className="text-[10.5px] text-muted-foreground/65 italic leading-snug">
              Puede estar en revisión o venir de Connecteam.
            </p>
          </>
        )}
      </div>

      {/* Pago — sin monto */}
      <div className="px-4 py-3 border-t border-border/30">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 font-bold">
          Pago
        </p>
        <p className="text-[12.5px] text-foreground/85 mt-0.5">
          {status === "paid"
            ? "Periodo pagado."
            : status === "published"
            ? "Disponible en tu reporte semanal."
            : status === "in_review"
            ? "Periodo en revisión."
            : status === "pending_validation"
            ? "Pendiente de validación del admin."
            : status === "open_clock"
            ? "Esperando cierre del reloj."
            : status === "no_hours"
            ? "Aún sin horas en Stafly."
            : "Pendiente."}
        </p>
        <p className="text-[10px] text-muted-foreground/45 mt-1 italic">
          Los montos se muestran en tu reporte semanal de pago.
        </p>
      </div>
    </section>
  );
}
