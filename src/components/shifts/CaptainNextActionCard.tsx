/**
 * CaptainNextActionCard — Read-only operational guidance for shift captain/admin.
 *
 * Tells the captain what to do *now*, what's pending, and when their
 * responsibility is complete. "Done for captain" = closeout.status === 'submitted'.
 * Does NOT wait for María or Keury to mark captain responsibility complete.
 *
 * Strictly presentational. No writes to:
 *   - time_entries, shift_assignments, attendance, payroll
 *   - pay_periods, reconciliation, worker portal payment messaging
 *   - closeout (CTA navigates/focuses existing closeout form via onOpenCloseout)
 */
import { useEffect, useState } from "react";
import {
  CalendarClock,
  PlayCircle,
  AlertTriangle,
  ClipboardCheck,
  ShieldCheck,
  Stamp,
  CheckCircle2,
  Circle,
  Loader2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getShiftCloseout,
  getShiftEvidencePacket,
  type ShiftCloseout,
  type EvidencePacket,
} from "@/lib/shifts/closeout";

interface ShiftLite {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
}

interface Props {
  shift: ShiftLite;
  /** Optional: parent can pass to avoid double-fetch. */
  closeoutOverride?: ShiftCloseout | null;
  evidenceOverride?: EvidencePacket | null;
  /** Called when captain taps the primary CTA to open the closeout form. */
  onOpenCloseout?: () => void;
  className?: string;
}

type Tone = "neutral" | "info" | "warning" | "success" | "complete";

interface ViewState {
  title: string;
  message: string;
  icon: typeof CalendarClock;
  tone: Tone;
  ctaLabel?: string;
  showResponsibilityBadge?: boolean;
}

const TONE_CLASSES: Record<Tone, { wrap: string; icon: string; pill: string }> = {
  neutral: {
    wrap: "border-border/40 bg-card/40",
    icon: "bg-muted text-muted-foreground",
    pill: "bg-muted/40 text-muted-foreground border-border/40",
  },
  info: {
    wrap: "border-primary/30 bg-primary/5",
    icon: "bg-primary/10 text-primary",
    pill: "bg-primary/10 text-primary border-primary/20",
  },
  warning: {
    wrap: "border-warning/30 bg-warning/5",
    icon: "bg-warning/10 text-warning",
    pill: "bg-warning/10 text-warning border-warning/20",
  },
  success: {
    wrap: "border-earning/30 bg-earning/5",
    icon: "bg-earning/10 text-earning",
    pill: "bg-earning/10 text-earning border-earning/20",
  },
  complete: {
    wrap: "border-earning/40 bg-earning/10",
    icon: "bg-earning/15 text-earning",
    pill: "bg-earning/15 text-earning border-earning/30",
  },
};

function computeView(
  shift: ShiftLite,
  closeout: ShiftCloseout | null,
  evidence: EvidencePacket | null,
  now: Date,
): ViewState {
  const start = new Date(`${shift.date}T${shift.start_time}`);
  const end = (() => {
    const e = new Date(`${shift.date}T${shift.end_time}`);
    if (e.getTime() <= start.getTime()) e.setDate(e.getDate() + 1);
    return e;
  })();

  const closeoutStatus = closeout?.status ?? null;
  const reviewStatus = closeout?.review_status ?? null;
  const finalStatus = closeout?.final_approval_status ?? null;

  // Terminal states first
  if (finalStatus === "approved") {
    return {
      title: "Listo para proceso de pago",
      message: "Este bloque puede entrar al proceso de pago.",
      icon: Wallet,
      tone: "complete",
      showResponsibilityBadge: true,
    };
  }
  if (closeoutStatus === "reviewed" && reviewStatus === "approved") {
    return {
      title: "Aprobado por María",
      message: "Pendiente aprobación final.",
      icon: Stamp,
      tone: "success",
      showResponsibilityBadge: true,
    };
  }
  if (closeoutStatus === "submitted") {
    return {
      title: "Tu parte está enviada",
      message:
        "María revisará las horas. Tu responsabilidad como encargado quedó completa.",
      icon: ShieldCheck,
      tone: "complete",
      showResponsibilityBadge: true,
    };
  }

  const accepted = evidence?.accepted ?? 0;
  const clockIns = evidence?.clockIns ?? 0;
  const clockOuts = evidence?.clockOuts ?? 0;
  const missingClockOut = evidence?.missingClockOut ?? 0;
  const beforeStart = now < start;
  const afterEnd = now > end;
  const expected = accepted > 0 ? accepted : evidence?.required ?? 0;
  const missingClockIn = Math.max(0, expected - clockIns);

  if (beforeStart) {
    return {
      title: "Antes de iniciar",
      message: "Revisa asignación y confirmaciones del equipo.",
      icon: CalendarClock,
      tone: "info",
    };
  }

  // After end with missing clock-outs
  if (afterEnd && missingClockOut > 0) {
    return {
      title: "Cierra el día",
      message: `Falta salida de ${missingClockOut} persona(s). Revisa antes de cerrar.`,
      icon: AlertTriangle,
      tone: "warning",
    };
  }

  // All clock-outs done, no closeout
  if (clockIns > 0 && missingClockOut === 0 && !closeoutStatus) {
    return {
      title: "Listo para cerrar",
      message: "Todo el equipo tiene salida. Envía el cierre del turno.",
      icon: ClipboardCheck,
      tone: "success",
      ctaLabel: "Capturar cierre del turno",
    };
  }

  if (afterEnd && clockIns === 0 && !closeoutStatus) {
    return {
      title: "Cierra el día",
      message: "No hay fichajes registrados. Revisa antes de cerrar.",
      icon: AlertTriangle,
      tone: "warning",
      ctaLabel: "Capturar cierre del turno",
    };
  }

  // In window, missing clock-ins
  if (!beforeStart && !afterEnd && missingClockIn > 0) {
    return {
      title: "Turno en curso",
      message: `Falta entrada de ${missingClockIn} persona(s). Contacta o marca ausencia.`,
      icon: AlertTriangle,
      tone: "warning",
    };
  }

  // In window, everyone in
  if (!beforeStart && !afterEnd) {
    return {
      title: "Turno en operación",
      message: "Supervisa entradas, salidas y novedades.",
      icon: PlayCircle,
      tone: "info",
    };
  }

  // Closeout in draft, after end
  if (closeoutStatus === "draft") {
    return {
      title: "Cierre en borrador",
      message: "Termina y envía el cierre del turno.",
      icon: ClipboardCheck,
      tone: "info",
      ctaLabel: "Continuar cierre",
    };
  }

  return {
    title: "Turno finalizado",
    message: "Captura el cierre cuando estés listo.",
    icon: ClipboardCheck,
    tone: "neutral",
    ctaLabel: !closeoutStatus ? "Capturar cierre del turno" : undefined,
  };
}

