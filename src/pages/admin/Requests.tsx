import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { OperationalWorkspace, WorkspaceSearch } from "@/components/stafly-ui/OperationalWorkspace";
import {
  Inbox, Search, CheckCircle2, Clock, AlertTriangle, AlertCircle, Info,
  User, Send, XCircle, Calendar, Timer, ArrowRight, MapPin, DollarSign,
} from "lucide-react";
import { formatDistanceToNow, format, isToday, isFuture, isPast, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";

interface Ticket {
  id: string;
  type: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  source: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  created_at: string;
  resolved_at: string | null;
  employee_id: string;
  company_id: string;
  employee?: { first_name: string; last_name: string };
}

interface TicketNote {
  id: string;
  content: string;
  author_type: string;
  note_type: string;
  created_at: string;
  author_id: string;
}

interface ShiftCtx {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string | null;
  client_id: string | null;
  location_id: string | null;
  client_name?: string | null;
}
interface TimeEntryCtx {
  id: string;
  shift_id: string | null;
  clock_in: string | null;
  clock_out: string | null;
  status: string | null;
}
interface AssignmentCtx {
  shift_id: string;
  employee_id: string;
  attendance_status: string | null;
}

type Urgency = "critical" | "warning" | "info";

const STATUS_CONFIG: Record<string, { label: string; tone: string; icon: any }> = {
  new: { label: "New", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20", icon: AlertCircle },
  in_progress: { label: "In review", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20", icon: Clock },
  resolved: { label: "Resolved", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20", icon: CheckCircle2 },
  closed: { label: "Closed", tone: "bg-muted text-muted-foreground border-border", icon: XCircle },
};

const TYPE_LABELS: Record<string, string> = {
  clock_request: "Missing clock-in",
  shift_request: "Schedule issue",
  general: "General request",
  complaint: "Complaint",
  document: "Document issue",
  schedule_change: "Schedule issue",
  no_show: "No-show reported",
  attendance: "Attendance issue",
};

const PRIORITY_RANK: Record<string, number> = {
  urgent: 4, high: 3, normal: 2, low: 1,
};

const PRIORITY_META: Record<string, { label: string; pill: string; border: string; bar: string }> = {
  urgent: {
    label: "Urgent",
    pill: "bg-destructive/10 text-destructive border-destructive/20",
    border: "border-destructive/40 ring-1 ring-destructive/10",
    bar: "bg-destructive",
  },
  high: {
    label: "High",
    pill: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
    border: "border-orange-500/30",
    bar: "bg-orange-500",
  },
  normal: {
    label: "Normal",
    pill: "bg-muted text-foreground/70 border-border",
    border: "border-border/50",
    bar: "bg-muted-foreground/30",
  },
  low: {
    label: "Low",
    pill: "bg-muted/60 text-muted-foreground/70 border-border/40",
    border: "border-border/30 opacity-90",
    bar: "bg-muted-foreground/20",
  },
};

const ATTENDANCE_LABELS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pending validation", tone: "text-amber-600 dark:text-amber-400" },
  present: { label: "Present", tone: "text-emerald-600 dark:text-emerald-400" },
  late: { label: "Late", tone: "text-amber-600 dark:text-amber-400" },
  absent: { label: "Absent", tone: "text-destructive" },
};

const URGENCY_BAR: Record<Urgency, string> = {
  critical: "bg-destructive",
  warning: "bg-amber-500",
  info: "bg-muted-foreground/30",
};
const URGENCY_PILL: Record<Urgency, { label: string; cls: string; Icon: any }> = {
  critical: { label: "Critical", cls: "bg-destructive/10 text-destructive border-destructive/20", Icon: AlertTriangle },
  warning: { label: "Needs attention", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20", Icon: AlertCircle },
  info: { label: "Info", cls: "bg-muted text-muted-foreground border-border", Icon: Info },
};

const ATTENDANCE_TYPES = new Set(["clock_request", "no_show", "attendance"]);

function isAttendanceTicket(t: Ticket): boolean {
  return ATTENDANCE_TYPES.has(t.type);
}

function computeUrgency(t: Ticket, shift: ShiftCtx | null, te: TimeEntryCtx | null): Urgency {
  // Critical: payroll-affecting
  if (isAttendanceTicket(t) && t.status !== "resolved" && t.status !== "closed") return "critical";
  if (t.priority === "urgent") return "critical";
  if (shift) {
    const shiftDate = parseISO(shift.date);
    if (isPast(shiftDate) && !isToday(shiftDate) && isAttendanceTicket(t) && !te) return "critical";
  }
  if (t.priority === "high") return "warning";
  return "info";
}

function shiftTimeWindow(s: ShiftCtx | null): string {
  if (!s) return "";
  return `${s.start_time?.slice(0, 5)} – ${s.end_time?.slice(0, 5)}`;
}

function shiftWhen(s: ShiftCtx | null): { label: string; isPastShift: boolean } {
  if (!s) return { label: "", isPastShift: false };
  const d = parseISO(s.date);
  if (isToday(d)) return { label: "Today", isPastShift: false };
  if (isFuture(d)) return { label: format(d, "EEE MMM d", { locale: enUS }), isPastShift: false };
  return { label: format(d, "EEE MMM d", { locale: enUS }), isPastShift: true };
}

export default function Requests() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [shifts, setShifts] = useState<Record<string, ShiftCtx>>({});
  const [timeEntries, setTimeEntries] = useState<Record<string, TimeEntryCtx>>({});
  const [assignments, setAssignments] = useState<Record<string, AssignmentCtx>>({}); // key shiftId:empId
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "in_progress" | "resolved">("all");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | Urgency>("all");
  const [search, setSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);

  const fetchContext = useCallback(async (rows: Ticket[]) => {
    const shiftIds = new Set<string>();
    const teIds = new Set<string>();
    const empByShift: Array<{ s: string; e: string }> = [];
    rows.forEach(t => {
      if (!t.source_entity_id) return;
      if (t.source_entity_type === "shift" || t.source_entity_type === "scheduled_shift") {
        shiftIds.add(t.source_entity_id);
        empByShift.push({ s: t.source_entity_id, e: t.employee_id });
      }
      if (t.source_entity_type === "time_entry") teIds.add(t.source_entity_id);
    });

    const [sRes, teRes] = await Promise.all([
      shiftIds.size
        ? supabase.from("scheduled_shifts").select("id, date, start_time, end_time, title, client_id, location_id").in("id", Array.from(shiftIds))
        : Promise.resolve({ data: [] as any[] }),
      teIds.size
        ? supabase.from("time_entries").select("id, shift_id, clock_in, clock_out, status").in("id", Array.from(teIds))
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const sMap: Record<string, ShiftCtx> = {};
    (sRes.data ?? []).forEach((s: any) => { sMap[s.id] = s; });

    // Fetch client names for shifts that have a client_id
    const clientIds = Array.from(new Set(Object.values(sMap).map(s => s.client_id).filter(Boolean) as string[]));
    if (clientIds.length) {
      const { data: clients } = await supabase
        .from("clients").select("id, name").in("id", clientIds);
      const cMap: Record<string, string> = {};
      (clients ?? []).forEach((c: any) => { cMap[c.id] = c.name; });
      Object.values(sMap).forEach(s => {
        if (s.client_id) s.client_name = cMap[s.client_id] ?? null;
      });
    }

    // For shift tickets, also find related time_entry by shift+employee
    const teMap: Record<string, TimeEntryCtx> = {};
    (teRes.data ?? []).forEach((te: any) => { teMap[te.id] = te; });

    if (empByShift.length) {
      const shiftIdList = Array.from(new Set(empByShift.map(x => x.s)));
      const { data: teByShift } = await supabase
        .from("time_entries")
        .select("id, shift_id, employee_id, clock_in, clock_out, status")
        .in("shift_id", shiftIdList);
      const { data: asgn } = await supabase
        .from("shift_assignments")
        .select("shift_id, employee_id, attendance_status")
        .in("shift_id", shiftIdList);

      (teByShift ?? []).forEach((te: any) => {
        teMap[`shift:${te.shift_id}:${te.employee_id}`] = te;
      });
      const aMap: Record<string, AssignmentCtx> = {};
      (asgn ?? []).forEach((a: any) => {
        aMap[`${a.shift_id}:${a.employee_id}`] = a;
      });
      setAssignments(aMap);
    }

    setShifts(sMap);
    setTimeEntries(teMap);
  }, []);

  const fetchTickets = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("employee_tickets")
      .select("*, employees!inner(first_name, last_name)")
      .eq("company_id", selectedCompanyId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!error && data) {
      const rows: Ticket[] = data.map((t: any) => ({ ...t, employee: t.employees }));
      setTickets(rows);
      fetchContext(rows);
    }
    setLoading(false);
  }, [selectedCompanyId, fetchContext]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    const channel = supabase
      .channel("tickets-realtime")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "employee_tickets",
        filter: `company_id=eq.${selectedCompanyId}`,
      }, () => { fetchTickets(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedCompanyId, fetchTickets]);

  const fetchNotes = async (ticketId: string) => {
    setNotesLoading(true);
    const { data } = await supabase
      .from("ticket_notes").select("*").eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setNotes((data as TicketNote[]) ?? []);
    setNotesLoading(false);
  };

  const openTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    fetchNotes(ticket.id);
  };

  const updateStatus = async (ticketId: string, newStatus: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === "in_progress" && !selectedTicket?.assigned_to) updates.assigned_to = user?.id;
    if (newStatus === "resolved" || newStatus === "closed") {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = user?.id;
    }
    const { error } = await supabase.from("employee_tickets").update(updates).eq("id", ticketId);
    if (error) { toast.error("Could not update status"); return; }

    await supabase.from("ticket_notes").insert({
      ticket_id: ticketId, company_id: selectedCompanyId!, author_id: user!.id,
      author_type: "admin", note_type: "status_change",
      content: `Status changed to ${STATUS_CONFIG[newStatus]?.label || newStatus}`,
    } as any);

    toast.success("Status updated");
    fetchTickets();
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket(prev => prev ? { ...prev, ...updates } : null);
      fetchNotes(ticketId);
    }
  };

  const sendNote = async () => {
    if (!newNote.trim() || !selectedTicket) return;
    const { error } = await supabase.from("ticket_notes").insert({
      ticket_id: selectedTicket.id, company_id: selectedCompanyId!,
      author_id: user!.id, author_type: "admin", note_type: "comment",
      content: newNote.trim(),
    } as any);
    if (!error) { setNewNote(""); fetchNotes(selectedTicket.id); toast.success("Note added"); }
    else toast.error("Could not add note");
  };

  // Helpers per ticket
  const ctxFor = useCallback((t: Ticket) => {
    let shift: ShiftCtx | null = null;
    let te: TimeEntryCtx | null = null;
    let asgn: AssignmentCtx | null = null;
    if (t.source_entity_type === "shift" || t.source_entity_type === "scheduled_shift") {
      if (t.source_entity_id) {
        shift = shifts[t.source_entity_id] ?? null;
        te = timeEntries[`shift:${t.source_entity_id}:${t.employee_id}`] ?? null;
        asgn = assignments[`${t.source_entity_id}:${t.employee_id}`] ?? null;
      }
    } else if (t.source_entity_type === "time_entry" && t.source_entity_id) {
      te = timeEntries[t.source_entity_id] ?? null;
      if (te?.shift_id) {
        shift = shifts[te.shift_id] ?? null;
        asgn = assignments[`${te.shift_id}:${t.employee_id}`] ?? null;
      }
    }
    return { shift, te, asgn };
  }, [shifts, timeEntries, assignments]);

  const sortByPriority = (a: Ticket, b: Ticket) => {
    const pa = PRIORITY_RANK[a.priority] ?? 2;
    const pb = PRIORITY_RANK[b.priority] ?? 2;
    if (pa !== pb) return pb - pa;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  };

  const filtered = useMemo(() => {
    return tickets
      .filter(t => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        const { shift, te } = ctxFor(t);
        if (urgencyFilter !== "all" && computeUrgency(t, shift, te) !== urgencyFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          t.subject?.toLowerCase().includes(q) ||
          t.employee?.first_name?.toLowerCase().includes(q) ||
          t.employee?.last_name?.toLowerCase().includes(q)
        );
      })
      .sort(sortByPriority);
  }, [tickets, statusFilter, urgencyFilter, search, ctxFor]);

  // Group buckets
  const grouped = useMemo(() => {
    const today: Ticket[] = [];
    const upcoming: Ticket[] = [];
    const pastUnresolved: Ticket[] = [];
    const other: Ticket[] = [];
    filtered.forEach(t => {
      const { shift } = ctxFor(t);
      const isOpen = t.status !== "resolved" && t.status !== "closed";
      if (shift) {
        const d = parseISO(shift.date);
        if (isToday(d)) { today.push(t); return; }
        if (isFuture(d)) { upcoming.push(t); return; }
        if (isOpen) { pastUnresolved.push(t); return; }
      }
      other.push(t);
    });
    [today, upcoming, pastUnresolved, other].forEach(arr => arr.sort(sortByPriority));
    return { today, upcoming, pastUnresolved, other };
  }, [filtered, ctxFor]);

  const counts = useMemo(() => {
    const c = { all: tickets.length, new: 0, in_progress: 0, resolved: 0, critical: 0 };
    tickets.forEach(t => {
      if (t.status === "new") c.new++;
      else if (t.status === "in_progress") c.in_progress++;
      else if (t.status === "resolved") c.resolved++;
      const { shift, te } = ctxFor(t);
      if (computeUrgency(t, shift, te) === "critical" && t.status !== "resolved" && t.status !== "closed") c.critical++;
    });
    return c;
  }, [tickets, ctxFor]);

  if (loading && tickets.length === 0) return <PageSkeleton />;

  const selectedCtx = selectedTicket ? ctxFor(selectedTicket) : null;
  const selectedUrgency = selectedTicket && selectedCtx
    ? computeUrgency(selectedTicket, selectedCtx.shift, selectedCtx.te)
    : "info";

  return (
    <OperationalWorkspace
      title="Solicitudes"
      context="Bandeja operativa de correcciones de fichaje, incidencias de asistencia y peticiones del equipo"
      search={
        <WorkspaceSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar por asunto o persona…"
        />
      }
      metrics={([
        { key: "all", label: "Total", tone: "neutral" as const },
        { key: "critical", label: "Críticas", tone: "critical" as const },
        { key: "new", label: "Nuevas", tone: "warning" as const },
        { key: "in_progress", label: "En revisión", tone: "primary" as const },
        { key: "resolved", label: "Resueltas", tone: "success" as const },
      ] as const).map((k) => ({
        label: k.label,
        value: counts[k.key],
        tone: k.tone,
        active:
          (k.key === "critical" && urgencyFilter === "critical") ||
          (k.key !== "critical" && statusFilter === (k.key as any)),
        onClick: () => {
          if (k.key === "critical") {
            setUrgencyFilter(urgencyFilter === "critical" ? "all" : "critical");
            setStatusFilter("all");
          } else {
            setStatusFilter(k.key as any);
            setUrgencyFilter("all");
          }
        },
      }))}
    >
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3 rounded-2xl border border-dashed border-border/40 bg-muted/10">
          <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Inbox className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-muted-foreground/70">Todo en orden</p>
          <p className="text-xs text-muted-foreground/50 max-w-sm">Ninguna solicitud coincide con los filtros. Aquí aparecerán las peticiones del equipo.</p>
        </div>
      ) : (
        <div className="space-y-6 pt-3">
          <Group title="Hoy" tickets={grouped.today} ctxFor={ctxFor} onOpen={openTicket} accent="critical" />
          <Group title="Pasadas sin resolver" tickets={grouped.pastUnresolved} ctxFor={ctxFor} onOpen={openTicket} accent="critical" />
          <Group title="Próximas" tickets={grouped.upcoming} ctxFor={ctxFor} onOpen={openTicket} accent="info" />
          <Group title="Otras" tickets={grouped.other} ctxFor={ctxFor} onOpen={openTicket} accent="info" />
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedTicket} onOpenChange={(v) => { if (!v) setSelectedTicket(null); }}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
          {selectedTicket && selectedCtx && (
            <>
              {/* Urgency strip */}
              <div className={cn("h-1.5 w-full shrink-0", URGENCY_BAR[selectedUrgency])} />

              <SheetHeader className="p-5 border-b border-border/30 shrink-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <UrgencyPill urgency={selectedUrgency} />
                  <Badge variant="outline" className={cn("gap-1 border", STATUS_CONFIG[selectedTicket.status]?.tone)}>
                    {STATUS_CONFIG[selectedTicket.status]?.label}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground/60">
                    {TYPE_LABELS[selectedTicket.type] || selectedTicket.type}
                  </span>
                </div>
                <SheetTitle className="text-base font-heading text-left">{selectedTicket.subject}</SheetTitle>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>{selectedTicket.employee?.first_name} {selectedTicket.employee?.last_name}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{format(new Date(selectedTicket.created_at), "MMM d, HH:mm", { locale: enUS })}</span>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Shift context */}
                {selectedCtx.shift && (
                  <ShiftContextCard
                    shift={selectedCtx.shift}
                    te={selectedCtx.te}
                    asgn={selectedCtx.asgn}
                    isAttendance={isAttendanceTicket(selectedTicket)}
                  />
                )}

                {/* Description */}
                {selectedTicket.description && (
                  <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-sm whitespace-pre-wrap">
                    {selectedTicket.description}
                  </div>
                )}

                {/* Next step */}
                {(selectedCtx.shift || selectedCtx.te) && (() => {
                  const isClock = isAttendanceTicket(selectedTicket);
                  const primary = isClock
                    ? { label: "Review attendance", icon: CheckCircle2, href: selectedCtx.shift ? `/app/shift-ops?id=${selectedCtx.shift.id}` : `/app/timeclock?entry=${selectedCtx.te?.id}` }
                    : selectedCtx.shift
                      ? { label: "Open shift", icon: Calendar, href: `/app/shift-ops?id=${selectedCtx.shift.id}` }
                      : null;
                  const secondary = isClock && selectedCtx.shift
                    ? { label: "Open shift", icon: Calendar, href: `/app/shift-ops?id=${selectedCtx.shift.id}` }
                    : null;
                  if (!primary) return null;
                  return (
                    <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-primary">Next step</h4>
                      </div>
                      <div className="grid gap-2">
                        <Button
                          className="rounded-xl justify-between h-11"
                          onClick={() => navigate(primary.href)}
                        >
                          <span className="flex items-center gap-2">
                            <primary.icon className="h-4 w-4" /> {primary.label}
                          </span>
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                        {secondary && (
                          <Button
                            variant="outline"
                            className="rounded-xl justify-between h-10"
                            onClick={() => navigate(secondary.href)}
                          >
                            <span className="flex items-center gap-2">
                              <secondary.icon className="h-4 w-4" /> {secondary.label}
                            </span>
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Status actions */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">Update status</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant={selectedTicket.status === "in_progress" ? "default" : "outline"}
                      size="sm" className="rounded-xl"
                      onClick={() => updateStatus(selectedTicket.id, "in_progress")}
                      disabled={selectedTicket.status === "in_progress"}
                    >
                      <Clock className="h-3.5 w-3.5 mr-1.5" /> Review
                    </Button>
                    <Button
                      variant={selectedTicket.status === "resolved" ? "default" : "outline"}
                      size="sm" className="rounded-xl"
                      onClick={() => updateStatus(selectedTicket.id, "resolved")}
                      disabled={selectedTicket.status === "resolved"}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Resolve
                    </Button>
                    <Button
                      variant="outline" size="sm" className="rounded-xl"
                      onClick={() => updateStatus(selectedTicket.id, "closed")}
                      disabled={selectedTicket.status === "closed"}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" /> Close
                    </Button>
                  </div>
                </div>

                {/* Activity */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">Activity</h4>
                  {notesLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground/50 text-center py-4">No activity yet</p>
                  ) : (
                    <div className="space-y-2">
                      {notes.map(n => (
                        <div key={n.id} className={cn(
                          "rounded-xl p-3 text-sm",
                          n.note_type === "status_change" ? "bg-muted/20 text-muted-foreground italic text-xs" : "bg-card border border-border/30",
                        )}>
                          <p className="whitespace-pre-wrap">{n.content}</p>
                          <p className="text-[10px] text-muted-foreground/40 mt-1">
                            {n.author_type === "admin" ? "Admin" : n.author_type === "employee" ? "Worker" : "System"}
                            {" · "}
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: enUS })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-border/30 p-4 shrink-0">
                <div className="flex gap-2">
                  <Textarea
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    placeholder="Add internal note or reply..."
                    className="min-h-[60px] text-sm rounded-xl bg-muted/20 border-border/30 resize-none"
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendNote(); }}
                  />
                  <Button size="icon" onClick={sendNote} disabled={!newNote.trim()} className="shrink-0 rounded-xl h-10 w-10">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/40 mt-1.5">⌘/Ctrl + Enter to send</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </OperationalWorkspace>
  );
}

/* ───────────────────────── Sub-components ───────────────────────── */

function UrgencyPill({ urgency }: { urgency: Urgency }) {
  const meta = URGENCY_PILL[urgency];
  const { Icon } = meta;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", meta.cls)}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function Group({
  title, tickets, ctxFor, onOpen, accent,
}: {
  title: string;
  tickets: Ticket[];
  ctxFor: (t: Ticket) => { shift: ShiftCtx | null; te: TimeEntryCtx | null; asgn: AssignmentCtx | null };
  onOpen: (t: Ticket) => void;
  accent: Urgency;
}) {
  if (!tickets.length) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <div className={cn("h-2 w-2 rounded-full", URGENCY_BAR[accent])} />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {title} <span className="text-muted-foreground/40 normal-case font-normal ml-1">({tickets.length})</span>
        </h3>
      </div>
      <div className="space-y-2">
        {tickets.map(t => {
          const { shift, te, asgn } = ctxFor(t);
          const urgency = computeUrgency(t, shift, te);
          const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.new;
          const when = shiftWhen(shift);
          const pr = PRIORITY_META[t.priority] ?? PRIORITY_META.normal;
          const typeLabel = TYPE_LABELS[t.type] || t.subject;
          const shiftLine = shift
            ? [when.label, shiftTimeWindow(shift), shift.client_name].filter(Boolean).join(" · ")
            : null;
          const teLine = !shift && te
            ? `Clock ${te.clock_in ? format(new Date(te.clock_in), "HH:mm") : "—"} → ${te.clock_out ? format(new Date(te.clock_out), "HH:mm") : "missing"}`
            : null;
          return (
            <button
              key={t.id}
              onClick={() => onOpen(t)}
              className={cn(
                "group w-full text-left rounded-2xl border bg-card hover:shadow-md transition-all overflow-hidden flex",
                pr.border,
              )}
            >
              <div className={cn("w-1 shrink-0", pr.bar)} />
              <div className="flex-1 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium", pr.pill)}>
                      {pr.label}
                    </span>
                    <Badge variant="outline" className={cn("gap-1 text-[10px] border", sc.tone)}>
                      {sc.label}
                    </Badge>
                    {isAttendanceTicket(t) && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
                        <DollarSign className="h-3 w-3" /> Affects payroll
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                    {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: enUS })}
                  </span>
                </div>

                <p className="text-sm font-medium leading-snug">{typeLabel}</p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {t.employee?.first_name} {t.employee?.last_name}
                  </span>
                  {shiftLine && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {shiftLine}
                    </span>
                  )}
                  {teLine && (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Timer className="h-3 w-3" />
                      {teLine}
                    </span>
                  )}
                  {asgn?.attendance_status && ATTENDANCE_LABELS[asgn.attendance_status] && (
                    <span className={cn("inline-flex items-center gap-1 font-medium", ATTENDANCE_LABELS[asgn.attendance_status].tone)}>
                      • {ATTENDANCE_LABELS[asgn.attendance_status].label}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ShiftContextCard({
  shift, te, asgn, isAttendance,
}: {
  shift: ShiftCtx;
  te: TimeEntryCtx | null;
  asgn: AssignmentCtx | null;
  isAttendance: boolean;
}) {
  const when = shiftWhen(shift);
  const attendance = asgn?.attendance_status && ATTENDANCE_LABELS[asgn.attendance_status];
  const mismatch = isAttendance && !te
    ? "No clock entry found for this shift"
    : isAttendance && te && !te.clock_out
      ? "Clock-out missing"
      : null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Related shift</p>
            <p className="text-sm font-medium leading-tight">{shift.title || "Shift"}</p>
          </div>
        </div>
        <Badge variant="outline" className={cn(
          "text-[10px]",
          when.isPastShift ? "border-amber-500/30 text-amber-700 dark:text-amber-300" : "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
        )}>
          {when.isPastShift ? "Past" : when.label === "Today" ? "Today" : "Upcoming"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {format(parseISO(shift.date), "EEE MMM d, yyyy", { locale: enUS })}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" />
          {shiftTimeWindow(shift)}
        </div>
        {shift.location_id && (
          <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
            <MapPin className="h-3 w-3" />
            <span className="truncate">Location set</span>
          </div>
        )}
      </div>

      {/* Attendance row */}
      <div className="rounded-xl bg-muted/20 border border-border/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Attendance</span>
          {attendance ? (
            <span className={cn("text-xs font-medium", attendance.tone)}>{attendance.label}</span>
          ) : (
            <span className="text-xs text-muted-foreground/60">Not validated</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Clock in</p>
            <p className="font-mono">
              {te?.clock_in ? format(new Date(te.clock_in), "HH:mm", { locale: enUS }) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Clock out</p>
            <p className="font-mono">
              {te?.clock_out ? format(new Date(te.clock_out), "HH:mm", { locale: enUS }) : "—"}
            </p>
          </div>
        </div>
        {mismatch && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/15 p-2">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-[11px] text-destructive">{mismatch}</p>
          </div>
        )}
      </div>
    </div>
  );
}
