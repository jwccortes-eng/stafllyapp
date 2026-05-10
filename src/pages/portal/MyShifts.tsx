import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import {
  CalendarDays, Clock, MapPin, HandMetal, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format, parseISO, isBefore, startOfDay, isToday, isTomorrow,
  startOfWeek, endOfWeek, subWeeks,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PortalShiftDetailDrawer } from "@/components/portal/PortalShiftDetailDrawer";
import { PortalShiftCard, type PortalShiftData } from "@/components/portal/PortalShiftCard";
import { CLAIMABLE_VISIBLE_STATUSES, isShiftClaimableForEmployee } from "@/lib/shifts/visibility";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBlock } from "@/components/ui/error-block";
import { formatDisplayName } from "@/lib/format-helpers";

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

type TabFilter = "available" | "today" | "upcoming" | "history";

export default function MyShifts() {
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [claimable, setClaimable] = useState<ClaimableShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedShift, setSelectedShift] = useState<ShiftAssignment | null>(null);
  const initialTab = (searchParams.get("tab") as TabFilter) || "today";
  const [activeTab, setActiveTab] = useState<TabFilter>(initialTab);
  // Pagination for History — render in chunks to keep DOM small.
  const HISTORY_PAGE = 30;
  const [historyVisible, setHistoryVisible] = useState(HISTORY_PAGE);

  const load = async () => {
    if (!employeeId) { setAssignments([]); setClaimable([]); setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {

    const { data: emp } = await supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle();
    if (!emp) { setLoading(false); return; }

    // CRITICAL: filter scheduled_shifts.deleted_at to hide soft-deleted shifts.
    // ALSO exclude removed/rejected assignments (set by trigger on soft-delete or by employee).
    // See src/lib/shifts/visibility.ts for the canonical rule.
    // Defense in depth: scope to the employee's own company so a stale
    // selection or upstream bug can never leak cross-tenant assignments.
    const { data: assignData } = await supabase
      .from("shift_assignments")
      .select(`id, status, response_status, accepted_shift_version, scheduled_shifts!inner (id, title, date, start_time, end_time, notes, status, slots, shift_code, meeting_point, special_instructions, company_id, operational_version, locations (name), clients (name))`)
      .eq("employee_id", employeeId)
      .eq("company_id", emp.company_id)
      .eq("is_draft_reservation", false)
      .is("scheduled_shifts.deleted_at", null)
      .eq("scheduled_shifts.publication_status", "published")
      .not("scheduled_shifts.status", "in", "(cancelled,canceled)")
      .not("status", "in", "(removed,rejected)")
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
      .select(`id, title, date, start_time, end_time, notes, slots, locations (name), clients (name), shift_assignments (id, status)`)
      .eq("company_id", emp.company_id).eq("claimable", true)
      .in("status", [...CLAIMABLE_VISIBLE_STATUSES])
      .is("deleted_at", null).gte("date", today).order("date", { ascending: true });

    const myShiftIds = new Set(mapped.map(a => a.shift.id));
    // Same rule as PortalShiftDetail: a pending request hides the shift from the available list
    const { data: myPendingReqs } = await supabase
      .from("shift_requests")
      .select("shift_id")
      .eq("employee_id", employeeId)
      .eq("status", "pending");
    const pendingRequestShiftIds = new Set((myPendingReqs ?? []).map((r: any) => r.shift_id as string));
    const activeCount = (s: any) =>
      (s.shift_assignments ?? []).filter((a: any) => a.status !== "removed" && a.status !== "rejected").length;
    const claimableFiltered: ClaimableShift[] = (claimData ?? [])
      .filter((s: any) => isShiftClaimableForEmployee({
        shiftId: s.id,
        slots: s.slots,
        activeAssignmentsCount: activeCount(s),
        myShiftIds,
        pendingRequestShiftIds,
      }))
      .map((s: any) => ({
        id: s.id, title: s.title, date: s.date, start_time: s.start_time,
        end_time: s.end_time, notes: s.notes, slots: s.slots,
        location: s.locations, client: s.clients, assignedCount: activeCount(s),
      }));
      setClaimable(claimableFiltered);
    } catch (err: any) {
      console.error("[MyShifts] load failed", err);
      setLoadError(err?.message ?? "Could not load your shifts.");
    } finally {
      setLoading(false);
    }
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
      if (!emp) throw new Error("Employee not found");

      // Check for existing request/assignment to prevent duplicates
      const { data: existing } = await supabase.from("shift_requests").select("id").eq("shift_id", shiftId).eq("employee_id", employeeId).maybeSingle();
      if (existing) throw new Error("You already requested this shift");

      // Race condition guard: re-check slot availability
      const { data: currentShift } = await supabase.from("scheduled_shifts")
        .select("slots, shift_assignments(id)").eq("id", shiftId).maybeSingle();
      if (currentShift) {
        const filled = currentShift.shift_assignments?.length ?? 0;
        if (currentShift.slots && filled >= currentShift.slots) throw new Error("This shift is already full");
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

      toast.success("✅ Request sent!", { description: claimedShift ? `Shift "${claimedShift.title}" requested successfully.` : "Your request has been submitted." });
      await load();
    } catch (err: any) {
      // Rollback optimistic update
      if (claimedShift) setClaimable(prev => [...prev, claimedShift].sort((a, b) => a.date.localeCompare(b.date)));
      toast.error("Error", { description: err.message ?? "Could not request the shift." });
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
      const empName = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : "Employee";
      const { data: admins } = await supabase.from("company_users").select("user_id").eq("company_id", shift.company_id).in("role", ["admin", "company_owner", "owner"]);
      const emoji = action === "confirmed" ? "✅" : "❌";
      const verb = action === "confirmed" ? "confirmed" : "rejected";
      for (const admin of admins ?? []) {
        await supabase.from("notifications").insert({
          company_id: shift.company_id,
          recipient_id: admin.user_id,
          recipient_type: "user",
          type: action === "confirmed" ? "shift_confirmed" : "shift_rejected",
          title: `${emoji} ${empName} ${verb} shift`,
          body: `"${shift.title}" — ${shift.date} at ${(shift.start_time as string).slice(0, 5)}`,
          metadata: { shift_id: sa.shift_id, employee_id: sa.employee_id, assignment_id: assignmentId },
        });
      }
    } catch { /* non-blocking */ }
  };

  // Phase 5B — prefer audited RPC, fall back to direct update for resiliency.
  const respondViaRpc = async (
    assignmentId: string,
    response: "accepted" | "rejected",
    reason?: string | null,
  ): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await (supabase as any).rpc("worker_respond_to_shift_assignment", {
      p_assignment_id: assignmentId,
      p_response: response,
      p_reason: reason ?? null,
      p_source: "worker_portal",
    });
    if (error) return { ok: false, error: error.message };
    if (data && data.ok === false) return { ok: false, error: "rpc_rejected" };
    return { ok: true };
  };

  const acceptAssignment = async (assignmentId: string) => {
    setResponding(assignmentId);
    const assignment = assignments.find(a => a.id === assignmentId);
    const version = assignment?.shift?.operational_version ?? 1;
    const rpc = await respondViaRpc(assignmentId, "accepted");
    let error: { message: string } | null = null;
    if (!rpc.ok) {
      const fallback = await supabase.from("shift_assignments").update({
        status: "confirmed",
        responded_at: new Date().toISOString(),
        response_status: "accepted",
        response_required: false,
        accepted_at: new Date().toISOString(),
        accepted_shift_version: version,
      } as any).eq("id", assignmentId);
      error = fallback.error;
    }
    if (error) toast.error("Error", { description: error.message });
    else { toast.success("Shift confirmed!"); notifyAdminOfResponse(assignmentId, "confirmed"); await load(); }
    setResponding(null);
  };

  const rejectAssignment = async () => {
    if (!rejectDialogId) return;
    setResponding(rejectDialogId);
    const reason = rejectReason.trim() || null;
    const rpc = await respondViaRpc(rejectDialogId, "rejected", reason);
    let error: { message: string } | null = null;
    if (!rpc.ok) {
      const fallback = await supabase.from("shift_assignments").update({
        status: "rejected",
        responded_at: new Date().toISOString(),
        rejection_reason: reason,
        response_status: "rejected",
        response_required: false,
        rejected_at: new Date().toISOString(),
      } as any).eq("id", rejectDialogId);
      error = fallback.error;
    }
    if (error) toast.error("Error", { description: error.message });
    else { toast.success("Shift rejected"); notifyAdminOfResponse(rejectDialogId, "rejected"); await load(); }
    setResponding(null); setRejectDialogId(null); setRejectReason("");
  };

  const today = startOfDay(new Date());

  const getFiltered = (): ShiftAssignment[] => {
    let list = assignments;
    switch (activeTab) {
      case "today": list = list.filter(a => isToday(parseISO(a.shift.date))); break;
      case "upcoming": list = list.filter(a => !isBefore(parseISO(a.shift.date), today) && !isToday(parseISO(a.shift.date))); break;
      case "history": list = list.filter(a => isBefore(parseISO(a.shift.date), today)); break;
    }
    list.sort((a, b) => {
      if (activeTab === "history") return parseISO(b.shift.date).getTime() - parseISO(a.shift.date).getTime();
      return parseISO(a.shift.date).getTime() - parseISO(b.shift.date).getTime();
    });
    return list;
  };

  const filtered = getFiltered();

  const todayCount = assignments.filter(a => isToday(parseISO(a.shift.date))).length;
  const upcomingCount = assignments.filter(a => !isBefore(parseISO(a.shift.date), today) && !isToday(parseISO(a.shift.date))).length;
  const pastCount = assignments.filter(a => isBefore(parseISO(a.shift.date), today)).length;

  // History count is intentionally not shown as a badge — it grows unbounded
  // and creates noise (e.g. "99+"). Today/Upcoming/Available keep their counts.
  const tabs: { key: TabFilter; label: string; count: number; showCount: boolean }[] = [
    ...(claimable.length > 0 ? [{ key: "available" as TabFilter, label: "Disponibles", count: claimable.length, showCount: true }] : []),
    { key: "today", label: "Hoy", count: todayCount, showCount: true },
    { key: "upcoming", label: "Próximos", count: upcomingCount, showCount: true },
    { key: "history", label: "Historial", count: pastCount, showCount: false },
  ];

  // Sync tab to URL for deep-link / back navigation
  const changeTab = (t: TabFilter) => {
    setActiveTab(t);
    setHistoryVisible(HISTORY_PAGE); // reset pagination on tab switch
    const next = new URLSearchParams(searchParams);
    if (t === "today") next.delete("tab"); else next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  const subtitle = (() => {
    if (todayCount > 0) return `${todayCount} turno${todayCount > 1 ? "s" : ""} hoy`;
    if (upcomingCount > 0) return `${upcomingCount} próximo${upcomingCount > 1 ? "s" : ""}`;
    return "Sin turnos programados";
  })();

  if (loading) {
    return (
      <div className="space-y-2 pt-2 animate-fade-in">
        <div className="flex items-center gap-5 border-b border-border/40 mb-3 pb-2.5">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-3.5 w-14 rounded-md" />)}
        </div>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-card rounded-xl border border-border/40 p-3 flex items-center gap-3">
            <Skeleton className="h-8 w-[58px] rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/5 rounded" />
              <Skeleton className="h-2.5 w-2/5 rounded" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="pt-4">
        <ErrorBlock
          title="No pudimos cargar tus turnos"
          message={loadError}
          onRetry={load}
        />
      </div>
    );
  }

  // response_status is the worker's source of truth. We must NOT show the card
  // as "Confirmed" while the worker still owes a response (admin may have
  // auto-set assignment.status='confirmed' on creation).
  const getDisplayStatus = (a: ShiftAssignment): string => {
    if (a.response_status === "needs_reacceptance") return "needs_reacceptance";
    if (a.response_status === "rejected" || a.status === "rejected") return "rejected";
    if (a.response_status === "accepted") return "confirmed";
    // Pending response — even if status='confirmed' on the row.
    if (a.response_status === "pending") return "pending";
    // Legacy rows without response_status fall back to assignment.status.
    if (a.status === "confirmed" || a.status === "accepted") return "confirmed";
    return "pending";
  };

  const toCardData = (a: ShiftAssignment): PortalShiftData => ({
    id: a.shift.id,
    assignmentId: a.id,
    title: a.shift.title,
    date: a.shift.date,
    start_time: a.shift.start_time,
    end_time: a.shift.end_time,
    status: getDisplayStatus(a),
    location_name: a.shift.location?.name,
    client_name: a.shift.client?.name,
    meeting_point: a.shift.meeting_point,
  });

  return (
    <div className="animate-fade-in pb-24">
      {/* Minimal header — title only, subtitle merged into active tab context */}
      <div className="pt-1 pb-3">
        <h1 className="text-[22px] font-bold font-heading tracking-tight text-foreground leading-none">
          Mis turnos
        </h1>
      </div>

      {/* Underline tab bar — premium, low-noise. Counts shown as soft pill badges. */}
      <div className="flex items-center gap-5 border-b border-border/40 mb-3">
        {tabs.map((t) => {
          const active = activeTab === t.key;
          const accent = t.key === "available";
          return (
            <button
              key={t.key}
              onClick={() => changeTab(t.key)}
              className={cn(
                "relative flex items-center gap-1.5 pb-2.5 text-[13px] font-semibold transition-colors",
                active ? "text-foreground" : "text-muted-foreground/55 hover:text-foreground/80",
              )}
            >
              <span>{t.label}</span>
              {t.showCount && t.count > 0 && (
                <span className={cn(
                  "inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full text-[10px] font-bold tabular-nums",
                  active
                    ? accent
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-foreground/70"
                    : "bg-muted/40 text-muted-foreground/55",
                )}>
                  {t.count > 9 ? "9+" : t.count}
                </span>
              )}
              {active && (
                <span className={cn(
                  "absolute -bottom-px left-0 right-0 h-[2px] rounded-full",
                  accent ? "bg-emerald-500" : "bg-primary"
                )} />
              )}
            </button>
          );
        })}
      </div>

      {/* Shift list — compact rows. History tab adds week grouping + pagination. */}
      {activeTab !== "available" && filtered.length > 0 && (() => {
        const renderCard = (a: ShiftAssignment) => {
          // A response is owed whenever response_status is pending OR
          // needs_reacceptance — independent of the assignment.status, which may
          // already be "confirmed" when the admin auto-assigned the worker.
          const responseOwed =
            (a.response_status === "pending" || a.response_status === "needs_reacceptance") &&
            !isBefore(parseISO(a.shift.date), today);
          // Treat the worker as confirmed only when they have explicitly accepted.
          const workerAccepted = a.response_status === "accepted";
          return (
            <PortalShiftCard
              key={a.id}
              shift={toCardData(a)}
              compact
              onClick={() => setSelectedShift(a)}
              onAccept={responseOwed ? () => acceptAssignment(a.id) : undefined}
              onReject={responseOwed ? () => { setRejectDialogId(a.id); setRejectReason(""); } : undefined}
              onClockIn={
                workerAccepted && isToday(parseISO(a.shift.date))
                  ? () => navigate(`/portal/clock?shiftId=${a.shift.id}`)
                  : undefined
              }
              responding={responding === a.id}
            />
          );
        };

        if (activeTab === "history") {
          // Paginate first to keep DOM size bounded.
          const visible = filtered.slice(0, historyVisible);
          const remaining = filtered.length - visible.length;

          // Group by week bucket (already date-desc sorted).
          const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 });
          const thisWeekEnd = endOfWeek(today, { weekStartsOn: 1 });
          const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
          const lastWeekEnd = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });

          type Bucket = { key: string; label: string; items: ShiftAssignment[] };
          const buckets: Bucket[] = [
            { key: "this-week", label: "This week", items: [] },
            { key: "last-week", label: "Last week", items: [] },
            { key: "earlier", label: "Earlier", items: [] },
          ];

          for (const a of visible) {
            const d = parseISO(a.shift.date);
            if (d >= thisWeekStart && d <= thisWeekEnd) buckets[0].items.push(a);
            else if (d >= lastWeekStart && d <= lastWeekEnd) buckets[1].items.push(a);
            else buckets[2].items.push(a);
          }

          return (
            <div className="space-y-4">
              {buckets.filter(b => b.items.length > 0).map((b) => (
                <div key={b.key} className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/55 px-1">
                    {b.label}
                  </p>
                  <div className="space-y-1.5">
                    {b.items.map(renderCard)}
                  </div>
                </div>
              ))}

              {remaining > 0 && (
                <div className="pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHistoryVisible(v => v + HISTORY_PAGE)}
                    className="w-full h-10 text-[12px] font-semibold rounded-xl text-muted-foreground hover:text-foreground"
                  >
                    Load {Math.min(remaining, HISTORY_PAGE)} more · {remaining} remaining
                  </Button>
                </div>
              )}
            </div>
          );
        }

        return (
          <div className="space-y-1.5">
            {filtered.map(renderCard)}
          </div>
        );
      })()}

      {/* AVAILABLE TAB — claimable shifts as primary content */}
      {activeTab === "available" && claimable.length > 0 && (
        <div className="space-y-2">
          {claimable.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border-2 border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.04] to-card p-3.5 space-y-2.5 active:scale-[0.99] transition-all cursor-pointer"
              onClick={() => navigate(`/portal/shifts/${s.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                      Available
                    </span>
                    {s.slots && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        {s.slots - s.assignedCount} spot{(s.slots - s.assignedCount) !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-[13.5px] font-bold text-foreground truncate">{formatDisplayName(s.title)}</p>
                  <p className="text-[11px] text-muted-foreground/75 mt-0.5">
                    {isToday(parseISO(s.date)) ? "Today" : isTomorrow(parseISO(s.date)) ? "Tomorrow" : format(parseISO(s.date), "EEE d MMM", { locale: enUS })}
                    {" · "}
                    <span className="tabular-nums">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                  </p>
                  {s.location && (
                    <p className="text-[11px] text-muted-foreground/65 mt-0.5 flex items-center gap-1 truncate">
                      <MapPin className="h-2.5 w-2.5 shrink-0" /> {formatDisplayName(s.location.name)}
                    </p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                className="w-full h-10 text-[12px] rounded-xl font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={(e) => { e.stopPropagation(); claimShift(s.id); }}
                disabled={claiming === s.id}
              >
                {claiming === s.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Requesting...</> : <><HandMetal className="h-3.5 w-3.5" />Request shift</>}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state — single source */}
      {activeTab !== "available" && filtered.length === 0 && (
        <div className="text-center py-14 space-y-3">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/30 border border-border/15 flex items-center justify-center">
            <CalendarDays className="h-7 w-7 text-muted-foreground/20" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground">
              {activeTab === "today" && "No shifts today"}
              {activeTab === "upcoming" && "No upcoming shifts"}
              {activeTab === "history" && "No history"}
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-[240px] mx-auto">
              {activeTab === "today"
                ? "You have no shifts scheduled for today."
                : activeTab === "history"
                ? "You don't have any completed shifts yet."
                : "Assigned shifts will appear here."
              }
            </p>
          </div>
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
            <DialogTitle className="text-base font-bold">Reject shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Optionally provide a reason for rejecting.</p>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason (optional)..." rows={3} className="text-sm resize-none rounded-xl" />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setRejectDialogId(null); setRejectReason(""); }}>Cancel</Button>
            <Button variant="destructive" size="sm" className="rounded-xl" onClick={rejectAssignment} disabled={responding === rejectDialogId}>
              {responding === rejectDialogId ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
