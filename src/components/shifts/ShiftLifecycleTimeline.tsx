/**
 * ShiftLifecycleTimeline — Premium operational lifecycle visualization.
 *
 * UI/read-only composition. Reads `shift_closeout_reports` + evidence packet
 * via existing helpers. Derives confirmation/clock counts from assignments
 * already in memory. NEVER writes anywhere, NEVER touches payroll, NEVER
 * converts scheduled hours into worked hours.
 *
 * Lifecycle:
 *   1. Programado
 *   2. Asignación
 *   3. Confirmación del equipo
 *   4. En operación
 *   5. Cierre del turno
 *   6. Revisión de María
 *   7. Aprobación final (Keury)
 *   8. Listo para proceso de pago
 */
import { useEffect, useState } from "react";
import {
  CalendarClock,
  Users,
  CheckCircle2,
  PlayCircle,
  ClipboardCheck,
  ShieldCheck,
  Stamp,
  Wallet,
  Clock,
  AlertTriangle,
  Circle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getShiftCloseout,
  getShiftEvidencePacket,
  type ShiftCloseout,
  type EvidencePacket,
} from "@/lib/shifts/closeout";

type StepState = "pendiente" | "en_progreso" | "listo" | "atencion";

interface LifecycleStep {
  key: string;
  label: string;
  icon: typeof CalendarClock;
  state: StepState;
  evidence?: string;
  nextAction?: string;
}

interface AssignmentLite {
  shift_id?: string;
  status: string;
}

interface ShiftLite {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  slots?: number | null;
  status?: string | null;
  publication_status?: string | null;
}

interface Props {
  shift: ShiftLite;
  assignments: AssignmentLite[];
  /** Optional: skip extra fetch if parent already has it. */
  closeoutOverride?: ShiftCloseout | null;
  evidenceOverride?: EvidencePacket | null;
  className?: string;
}

const STATE_TONE: Record<
  StepState,
  { dot: string; ring: string; pill: string; label: string }
> = {
  pendiente: {
    dot: "bg-muted text-muted-foreground",
    ring: "ring-border/40",
    pill: "bg-muted/40 text-muted-foreground border-border/40",
    label: "Pendiente",
  },
  en_progreso: {
    dot: "bg-primary/10 text-primary",
    ring: "ring-primary/30",
    pill: "bg-primary/10 text-primary border-primary/20",
    label: "En progreso",
  },
  listo: {
    dot: "bg-earning/10 text-earning",
    ring: "ring-earning/30",
    pill: "bg-earning/10 text-earning border-earning/20",
    label: "Listo",
  },
  atencion: {
    dot: "bg-warning/10 text-warning",
    ring: "ring-warning/30",
    pill: "bg-warning/10 text-warning border-warning/20",
    label: "Requiere atención",
  },
};

