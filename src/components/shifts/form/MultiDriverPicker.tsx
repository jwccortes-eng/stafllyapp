/**
 * MultiDriverPicker — selección de VARIOS conductores para un turno.
 *
 * Reutiliza `SingleEmployeePicker` como buscador (una persona a la vez) y
 * muestra los drivers ya elegidos como fichas removibles. No inventa reglas:
 * la cantidad de vehículos NO define la cantidad de drivers; el operador
 * decide cuántos necesita.
 */
import { memo } from "react";
import { X, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { SingleEmployeePicker } from "../SingleEmployeePicker";
import { formatPersonName } from "@/lib/format-helpers";
import { cn } from "@/lib/utils";
import type { Employee } from "../types";

interface Props {
  employees: Employee[];
  driverIds: string[];
  onChange: (driverIds: string[]) => void;
  /** Cuántos drivers declara el operador que necesita (sólo informativo). */
  driversRequired?: number;
  disabled?: boolean;
}

function MultiDriverPickerImpl({ employees, driverIds, onChange, driversRequired = 0, disabled }: Props) {
  const byId = new Map(employees.map(e => [e.id, e]));
  const selected = driverIds.filter(id => byId.has(id));
  const missing = Math.max(0, driversRequired - selected.length);

  const add = (id: string | null) => {
    if (!id || driverIds.includes(id)) return;
    onChange([...driverIds, id]);
  };
  const remove = (id: string) => onChange(driverIds.filter(d => d !== id));

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(id => {
            const emp = byId.get(id)!;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.06] pl-1 pr-1 py-0.5"
              >
                <EmployeeAvatar
                  firstName={emp.first_name}
                  lastName={emp.last_name}
                  avatarUrl={(emp as any).avatar_url}
                  gender={(emp as any).gender}
                  size="xs"
                />
                <span className="text-[11px] font-medium">
                  {formatPersonName(`${emp.first_name ?? ""} ${emp.last_name ?? ""}`)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  onClick={() => remove(id)}
                  aria-label={`Quitar conductor ${emp.first_name}`}
                  className="h-6 w-6 rounded-full hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </Button>
              </span>
            );
          })}
        </div>
      )}

      <SingleEmployeePicker
        employees={employees.filter(e => !driverIds.includes(e.id))}
        value={null}
        onChange={add}
        placeholder="Buscar conductor…"
        emptyLabel={selected.length > 0 ? "Agregar otro conductor" : "Sin conductores"}
        highlightDrivers
        disabled={disabled}
      />

      <p
        className={cn(
          "text-[11px] flex items-center gap-1.5",
          missing > 0 ? "text-warning" : "text-muted-foreground",
        )}
      >
        <Car className="h-3 w-3 shrink-0" />
        {driversRequired > 0
          ? `${selected.length} de ${driversRequired} ${driversRequired === 1 ? "conductor seleccionado" : "conductores seleccionados"}`
          : `${selected.length} ${selected.length === 1 ? "conductor seleccionado" : "conductores seleccionados"}`}
        {missing > 0 && ` · faltan ${missing}. El turno se puede crear igual.`}
      </p>
    </div>
  );
}

export const MultiDriverPicker = memo(MultiDriverPickerImpl);
