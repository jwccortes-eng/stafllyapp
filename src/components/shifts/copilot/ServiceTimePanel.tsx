/**
 * ServiceTimePanel — etapa TIEMPO del editor (solo lectura).
 *
 * No es otro módulo de asistencia: resume lo que ya ocurrió y ofrece deep-links
 * seguros a las superficies canónicas (`/app/timeclock`, Centro de Validación).
 * Cero escrituras, cero mutaciones de payroll o attendance.
 */
import { memo } from "react";
import { Link } from "react-router-dom";
import { Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CopilotAttendanceSignals } from "@/lib/shifts/service-copilot";

interface Props {
  shiftId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  assignedCount: number;
  isPast: boolean;
  attendance?: CopilotAttendanceSignals;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "muted" }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold", tone === "muted" && "text-muted-foreground")}>
        {value}
      </span>
    </div>
  );
}

function ServiceTimePanelImpl(p: Props) {
  const att = p.attendance ?? {};
  const pending = "Pendiente";
  const notYet = "Aún no aplica";

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-3.5 space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[12px] font-bold font-heading">Tiempo</h4>
      </div>

      <Row label="Horario planificado" value={p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : "Sin definir"} />
      <Row label="Personas asignadas" value={String(p.assignedCount)} />
      <Row
        label="Clock In"
        value={!p.isPast ? notYet : att.clockedIn != null ? `${att.clockedIn}/${p.assignedCount}` : pending}
        tone={!p.isPast ? "muted" : undefined}
      />
      <Row
        label="Clock Out"
        value={!p.isPast ? notYet : att.clockedOut != null ? `${att.clockedOut}/${p.assignedCount}` : pending}
        tone={!p.isPast ? "muted" : undefined}
      />
      <Row
        label="Horas revisadas"
        value={!p.isPast ? notYet : att.hoursReviewed ? "Sí" : pending}
        tone={!p.isPast ? "muted" : undefined}
      />

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30 mt-1">
        <Link
          to={`/app/timeclock?shiftId=${p.shiftId}&date=${p.date}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1 text-[11px] font-semibold hover:bg-muted"
        >
          Ver fichaje <ExternalLink className="h-3 w-3" />
        </Link>
        <Link
          to={`/app/payroll-review-queue?shiftId=${p.shiftId}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1 text-[11px] font-semibold hover:bg-muted"
        >
          Revisar horas <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <p className="text-[10px] text-muted-foreground pt-1">
        No cambia payroll. La revisión final se hace en Centro de Validación.
      </p>
    </div>
  );
}

export const ServiceTimePanel = memo(ServiceTimePanelImpl);
