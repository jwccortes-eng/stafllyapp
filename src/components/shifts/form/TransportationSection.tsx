/**
 * TransportationSection — toggle + capacity + driver picker.
 *
 * When OFF: shows a tiny informational state. Meeting points handled by
 * MeetingPointsSection (separate card). When ON: capacity, drivers, notes.
 *
 * Capacity warning rule (regression #1, kept):
 *   capacityShortage = transportRequired && slots > 0 && capacity * rides < slots
 */
import { memo } from "react";
import { Car, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";
import { SingleEmployeePicker } from "../SingleEmployeePicker";
import type { Employee } from "../types";

interface Props {
  mode: "create" | "edit";
  transportRequired: boolean;
  carCapacity: string;
  transportNotes: string;
  driverEmployeeId: string;
  /** Computed by parent so we don't repeat the math */
  ridesNeeded: number;
  driversInTeam: number;
  assignedCount: number;
  capacityShortage: boolean;
  driversShortage: boolean;
  /** Capacity covered chip when transport ON and there's NO shortage and slots>0 */
  capacityCovered: boolean;
  employees: Employee[];
  onChange: (patch: {
    transportRequired?: boolean;
    carCapacity?: string;
    transportNotes?: string;
    driverEmployeeId?: string;
  }) => void;
}

function TransportationSectionImpl({
  mode,
  transportRequired,
  carCapacity,
  transportNotes,
  driverEmployeeId,
  ridesNeeded,
  driversInTeam,
  assignedCount,
  capacityShortage,
  driversShortage,
  capacityCovered,
  employees,
  onChange,
}: Props) {
  return (
    <SectionCard
      icon={Car}
      title="Transporte"
      subtitle={transportRequired
        ? "Capacidad, conductor y vehículos para mover al equipo."
        : "Activa transporte si necesitas coordinar drivers."}
      action={
        <div className="flex items-center gap-2">
          <Checkbox
            checked={transportRequired}
            onCheckedChange={(c) => onChange({ transportRequired: !!c })}
            id={`transport-toggle-${mode}`}
          />
          <Label htmlFor={`transport-toggle-${mode}`} className="text-[11px] font-medium cursor-pointer">
            {transportRequired ? "Activado" : "Desactivado"}
          </Label>
        </div>
      }
    >
      {!transportRequired ? (
        <div className="text-[11px] text-muted-foreground leading-snug">
          Cuando lo actives aparecerán capacidad por vehículo, conductor y puntos de encuentro.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium">Capacidad por vehículo</Label>
              <Input
                type="number"
                min="1"
                value={carCapacity}
                onChange={(e) => onChange({ carCapacity: e.target.value })}
                className="h-9 text-sm mt-1"
              />
            </div>
            <div className="flex flex-col justify-end">
              <p className="text-[11px] text-muted-foreground font-medium mb-1">Vehículos necesarios</p>
              <div className="h-9 flex items-center px-3 rounded-md border border-border/30 bg-muted/20 text-sm font-semibold">
                {ridesNeeded}
              </div>
            </div>
          </div>

          {/* Capacity status — discreet green chip when covered, red banner when short */}
          {capacityShortage ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">Capacidad insuficiente</span>: necesitas {ridesNeeded} vehículo
                {ridesNeeded === 1 ? "" : "s"} para cubrir las plazas con capacidad de {parseInt(carCapacity) || 5} por
                vehículo.
              </span>
            </div>
          ) : capacityCovered ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(142_76%_36%/0.3)] bg-[hsl(142_76%_36%/0.06)] px-2.5 py-1 text-[10px] font-medium text-[hsl(142_76%_36%)]">
              <CheckCircle2 className="h-3 w-3" /> Capacidad cubierta
            </div>
          ) : null}

          {/* Drivers in team hint */}
          {assignedCount > 0 && (
            <div
              className={cn(
                "flex items-center gap-1.5 text-[11px] rounded-md border px-2.5 py-1.5",
                driversShortage
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-border/40 bg-muted/20 text-muted-foreground",
              )}
            >
              <Car className="h-3 w-3 shrink-0" />
              <span>
                <span className="font-semibold text-foreground">{driversInTeam}</span> de{" "}
                <span className="font-semibold text-foreground">{assignedCount}</span> asignados pueden manejar
                {ridesNeeded > 0 && (
                  <>
                    {" "}· se necesitan <span className="font-semibold text-foreground">{ridesNeeded}</span>
                  </>
                )}
              </span>
            </div>
          )}

          <div>
            <Label className="text-[11px] text-muted-foreground font-medium">Conductor asignado</Label>
            <div className="mt-1">
              <SingleEmployeePicker
                employees={employees}
                value={driverEmployeeId || null}
                onChange={(id) => onChange({ driverEmployeeId: id ?? "" })}
                placeholder="Buscar conductor…"
                emptyLabel="Sin asignar"
                highlightDrivers
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px] text-muted-foreground font-medium">Notas de transporte</Label>
            <Input
              value={transportNotes}
              onChange={(e) => onChange({ transportNotes: e.target.value })}
              placeholder="Ej: Recoger en oficina a las 7:30 AM"
              className="h-9 text-sm mt-1"
            />
          </div>
        </>
      )}
    </SectionCard>
  );
}

export const TransportationSection = memo(TransportationSectionImpl);
