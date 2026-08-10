/**
 * ServiceCopilotHeader — el header del editor es un RESUMEN OPERATIVO.
 *
 * Solo lo esencial: Cliente · QK · Fecha · Horario · Estado · Readiness.
 * Nada secundario vive arriba.
 *
 * UI-only. Reutiliza ClientAvatar (identidad visual de cliente) y ReadinessBar.
 */
import { memo } from "react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { ReadinessBar } from "./ReadinessBar";
import type { PreparationBand } from "@/lib/shifts/service-preparation";

export type ServiceStatusTone = "draft" | "published" | "closed" | "cancelled";

interface Props {
  clientId?: string | null;
  clientName?: string | null;
  serviceRef?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string;
  statusLabel: string;
  statusTone: ServiceStatusTone;
  readiness: number;
  band: PreparationBand;
}

const STATUS_CLASS: Record<ServiceStatusTone, string> = {
  draft: "bg-primary/10 text-primary border-primary/20",
  published: "bg-earning/10 text-earning border-earning/20",
  closed: "bg-muted text-muted-foreground border-border/40",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

function fmtDate(d?: string): string | null {
  if (!d) return null;
  try {
    return format(parse(d, "yyyy-MM-dd", new Date()), "EEE d MMM", { locale: es });
  } catch {
    return d;
  }
}

function ServiceCopilotHeaderImpl(p: Props) {
  const dateLabel = fmtDate(p.date);
  const schedule =
    p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : p.startTime || null;

  return (
    <div className="flex items-center gap-3 min-w-0">
      <ClientAvatar clientId={p.clientId ?? null} name={p.clientName ?? "Servicio"} size="sm" />
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-bold font-heading leading-tight truncate max-w-[240px]">
            {p.clientName || "Servicio sin cliente"}
          </h2>
          {p.serviceRef && (
            <span className="text-[10px] font-mono font-semibold text-muted-foreground shrink-0">
              {p.serviceRef}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider shrink-0",
              STATUS_CLASS[p.statusTone],
            )}
          >
            {p.statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground min-w-0">
          {dateLabel && <span className="shrink-0">{dateLabel}</span>}
          {dateLabel && schedule && <span className="text-muted-foreground/40">·</span>}
          {schedule && <span className="shrink-0 tabular-nums">{schedule}</span>}
          <span className="text-muted-foreground/40 hidden sm:inline">·</span>
          <ReadinessBar value={p.readiness} band={p.band} className="hidden sm:flex" />
        </div>
      </div>
    </div>
  );
}

export const ServiceCopilotHeader = memo(ServiceCopilotHeaderImpl);
