import { ClipboardList, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvidencePacket } from "@/lib/shifts/closeout";

interface Props {
  packet: EvidencePacket | null;
  incidents?: number;
  className?: string;
}

export function EvidencePacketCard({ packet, incidents, className }: Props) {
  if (!packet) return null;
  const inc = incidents ?? packet.incidents ?? 0;
  const items: Array<{ label: string; value: string | number; tone?: "warn" | "bad" | "info" }> = [
    { label: "Requeridos", value: packet.required ?? "—" },
    { label: "Asignados", value: packet.assigned },
    { label: "Aceptados", value: packet.accepted },
    { label: "Entradas", value: packet.clockIns },
    { label: "Salidas", value: packet.clockOuts },
    {
      label: "Falta salida",
      value: packet.missingClockOut,
      tone: packet.missingClockOut > 0 ? "bad" : undefined,
    },
    {
      label: "Incidencias",
      value: inc,
      tone: inc > 0 ? "bad" : undefined,
    },
    {
      label: "Horas pendientes de revisión",
      value: `${packet.pendingReviewHours}h`,
      tone: packet.pendingReviewHours > 0 ? "warn" : undefined,
    },
  ];

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 bg-card p-4 space-y-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Evidencia del turno</p>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {items.map((it) => (
          <div key={it.label} className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {it.label}
            </span>
            <span
              className={cn(
                "font-mono text-sm font-semibold tabular-nums",
                it.tone === "bad" && "text-rose-700 dark:text-rose-400",
                it.tone === "warn" && "text-amber-700 dark:text-amber-400",
              )}
            >
              {it.value}
            </span>
          </div>
        ))}
      </div>

      {packet.dayPayNeedsPresence ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2.5 text-[12px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Pago por día requiere validación de presencia.</span>
        </div>
      ) : null}

      <div className="flex items-start gap-2 text-[11px] text-muted-foreground leading-snug">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          Solo evidencia operativa. Payroll se calcula con fichajes reales o
          validaciones aprobadas.
        </span>
      </div>
    </div>
  );
}
