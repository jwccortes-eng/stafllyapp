import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Loader2, ArrowLeft, Building2, MapPin, Clock, Users, Car, CalendarDays,
  Shield, MessageSquare, Phone, AlertTriangle, CheckCircle2, Plus, Send,
  FileText, Flag, Pencil, Hash, CreditCard, UserCheck, Truck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface ShiftDetail {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  slots: number;
  client_id: string | null;
  location_id: string | null;
  notes: string | null;
  pay_type: string;
  clock_method: string;
  transportation_required: boolean;
  car_capacity: number;
  transportation_notes: string | null;
  meeting_point: string | null;
  special_instructions: string | null;
  shift_admin_id: string | null;
  driver_employee_id: string | null;
  shift_code: string | null;
}

interface AssignmentDetail {
  id: string;
  employee_id: string;
  status: string;
  assignment_role: string;
  employee?: { first_name: string; last_name: string; phone_number: string | null; county: string | null; has_car: string | null };
}

interface TimelineEvent {
  id: string;
  event_type: string;
  description: string;
  actor_id: string | null;
  created_at: string;
  metadata: any;
}

interface ShiftNote {
  id: string;
  note_type: string;
  content: string;
  created_by: string;
  created_at: string;
  linked_employee_id: string | null;
}

const NOTE_TYPES = [
  { value: "internal", label: "Nota interna", icon: "📝" },
  { value: "call_log", label: "Registro de llamada", icon: "📞" },
  { value: "text_message", label: "Mensaje de texto", icon: "💬" },
  { value: "staffing", label: "Nota de staffing", icon: "👥" },
  { value: "transport", label: "Nota de transporte", icon: "🚗" },
  { value: "client", label: "Nota de cliente", icon: "🏢" },
  { value: "incident", label: "Incidente", icon: "⚠️" },
];

const EVENT_ICONS: Record<string, string> = {
  shift_created: "🆕", shift_edited: "✏️", employee_added: "➕", employee_removed: "➖",
  admin_assigned: "🛡️", driver_assigned: "🚗", transport_enabled: "🚐",
  message_sent: "📨", call_logged: "📞", comment_added: "💬",
  issue_flagged: "🚩", shift_started: "▶️", shift_completed: "✅",
  note_added: "📝", role_changed: "🔄",
};

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  staff: { label: "Staff", color: "bg-muted text-muted-foreground" },
  driver: { label: "Conductor", color: "bg-warning/10 text-warning border-warning/20" },
  shift_admin: { label: "Admin Turno", color: "bg-primary/10 text-primary border-primary/20" },
  shift_lead: { label: "Líder", color: "bg-earning/10 text-earning border-earning/20" },
  backup_admin: { label: "Backup Admin", color: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
  transport_lead: { label: "Líder Transporte", color: "bg-warning/10 text-warning border-warning/20" },
  check_in_admin: { label: "Check-in", color: "bg-info/10 text-info border-info/20" },
};