function buildLifecycle(
  shift: ShiftLite,
  assignments: AssignmentLite[],
  closeout: ShiftCloseout | null,
  evidence: EvidencePacket | null,
  now: Date,
): LifecycleStep[] {
  const required = shift.slots ?? 1;
  const active = assignments.filter(
    (a) =>
      (!a.shift_id || a.shift_id === shift.id) &&
      !["rejected", "removed"].includes((a.status ?? "").toLowerCase()),
  );
  const accepted = active.filter((a) =>
    ["accepted", "confirmed"].includes((a.status ?? "").toLowerCase()),
  ).length;
  const pending = active.filter((a) =>
    ["pending", "review", "invited"].includes((a.status ?? "").toLowerCase()),
  ).length;
  const rejected = assignments.filter(
    (a) => (a.status ?? "").toLowerCase() === "rejected",
  ).length;

  const start = new Date(`${shift.date}T${shift.start_time}`);
  const end = (() => {
    const e = new Date(`${shift.date}T${shift.end_time}`);
    if (e.getTime() <= start.getTime()) e.setDate(e.getDate() + 1);
    return e;
  })();
  const beforeStart = now < start;
  const inWindow = now >= start && now <= end;
  const afterEnd = now > end;
  const published = (shift.status ?? "").toLowerCase() === "published";

  // 1. Programado
  const step1: LifecycleStep = {
    key: "scheduled",
    label: "Programado",
    icon: CalendarClock,
    state: "listo",
    evidence: `Plazas requeridas: ${required}`,
  };

  // 2. Asignación
  let step2State: StepState = "en_progreso";
  if (active.length === 0) step2State = published ? "atencion" : "pendiente";
  else if (active.length >= required) step2State = "listo";
  else step2State = published ? "atencion" : "en_progreso";
  const step2: LifecycleStep = {
    key: "assignment",
    label: "Asignación",
    icon: Users,
    state: step2State,
    evidence: `${active.length}/${required} asignados${
      rejected > 0 ? ` · ${rejected} rechazados` : ""
    }`,
    nextAction:
      active.length < required
        ? `Faltan ${required - active.length} por asignar`
        : undefined,
  };

  // 3. Confirmación del equipo
  let step3State: StepState = "pendiente";
  if (active.length === 0) step3State = "pendiente";
  else if (accepted >= required) step3State = "listo";
  else if (pending > 0 || accepted > 0) step3State = "en_progreso";
  if (published && beforeStart && pending > 0 && accepted < required) {
    // urgent if shift starts soon (<2h) and not enough acceptances
    const minutesToStart = (start.getTime() - now.getTime()) / 60_000;
    if (minutesToStart < 120) step3State = "atencion";
  }
  const step3: LifecycleStep = {
    key: "confirmation",
    label: "Confirmación del equipo",
    icon: CheckCircle2,
    state: step3State,
    evidence: `${accepted} aceptados · ${pending} pendientes${
      rejected > 0 ? ` · ${rejected} rechazados` : ""
    }`,
    nextAction:
      pending > 0 && accepted < required
        ? "Recordatorio al equipo pendiente"
        : undefined,
  };

  // 4. En operación
  const clockIns = evidence?.clockIns ?? 0;
  const clockOuts = evidence?.clockOuts ?? 0;
  const missingClockOut = evidence?.missingClockOut ?? 0;
  let step4State: StepState = "pendiente";
  if (beforeStart) step4State = "pendiente";
  else if (inWindow) {
    if (clockIns === 0 && accepted > 0) step4State = "atencion";
    else step4State = "en_progreso";
  } else if (afterEnd) {
    if (missingClockOut > 0) step4State = "atencion";
    else if (clockIns > 0) step4State = "listo";
    else step4State = "pendiente";
  }
  const step4: LifecycleStep = {
    key: "operation",
    label: "En operación",
    icon: PlayCircle,
    state: step4State,
    evidence:
      clockIns + clockOuts + missingClockOut > 0
        ? `${clockIns} entradas · ${clockOuts} salidas${
            missingClockOut > 0 ? ` · falta salida ${missingClockOut}` : ""
          }`
        : beforeStart
          ? "Aún no inicia"
          : "Sin fichajes registrados",
    nextAction:
      missingClockOut > 0
        ? "Revisar fichajes sin salida"
        : inWindow && clockIns === 0 && accepted > 0
          ? "Confirmar llegada del equipo"
          : undefined,
  };

  // 5. Cierre del turno
  const closeoutStatus = closeout?.status ?? null;
  let step5State: StepState = "pendiente";
  if (closeoutStatus === "draft") step5State = "en_progreso";
  else if (closeoutStatus === "submitted") step5State = "listo";
  else if (closeoutStatus === "reviewed" || closeoutStatus === "rejected")
    step5State = "listo";
  else if (afterEnd) step5State = "atencion";
  const step5: LifecycleStep = {
    key: "closeout",
    label: "Cierre del turno",
    icon: ClipboardCheck,
    state: step5State,
    evidence: closeoutStatus
      ? closeoutStatus === "draft"
        ? "Borrador en captura"
        : closeoutStatus === "submitted"
          ? "Enviado para revisión"
          : "Cierre registrado"
      : afterEnd
        ? "Sin cierre registrado"
        : "Pendiente del fin del turno",
    nextAction:
      !closeoutStatus && afterEnd
        ? "Capturar cierre del turno"
        : closeoutStatus === "draft"
          ? "Enviar a revisión"
          : undefined,
  };

  // 6. Revisión de María
  const reviewStatus = closeout?.review_status ?? null;
  let step6State: StepState = "pendiente";
  if (closeoutStatus === "submitted") step6State = "en_progreso";
  else if (closeoutStatus === "reviewed" && reviewStatus === "approved")
    step6State = "listo";
  else if (closeoutStatus === "rejected" || reviewStatus === "rejected")
    step6State = "atencion";
  else if (
    reviewStatus === "needs_followup" ||
    reviewStatus === "escalated"
  )
    step6State = "atencion";
  const step6: LifecycleStep = {
    key: "review",
    label: "Revisión de María",
    icon: ShieldCheck,
    state: step6State,
    evidence:
      closeoutStatus === "submitted"
        ? "En cola de revisión"
        : reviewStatus === "approved"
          ? "Aprobado por María"
          : reviewStatus === "needs_followup"
            ? "Requiere seguimiento"
            : reviewStatus === "escalated"
              ? "Escalado"
              : reviewStatus === "rejected"
                ? "Rechazado"
                : closeoutStatus === "rejected"
                  ? "Requiere corrección"
                  : "Pendiente del cierre",
    nextAction:
      step6State === "atencion" && closeoutStatus !== "submitted"
        ? "Resolver observaciones"
        : undefined,
  };

  // 7. Aprobación final (Keury)
  const finalStatus = closeout?.final_approval_status ?? null;
  let step7State: StepState = "pendiente";
  if (step6State === "listo") {
    if (finalStatus === "approved") step7State = "listo";
    else if (finalStatus === "rejected") step7State = "atencion";
    else if (finalStatus === "on_hold") step7State = "atencion";
    else step7State = "en_progreso";
  }
  const step7: LifecycleStep = {
    key: "final",
    label: "Aprobación final",
    icon: Stamp,
    state: step7State,
    evidence:
      finalStatus === "approved"
        ? "Keury aprobó"
        : finalStatus === "rejected"
          ? "Rechazado en aprobación final"
          : finalStatus === "on_hold"
            ? "En pausa"
            : step6State === "listo"
              ? "Pendiente de Keury"
              : "Esperando revisión previa",
    nextAction:
      step7State === "en_progreso" ? "Marcar aprobación final" : undefined,
  };

  // 8. Listo para proceso de pago
  const step8State: StepState =
    finalStatus === "approved" ? "listo" : "pendiente";
  const step8: LifecycleStep = {
    key: "payroll_ready",
    label: "Listo para proceso de pago",
    icon: Wallet,
    state: step8State,
    evidence:
      step8State === "listo"
        ? "Listo para incluir en el ciclo de pago"
        : "Horas pendientes de revisión",
  };

  return [step1, step2, step3, step4, step5, step6, step7, step8];
}

