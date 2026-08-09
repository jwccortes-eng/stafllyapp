/**
 * ProvisionalEndPanel — completar el mínimo técnico de Connecteam sin
 * falsificar la realidad del Servicio.
 *
 * El operador decide EXPLÍCITAMENTE una hora final provisional (o una duración)
 * que se usa SOLO en este CSV. `scheduled_shifts` no se toca: la hora final
 * canónica sigue pendiente hasta que el coordinador la confirme.
 *
 * UI-only: sin escrituras, sin payroll, sin staffing, sin assignments.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROVISIONAL_COPY,
  resolveProvisionalEnd,
  type ProvisionalEndDecision,
  type ProvisionalMode,
} from "@/lib/integrations/connecteam-provisional";
import type { Shift } from "@/components/shifts/types";

interface Props {
  /** Servicios seleccionados que necesitan hora final para Connecteam. */
  pending: Array<{ shift: Shift; ref: string }>;
  /** Decisión aplicada actualmente (null = todavía no confirmada). */
  applied: ProvisionalEndDecision | null;
  onApply: (decision: ProvisionalEndDecision) => void;
  onClear: () => void;
}

const hhmm = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : "");

export function ProvisionalEndPanel({ pending, applied, onApply, onClear }: Props) {
  const [mode, setMode] = useState<ProvisionalMode>("duration");
  const [hours, setHours] = useState("6");
  const [endTime, setEndTime] = useState("23:00");
  const [reason, setReason] = useState("");
  const [previewing, setPreviewing] = useState(false);

  if (pending.length === 0) return null;

  const draft: ProvisionalEndDecision = {
    mode,
    durationHours: Number(hours),
    endTime,
    reason,
  };

  const preview = pending.map((p) => ({
    ...p,
    end: resolveProvisionalEnd(p.shift, draft),
  }));
  const validPreview = preview.filter((p) => !!p.end);

  if (applied) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-3 text-xs space-y-1.5">
        <p className="font-semibold text-warning flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {PROVISIONAL_COPY.exportWarning}
        </p>
        <p className="text-muted-foreground">
          {pending.length} servicio{pending.length === 1 ? "" : "s"} exportan con hora final
          provisional{" "}
          {applied.mode === "duration"
            ? `(duración de ${applied.durationHours}h)`
            : `(${applied.endTime})`}
          . {PROVISIONAL_COPY.doesNotChangeService}
        </p>
        <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onClear}>
          Quitar dato provisional
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 px-3.5 py-3 space-y-3">
      <div className="flex items-start gap-2">
        <Clock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="text-xs">
          <p className="font-semibold text-foreground">{PROVISIONAL_COPY.needTitle}</p>
          <p className="text-muted-foreground mt-0.5">{PROVISIONAL_COPY.needBody}</p>
          <p className="text-muted-foreground mt-0.5">
            {pending.length} servicio{pending.length === 1 ? "" : "s"} con hora final pendiente.
          </p>
        </div>
      </div>

      {!previewing ? (
        <Button size="sm" className="h-8 text-xs" onClick={() => setPreviewing(true)}>
          {PROVISIONAL_COPY.cta}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            <ModeChip active={mode === "duration"} onClick={() => setMode("duration")}>
              Duración provisional
            </ModeChip>
            <ModeChip active={mode === "end_time"} onClick={() => setMode("end_time")}>
              Hora final provisional
            </ModeChip>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {mode === "duration" ? (
              <div className="space-y-1">
                <Label htmlFor="prov-hours" className="text-[11px]">Horas</Label>
                <Input
                  id="prov-hours"
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="prov-end" className="text-[11px]">Hora final</Label>
                <Input
                  id="prov-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="prov-reason" className="text-[11px]">Motivo (opcional)</Label>
              <Input
                id="prov-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Duración estimada por el cliente"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/30 bg-card divide-y divide-border/30 max-h-40 overflow-y-auto">
            {preview.slice(0, 12).map((p) => (
              <div key={p.shift.id} className="px-2.5 py-1.5 text-[11px] flex items-center gap-2">
                <span className="font-mono text-muted-foreground">{p.ref}</span>
                <span className="text-foreground">{p.shift.date}</span>
                <span className="text-muted-foreground">
                  {hhmm(p.shift.start_time)} → {p.end || "—"} provisional
                </span>
              </div>
            ))}
            {preview.length > 12 && (
              <p className="px-2.5 py-1.5 text-[10px] text-muted-foreground">
                …y {preview.length - 12} más.
              </p>
            )}
          </div>

          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <p>· {PROVISIONAL_COPY.onlyForExport}</p>
            <p>· {PROVISIONAL_COPY.doesNotChangeService}</p>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={validPreview.length !== pending.length}
              onClick={() => onApply(draft)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Aplicar provisionalmente a los {pending.length}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setPreviewing(false)}
            >
              Cancelar
            </Button>
          </div>
          {validPreview.length !== pending.length && (
            <p className="text-[11px] text-destructive">
              La hora final provisional debe ser distinta de la hora de inicio de cada servicio.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ModeChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary font-semibold"
          : "border-border/40 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
