import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployeeCombobox } from "./EmployeeCombobox";
import { Clock, MapPin, Users, Trash2, UserPlus, Send, Save, X, Globe, Loader2, HandMetal, CheckCircle2, XCircle, Hash, ShieldCheck, ShieldX, ShieldQuestion, Megaphone, MessageSquare, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import type { Shift, Assignment, Employee, SelectOption } from "./types";
import { formatShiftCode } from "./types";
import { SendNotificationDialog } from "./SendNotificationDialog";
import { ShiftCommentsPanel } from "./ShiftCommentsPanel";

interface ShiftDetailDialogProps {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: Assignment[];
  employees: Employee[];
  locations: SelectOption[];
  clients: SelectOption[];
  allShifts?: Shift[];
  canEdit: boolean;
  onAddEmployees: (shiftId: string, employeeIds: string[]) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onEdit: (shift: Shift) => void;
  onPublish: (shift: Shift) => void;
  onSave?: (shiftId: string, updates: Partial<Shift>, oldShift: Shift) => Promise<void>;
  onRequestAction?: () => void;
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

interface ShiftRequestItem {
  id: string;
  employee_id: string;
  status: string;
  message: string | null;
  rejection_reason: string | null;
  created_at: string;
  employee: { first_name: string; last_name: string };
}

export function ShiftDetailDialog({
  shift, open, onOpenChange, assignments, employees, locations, clients, allShifts = [],
  canEdit, onAddEmployees, onRemoveAssignment, onEdit, onPublish, onSave, onRequestAction,
}: ShiftDetailDialogProps) {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
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

  // Shift requests state
  const [requests, setRequests] = useState<ShiftRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [processingReqId, setProcessingReqId] = useState<string | null>(null);
  const [rejectReqId, setRejectReqId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState<{ assignmentId: string; employeeName: string } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!shift) return;
    setLoadingRequests(true);
    const { data } = await supabase
      .from("shift_requests")
      .select("id, employee_id, status, message, rejection_reason, created_at, employees!inner(first_name, last_name)")
      .eq("shift_id", shift.id)
      .order("created_at", { ascending: true });
    setRequests((data ?? []).map((r: any) => ({
      id: r.id, employee_id: r.employee_id, status: r.status,
      message: r.message, rejection_reason: r.rejection_reason, created_at: r.created_at,
      employee: { first_name: r.employees.first_name, last_name: r.employees.last_name },
    })));
    setLoadingRequests(false);
  }, [shift]);

  const handleApproveRequest = async (req: ShiftRequestItem) => {
    if (!shift || !selectedCompanyId) return;
    setProcessingReqId(req.id);

    // Check slot availability
    const shiftAssignments = assignments.filter(a => a.shift_id === shift.id);
    const maxSlots = shift.slots ?? 1;
    const approvedRequests = requests.filter(r => r.status === "approved" && r.id !== req.id).length;
    if (shiftAssignments.length + approvedRequests >= maxSlots) {
      toast.error("No hay plazas disponibles");
      setProcessingReqId(null);
      return;
    }

    // Create assignment
    const { error: assignErr } = await supabase.from("shift_assignments").insert({
      company_id: selectedCompanyId,
      shift_id: shift.id,
      employee_id: req.employee_id,
      status: "confirmed",
    } as any);
    if (assignErr) { toast.error(assignErr.message); setProcessingReqId(null); return; }

    // Update request status
    await supabase.from("shift_requests")
      .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() } as any)
      .eq("id", req.id);

    // Notify employee
    await supabase.from("notifications").insert({
      company_id: selectedCompanyId,
      recipient_id: req.employee_id,
      recipient_type: "employee",
      type: "shift_request_approved",
      title: "Solicitud aprobada",
      body: `Tu solicitud para "${shift.title}" fue aprobada. Estás asignado.`,
      metadata: { shift_id: shift.id },
      created_by: user?.id,
    } as any);

    toast.success(`${req.employee.first_name} aprobado y asignado`);
    setProcessingReqId(null);
    await loadRequests();
    onRequestAction?.();
  };

  const handleRejectRequest = async () => {
    if (!rejectReqId || !shift || !selectedCompanyId) return;
    const req = requests.find(r => r.id === rejectReqId);
    if (!req) return;
    setProcessingReqId(rejectReqId);

    await supabase.from("shift_requests")
      .update({ status: "rejected", rejection_reason: rejectReason.trim() || null, reviewed_by: user?.id, reviewed_at: new Date().toISOString() } as any)
      .eq("id", rejectReqId);

    await supabase.from("notifications").insert({
      company_id: selectedCompanyId,
      recipient_id: req.employee_id,
      recipient_type: "employee",
      type: "shift_request_rejected",
      title: "Solicitud rechazada",
      body: `Tu solicitud para "${shift.title}" fue rechazada.${rejectReason.trim() ? ` Motivo: ${rejectReason.trim()}` : ""}`,
      metadata: { shift_id: shift.id },
      created_by: user?.id,
    } as any);

    toast.success("Solicitud rechazada");
    setProcessingReqId(null);
    setRejectReqId(null);
    setRejectReason("");
    await loadRequests();
    onRequestAction?.();
  };

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
      loadRequests();
    }
  }, [shift, open, loadRequests]);

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
    confirmed: "text-earning", pending: "text-warning", rejected: "text-destructive", review: "text-primary",
  };

  const statusIcons: Record<string, React.ReactNode> = {
    confirmed: <ShieldCheck className="h-3.5 w-3.5 text-earning" />,
    pending: <ShieldQuestion className="h-3.5 w-3.5 text-warning" />,
    rejected: <ShieldX className="h-3.5 w-3.5 text-destructive" />,
    review: <ShieldQuestion className="h-3.5 w-3.5 text-primary" />,
  };

  const statusLabels: Record<string, string> = {
    confirmed: "Aceptado", pending: "Pendiente", rejected: "Rechazado", review: "En revisión",
  };

  const handleChangeAssignmentStatus = async (assignmentId: string, newStatus: string) => {
    setUpdatingStatus(assignmentId);
    const { error } = await supabase.from("shift_assignments")
      .update({ status: newStatus } as any)
      .eq("id", assignmentId);
    if (error) { toast.error(error.message); }
    else { toast.success(`Estado actualizado a ${statusLabels[newStatus] || newStatus}`); }
    setUpdatingStatus(null);
    onRequestAction?.();
  };

  const handleConfirmRemove = () => {
    if (!removeConfirm) return;
    onRemoveAssignment(removeConfirm.assignmentId);
    setRemoveConfirm(null);
  };

  const statusLabel = shift.status === "published" ? "publicado" : shift.status === "draft" ? "borrador" : shift.status;

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setShowAddPanel(false); setSelected([]); setEditing(false); } }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
         <div className="px-5 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {shift.shift_code && (
                <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">
                  #{formatShiftCode(shift.shift_code)}
                </span>
              )}
              <p className="text-xs text-muted-foreground capitalize">
                {format(parseISO(shift.date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
              </p>
            </div>
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
                Detalles
              </TabsTrigger>
              <TabsTrigger
                value="team"
                className="text-xs px-0 pb-2 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
              >
                Equipo ({shiftAssignments.length}/{shift.slots ?? 1})
              </TabsTrigger>
              {requests.length > 0 && (
                <TabsTrigger
                  value="requests"
                  className="text-xs px-0 pb-2 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary gap-1"
                >
                  Solicitudes
                  {requests.filter(r => r.status === "pending").length > 0 && (
                    <Badge className="h-4 min-w-4 px-1 text-[9px] bg-warning text-warning-foreground">
                      {requests.filter(r => r.status === "pending").length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              <TabsTrigger
                value="comments"
                className="text-xs px-0 pb-2 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary gap-1"
              >
                <MessageSquare className="h-3 w-3" /> Comentarios
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
          ) : tab === "team" ? (
            /* Team tab */
            <div className="space-y-3">
              {/* Employee list with status management */}
              {shiftAssignments.length > 0 && (
                <div className="space-y-1.5">
                  {shiftAssignments.map(a => {
                    const emp = employees.find(e => e.id === a.employee_id);
                    if (!emp) return null;
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors",
                          a.status === "confirmed" && "border-earning/20 bg-earning/5",
                          a.status === "rejected" && "border-destructive/20 bg-destructive/5",
                          a.status === "review" && "border-primary/20 bg-primary/5",
                          a.status === "pending" && "border-warning/20 bg-warning/5",
                        )}
                        draggable={canEdit}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/assignment", JSON.stringify({
                            assignmentId: a.id, employeeId: a.employee_id, fromShiftId: shift.id,
                          }));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                      >
                        <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{emp.first_name} {emp.last_name}</p>
                        </div>
                        {/* Status dropdown */}
                        {canEdit ? (
                          <Select
                            value={a.status}
                            onValueChange={(v) => handleChangeAssignmentStatus(a.id, v)}
                            disabled={updatingStatus === a.id}
                          >
                            <SelectTrigger className={cn(
                              "h-7 w-[120px] text-[10px] font-semibold border-0 gap-1",
                              a.status === "confirmed" && "text-earning bg-earning/10",
                              a.status === "rejected" && "text-destructive bg-destructive/10",
                              a.status === "review" && "text-primary bg-primary/10",
                              a.status === "pending" && "text-warning bg-warning/10",
                            )}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="confirmed">
                                <span className="flex items-center gap-1.5 text-earning font-semibold">
                                  <ShieldCheck className="h-3 w-3" /> Aceptado
                                </span>
                              </SelectItem>
                              <SelectItem value="rejected">
                                <span className="flex items-center gap-1.5 text-destructive font-semibold">
                                  <ShieldX className="h-3 w-3" /> Rechazado
                                </span>
                              </SelectItem>
                              <SelectItem value="review">
                                <span className="flex items-center gap-1.5 text-primary font-semibold">
                                  <ShieldQuestion className="h-3 w-3" /> En revisión
                                </span>
                              </SelectItem>
                              <SelectItem value="pending">
                                <span className="flex items-center gap-1.5 text-warning font-semibold">
                                  <ShieldQuestion className="h-3 w-3" /> Pendiente
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={cn("text-[10px] font-semibold flex items-center gap-1", statusColors[a.status])}>
                            {statusIcons[a.status]}
                            {statusLabels[a.status] || a.status}
                          </span>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => setRemoveConfirm({
                              assignmentId: a.id,
                              employeeName: `${emp.first_name} ${emp.last_name}`,
                            })}
                            className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 rounded-lg hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
                    Agregar
                  </Button>
                )}
              </div>

              {/* Claimable toggle */}
              {canEdit && (
                <div className="flex items-center justify-between rounded-xl border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-3.5 w-3.5 text-primary" />
                    <div>
                      <p className="text-[11px] font-semibold">Permitir reclamo</p>
                      <p className="text-[9px] text-muted-foreground">Empleados podrán solicitar este turno</p>
                    </div>
                  </div>
                  <Switch
                    checked={shift.claimable}
                    onCheckedChange={async (checked) => {
                      if (onSave) {
                        await onSave(shift.id, { claimable: checked }, shift);
                      }
                    }}
                  />
                </div>
              )}

              {/* Add panel */}
              {showAddPanel && (
                <div className="border border-border/50 rounded-xl p-3 space-y-2 bg-muted/20">
                  <p className="text-[11px] font-medium text-muted-foreground">Seleccionar empleados</p>
                  <EmployeeCombobox
                    employees={unassigned}
                    selected={selected}
                    onToggle={toggleEmployee}
                    shifts={allShifts}
                    assignments={assignments}
                    shiftDate={shift.date}
                    shiftStart={shift.start_time.slice(0, 5)}
                    shiftEnd={shift.end_time.slice(0, 5)}
                    maxHeight="160px"
                    showChips={false}
                  />
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
          ) : tab === "requests" ? (
            /* Requests tab */
            <div className="space-y-3">
              {loadingRequests ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : requests.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Sin solicitudes</p>
              ) : (
                <>
                  {/* Capacity summary */}
                  <div className="rounded-lg bg-muted/40 p-3 text-center">
                    <p className="text-lg font-bold tabular-nums">
                      {shiftAssignments.length} <span className="text-muted-foreground text-sm font-normal">/ {shift.slots ?? 1}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">plazas ocupadas</p>
                  </div>

                  {requests.map(req => {
                    const isFull = shiftAssignments.length >= (shift.slots ?? 1);
                    return (
                      <div key={req.id} className="rounded-lg border bg-card p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <EmployeeAvatar firstName={req.employee.first_name} lastName={req.employee.last_name} size="sm" />
                            <div>
                              <p className="text-xs font-semibold">{req.employee.first_name} {req.employee.last_name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {format(parseISO(req.created_at), "d MMM HH:mm", { locale: es })}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className={cn("text-[10px]",
                            req.status === "pending" && "bg-warning/10 text-warning border-warning/30",
                            req.status === "approved" && "bg-earning/10 text-earning border-earning/30",
                            req.status === "rejected" && "bg-destructive/10 text-destructive border-destructive/30"
                          )}>
                            {req.status === "pending" ? "Pendiente" : req.status === "approved" ? "Aprobada" : "Rechazada"}
                          </Badge>
                        </div>

                        {req.message && (
                          <p className="text-[11px] text-muted-foreground bg-muted/30 rounded px-2 py-1">"{req.message}"</p>
                        )}

                        {req.rejection_reason && req.status === "rejected" && (
                          <p className="text-[11px] text-destructive flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> {req.rejection_reason}
                          </p>
                        )}

                        {req.status === "pending" && canEdit && (
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              className="h-7 text-[11px] gap-1"
                              onClick={() => handleApproveRequest(req)}
                              disabled={processingReqId === req.id || isFull}
                            >
                              {processingReqId === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                              {isFull ? "Sin plazas" : "Aprobar"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] gap-1 text-destructive hover:text-destructive"
                              onClick={() => { setRejectReqId(req.id); setRejectReason(""); }}
                              disabled={processingReqId === req.id}
                            >
                              <XCircle className="h-3 w-3" />
                              Rechazar
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          ) : tab === "comments" ? (
            <ShiftCommentsPanel shiftId={shift.id} companyId={selectedCompanyId!} employees={employees} />
          ) : null}
        </div>

        {/* Reject request dialog */}
        {rejectReqId && (
          <div className="absolute inset-0 z-50 bg-background/80 flex items-center justify-center p-6">
            <div className="bg-card border rounded-xl p-4 w-full max-w-sm space-y-3 shadow-lg">
              <p className="text-sm font-semibold">Rechazar solicitud</p>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Motivo del rechazo (opcional)..."
                rows={3}
                className="text-sm resize-none"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setRejectReqId(null); setRejectReason(""); }}>Cancelar</Button>
                <Button variant="destructive" size="sm" onClick={handleRejectRequest} disabled={processingReqId === rejectReqId}>
                  {processingReqId === rejectReqId ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Rechazar
                </Button>
              </div>
            </div>
          </div>
        )}
        {canEdit && (
          <div className="px-5 py-3 border-t border-border/40 bg-muted/20 flex items-center gap-2">
            {shift.status !== "published" && (
              <Button size="sm" onClick={() => onPublish(shift)} className="h-8 text-xs gap-1.5">
                <Send className="h-3 w-3" />
                Publicar
              </Button>
            )}
              <Button variant="outline" size="sm" onClick={() => setNotifyOpen(true)} className="h-8 text-xs gap-1.5">
                <Bell className="h-3 w-3" />
                Notificar
              </Button>
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

    {/* Remove assignment confirmation */}
    <AlertDialog open={!!removeConfirm} onOpenChange={(o) => { if (!o) setRemoveConfirm(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-destructive" /> Confirmar eliminación
          </AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de remover a <strong>{removeConfirm?.employeeName}</strong> de este turno? Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmRemove} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            Sí, remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <SendNotificationDialog
      open={notifyOpen}
      onOpenChange={setNotifyOpen}
      shift={shift}
      assignments={assignments}
      employees={employees}
    />
    </>
  );
}