export function ShiftLifecycleTimeline({
  shift,
  assignments,
  closeoutOverride,
  evidenceOverride,
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

  const steps = buildLifecycle(shift, assignments, closeout, evidence, new Date());

  // Find current focus: first non-listo step (en_progreso or atencion first)
  const focus =
    steps.find((s) => s.state === "atencion") ??
    steps.find((s) => s.state === "en_progreso") ??
    steps[steps.length - 1];

  return (
    <section
      aria-label="Ciclo del turno"
      className={cn(
        "rounded-2xl border border-border/50 bg-card/40 overflow-hidden",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Ciclo del turno
          </h3>
        </div>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <span
            className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full border",
              STATE_TONE[focus.state].pill,
            )}
          >
            {focus.label}
          </span>
        )}
      </header>

      <ol className="px-3.5 py-3 space-y-2.5">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const tone = STATE_TONE[step.state];
          const isLast = idx === steps.length - 1;
          const StateIcon =
            step.state === "listo"
              ? CheckCircle2
              : step.state === "atencion"
                ? AlertTriangle
                : step.state === "en_progreso"
                  ? Loader2
                  : Circle;
          return (
            <li key={step.key} className="flex gap-2.5 relative">
              {/* Rail */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center ring-2",
                    tone.dot,
                    tone.ring,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {!isLast && (
                  <div className="w-px flex-1 min-h-[14px] bg-border/50 my-0.5" />
                )}
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12.5px] font-semibold leading-tight text-foreground">
                    {step.label}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
                      tone.pill,
                    )}
                  >
                    <StateIcon
                      className={cn(
                        "h-2.5 w-2.5",
                        step.state === "en_progreso" && "animate-spin",
                      )}
                    />
                    {tone.label}
                  </span>
                </div>
                {step.evidence && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {step.evidence}
                  </p>
                )}
                {step.nextAction && (
                  <p className="text-[11px] font-medium text-primary/90 mt-0.5 leading-snug">
                    Siguiente: {step.nextAction}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="px-3.5 py-2 border-t border-border/40 bg-muted/10">
        <p className="text-[10px] text-muted-foreground leading-snug">
          Las horas mostradas son referencia operativa. Payroll se calcula con
          fichajes reales o validaciones aprobadas.
        </p>
      </footer>
    </section>
  );
}
