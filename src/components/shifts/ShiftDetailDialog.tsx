import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Clock, MapPin, Users, Trash2, UserPlus, Pencil, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { Shift, Assignment, Employee, SelectOption } from "./types";

interface ShiftDetailDialogProps {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: Assignment[];
  employees: Employee[];
  locations: SelectOption[];
  clients: SelectOption[];
  canEdit: boolean;
  onAddEmployees: (shiftId: string, employeeIds: string[]) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onEdit: (shift: Shift) => void;
  onPublish: (shift: Shift) => void;
}

export function ShiftDetailDialog({
  shift, open, onOpenChange, assignments, employees, locations, clients,
  canEdit, onAddEmployees, onRemoveAssignment, onEdit, onPublish,
}: ShiftDetailDialogProps) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  if (!shift) return null;

  const shiftAssignments = assignments.filter(a => a.shift_id === shift.id);
  const assignedIds = new Set(shiftAssignments.map(a => a.employee_id));
  const unassigned = employees.filter(e => !assignedIds.has(e.id));
  const location = locations.find(l => l.id === shift.location_id);
  const client = clients.find(c => c.id === shift.client_id);

  const toggleEmployee = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const handleAdd = () => {
    if (selected.length > 0) {
      onAddEmployees(shift.id, selected);
      setSelected([]);
      setShowAddPanel(false);
    }
  };

  const statusColors: Record<string, string> = {
    confirmed: "text-earning",
    pending: "text-warning",
    rejected: "text-deduction",
  };

  const statusBadgeVariant = shift.status === "published"
    ? "default" as const
    : "secondary" as const;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setShowAddPanel(false); setSelected([]); } }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-lg flex-1">{shift.title}</DialogTitle>
            <Badge variant={statusBadgeVariant} className="capitalize">
              {shift.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Action buttons */}
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(shift)} className="flex-1">
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Editar
              </Button>
              {shift.status !== "published" && (
                <Button size="sm" onClick={() => onPublish(shift)} className="flex-1">
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Publicar
                </Button>
              )}
            </div>
          )}

          {/* Info */}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              📅 {format(parseISO(shift.date), "EEEE d MMM yyyy", { locale: es })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
            </span>
          </div>

          {(location || client) && (
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {location.name}
                </span>
              )}
              {client && <span>🏢 {client.name}</span>}
            </div>
          )}

          {shift.notes && (
            <p className="text-sm bg-muted/50 rounded-xl px-3 py-2">{shift.notes}</p>
          )}

          {/* Assigned employees */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-1">
                <Users className="h-4 w-4" />
                Empleados asignados ({shiftAssignments.length}/{shift.slots ?? 1})
              </h3>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => setShowAddPanel(!showAddPanel)}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Agregar
                </Button>
              )}
            </div>

            {shiftAssignments.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">Sin empleados asignados</p>
            ) : (
              <div className="space-y-1">
                {shiftAssignments.map(a => {
                  const emp = employees.find(e => e.id === a.employee_id);
                  if (!emp) return null;
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/50 group"
                      draggable={canEdit}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/assignment", JSON.stringify({
                          assignmentId: a.id,
                          employeeId: a.employee_id,
                          fromShiftId: shift.id,
                        }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="sm" />
                      <span className="text-sm flex-1">{emp.first_name} {emp.last_name}</span>
                      <span className={cn("text-[10px] font-medium capitalize", statusColors[a.status] || "text-muted-foreground")}>
                        {a.status}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => onRemoveAssignment(a.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add employees panel */}
          {showAddPanel && (
            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Selecciona empleados</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {unassigned.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">Todos asignados</p>
                ) : (
                  unassigned.map(emp => (
                    <label key={emp.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                      <Checkbox
                        checked={selected.includes(emp.id)}
                        onCheckedChange={() => toggleEmployee(emp.id)}
                      />
                      <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="sm" />
                      {emp.first_name} {emp.last_name}
                    </label>
                  ))
                )}
              </div>
              {selected.length > 0 && (
                <Button size="sm" onClick={handleAdd} className="w-full">
                  Asignar {selected.length} empleado{selected.length > 1 ? "s" : ""}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
