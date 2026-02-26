import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Clock, MapPin, Users, Trash2, UserPlus, Send, Save, X, Globe, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { useState, useEffect } from "react";
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
  onSave?: (shiftId: string, updates: Partial<Shift>, oldShift: Shift) => Promise<void>;
}

function calcHours(start: string, end: string): string {
  if (!start || !end) return "—";
  const today = "2000-01-01";
  const s = new Date(`${today}T${start}`);
  let e = new Date(`${today}T${end}`);
  if (e <= s) e = new Date(e.getTime() + 24 * 60 * 60 * 1000);
  const mins = differenceInMinutes(e, s);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

export function ShiftDetailDialog({
  shift, open, onOpenChange, assignments, employees, locations, clients,
  canEdit, onAddEmployees, onRemoveAssignment, onEdit, onPublish, onSave,
}: ShiftDetailDialogProps) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState("details");

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [slots, setSlots] = useState("1");
  const [clientId, setClientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [claimable, setClaimable] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (shift && open) {
      setTitle(shift.title);
      setDate(shift.date);
      setStartTime(shift.start_time.slice(0, 5));
      setEndTime(shift.end_time.slice(0, 5));
      setSlots(String(shift.slots ?? 1));
      setClientId(shift.client_id || "");
      setLocationId(shift.location_id || "");
      setNotes(shift.notes || "");
      setClaimable(shift.claimable);
      setEditing(false);
      setTab("details");
    }
  }, [shift, open]);

  if (!shift) return null;

  const shiftAssignments = assignments.filter(a => a.shift_id === shift.id);
  const assignedIds = new Set(shiftAssignments.map(a => a.employee_id));
  const unassigned = employees.filter(e => !assignedIds.has(e.id));
  const location = locations.find(l => l.id === shift.location_id);
  const client = clients.find(c => c.id === shift.client_id);
  const hoursLabel = calcHours(editing ? startTime : shift.start_time.slice(0, 5), editing ? endTime : shift.end_time.slice(0, 5));

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

  const handleInlineSave = async () => {
    if (!title.trim() || !date) return;
    if (onSave) {
      setSaving(true);
      try {
        await onSave(shift.id, {
          title: title.trim(), date, start_time: startTime, end_time: endTime,
          slots: parseInt(slots) || 1, client_id: clientId || null,
          location_id: locationId || null, notes: notes.trim() || null, claimable,
        }, shift);
        setEditing(false);
      } finally { setSaving(false); }
    } else {
      onEdit(shift);
    }
  };

  const statusColors: Record<string, string> = {
    confirmed: "text-emerald-600", pending: "text-amber-500", rejected: "text-red-500",
  };

  const statusLabel = shift.status === "published" ? "publicado" : shift.status === "draft" ? "borrador" : shift.status;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setShowAddPanel(false); setSelected([]); setEditing(false); } }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground capitalize">
              {format(parseISO(shift.date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
            </p>
            <Badge
              variant={shift.status === "published" ? "default" : "secondary"}
              className="text-[10px] px-2 py-0.5 capitalize"
            >
              {statusLabel}
            </Badge>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-8 bg-transparent p-0 gap-4 border-b-0">
              <TabsTrigger
                value="details"
                className="text-xs px-0 pb-2 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
              >
                Detalles del turno
              </TabsTrigger>
              <TabsTrigger
                value="team"
                className="text-xs px-0 pb-2 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
              >
                Equipo ({shiftAssignments.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "details" ? (
            <div className="space-y-4">
              {/* Date & Time */}
              <div className="space-y-3">
                {editing ? (
                  <>
                    <div>
                      <Label className="text-xs text-muted-foreground">Fecha</Label>
                      <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Entrada</Label>
                        <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-9 text-sm" />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Salida</Label>
                        <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-9 text-sm" />
                      </div>
                      <div className="pt-5">
                        <span className="text-sm font-semibold whitespace-nowrap">{hoursLabel}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{shift.start_time.slice(0, 5)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{shift.end_time.slice(0, 5)}</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{hoursLabel}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-primary">
                  <Globe className="h-3.5 w-3.5" />
                  <span>America/New_York</span>
                </div>
              </div>

              <hr className="border-border/40" />

              {/* Shift Title */}
              <div>
                <Label className="text-xs text-muted-foreground">Nombre del turno</Label>
                {editing ? (
                  <Input value={title} onChange={e => setTitle(e.target.value)} className="h-9 text-sm" />
                ) : (
                  <p className="text-sm font-medium mt-0.5">{shift.title}</p>
                )}
              </div>

              {/* Client (Job) */}
              <div>
                <Label className="text-xs text-muted-foreground">Cliente</Label>
                {editing ? (
                  <Select value={clientId || "none"} onValueChange={v => setClientId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm mt-0.5">{client?.name || <span className="text-muted-foreground italic">sin asignar</span>}</p>
                )}
              </div>

              {/* Location (Address) */}
              <div>
                <Label className="text-xs text-muted-foreground">Ubicación</Label>
                {editing ? (
                  <Select value={locationId || "none"} onValueChange={v => setLocationId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-1.5 text-sm mt-0.5">
                    {location ? (
                      <><MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{location.name}</>
                    ) : (
                      <span className="text-muted-foreground italic">sin asignar</span>
                    )}
                  </div>
                )}
              </div>

              {/* Slots & Claimable */}
              {editing && (
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label className="text-xs text-muted-foreground">Plazas</Label>
                    <Input type="number" value={slots} onChange={e => setSlots(e.target.value)} min="1" className="h-9 text-sm" />
                  </div>
                  <div className="flex items-center gap-2 h-9">
                    <Checkbox checked={claimable} onCheckedChange={c => setClaimable(!!c)} id="detail-claimable" />
                    <Label htmlFor="detail-claimable" className="text-xs font-normal cursor-pointer">Permitir reclamo</Label>
                  </div>
                </div>
              )}

              {!editing && shift.claimable && (
                <div className="flex items-center gap-2 text-xs text-primary">
                  <Checkbox checked disabled className="h-3.5 w-3.5" />
                  <span>Los empleados pueden reclamar este turno</span>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label className="text-xs text-muted-foreground">Notas</Label>
                {editing ? (
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Opcional..." className="text-sm resize-none mt-0.5" />
                ) : shift.notes ? (
                  <p className="text-xs bg-muted/40 rounded-lg px-3 py-2 mt-0.5 text-muted-foreground">{shift.notes}</p>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic mt-0.5">sin notas</p>
                )}
              </div>
            </div>
          ) : (
            /* Team tab */
            <div className="space-y-3">
              {/* Employee chips */}
              {shiftAssignments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {shiftAssignments.map(a => {
                    const emp = employees.find(e => e.id === a.employee_id);
                    if (!emp) return null;
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-1.5 bg-muted/60 rounded-full pl-1 pr-2 py-1 text-xs group"
                        draggable={canEdit}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/assignment", JSON.stringify({
                            assignmentId: a.id, employeeId: a.employee_id, fromShiftId: shift.id,
                          }));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                      >
                        <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="sm" />
                        <span className="font-medium">{emp.first_name} {emp.last_name}</span>
                        <span className={cn("text-[10px] capitalize", statusColors[a.status] || "text-muted-foreground")}>
                          {a.status === "confirmed" ? "✓" : a.status === "pending" ? "⏳" : a.status}
                        </span>
                        {canEdit && (
                          <button
                            onClick={() => onRemoveAssignment(a.id)}
                            className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {shiftAssignments.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Sin empleados asignados aún</p>
              )}

              {/* Capacity indicator */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {shiftAssignments.length} de {shift.slots ?? 1} plaza{(shift.slots ?? 1) > 1 ? "s" : ""}
                </span>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAddPanel(!showAddPanel)} className="h-7 text-xs px-2 text-primary">
                    <UserPlus className="h-3 w-3 mr-1" />
                    Agregar empleados
                  </Button>
                )}
              </div>

              {/* Add panel */}
              {showAddPanel && (
                <div className="border border-border/50 rounded-xl p-3 space-y-2 bg-muted/20">
                  <p className="text-[11px] font-medium text-muted-foreground">Seleccionar empleados</p>
                  <div className="max-h-44 overflow-y-auto space-y-0.5">
                    {unassigned.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-3 text-center">Todos los empleados están asignados</p>
                    ) : (
                      unassigned.map(emp => (
                        <label key={emp.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent cursor-pointer text-xs">
                          <Checkbox checked={selected.includes(emp.id)} onCheckedChange={() => toggleEmployee(emp.id)} />
                          <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="sm" />
                          {emp.first_name} {emp.last_name}
                        </label>
                      ))
                    )}
                  </div>
                  {selected.length > 0 && (
                    <Button size="sm" onClick={handleAdd} className="w-full h-8 text-xs">
                      Asignar {selected.length} empleado{selected.length > 1 ? "s" : ""}
                    </Button>
                  )}
                </div>
              )}

              {/* Qualified count hint */}
              {employees.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{employees.length} empleados</span> disponibles en el directorio
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {canEdit && (
          <div className="px-5 py-3 border-t border-border/40 bg-muted/20 flex items-center gap-2">
            {shift.status !== "published" && (
              <Button size="sm" onClick={() => onPublish(shift)} className="h-8 text-xs gap-1.5">
                <Send className="h-3 w-3" />
                Publicar
              </Button>
            )}
            {!editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-8 text-xs gap-1.5">
                <Save className="h-3 w-3" />
                Editar turno
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={handleInlineSave} disabled={saving || !title.trim() || !date} className="h-8 text-xs gap-1.5">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Guardar cambios
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="h-8 text-xs">
                  Cancelar
                </Button>
              </>
            )}
            {shift.status === "published" && !editing && (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                ✓ Publicado
              </Badge>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
