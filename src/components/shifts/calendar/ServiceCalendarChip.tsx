/**
 * ServiceCalendarChip — identidad inequívoca de un Servicio en calendario.
 *
 * UI-only. No decide nada: consume `getCalendarServiceIdentity` y muestra
 * SERVICE STATE, STAFFING STATE y CONNECTEAM STATE por separado.
 * Nunca renderiza no-disponibilidades (ese es otro componente y otra semántica).
 */
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, FileEdit, Users, Clock } from "lucide-react";
import type { CalendarServiceIdentity } from "@/lib/shifts/calendar-service-identity";

interface Props {
  identity: CalendarServiceIdentity;
  dateLabel: string;
  density?: "compact" | "regular";
  onOpenService: () => void;
  className?: string;
}

export function ServiceCalendarChip({
  identity,
  dateLabel,
  density = "compact",
  onOpenService,
  className,
}: Props) {
  const isDraft = identity.service.isDraft;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full text-left rounded-md px-1.5 py-[3px] leading-tight transition-all hover:shadow-sm border-l-2 overflow-hidden",
            isDraft
              ? "border-dashed border-primary/50 bg-primary/[0.06]"
              : "border-border bg-muted/40",
            density === "compact" ? "text-[10px]" : "text-xs",
            className,
          )}
        >
          <span className="flex items-center gap-1 min-w-0">
            {isDraft && <FileEdit className="h-2.5 w-2.5 shrink-0 text-primary" />}
            <span className="font-mono text-[9px] text-muted-foreground shrink-0">
              {identity.refLabel}
            </span>
            <span className="truncate font-semibold text-foreground/90">{identity.title}</span>
          </span>
          <span className="flex items-center gap-1 mt-[1px] min-w-0">
            {isDraft && (
              <span className="shrink-0 rounded-sm bg-primary/15 text-primary px-1 text-[8px] font-bold tracking-wide">
                BORRADOR
              </span>
            )}
            <span className="truncate text-[9px] text-muted-foreground">
              {identity.time.label}
            </span>
            {identity.connecteam.ready ? (
              <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-earning" />
            ) : (
              <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-warning" />
            )}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-3 space-y-2.5 text-xs">
        <div className="space-y-0.5">
          <p className="font-mono text-[10px] text-muted-foreground">{identity.refLabel}</p>
          <p className="font-semibold text-sm leading-tight">{identity.title}</p>
          <p className="text-muted-foreground">{dateLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              isDraft ? "border-primary/40 text-primary" : "border-border/60 text-foreground",
            )}
          >
            {identity.service.label}
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1 border-border/60">
            <Clock className="h-2.5 w-2.5" />
            {identity.time.label}
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1 border-border/60">
            <Users className="h-2.5 w-2.5" />
            {identity.staffing.label}
          </Badge>
        </div>

        <div className="rounded-lg border border-border/50 p-2 space-y-1.5">
          <p className="flex items-center gap-1.5 font-medium">
            Connecteam:
            {identity.connecteam.ready ? (
              <span className="text-earning flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Listo
              </span>
            ) : (
              <span className="text-warning flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {identity.connecteam.label}
              </span>
            )}
          </p>
          {identity.connecteam.blockers.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {identity.connecteam.blockers.map((b) => (
                <li key={b.code}>· {b.reason}</li>
              ))}
            </ul>
          )}
        </div>

        <Button size="sm" className="w-full h-8 text-xs" onClick={onOpenService}>
          {identity.connecteam.ready ? "Abrir servicio" : "Completar para Connecteam"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
