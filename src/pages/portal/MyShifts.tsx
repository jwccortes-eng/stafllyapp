import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  CalendarDays, Clock, MapPin, CheckCircle2, XCircle, AlertCircle,
  HandMetal, Users, Loader2, LogIn, ChevronRight, ChevronDown,
  FileText, Filter, LayoutList, LayoutGrid,
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
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { PortalShiftDetailDrawer } from "@/components/portal/PortalShiftDetailDrawer";
import { PortalShiftCard, type PortalShiftData } from "@/components/portal/PortalShiftCard";

interface ShiftAssignment {
  id: string;
  status: string;
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
  const { employeeId } = useAuth();
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
  const { toast } = useToast();

  const load = async () => {
    if (!employeeId) { setAssignments([]); setClaimable([]); setLoading(false); return; }
    setLoading(true);

    const { data: emp } = await supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle();
    if (!emp) { setLoading(false); return; }

    const { data: assignData } = await supabase
      .from("shift_assignments")
      .select(`id, status, scheduled_shifts!inner (id, title, date, start_time, end_time, notes, status, slots, shift_code, meeting_point, special_instructions, company_id, locations (name), clients (name))`)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });

    const mapped: ShiftAssignment[] = (assignData ?? []).map((a: any) => ({
      id: a.id,
      status: a.status,
      shift: {
        id: a.scheduled_shifts.id, title: a.scheduled_shifts.title,
        date: a.scheduled_shifts.date, start_time: a.scheduled_shifts.start_time,
        end_time: a.scheduled_shifts.end_time, notes: a.scheduled_shifts.notes,
        status: a.scheduled_shifts.status, slots: a.scheduled_shifts.slots,
        shift_code: a.scheduled_shifts.shift_code, meeting_point: a.scheduled_shifts.meeting_point,
        special_instructions: a.scheduled_shifts.special_instructions,
        company_id: a.scheduled_shifts.company_id,
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
    const { data: emp } = await supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle();
    if (!emp) { setClaiming(null); return; }
    const { data: existing } = await supabase.from("shift_requests").select("id").eq("shift_id", shiftId).eq("employee_id", employeeId).maybeSingle();
    if (existing) { toast({ title: "Ya solicitaste este turno", variant: "destructive" }); setClaiming(null); return; }
    const { error } = await supabase.from("shift_requests").insert({ shift_id: shiftId, employee_id: employeeId, company_id: emp.company_id, status: "pending" } as any);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "¡Solicitud enviada!" }); await load(); }
    setClaiming(null);
  };

  const acceptAssignment = async (assignmentId: string) => {
    setResponding(assignmentId);
    const { error } = await supabase.from("shift_assignments").update({ status: "confirmed", responded_at: new Date().toISOString() } as any).eq("id", assignmentId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "¡Turno confirmado!" }); await load(); }
    setResponding(null);
  };

  const rejectAssignment = async () => {
    if (!rejectDialogId) return;
    setResponding(rejectDialogId);
    const { error } = await supabase.from("shift_assignments").update({ status: "rejected", responded_at: new Date().toISOString(), rejection_reason: rejectReason.trim() || null } as any).eq("id", rejectDialogId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Turno rechazado" }); await load(); }
    setResponding(null); setRejectDialogId(null); setRejectReason("");
  };

  // Filter logic
  const today = startOfDay(new Date());
  const weekInterval = { start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) };

  const getFiltered = (): ShiftAssignment[] => {
    let list = assignments;

    // Tab filter
    switch (activeTab) {
      case "hoy":
        list = list.filter(a => isToday(parseISO(a.shift.date)));
        break;
      case "proximos":
        list = list.filter(a => !isBefore(parseISO(a.shift.date), today) && !isToday(parseISO(a.shift.date)));
        break;
      case "semana":
        list = list.filter(a => isWithinInterval(parseISO(a.shift.date), weekInterval));
        break;
      case "historial":
        list = list.filter(a => isBefore(parseISO(a.shift.date), today));
        break;
    }

    // Status filter
    switch (statusFilter) {
      case "pendientes":
        list = list.filter(a => a.status === "pending");
        break;
      case "confirmados":
        list = list.filter(a => a.status === "confirmed" || a.status === "accepted");
        break;
      case "cancelados":
        list = list.filter(a => a.status === "rejected");
        break;
    }

    // Sort: today first, then by date
    list.sort((a, b) => {
      if (activeTab === "historial") return parseISO(b.shift.date).getTime() - parseISO(a.shift.date).getTime();
      return parseISO(a.shift.date).getTime() - parseISO(b.shift.date).getTime();
    });

    return list;
  };

  const filtered = getFiltered();

  // Counts for tabs
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

  // Dynamic subtitle
  const subtitle = (() => {
    if (todayCount > 0) return `Tienes ${todayCount} turno${todayCount > 1 ? "s" : ""} hoy`;
    if (upcomingCount > 0) return `${upcomingCount} turno${upcomingCount > 1 ? "s" : ""} próximo${upcomingCount > 1 ? "s" : ""}`;
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
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold font-heading tracking-tight text-foreground flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-primary" />
          Mis Turnos
        </h1>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">{subtitle}</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0.5 bg-muted/30 p-0.5 rounded-lg overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold whitespace-nowrap transition-all flex-1 justify-center",
              activeTab === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground/70 hover:text-foreground"
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className={cn(
                "text-[8px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5",
                activeTab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground/70"
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Status chips + view toggle */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {statusFilters.map((sf) => (
            <button
              key={sf.key}
              onClick={() => setStatusFilter(sf.key)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all",
                statusFilter === sf.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground/60 hover:bg-muted/40"
              )}
            >
              {sf.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCompactView(!compactView)}
          className="p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
        >
          {compactView ? <LayoutGrid className="h-3.5 w-3.5" /> : <LayoutList className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Claimable shifts */}
      {claimable.length > 0 && activeTab !== "historial" && (
        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5 flex items-center gap-1">
            <HandMetal className="h-3 w-3" />
            Turnos disponibles · {claimable.length}
          </h2>
          <div className="space-y-1.5">
            {claimable.map((s) => (
              <div key={s.id} className="rounded-xl border border-dashed border-primary/25 bg-primary/[0.03] p-3.5 space-y-2.5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{s.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                      {isToday(parseISO(s.date)) ? "Hoy" : isTomorrow(parseISO(s.date)) ? "Mañana" : format(parseISO(s.date), "EEEE d MMM", { locale: es })}
                    </p>
                  </div>
                  {s.slots && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-primary/10 text-primary">
                      {s.slots - s.assignedCount} lugar{(s.slots - s.assignedCount) !== 1 ? "es" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5" />
                    {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                  </span>
                  {s.location && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 shrink-0" /> {s.location.name}
                    </span>
                  )}
                </div>
                <Button size="sm" className="w-full h-9 text-xs" onClick={() => claimShift(s.id)} disabled={claiming === s.id}>
                  {claiming === s.id ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Enviando...</> : <><HandMetal className="h-3.5 w-3.5 mr-1.5" />Solicitar turno</>}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shift list */}
      {filtered.length > 0 && (
        <div className="space-y-1.5">
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
        <div className="text-center py-12 space-y-3">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/50 border border-border/20 flex items-center justify-center">
            <CalendarDays className="h-7 w-7 text-muted-foreground/30" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {activeTab === "hoy" && "Sin turnos hoy"}
              {activeTab === "proximos" && "Sin turnos próximos"}
              {activeTab === "semana" && "Sin turnos esta semana"}
              {activeTab === "historial" && "Sin historial de turnos"}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              {activeTab === "hoy"
                ? "No tienes turnos programados para hoy. Revisa tus próximos turnos."
                : activeTab === "historial"
                ? "Aún no tienes turnos completados."
                : "Cuando haya turnos asignados, aparecerán aquí."
              }
            </p>
          </div>
        </div>
      )}

      {filtered.length === 0 && claimable.length > 0 && activeTab !== "historial" && (
        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-5 text-center space-y-2">
          <HandMetal className="h-6 w-6 text-primary mx-auto" />
          <p className="text-sm font-semibold text-foreground">¡Hay turnos disponibles!</p>
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Rechazar turno</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Indica opcionalmente el motivo.</p>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Motivo (opcional)..." rows={3} className="text-sm resize-none" />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setRejectDialogId(null); setRejectReason(""); }}>Cancelar</Button>
            <Button variant="destructive" size="sm" onClick={rejectAssignment} disabled={responding === rejectDialogId}>
              {responding === rejectDialogId ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
