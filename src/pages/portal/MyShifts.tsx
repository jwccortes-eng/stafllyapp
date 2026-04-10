import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import {
  CalendarDays, Clock, MapPin, HandMetal, Loader2, LayoutList, LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format, parseISO, isBefore, startOfDay, isToday, isTomorrow,
  endOfWeek, startOfWeek, isWithinInterval,
} from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { PortalShiftDetailDrawer } from "@/components/portal/PortalShiftDetailDrawer";
import { PortalShiftCard, type PortalShiftData } from "@/components/portal/PortalShiftCard";

interface ShiftAssignment {
  id: string;
  status: string;
  response_status: string;
  accepted_shift_version: number | null;
  shift: {
    id: string;
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
    status: string;
    slots: number | null;
    shift_code?: string | null;
    meeting_point?: string | null;
    special_instructions?: string | null;
    company_id?: string;
    operational_version?: number;
    location?: { name: string } | null;
    client?: { name: string } | null;
  };
}

interface ClaimableShift {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  slots: number | null;
  location?: { name: string } | null;
  client?: { name: string } | null;
  assignedCount: number;
}

type TabFilter = "hoy" | "proximos" | "semana" | "historial";
type StatusFilter = "todos" | "pendientes" | "confirmados" | "cancelados";

export default function MyShifts() {
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [claimable, setClaimable] = useState<ClaimableShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedShift, setSelectedShift] = useState<ShiftAssignment | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>("hoy");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [compactView, setCompactView] = useState(false);
  // toast imported from sonner at top

  const load = async () => {
    if (!employeeId) { setAssignments([]); setClaimable([]); setLoading(false); return; }
    setLoading(true);

    const { data: emp } = await supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle();
    if (!emp) { setLoading(false); return; }

    const { data: assignData } = await supabase
      .from("shift_assignments")
      .select(`id, status, response_status, accepted_shift_version, scheduled_shifts!inner (id, title, date, start_time, end_time, notes, status, slots, shift_code, meeting_point, special_instructions, company_id, operational_version, locations (name), clients (name))`)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });

    const mapped: ShiftAssignment[] = (assignData ?? []).map((a: any) => ({
      id: a.id,
      status: a.status,
      response_status: a.response_status ?? "pending",
      accepted_shift_version: a.accepted_shift_version,
      shift: {
        id: a.scheduled_shifts.id, title: a.scheduled_shifts.title,
        date: a.scheduled_shifts.date, start_time: a.scheduled_shifts.start_time,
        end_time: a.scheduled_shifts.end_time, notes: a.scheduled_shifts.notes,
        status: a.scheduled_shifts.status, slots: a.scheduled_shifts.slots,
        shift_code: a.scheduled_shifts.shift_code, meeting_point: a.scheduled_shifts.meeting_point,
        special_instructions: a.scheduled_shifts.special_instructions,
        company_id: a.scheduled_shifts.company_id,
        operational_version: a.scheduled_shifts.operational_version,
        location: a.scheduled_shifts.locations, client: a.scheduled_shifts.clients,
      },
    }));
    setAssignments(mapped);

    const today = new Date().toISOString().split("T")[0];
    const { data: claimData } = await supabase
      .from("scheduled_shifts")
      .select(`id, title, date, start_time, end_time, notes, slots, locations (name), clients (name), shift_assignments (id)`)
      .eq("company_id", emp.company_id).eq("claimable", true).eq("status", "open")
      .is("deleted_at", null).gte("date", today).order("date", { ascending: true });

    const myShiftIds = new Set(mapped.map(a => a.shift.id));
    const claimableFiltered: ClaimableShift[] = (claimData ?? [])
      .filter((s: any) => !myShiftIds.has(s.id))
      .filter((s: any) => { const c = s.shift_assignments?.length ?? 0; return !s.slots || c < s.slots; })
      .map((s: any) => ({
        id: s.id, title: s.title, date: s.date, start_time: s.start_time,
        end_time: s.end_time, notes: s.notes, slots: s.slots,
        location: s.locations, client: s.clients, assignedCount: s.shift_assignments?.length ?? 0,
      }));
    setClaimable(claimableFiltered);
    setLoading(false);
  };

  useEffect(() => { load(); }, [employeeId]);

  const claimShift = async (shiftId: string) => {
    if (!employeeId) return;
    setClaiming(shiftId);

    // Optimistic UI: remove from claimable immediately
    const claimedShift = claimable.find(s => s.id === shiftId);
    setClaimable(prev => prev.filter(s => s.id !== shiftId));

    try {
      const { data: emp } = await supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle();
      if (!emp) throw new Error("Empleado no encontrado");

      // Check for existing request/assignment to prevent duplicates
      const { data: existing } = await supabase.from("shift_requests").select("id").eq("shift_id", shiftId).eq("employee_id", employeeId).maybeSingle();
      if (existing) throw new Error("Ya solicitaste este turno");

      // Race condition guard: re-check slot availability
      const { data: currentShift } = await supabase.from("scheduled_shifts")
        .select("slots, shift_assignments(id)").eq("id", shiftId).maybeSingle();
      if (currentShift) {
        const filled = currentShift.shift_assignments?.length ?? 0;
        if (currentShift.slots && filled >= currentShift.slots) throw new Error("Este turno ya está lleno");
      }

      const { error } = await supabase.from("shift_requests").insert({
        shift_id: shiftId, employee_id: employeeId, company_id: emp.company_id, status: "pending",
      } as any);
      if (error) throw error;

      // Success feedback: sound + vibration + toast
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      } catch {}
      if (navigator.vibrate) navigator.vibrate(100);

      toast.success("✅ ¡Solicitud enviada!", { description: claimedShift ? `Turno "${claimedShift.title}" solicitado exitosamente.` : "Tu solicitud fue registrada." });
      await load();
    } catch (err: any) {
      // Rollback optimistic update
      if (claimedShift) setClaimable(prev => [...prev, claimedShift].sort((a, b) => a.date.localeCompare(b.date)));
      toast.error("Error", { description: err.message ?? "No se pudo solicitar el turno." });
    } finally {
      setClaiming(null);
    }
  };

  const notifyAdminOfResponse = async (assignmentId: string, action: "confirmed" | "rejected") => {
    try {
      const { data: sa } = await supabase.from("shift_assignments").select("shift_id, employee_id").eq("id", assignmentId).maybeSingle();
      if (!sa) return;
      const { data: shift } = await supabase.from("scheduled_shifts").select("title, company_id, date, start_time").eq("id", sa.shift_id).maybeSingle();
      if (!shift) return;
      const { data: emp } = await supabase.from("employees").select("first_name, last_name").eq("id", sa.employee_id).maybeSingle();
      const empName = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : "Empleado";
      const { data: admins } = await supabase.from("company_users").select("user_id").eq("company_id", shift.company_id).in("role", ["admin", "company_owner", "owner"]);
      const emoji = action === "confirmed" ? "✅" : "❌";
      const verb = action === "confirmed" ? "confirmó" : "rechazó";
      for (const admin of admins ?? []) {
        await supabase.from("notifications").insert({
          company_id: shift.company_id,
          recipient_id: admin.user_id,
          recipient_type: "user",
          type: action === "confirmed" ? "shift_confirmed" : "shift_rejected",
          title: `${emoji} ${empName} ${verb} turno`,
          body: `"${shift.title}" — ${shift.date} a las ${(shift.start_time as string).slice(0, 5)}`,
          metadata: { shift_id: sa.shift_id, employee_id: sa.employee_id, assignment_id: assignmentId },
        });
      }
    } catch { /* non-blocking */ }
  };

  const acceptAssignment = async (assignmentId: string) => {
    setResponding(assignmentId);
    const assignment = assignments.find(a => a.id === assignmentId);
    const version = assignment?.shift?.operational_version ?? 1;
    const { error } = await supabase.from("shift_assignments").update({
      status: "confirmed",
      responded_at: new Date().toISOString(),
      response_status: "accepted",
      response_required: false,
      accepted_at: new Date().toISOString(),
      accepted_shift_version: version,
    } as any).eq("id", assignmentId);
    if (error) toast.error("Error", { description: error.message });
    else { toast.success("¡Turno confirmado!"); notifyAdminOfResponse(assignmentId, "confirmed"); await load(); }
    setResponding(null);
  };

  const rejectAssignment = async () => {
    if (!rejectDialogId) return;
    setResponding(rejectDialogId);
    const { error } = await supabase.from("shift_assignments").update({
      status: "rejected",
      responded_at: new Date().toISOString(),
      rejection_reason: rejectReason.trim() || null,
      response_status: "rejected",
      response_required: false,
      rejected_at: new Date().toISOString(),
    } as any).eq("id", rejectDialogId);
    if (error) toast.error("Error", { description: error.message });
    else { toast.success("Turno rechazado"); notifyAdminOfResponse(rejectDialogId, "rejected"); await load(); }
    setResponding(null); setRejectDialogId(null); setRejectReason("");
  };

  const today = startOfDay(new Date());
  const weekInterval = { start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) };

  const getFiltered = (): ShiftAssignment[] => {
    let list = assignments;
    switch (activeTab) {
      case "hoy": list = list.filter(a => isToday(parseISO(a.shift.date))); break;
      case "proximos": list = list.filter(a => !isBefore(parseISO(a.shift.date), today) && !isToday(parseISO(a.shift.date))); break;
      case "semana": list = list.filter(a => isWithinInterval(parseISO(a.shift.date), weekInterval)); break;
      case "historial": list = list.filter(a => isBefore(parseISO(a.shift.date), today)); break;
    }
    switch (statusFilter) {
      case "pendientes": list = list.filter(a => a.status === "pending"); break;
      case "confirmados": list = list.filter(a => a.status === "confirmed" || a.status === "accepted"); break;
      case "cancelados": list = list.filter(a => a.status === "rejected"); break;
    }
    list.sort((a, b) => {
      if (activeTab === "historial") return parseISO(b.shift.date).getTime() - parseISO(a.shift.date).getTime();
      return parseISO(a.shift.date).getTime() - parseISO(b.shift.date).getTime();
    });
    return list;
  };

  const filtered = getFiltered();

  const todayCount = assignments.filter(a => isToday(parseISO(a.shift.date))).length;
  const upcomingCount = assignments.filter(a => !isBefore(parseISO(a.shift.date), today) && !isToday(parseISO(a.shift.date))).length;
  const weekCount = assignments.filter(a => isWithinInterval(parseISO(a.shift.date), weekInterval)).length;
  const pastCount = assignments.filter(a => isBefore(parseISO(a.shift.date), today)).length;

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: "hoy", label: "Hoy", count: todayCount },
    { key: "proximos", label: "Próximos", count: upcomingCount },
    { key: "semana", label: "Semana", count: weekCount },
    { key: "historial", label: "Historial", count: pastCount },
  ];

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "pendientes", label: "Pendientes" },
    { key: "confirmados", label: "Confirmados" },
    { key: "cancelados", label: "Cancelados" },
  ];

  const subtitle = (() => {
    if (todayCount > 0) return `${todayCount} turno${todayCount > 1 ? "s" : ""} hoy`;
    if (upcomingCount > 0) return `${upcomingCount} próximo${upcomingCount > 1 ? "s" : ""}`;
    return "Sin turnos programados";
  })();

  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        {[1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  const toCardData = (a: ShiftAssignment): PortalShiftData => ({
    id: a.shift.id,
    assignmentId: a.id,
    title: a.shift.title,
    date: a.shift.date,
    start_time: a.shift.start_time,
    end_time: a.shift.end_time,
    status: a.status,
    location_name: a.shift.location?.name,
    client_name: a.shift.client?.name,
    meeting_point: a.shift.meeting_point,
  });

  return (
    <div className="space-y-4 animate-fade-in pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold font-heading tracking-tight text-foreground">
          Mis Turnos
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-2xl overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-1 justify-center",
              activeTab === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground/60 hover:text-foreground"
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className={cn(
                "text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1",
                activeTab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground/60"
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Status chips + view toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {statusFilters.map((sf) => (
            <button
              key={sf.key}
              onClick={() => setStatusFilter(sf.key)}
              className={cn(
                "px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all",
                statusFilter === sf.key
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground/50 hover:bg-muted/40"
              )}
            >
              {sf.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCompactView(!compactView)}
          className="p-1.5 rounded-xl text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
        >
          {compactView ? <LayoutGrid className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
        </button>
      </div>

      {/* Claimable shifts */}
      {claimable.length > 0 && activeTab !== "historial" && (
        <div>
          <h2 className="text-xs font-bold text-primary mb-2 flex items-center gap-1.5">
            <HandMetal className="h-3.5 w-3.5" />
            Turnos disponibles · {claimable.length}
          </h2>
          <div className="space-y-2">
            {claimable.map((s) => (
              <div key={s.id} className="rounded-2xl border-2 border-dashed border-primary/20 bg-primary/[0.02] p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-foreground">{s.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                      {isToday(parseISO(s.date)) ? "Hoy" : isTomorrow(parseISO(s.date)) ? "Mañana" : format(parseISO(s.date), "EEEE d MMM", { locale: es })}
                    </p>
                  </div>
                  {s.slots && (
                    <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-primary/10 text-primary">
                      {s.slots - s.assignedCount} lugar{(s.slots - s.assignedCount) !== 1 ? "es" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5 text-primary/50" />
                    {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                  </span>
                  {s.location && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 shrink-0 text-primary/40" /> {s.location.name}
                    </span>
                  )}
                </div>
                <Button size="sm" className="w-full h-10 text-xs rounded-xl font-bold" onClick={() => claimShift(s.id)} disabled={claiming === s.id}>
                  {claiming === s.id ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Enviando...</> : <><HandMetal className="h-3.5 w-3.5 mr-1.5" />Solicitar turno</>}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shift list */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((a) => (
            <PortalShiftCard
              key={a.id}
              shift={toCardData(a)}
              compact={compactView || activeTab === "historial"}
              onClick={() => setSelectedShift(a)}
              onAccept={a.status === "pending" && !isBefore(parseISO(a.shift.date), today) ? () => acceptAssignment(a.id) : undefined}
              onReject={a.status === "pending" && !isBefore(parseISO(a.shift.date), today) ? () => { setRejectDialogId(a.id); setRejectReason(""); } : undefined}
              onClockIn={
                (a.status === "confirmed" || a.status === "accepted") && isToday(parseISO(a.shift.date))
                  ? () => navigate(`/portal/clock?shiftId=${a.shift.id}`)
                  : undefined
              }
              responding={responding === a.id}
            />
          ))}
        </div>
      )}

      {/* Empty states */}
      {filtered.length === 0 && claimable.length === 0 && (
        <div className="text-center py-14 space-y-3">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/30 border border-border/15 flex items-center justify-center">
            <CalendarDays className="h-7 w-7 text-muted-foreground/20" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground">
              {activeTab === "hoy" && "Sin turnos hoy"}
              {activeTab === "proximos" && "Sin turnos próximos"}
              {activeTab === "semana" && "Sin turnos esta semana"}
              {activeTab === "historial" && "Sin historial"}
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-[240px] mx-auto">
              {activeTab === "hoy"
                ? "No tienes turnos programados para hoy."
                : activeTab === "historial"
                ? "Aún no tienes turnos completados."
                : "Los turnos asignados aparecerán aquí."
              }
            </p>
          </div>
        </div>
      )}

      {filtered.length === 0 && claimable.length > 0 && activeTab !== "historial" && (
        <div className="rounded-2xl border-2 border-dashed border-primary/20 bg-primary/[0.02] p-6 text-center space-y-2">
          <HandMetal className="h-7 w-7 text-primary mx-auto" />
          <p className="text-sm font-bold text-foreground">¡Hay turnos disponibles!</p>
          <p className="text-xs text-muted-foreground">Solicita los turnos abiertos de arriba.</p>
        </div>
      )}

      {/* Shift detail drawer */}
      <PortalShiftDetailDrawer
        shift={selectedShift?.shift ?? null}
        assignmentStatus={selectedShift?.status}
        open={!!selectedShift}
        onOpenChange={o => { if (!o) setSelectedShift(null); }}
      />

      {/* Reject dialog */}
      <Dialog open={!!rejectDialogId} onOpenChange={o => { if (!o) { setRejectDialogId(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Rechazar turno</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Indica opcionalmente el motivo del rechazo.</p>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Motivo (opcional)..." rows={3} className="text-sm resize-none rounded-xl" />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setRejectDialogId(null); setRejectReason(""); }}>Cancelar</Button>
            <Button variant="destructive" size="sm" className="rounded-xl" onClick={rejectAssignment} disabled={responding === rejectDialogId}>
              {responding === rejectDialogId ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