interface ChecklistItem {
  label: string;
  done: boolean;
}

function computeChecklist(
  closeout: ShiftCloseout | null,
  evidence: EvidencePacket | null,
): ChecklistItem[] {
  const accepted = evidence?.accepted ?? 0;
  const required = evidence?.required ?? 0;
  const clockIns = evidence?.clockIns ?? 0;
  const clockOuts = evidence?.clockOuts ?? 0;
  const missingClockOut = evidence?.missingClockOut ?? 0;
  return [
    {
      label: "Personal asignado y confirmado",
      done: required > 0 ? accepted >= required : accepted > 0,
    },
    { label: "Entradas revisadas", done: clockIns > 0 },
    {
      label: "Salidas revisadas",
      done: clockOuts > 0 && missingClockOut === 0,
    },
    {
      label: "Extras / no-shows revisados",
      done:
        (closeout?.no_show_count ?? null) !== null ||
        (closeout?.late_count ?? null) !== null ||
        closeout?.status === "submitted" ||
        closeout?.status === "reviewed",
    },
    {
      label: "Incidencias / notas registradas",
      done:
        !!closeout?.notes ||
        (closeout?.incident_count ?? null) !== null ||
        closeout?.status === "submitted" ||
        closeout?.status === "reviewed",
    },
    {
      label: "Cierre enviado",
      done:
        closeout?.status === "submitted" || closeout?.status === "reviewed",
    },
  ];
}

export function CaptainNextActionCard({
  shift,
  closeoutOverride,
  evidenceOverride,
  onOpenCloseout,
  className,
}: Props) {
  const [closeout, setCloseout] = useState<ShiftCloseout | null>(
    closeoutOverride ?? null,
  );
  const [evidence, setEvidence] = useState<EvidencePacket | null>(
    evidenceOverride ?? null,
  );
  const [loading, setLoading] = useState(
    closeoutOverride === undefined || evidenceOverride === undefined,
  );

  useEffect(() => {
    let cancelled = false;
    if (closeoutOverride !== undefined && evidenceOverride !== undefined) {
      setCloseout(closeoutOverride ?? null);
      setEvidence(evidenceOverride ?? null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      closeoutOverride === undefined
        ? getShiftCloseout(shift.id)
        : Promise.resolve(closeoutOverride),
      evidenceOverride === undefined
        ? getShiftEvidencePacket(shift.id)
        : Promise.resolve(evidenceOverride),
    ])
      .then(([c, ev]) => {
        if (cancelled) return;
        setCloseout(c ?? null);
        setEvidence(ev ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shift.id, closeoutOverride, evidenceOverride]);

  const view = computeView(shift, closeout, evidence, new Date());
  const tone = TONE_CLASSES[view.tone];
  const Icon = view.icon;
  const checklist = computeChecklist(closeout, evidence);

  return (
    <section
      aria-label="Acción del encargado"
      className={cn(
        "rounded-2xl border p-3.5 space-y-3",
        tone.wrap,
        className,
      )}
    >
      <header className="flex items-start gap-3">
        <div
          className={cn(
            "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
            tone.icon,
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-[13px] font-bold text-foreground leading-tight">
              {view.title}
            </h3>
            {view.showResponsibilityBadge && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
                  tone.pill,
                )}
              >
                <CheckCircle2 className="h-2.5 w-2.5" />
                Responsabilidad completada
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">
            {view.message}
          </p>
        </div>
      </header>

      {view.ctaLabel && onOpenCloseout && (
        <Button
          type="button"
          size="sm"
          onClick={onOpenCloseout}
          className="w-full h-9 text-xs"
        >
          {view.ctaLabel}
        </Button>
      )}

      <ul className="space-y-1.5 pt-1 border-t border-border/30">
        {checklist.map((item) => {
          const ItemIcon = item.done ? CheckCircle2 : Circle;
          return (
            <li
              key={item.label}
              className="flex items-center gap-2 text-[11.5px] leading-snug"
            >
              <ItemIcon
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  item.done ? "text-earning" : "text-muted-foreground/60",
                )}
              />
              <span
                className={cn(
                  item.done
                    ? "text-foreground/80"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-[10px] text-muted-foreground/80 leading-snug pt-1 border-t border-border/30">
        Tu responsabilidad como encargado termina al enviar el cierre. María y
        Keury continúan con la validación de horas.
      </p>
    </section>
  );
}
