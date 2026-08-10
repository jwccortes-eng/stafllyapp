/**
 * ClientView — Cliente como agrupador, Servicio como unidad.
 * Los workers nunca se convierten en filas/eventos: son metadata del Servicio.
 */
import { Building2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatDisplayText } from "@/lib/format-helpers";
import { getClientColor } from "./types";
import { buildServiceEventModel } from "@/lib/shifts/service-event-model";
import { ServiceEventCard } from "./calendar/ServiceEventCard";
import type { Shift, Assignment, SelectOption, Employee } from "./types";

interface ClientViewProps {
  clients: SelectOption[];
  shifts: Shift[];
  assignments: Assignment[];
  locations: SelectOption[];
  employees?: Employee[];
  onShiftClick: (shift: Shift) => void;
  onDropOnShift: (shiftId: string, data: string) => void;
}

export function ClientView({ clients, shifts, assignments, locations, employees = [], onShiftClick, onDropOnShift }: ClientViewProps) {
  const clientIds = clients.map(c => c.id);

  const clientGroups = clients.map(client => ({
    client,
    shifts: shifts.filter(s => s.client_id === client.id),
  })).filter(g => g.shifts.length > 0);

  const noClientShifts = shifts.filter(s => !s.client_id);

  const renderService = (shift: Shift) => {
    const model = buildServiceEventModel(shift as any, {
      assignments,
      employees,
      clientName: clients.find(c => c.id === shift.client_id)?.name ?? null,
      locationName: locations.find(l => l.id === shift.location_id)?.name ?? null,
    });
    const dateLabel = shift.date
      ? format(new Date(shift.date + "T00:00:00"), "d MMM", { locale: es })
      : undefined;

    return (
      <ServiceEventCard
        key={shift.id}
        model={model}
        density="list"
        dateLabel={dateLabel}
        showDate
        onOpen={() => onShiftClick(shift)}
        onDropAssignment={(data) => onDropOnShift(shift.id, data)}
      />
    );
  };

  return (
    <div className="space-y-3">
      {clientGroups.length === 0 && noClientShifts.length === 0 && (
        <p className="text-sm text-muted-foreground/40 text-center py-12">No hay servicios en este período</p>
      )}

      {clientGroups.map(({ client, shifts: cShifts }) => {
        const color = getClientColor(client.id, clientIds);
        return (
          <div key={client.id} className="rounded-2xl border border-border/20 bg-card/50 p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${color.bg}`}>
                <Building2 className={`h-4 w-4 ${color.text}`} />
              </div>
              <div>
                <p className="text-sm font-semibold">{formatDisplayText(client.name, "name")}</p>
                <p className="text-[10px] text-muted-foreground/60">
                  {cShifts.length} servicio{cShifts.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {cShifts
                .slice()
                .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))
                .map(renderService)}
            </div>
          </div>
        );
      })}

      {noClientShifts.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-muted/20 p-4">
          <p className="text-xs font-medium text-muted-foreground/60 mb-3">Sin cliente asignado</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {noClientShifts
              .slice()
              .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))
              .map(renderService)}
          </div>
        </div>
      )}
    </div>
  );
}
