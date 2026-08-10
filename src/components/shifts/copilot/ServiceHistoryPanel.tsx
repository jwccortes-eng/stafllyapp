/**
 * ServiceHistoryPanel — etapa HISTORIAL: una línea de tiempo operativa.
 *
 * No es un log técnico: solo hitos que un coordinador reconoce.
 * Se construye con datos que el editor YA tiene (fila del servicio y sus
 * asignaciones). Sin consultas nuevas, sin escrituras.
 */
import { memo } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface ServiceHistoryEvent {
  key: string;
  label: string;
  at?: string | null;
  tone?: "neutral" | "positive" | "warning";
}

function fmt(at?: string | null): string | null {
  if (!at) return null;
  try {
    return format(parseISO(at), "d MMM · HH:mm", { locale: es });
  } catch {
    return null;
  }
}

const DOT: Record<NonNullable<ServiceHistoryEvent["tone"]>, string> = {
  neutral: "bg-muted-foreground/40",
  positive: "bg-earning",
  warning: "bg-warning",
};

function ServiceHistoryPanelImpl({ events }: { events: ServiceHistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card p-3.5">
        <p className="text-[12px] text-muted-foreground">
          Todavía no hay hitos registrados para este Servicio.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-3.5">
      <h4 className="text-[12px] font-bold font-heading mb-2">Historial</h4>
      <ol className="relative space-y-2.5 pl-4">
        <span className="absolute left-[3px] top-1 bottom-1 w-px bg-border/50" aria-hidden />
        {events.map((e) => (
          <li key={e.key} className="relative">
            <span
              className={cn(
                "absolute -left-4 top-1.5 h-1.5 w-1.5 rounded-full",
                DOT[e.tone ?? "neutral"],
              )}
            />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-medium leading-tight">{e.label}</span>
              {fmt(e.at) && (
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {fmt(e.at)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const ServiceHistoryPanel = memo(ServiceHistoryPanelImpl);
