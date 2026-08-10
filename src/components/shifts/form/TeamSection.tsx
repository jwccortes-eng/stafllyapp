/**
 * TeamSection — workforce assignment + shift admin selector.
 *
 * In CREATE: combobox of employees + claimable toggle.
 * In EDIT: assignment UI is handled outside; we still show admin selector.
 */
import { memo } from "react";
import { Users, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";
import { EmployeeCombobox } from "../EmployeeCombobox";
import type { Employee, Shift, Assignment } from "../types";

interface Props {
  mode: "create" | "edit";
  showEmployeePicker: boolean;
  allowClaims: boolean;
  claimable: boolean;
  selectedEmployees: string[];
  shiftAdminId: string;
  /** Pre-filtered candidates for the admin select (assigned-only when team picked). */
  adminCandidates: Employee[];
  /** Employees catalog for combobox. */
  employees: Employee[];
  shifts: Shift[];
  assignments: Assignment[];
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string;
  slotsNum: number;
  transportRequired: boolean;
  availabilityConfigs?: any[];
  availabilityOverrides?: any[];
  /** Number of assigned employees (for the live coverage chip). */
  assignedCount: number;
  adminError?: string | null;
  onToggleEmployee: (id: string) => void;
  onAddNewEmployee?: () => void;
  onAddEmergencyWorker?: () => void;
  onChange: (patch: { claimable?: boolean; shiftAdminId?: string }) => void;
  /**
   * El Command Center ya ofrece asignación real (personas sugeridas), así que
   * la pista "cierra el modal y usa otro botón" deja de tener sentido.
   */
  hideAssignHint?: boolean;
}

function TeamSectionImpl({
  hideAssignHint,
  mode,
  showEmployeePicker,
  allowClaims,
  claimable,
  selectedEmployees,
  shiftAdminId,
  adminCandidates,
  employees,
  shifts,
  assignments,
  shiftDate,
  shiftStart,
  shiftEnd,
  slotsNum,
  transportRequired,
  availabilityConfigs,
  availabilityOverrides,
  assignedCount,
  adminError,
  onToggleEmployee,
  onAddNewEmployee,
  onAddEmergencyWorker,
  onChange,
}: Props) {
  return (
    <SectionCard icon={Users} title="Equipo" subtitle="Asigna personas y define quién es el responsable del turno.">
      {showEmployeePicker && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] uppercase tracking-wide font-semibold text-foreground">
              Asignar empleados
            </Label>
            <span
              className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                selectedEmployees.length === 0
                  ? "bg-muted text-muted-foreground"
                  : selectedEmployees.length >= slotsNum
                    ? "bg-[hsl(142_76%_36%/0.12)] text-[hsl(142_76%_36%)]"
                    : "bg-[hsl(var(--status-pending)/0.12)] text-[hsl(var(--status-pending))]",
              )}
            >
              {selectedEmployees.length}/{slotsNum || 1} cubiertos
            </span>
          </div>
          <EmployeeCombobox
            employees={employees}
            selected={selectedEmployees}
            onToggle={onToggleEmployee}
            shifts={shifts}
            assignments={assignments}
            shiftDate={shiftDate}
            shiftStart={shiftStart}
            shiftEnd={shiftEnd}
            maxHeight="200px"
            availabilityConfigs={availabilityConfigs}
            availabilityOverrides={availabilityOverrides}
            availabilityBlockMode="warning"
            onAddNewEmployee={onAddNewEmployee}
            onAddEmergencyWorker={onAddEmergencyWorker}
            requiresDriver={transportRequired}
            showBulkActions={transportRequired || (slotsNum > 0 && selectedEmployees.length < slotsNum)}
            remainingSlots={Math.max(slotsNum - selectedEmployees.length, 0)}
          />
        </div>
      )}

      {!showEmployeePicker && mode === "edit" && !hideAssignHint && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-primary/[0.04] border border-primary/15">
          <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-snug">
            Para <span className="font-semibold text-foreground">asignar o quitar trabajadores</span>, cierra este modal y usa el botón{" "}
            <span className="font-semibold text-primary">"Agregar empleados"</span> en el detalle del turno (sección Equipo).
          </p>
        </div>
      )}

      {allowClaims && (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={claimable}
            onCheckedChange={(c) => onChange({ claimable: !!c })}
            id={`claimable-${mode}`}
          />
          <Label htmlFor={`claimable-${mode}`} className="text-xs font-normal cursor-pointer">
            Permitir reclamo abierto
          </Label>
        </div>
      )}

      <div className="pt-2 border-t border-border/30">
        <Label className="text-[11px] text-muted-foreground font-medium">
          Responsable operativo {assignedCount > 0 && <span className="text-destructive">*</span>}
        </Label>
        <Select
          value={shiftAdminId || "none"}
          onValueChange={(val) => onChange({ shiftAdminId: val === "none" ? "" : val })}
        >
          <SelectTrigger
            className={cn("h-9 text-sm mt-1", adminError && "border-destructive/50 ring-1 ring-destructive/20")}
          >
            <SelectValue placeholder="Sin asignar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin asignar</SelectItem>
            {adminCandidates.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.first_name} {e.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {adminError ? (
          <p className="text-[10px] text-destructive mt-1 font-medium">⛔ {adminError}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground mt-1">
            {assignedCount === 0
              ? "Asigna primero el equipo; el admin debe ser uno de los empleados asignados."
              : "Confirma asistencia del equipo. Debe ser uno de los empleados asignados."}
          </p>
        )}
      </div>
    </SectionCard>
  );
}

export const TeamSection = memo(TeamSectionImpl);
