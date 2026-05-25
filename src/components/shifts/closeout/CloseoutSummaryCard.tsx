import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  BadgeCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type ShiftCloseout,
  closeoutStatusLabel,
  reviewStatusLabel,
  finalStatusLabel,
} from "@/lib/shifts/closeout";

interface Props {
  closeout: ShiftCloseout | null;
  className?: string;
}

const STATUS_TONE: Record<string, string> = {
  draft: "border-muted-foreground/30 bg-muted/40 text-foreground/70",
  submitted:
    "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  reviewed:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  rejected: "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300",
};

const FINAL_TONE: Record<string, string> = {
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  approved:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  rejected: "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300",
  on_hold: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMM yyyy · HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

export function CloseoutSummaryCard({ closeout, className }: Props) {
  if (!closeout) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-5 text-center",
          className,
        )}
      >
        <ClipboardCheck className="h-5 w-5 mx-auto text-muted-foreground/70 mb-1.5" />
        <p className="text-sm font-medium text-foreground/80">
          Cierre del turno aún no enviado
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Evidencia operativa. No aprueba payroll ni confirma pagos.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 bg-card divide-y divide-border/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Cierre del turno
          </p>
          <p className="text-sm font-semibold leading-tight">
            {closeoutStatusLabel(closeout.status)}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "h-[22px] px-2 text-[11px] font-medium",
            STATUS_TONE[closeout.status] ?? STATUS_TONE.draft,
          )}
        >
          {closeoutStatusLabel(closeout.status)}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 text-sm">
        <Stat label="Personal reportado" value={closeout.staff_count_reported ?? 0} />
        <Stat
          label="Faltas"
          value={closeout.no_show_count ?? 0}
          tone={(closeout.no_show_count ?? 0) > 0 ? "bad" : undefined}
        />
        <Stat
          label="Tarde"
          value={closeout.late_count ?? 0}
          tone={(closeout.late_count ?? 0) > 0 ? "warn" : undefined}
        />
        <Stat
          label="Incidencias"
          value={closeout.incident_count ?? 0}
          tone={(closeout.incident_count ?? 0) > 0 ? "bad" : undefined}
        />
      </div>

      <div className="px-4 py-3 space-y-2 text-[13px]">
        <div className="flex items-center gap-2">
          {closeout.uniform_ok === true ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : closeout.uniform_ok === false ? (
            <XCircle className="h-4 w-4 text-rose-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-foreground/80">
            Uniforme:{" "}
            <span className="font-medium">
              {closeout.uniform_ok === true
                ? "OK"
                : closeout.uniform_ok === false
                  ? "Con problemas"
                  : "Sin reportar"}
            </span>
          </span>
        </div>
        {closeout.notes ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Notas
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-foreground/90 leading-snug">
              {closeout.notes}
            </p>
          </div>
        ) : null}
        {closeout.client_feedback ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Comentario del cliente
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-foreground/90 leading-snug">
              {closeout.client_feedback}
            </p>
          </div>
        ) : null}
      </div>

      <div className="px-4 py-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>Enviado: {fmtDateTime(closeout.submitted_at)}</span>
        </div>
        <div className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          <span>Revisado: {fmtDateTime(closeout.reviewed_at)}</span>
        </div>
        {closeout.review_status ? (
          <div className="col-span-2">
            Revisión de María:{" "}
            <span className="font-medium text-foreground/80">
              {reviewStatusLabel(closeout.review_status)}
            </span>
          </div>
        ) : null}
        {closeout.review_notes ? (
          <div className="col-span-2 whitespace-pre-wrap text-foreground/80">
            “{closeout.review_notes}”
          </div>
        ) : null}
      </div>

      {/* Final operational approval row */}
      <div className="px-4 py-3 flex items-start gap-2 text-[12px]">
        <BadgeCheck className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Aprobación final
            </span>
            <Badge
              variant="outline"
              className={cn(
                "h-[22px] px-2 text-[11px] font-medium",
                FINAL_TONE[closeout.final_approval_status ?? "pending"] ??
                  FINAL_TONE.pending,
              )}
            >
              {finalStatusLabel(closeout.final_approval_status)}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
            “Listo para pago” es una etiqueta operativa. No confirma que el pago
            haya sido emitido.
          </p>
          {closeout.final_approved_at ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Firmado: {fmtDateTime(closeout.final_approved_at)}
            </p>
          ) : null}
          {closeout.final_approval_notes ? (
            <p className="mt-1 whitespace-pre-wrap text-foreground/80">
              “{closeout.final_approval_notes}”
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "bad";
}) {
  const toneClass =
    tone === "bad"
      ? "text-rose-700 dark:text-rose-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={cn("font-mono text-sm font-semibold tabular-nums", toneClass)}>
        {value}
      </span>
    </div>
  );
}
