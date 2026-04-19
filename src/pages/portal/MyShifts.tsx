import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import {
  CalendarDays, Clock, MapPin, HandMetal, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format, parseISO, isBefore, startOfDay, isToday, isTomorrow,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
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

type TabFilter = "available" | "today" | "upcoming" | "history";

export default function MyShifts() {
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [claimable, setClaimable] = useState<ClaimableShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedShift, setSelectedShift] = useState<ShiftAssignment | null>(null);
  const initialTab = (searchParams.get("tab") as TabFilter) || "today";
  const [activeTab, setActiveTab] = useState<TabFilter>(initialTab);
  // toast imported from sonner at top

  const load = async () => {
    if (!employeeId) { setAssignments([]); setClaimable([]); setLoading(false); return; }
    setLoading(true);

    const { data: emp } = await supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle();
    if (!emp) { setLoading(false); return; }

    // CRITICAL: filter scheduled_shifts.deleted_at to hide soft-deleted shifts.
    // ALSO exclude removed/rejected assignments (set by trigger on soft-delete or by employee).
    // See src/lib/shifts/visibility.ts for the canonical rule.
    const { data: assignData } = await supabase
      .from("shift_assignments")
      .select(`id, status, response_status, accepted_shift_version, scheduled_shifts!inner (id, title, date, start_time, end_time, notes, status, slots, shift_code, meeting_point, special_instructions, company_id, operational_version, locations (name), clients (name))`)
      .eq("employee_id", employeeId)
      .is("scheduled_shifts.deleted_at", null)
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
      .in("status", ["open", "published"])
      .is("deleted_at", null).gte("date", today).order("date", { ascending: true });

    const myShiftIds = new Set(mapped.map(a => a.shift.id));
    const activeCount = (s: any) =>
      (s.shift_assignments ?? []).filter((a: any) => a.status !== "removed" && a.status !== "rejected").length;
    const claimableFiltered: ClaimableShift[] = (claimData ?? [])
      .filter((s: any) => !myShiftIds.has(s.id))
      .filter((s: any) => { const c = activeCount(s); return !s.slots || c < s.slots; })
      .map((s: any) => ({
        id: s.id, title: s.title, date: s.date, start_time: s.start_time,
        end_time: s.end_time, notes: s.notes, slots: s.slots,
        location: s.locations, client: s.clients, assignedCount: activeCount(s),
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
    else { toast.success("Shift confirmed!"); notifyAdminOfResponse(assignmentId, "confirmed"); await load(); }
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

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    ...(claimable.length > 0 ? [{ key: "available" as TabFilter, label: "Available", count: claimable.length }] : []),
    { key: "today", label: "Today", count: todayCount },
    { key: "upcoming", label: "Upcoming", count: upcomingCount },
    { key: "history", label: "History", count: pastCount },
  ];

  // Sync tab to URL for deep-link / back navigation
  const changeTab = (t: TabFilter) => {
    setActiveTab(t);
    const next = new URLSearchParams(searchParams);
    if (t === "today") next.delete("tab"); else next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  const subtitle = (() => {
    if (todayCount > 0) return `${todayCount} shift${todayCount > 1 ? "s" : ""} today`;
    if (upcomingCount > 0) return `${upcomingCount} upcoming`;
    return "No scheduled shifts";
  })();

  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        {[1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  // Use response_status for display; fall back to assignment status for backwards compat
  const getDisplayStatus = (a: ShiftAssignment): string => {
    if (a.response_status === "needs_reacceptance") return "needs_reacceptance";
    if (a.response_status === "accepted" || a.status === "confirmed" || a.status === "accepted") return "confirmed";
    if (a.response_status === "rejected" || a.status === "rejected") return "rejected";
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
          My Shifts
        </h1>
      </div>

      {/* Underline tab bar — premium, low-noise, mirrors video benchmark rhythm */}
      <div className="flex items-center gap-5 border-b border-border/40 mb-3">
        {tabs.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => changeTab(t.key)}
              className={cn(
                "relative flex items-baseline gap-1.5 pb-2.5 text-[13px] font-semibold transition-colors",
                active ? "text-foreground" : "text-muted-foreground/55 hover:text-foreground/80",
              )}
            >
              {t.label}
              {t.count > 0 && (
                <span className={cn(
                  "text-[10px] font-bold tabular-nums",
                  active ? (t.key === "available" ? "text-emerald-600 dark:text-emerald-400" : "text-primary") : "text-muted-foreground/45",
                )}>
                  {t.count}
                </span>
              )}
              {active && (
                <span className={cn(
                  "absolute -bottom-px left-0 right-0 h-[2px] rounded-full",
                  t.key === "available" ? "bg-emerald-500" : "bg-primary"
                )} />
              )}
            </button>
          );
        })}
      </div>

      {/* Shift list — compact rows, single source of state per card */}
      {activeTab !== "available" && filtered.length > 0 && (
        <div className="space-y-1.5">
          {filtered.map((a) => (
            <PortalShiftCard
              key={a.id}
              shift={toCardData(a)}
              compact
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
                  <p className="text-[13.5px] font-bold text-foreground truncate">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground/75 mt-0.5">
                    {isToday(parseISO(s.date)) ? "Today" : isTomorrow(parseISO(s.date)) ? "Tomorrow" : format(parseISO(s.date), "EEE d MMM", { locale: enUS })}
                    {" · "}
                    <span className="tabular-nums">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                  </p>
                  {s.location && (
                    <p className="text-[11px] text-muted-foreground/65 mt-0.5 flex items-center gap-1 truncate">
                      <MapPin className="h-2.5 w-2.5 shrink-0" /> {s.location.name}
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