export default function ShiftOperations() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const shiftId = searchParams.get("id");

  const [shift, setShift] = useState<ShiftDetail | null>(null);
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [notes, setNotes] = useState<ShiftNote[]>([]);
  const [clientName, setClientName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [loading, setLoading] = useState(true);

  // Note form
  const [newNoteType, setNewNoteType] = useState("internal");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Staff list for role assignment
  const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string; county: string | null; has_car: string | null; phone_number: string | null }[]>([]);

  useEffect(() => {
    if (shiftId && selectedCompanyId) loadAll();
  }, [shiftId, selectedCompanyId]);

  const loadAll = async () => {
    if (!shiftId || !selectedCompanyId) return;
    setLoading(true);

    const [shiftRes, assignRes, timelineRes, notesRes, empsRes] = await Promise.all([
      supabase.from("scheduled_shifts").select("*").eq("id", shiftId).single(),
      supabase.from("shift_assignments").select("id, employee_id, status, assignment_role, employees(first_name, last_name, phone_number, county, has_car)").eq("shift_id", shiftId) as any,
      supabase.from("shift_timeline").select("*").eq("shift_id", shiftId).order("created_at", { ascending: false }),
      supabase.from("shift_notes").select("*").eq("shift_id", shiftId).order("created_at", { ascending: false }),
      supabase.from("employees").select("id, first_name, last_name, county, has_car, phone_number").eq("company_id", selectedCompanyId).eq("is_active", true),
    ]);

    if (shiftRes.data) {
      const s = shiftRes.data as any;
      setShift(s);
      // Fetch client/location names
      if (s.client_id) {
        const { data: cl } = await supabase.from("clients").select("name").eq("id", s.client_id).single();
        setClientName(cl?.name ?? "");
      }
      if (s.location_id) {
        const { data: loc } = await supabase.from("locations").select("name, address").eq("id", s.location_id).single();
        setLocationName(loc?.name ?? "");
        setLocationAddress(loc?.address ?? "");
      }
    }

    setAssignments((assignRes.data ?? []).map((a: any) => ({ ...a, employee: a.employees })));
    setTimeline((timelineRes.data ?? []) as TimelineEvent[]);
    setNotes((notesRes.data ?? []) as ShiftNote[]);
    setEmployees((empsRes.data ?? []) as any[]);
    setLoading(false);
  };

  const handleAddNote = async () => {
    if (!newNoteContent.trim() || !shiftId || !selectedCompanyId || !user) return;
    setSavingNote(true);
    const { error } = await supabase.from("shift_notes").insert({
      shift_id: shiftId,
      company_id: selectedCompanyId,
      note_type: newNoteType,
      content: newNoteContent.trim(),
      created_by: user.id,
    } as any);
    if (error) toast.error(error.message);
    else {
      toast.success("Nota agregada");
      // Also add to timeline
      await supabase.from("shift_timeline").insert({
        shift_id: shiftId,
        company_id: selectedCompanyId,
        event_type: "note_added",
        description: `Nota (${NOTE_TYPES.find(n => n.value === newNoteType)?.label}): ${newNoteContent.trim().slice(0, 80)}`,
        actor_id: user.id,
      } as any);
      setNewNoteContent("");
      loadAll();
    }
    setSavingNote(false);
  };

  const handleRoleChange = async (assignmentId: string, newRole: string) => {
    const { error } = await supabase.from("shift_assignments").update({ assignment_role: newRole } as any).eq("id", assignmentId);
    if (error) toast.error(error.message);
    else {
      toast.success("Rol actualizado");
      if (shiftId && selectedCompanyId && user) {
        await supabase.from("shift_timeline").insert({
          shift_id: shiftId,
          company_id: selectedCompanyId,
          event_type: "role_changed",
          description: `Rol cambiado a ${ROLE_LABELS[newRole]?.label ?? newRole}`,
          actor_id: user.id,
          metadata: { assignment_id: assignmentId, new_role: newRole },
        } as any);
      }
      loadAll();
    }
  };

  // KPIs
  const totalAssigned = assignments.length;
  const confirmed = assignments.filter(a => a.status === "confirmed").length;
  const pending = assignments.filter(a => a.status === "pending").length;
  const rejected = assignments.filter(a => a.status === "rejected").length;
  const drivers = assignments.filter(a => a.assignment_role === "driver").length;
  const admins = assignments.filter(a => ["shift_admin", "shift_lead", "backup_admin", "check_in_admin"].includes(a.assignment_role)).length;
  const carsNeeded = shift ? Math.ceil(totalAssigned / (shift.car_capacity || 5)) : 0;

  // Group by area
  const byArea = useMemo(() => {
    const map = new Map<string, AssignmentDetail[]>();
    assignments.forEach(a => {
      const area = a.employee?.county || "Sin área";
      if (!map.has(area)) map.set(area, []);
      map.get(area)!.push(a);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [assignments]);

  if (!shiftId) return <div className="p-8 text-center text-muted-foreground">No se especificó turno</div>;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (!shift) return (
    <div className="p-8 text-center text-muted-foreground">
      <p>Turno no encontrado</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/app/shifts")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Volver a turnos
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/shifts")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold font-heading">{shift.title}</h1>
            <Badge variant={shift.status === "published" ? "default" : shift.status === "locked" ? "secondary" : "outline"} className="text-[10px]">
              {shift.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Centro de Operaciones del Turno
          </p>
        </div>
      </div>

      {/* A) Shift Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Summary card */}
          <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
            <h2 className="text-sm font-bold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Resumen del turno</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Fecha", value: format(new Date(shift.date + "T12:00:00"), "EEE d MMM yyyy", { locale: es }), icon: CalendarDays },
                { label: "Horario", value: `${shift.start_time.slice(0, 5)} – ${shift.end_time.slice(0, 5)}`, icon: Clock },
                { label: "Cliente", value: clientName || "—", icon: Building2 },
                { label: "Ubicación", value: locationName || "—", icon: MapPin },
              ].map(item => (
                <div key={item.label} className="rounded-xl bg-muted/30 p-3">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1"><item.icon className="h-3 w-3" />{item.label}</p>
                  <p className="text-sm font-semibold mt-0.5 truncate">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> Pago</p>
                <p className="text-sm font-semibold mt-0.5">{shift.pay_type === "daily" ? "📅 Día" : "⏱ Hora"}</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Fichaje</p>
                <p className="text-sm font-semibold mt-0.5">{shift.clock_method === "mobile" ? "📱 Móvil" : shift.clock_method === "kiosk" ? "🖥 Kiosk" : "📱🖥 Ambos"}</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Car className="h-3 w-3" /> Transporte</p>
                <p className="text-sm font-semibold mt-0.5">{shift.transportation_required ? "✅ Requerido" : "❌ No"}</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" /> Plazas</p>
                <p className="text-sm font-semibold mt-0.5">{shift.slots ?? 1}</p>
              </div>
            </div>
            {(shift.meeting_point || shift.special_instructions || locationAddress) && (
              <div className="rounded-xl bg-primary/[0.03] border border-primary/10 p-3 space-y-1.5">
                {(shift.meeting_point || locationAddress) && (
                  <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">📍 Punto de encuentro:</span> {shift.meeting_point || locationAddress}</p>
                )}
                {shift.special_instructions && (
                  <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">📋 Instrucciones:</span> {shift.special_instructions}</p>
                )}
              </div>
            )}
          </div>

          {/* B) Staffing Board */}
          <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
            <h2 className="text-sm font-bold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Staffing Board</h2>
            {/* KPI chips */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Plazas", value: shift.slots ?? 1, color: "text-foreground" },
                { label: "Asignados", value: totalAssigned, color: "text-primary" },
                { label: "Confirmados", value: confirmed, color: "text-earning" },
                { label: "Pendientes", value: pending, color: "text-warning" },
                { label: "Rechazados", value: rejected, color: "text-destructive" },
                { label: "Conductores", value: drivers, color: "text-warning" },
                { label: "Admins", value: admins, color: "text-primary" },
              ].map(k => (
                <div key={k.label} className="flex items-center gap-1.5 rounded-lg bg-muted/30 px-2.5 py-1.5">
                  <span className={cn("text-sm font-bold tabular-nums", k.color)}>{k.value}</span>
                  <span className="text-[10px] text-muted-foreground">{k.label}</span>
                </div>
              ))}
            </div>
            {/* Assignment list */}
            <div className="space-y-1.5">
              {assignments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No hay asignaciones aún</p>
              ) : assignments.map(a => {
                const emp = a.employee;
                const roleInfo = ROLE_LABELS[a.assignment_role] || ROLE_LABELS.staff;
                return (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors px-3 py-2.5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                        {emp ? `${emp.first_name[0]}${emp.last_name[0]}` : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{emp ? `${emp.first_name} ${emp.last_name}` : a.employee_id}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {emp?.phone_number && <span className="text-[10px] text-muted-foreground">{emp.phone_number}</span>}
                        {emp?.county && <span className="text-[10px] text-muted-foreground/50">• {emp.county}</span>}
                        {emp?.has_car === "yes" && <Car className="h-2.5 w-2.5 text-warning" />}
                      </div>
                    </div>
                    {/* Role selector */}
                    <Select value={a.assignment_role} onValueChange={v => handleRoleChange(a.id, v)}>
                      <SelectTrigger className={cn("h-7 text-[10px] font-semibold w-auto min-w-[110px] border rounded-lg", roleInfo.color)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Status badge */}
                    <Badge variant={a.status === "confirmed" ? "default" : a.status === "rejected" ? "destructive" : "outline"} className="text-[9px] shrink-0">
                      {a.status === "confirmed" ? "✅" : a.status === "rejected" ? "❌" : "⏳"} {a.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          {/* C) Staff by Area — assigned + unassigned pool */}
          <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
            <h2 className="text-sm font-bold flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Staff por Área</h2>
            {/* Assigned by area */}
            {byArea.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {byArea.map(([area, areaAssignments]) => (
                  <div key={area} className="rounded-xl border border-border/30 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold">{area}</p>
                      <Badge variant="secondary" className="text-[9px]">{areaAssignments.length}</Badge>
                    </div>
                    <div className="space-y-1">
                      {areaAssignments.map(a => (
                        <div key={a.id} className="flex items-center gap-2 text-[11px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          <span className="truncate">{a.employee?.first_name} {a.employee?.last_name}</span>
                          <span className="text-muted-foreground/50 ml-auto text-[9px]">{ROLE_LABELS[a.assignment_role]?.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Unassigned employee pool by area */}
            {(() => {
              const assignedIds = new Set(assignments.map(a => a.employee_id));
              const unassigned = employees.filter(e => !assignedIds.has(e.id));
              if (unassigned.length === 0) return null;

              const unassignedByArea = new Map<string, typeof unassigned>();
              unassigned.forEach(e => {
                const area = e.county || "Sin área";
                if (!unassignedByArea.has(area)) unassignedByArea.set(area, []);
                unassignedByArea.get(area)!.push(e);
              });
              const sortedAreas = Array.from(unassignedByArea.entries()).sort((a, b) => a[0].localeCompare(b[0]));

              return (
                <div className="space-y-2 mt-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Disponibles para asignar</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sortedAreas.map(([area, areaEmps]) => (
                      <div key={area} className="rounded-xl border border-dashed border-border/40 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-muted-foreground">{area}</p>
                          <Badge variant="outline" className="text-[9px]">{areaEmps.length}</Badge>
                        </div>
                        <div className="space-y-1">
                          {areaEmps.slice(0, 8).map(e => (
                            <div key={e.id} className="flex items-center gap-2 text-[11px] group">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                              <span className="truncate text-muted-foreground">{e.first_name} {e.last_name}</span>
                              {e.has_car === "yes" && <Car className="h-2.5 w-2.5 text-warning shrink-0" />}
                              <button
                                className="ml-auto text-[9px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={async () => {
                                  if (!shiftId || !selectedCompanyId) return;
                                  const { error } = await supabase.from("shift_assignments").insert({
                                    company_id: selectedCompanyId,
                                    shift_id: shiftId,
                                    employee_id: e.id,
                                    status: "pending",
                                  } as any);
                                  if (error) toast.error(error.message);
                                  else { toast.success(`${e.first_name} asignado`); loadAll(); }
                                }}
                              >
                                + Asignar
                              </button>
                            </div>
                          ))}
                          {areaEmps.length > 8 && (
                            <p className="text-[9px] text-muted-foreground/50 text-center">+{areaEmps.length - 8} más</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Right column: Transport, Timeline, Notes */}
        <div className="space-y-4">
          {/* D) Transport Panel */}
          {shift.transportation_required && (
            <div className="rounded-2xl border border-warning/20 bg-warning/[0.03] p-4 space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2"><Truck className="h-4 w-4 text-warning" /> Transporte</h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-card p-2.5 border border-border/30">
                  <p className="text-[10px] text-muted-foreground">Carros necesarios</p>
                  <p className="text-lg font-bold text-warning">{carsNeeded}</p>
                </div>
                <div className="rounded-lg bg-card p-2.5 border border-border/30">
                  <p className="text-[10px] text-muted-foreground">Conductores</p>
                  <p className="text-lg font-bold">{drivers}</p>
                </div>
              </div>
              {drivers < carsNeeded && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <p className="text-[10px] text-destructive font-medium">
                    Faltan {carsNeeded - drivers} conductor(es). Asigna el rol "Conductor" al staffing.
                  </p>
                </div>
              )}
              {shift.transportation_notes && (
                <p className="text-[11px] text-muted-foreground">📝 {shift.transportation_notes}</p>
              )}
            </div>
          )}

          {/* E) Timeline */}
          <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Cronología</h2>
            {timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sin eventos aún</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                {timeline.map(evt => (
                  <div key={evt.id} className="flex gap-2.5">
                    <span className="text-sm mt-0.5 shrink-0">{EVENT_ICONS[evt.event_type] || "📌"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-foreground leading-snug">{evt.description}</p>
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                        {format(new Date(evt.created_at), "d MMM HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* F) Admin Notes */}
          <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Notas & Comunicación</h2>
            {/* Add note form */}
            <div className="space-y-2 bg-muted/20 rounded-xl p-3">
              <div className="flex gap-2">
                <Select value={newNoteType} onValueChange={setNewNoteType}>
                  <SelectTrigger className="h-8 text-[10px] w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTE_TYPES.map(nt => (
                      <SelectItem key={nt.value} value={nt.value} className="text-xs">{nt.icon} {nt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={newNoteContent}
                onChange={e => setNewNoteContent(e.target.value)}
                placeholder="Escribe una nota..."
                rows={2}
                className="text-xs resize-none"
              />
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={savingNote || !newNoteContent.trim()}
                className="w-full h-7 text-xs"
              >
                {savingNote ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                Agregar nota
              </Button>
            </div>
            {/* Notes list */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto scrollbar-thin">
              {notes.map(n => {
                const ntInfo = NOTE_TYPES.find(nt => nt.value === n.note_type);
                return (
                  <div key={n.id} className="rounded-lg bg-muted/20 p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold">{ntInfo?.icon} {ntInfo?.label ?? n.note_type}</span>
                      <span className="text-[9px] text-muted-foreground/50">{format(new Date(n.created_at), "d MMM HH:mm", { locale: es })}</span>
                    </div>
                    <p className="text-[11px] text-foreground whitespace-pre-wrap">{n.content}</p>
                  </div>
                );
              })}
              {notes.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Sin notas</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
