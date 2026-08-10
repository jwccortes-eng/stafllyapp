/**
 * ServiceEventCard — representación visual CANÓNICA de un Servicio en calendarios.
 *
 * Design System:
 *   EntityCard  → directorios
 *   EntityRow   → planning por persona
 *   ServiceEventCard → calendarios de Servicios   ← este componente
 *   EntityPassport → detalle completo
 *
 * REGLAS:
 *   · Un Servicio se dibuja UNA sola vez. Los workers son metadata.
 *   · Jerarquía: Cliente/Venue → Horario → Cobertura → (QK si aporta).
 *   · El estado vive en el acento/borde, nunca saturando toda la tarjeta.
 *   · UI-only: no muta nada, click delega en el detalle existente del Servicio.
 */
import { memo } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmployeeAvatarGroup } from "@/components/ui/employee-avatar-group";
import { Clock, Users, FileEdit, CheckCircle2, AlertTriangle } from "lucide-react";
import type { ServiceEventModel, ServiceAccent } from "@/lib/shifts/service-event-model";

export type ServiceEventDensity = "month" | "week" | "list";

interface Props {
  model: ServiceEventModel;
  density?: ServiceEventDensity;
  dateLabel?: string;
  /** Muestra la fecha dentro de la tarjeta (vistas agrupadas por Cliente). */
  showDate?: boolean;
  selected?: boolean;
  onOpen: () => void;
  onDropAssignment?: (payload: string) => void;
  className?: string;
}

const ACCENT: Record<ServiceAccent, string> = {
  positive: "border-l-earning bg-earning/[0.05]",
  warning: "border-l-warning bg-warning/[0.06]",
  draft: "border-l-primary border-dashed bg-primary/[0.05]",
  critical: "border-l-destructive bg-destructive/[0.06]",
  neutral: "border-l-border bg-muted/40",
};

function CoverageChip({ model, tiny }: { model: ServiceEventModel; tiny?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm px-1 font-semibold tabular-nums",
        tiny ? "text-[9px]" : "text-[10px]",
        model.coverageComplete
          ? "bg-earning/15 text-earning"
          : "bg-warning/15 text-warning",
      )}
    >
      {model.coverageLabel}
    </span>
  );
}

function ServiceEventCardImpl({
  model,
  density = "week",
  dateLabel,
  showDate = false,
  selected = false,
  onOpen,
  onDropAssignment,
  className,
}: Props) {
  const { identity } = model;

  const dnd = onDropAssignment
    ? {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.currentTarget.classList.add("ring-1", "ring-primary/40");
        },
        onDragLeave: (e: React.DragEvent) => {
          e.currentTarget.classList.remove("ring-1", "ring-primary/40");
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          e.currentTarget.classList.remove("ring-1", "ring-primary/40");
          const data = e.dataTransfer.getData("application/assignment");
          if (data) onDropAssignment(data);
        },
      }
    : {};

  const base = cn(
    "w-full text-left border-l-2 rounded-md transition-all cursor-pointer overflow-hidden",
    "hover:shadow-sm hover:brightness-[0.99]",
    ACCENT[model.accent],
    selected && "ring-1 ring-primary/50",
    className,
  );

  /** El borde izquierdo es IDENTIDAD del Cliente; el estado vive en el fondo. */
  const identityStyle = model.accentColor
    ? { borderLeftColor: model.accentColor, borderLeftWidth: 3 }
    : undefined;


  const body =
    density === "month" ? (
      <button type="button" onClick={onOpen} style={identityStyle} className={cn(base, "px-1.5 py-[3px]")} {...dnd}>
        <span className="flex items-center gap-1 min-w-0">
          {model.isDraft && <FileEdit className="h-2.5 w-2.5 shrink-0 text-primary" />}
          <span className="truncate text-[10px] font-semibold uppercase leading-tight text-foreground/90">
            {model.primaryLabel}
          </span>
        </span>
        <span className="mt-[1px] flex items-center gap-1 min-w-0">
          {model.isDraft && (
            <span className="shrink-0 rounded-sm bg-primary/15 px-1 text-[8px] font-bold tracking-wide text-primary">
              BORRADOR
            </span>
          )}
          <span className="truncate text-[9px] text-muted-foreground">{model.timeLabel}</span>
          <CoverageChip model={model} tiny />
        </span>
      </button>
    ) : (
      <button type="button" onClick={onOpen} style={identityStyle} className={cn(base, "px-2 py-2 space-y-1")} {...dnd}>
        <span className="flex items-center gap-1.5 min-w-0">
          {identity.ref && (
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
              {identity.refLabel}
            </span>
          )}
          {model.isDraft && (
            <span className="shrink-0 rounded-sm bg-primary/15 px-1 text-[8px] font-bold tracking-wide text-primary">
              BORRADOR
            </span>
          )}
          {model.infoPending && (
            <span className="shrink-0 rounded-sm bg-muted px-1 text-[8px] font-medium tracking-wide text-muted-foreground">
              INFO
            </span>
          )}
        </span>

        <span className="block truncate text-[12px] font-semibold uppercase leading-tight text-foreground">
          {model.primaryLabel}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {showDate && dateLabel ? `${dateLabel} · ` : ""}
            {model.timeLabel}
          </span>
        </span>
        <span className="flex items-center justify-between gap-2 pt-0.5">
          <span className="min-w-0">
            {model.team.length > 0 ? (
              <EmployeeAvatarGroup
                employees={model.team.map((t) => ({
                  firstName: t.firstName,
                  lastName: t.lastName,
                  avatarUrl: t.avatarUrl ?? null,
                  gender: t.gender ?? null,
                }))}
                max={3}
                size="xs"
              />
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                <Users className="h-2.5 w-2.5" /> Sin personal
              </span>
            )}
          </span>
          <CoverageChip model={model} />
        </span>
      </button>
    );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{body}</TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-[260px] space-y-1.5 p-2.5">
          <p className="font-mono text-[10px] text-muted-foreground">{identity.refLabel}</p>
          <p className="text-xs font-semibold leading-tight">{model.primaryLabel}</p>
          {dateLabel && <p className="text-[11px] text-muted-foreground">{dateLabel}</p>}
          <p className="text-[11px] text-muted-foreground">{model.timeLabel}</p>
          <p className="text-[11px]">
            {identity.service.label} · {identity.staffing.label}
          </p>
          {model.team.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {model.team.map((t) => `${t.firstName} ${t.lastName?.charAt(0) ?? ""}.`).join(" · ")}
            </p>
          )}
          <p className="flex items-center gap-1 text-[11px]">
            {identity.connecteam.ready ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-earning" /> Listo para Connecteam
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3 text-warning" /> {identity.connecteam.label}
              </>
            )}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const ServiceEventCard = memo(ServiceEventCardImpl);
