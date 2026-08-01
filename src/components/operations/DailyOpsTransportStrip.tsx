/**
 * DailyOpsTransportStrip — "Transporte".
 *
 * Aggregates transport health for shifts that require it. Derived only from
 * existing fields (transportation_required, car_capacity, driver_employee_id,
 * shift_rides). Read-only.
 */
import { Car, AlertTriangle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TodayOpsShift } from "@/hooks/useTodayOperations";

interface Props {
  shifts: TodayOpsShift[];
  onOperate: (id: string) => void;
}

export function DailyOpsTransportStrip({ shifts, onOperate }: Props) {
  const required = shifts.filter((s) => s.transport.required);
  if (required.length === 0) return null;

  const missingDriver = required.filter((s) => s.transport.missing_driver);
  const capacityShort = required.filter(
    (s) => s.transport.capacity_short && !s.transport.missing_driver,
  );
  const totalDriversAssigned = required.reduce((n, s) => n + s.transport.drivers_assigned, 0);
  const totalSlots = required.reduce((n, s) => n + (s.slots ?? 0), 0);
  const totalCapacity = required.reduce((n, s) => n + s.transport.capacity_total, 0);
  const affected = [...missingDriver, ...capacityShort];
  const hasIssues = affected.length > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        hasIssues
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-border/50 bg-card",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Car className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Transporte</h3>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-auto">
          {required.length} turno{required.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Tile label="Cupos requeridos" value={totalSlots} />
        <Tile label="Capacidad disponible" value={totalCapacity} />
        <Tile
          label="Conductores asignados"
          value={totalDriversAssigned}
          tone={missingDriver.length > 0 ? "danger" : "neutral"}
        />
        <Tile
          label="Faltan conductores"
          value={missingDriver.length}
          tone={missingDriver.length > 0 ? "danger" : "neutral"}
        />
      </div>

      {hasIssues && (
        <div className="mt-3 space-y-1.5">
          {affected.slice(0, 5).map((s) => {
            const isMissing = s.transport.missing_driver;
            return (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-lg bg-card border border-border/40 px-3 py-2"
              >
                <AlertTriangle
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isMissing ? "text-destructive" : "text-amber-600 dark:text-amber-400",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">
                    {s.title}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground truncate">
                    {isMissing
                      ? "Sin conductor asignado."
                      : `Faltan ${s.slots - s.transport.capacity_total} cupo${s.slots - s.transport.capacity_total === 1 ? "" : "s"} de transporte.`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] gap-1"
                  onClick={() => onOperate(s.id)}
                >
                  Operar
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
          {affected.length > 5 && (
            <p className="text-[10.5px] text-muted-foreground pl-1">
              +{affected.length - 5} turno{affected.length - 5 === 1 ? "" : "s"} con incidencias de transporte
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger";
}) {
  const t = tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg bg-card border border-border/40 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </p>
      <p className={cn("text-base font-bold tabular-nums mt-0.5", t)}>{value}</p>
    </div>
  );
}
