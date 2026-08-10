/**
 * ServiceStageLayout — el editor deja de ser un formulario largo.
 *
 * Seis etapas, sin mezclar información:
 *   Resumen · Equipo · Operación · Tiempo · Pago · Historial
 *
 * Layout puro: no conoce el contenido de cada etapa. Escucha las peticiones de
 * foco del copiloto para saltar a la etapa correcta antes de enfocar la sección.
 */
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { focusServiceSection } from "@/lib/shifts/service-publish-readiness";
import { SERVICE_FOCUS_EVENT } from "@/lib/shifts/service-focus";

export type ServiceStageKey =
  | "resumen"
  | "equipo"
  | "operacion"
  | "tiempo"
  | "pago"
  | "historial";

const STAGES: { key: ServiceStageKey; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "equipo", label: "Equipo" },
  { key: "operacion", label: "Operación" },
  { key: "tiempo", label: "Tiempo" },
  { key: "pago", label: "Pago" },
  { key: "historial", label: "Historial" },
];

interface Props {
  stages: Partial<Record<ServiceStageKey, ReactNode>>;
  /** Ancla → etapa que la contiene, para el salto del "siguiente paso". */
  anchorStage?: Record<string, ServiceStageKey>;
  initial?: ServiceStageKey;
}

export function ServiceStageLayout({ stages, anchorStage, initial = "resumen" }: Props) {
  const [active, setActive] = useState<ServiceStageKey>(initial);
  const available = STAGES.filter((s) => stages[s.key]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ anchorId: string; handled: boolean }>).detail;
      if (!detail?.anchorId) return;
      const target = anchorStage?.[detail.anchorId];
      if (!target || !stages[target]) return;
      detail.handled = true;
      setActive(target);
      window.setTimeout(() => focusServiceSection(detail.anchorId), 80);
    };
    window.addEventListener(SERVICE_FOCUS_EVENT, handler);
    return () => window.removeEventListener(SERVICE_FOCUS_EVENT, handler);
  }, [anchorStage, stages]);

  const current = stages[active] ?? stages[available[0]?.key ?? "resumen"];

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-1 overflow-x-auto">
          {available.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(s.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
                s.key === active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="mr-1 opacity-60 tabular-nums">{i + 1}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">{current}</div>
    </div>
  );
}
