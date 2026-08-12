import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { versionedAssignmentTransition, assignmentConflictCopy } from "@/lib/data/assignment-write";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import {
  CalendarDays, Clock, MapPin, HandMetal, Loader2, Check, X, LogIn,
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
import { canAnnounceOpenShift } from "@/lib/shifts/publication-truth";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBlock } from "@/components/ui/error-block";
import { formatDisplayName } from "@/lib/format-helpers";
import {
  OperationalAgendaHero,
  OperationalTimeline,
  OperationalTimelineRow,
  AgendaSectionHeader,
  AgendaEmptyState,
  type AgendaItem,
  type AgendaStatus,
} from "@/components/mobile-agenda";
import { HistoryShiftRow } from "@/components/mobile-agenda/HistoryShiftRow";
import { useWorkedShiftHistory } from "@/hooks/useWorkedShiftHistory";
import { WeekHistorySummary } from "@/components/portal/WeekHistorySummary";
import { useT } from "@/i18n/LanguageContext";
import { SmartWorkCardHero } from "@/components/portal/SmartWorkCardHero";
import { getPageCache, setPageCache, hasPageCache } from "@/lib/portal/page-cache";

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
    shift_ref?: string | null;
    meeting_point?: string | null;
    meeting_time?: string | null;
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

type ShiftsSnapshot = { assignments: ShiftAssignment[]; claimable: ClaimableShift[] };
const PAGE_KEY = "portal:my-shifts";

export default function MyShifts() {
  const { stableEmployeeId: employeeId, isResolvingEmployee } = useEffectiveEmployee();
  const navigate = useNavigate();
  const { t } = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  // Hydrate from cache so a bottom-nav return doesn't flash skeletons.
  const cached = getPageCache<ShiftsSnapshot>(PAGE_KEY, employeeId);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>(cached?.assignments ?? []);
  const [claimable, setClaimable] = useState<ClaimableShift[]>(cached?.claimable ?? []);
  const [loading, setLoading] = useState(!cached);
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
    if (!employeeId) {
      if (!isResolvingEmployee) {
        setAssignments([]);
        setClaimable([]);
      }
      setLoading(false);
      return;
    }
    // Background refetch keeps existing data on screen; only first load shows skeleton.
    if (!hasPageCache(PAGE_KEY, employeeId)) setLoading(true);
    setLoadError(null);
    try {

    const { data: emp } = await supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle();
    if (!emp) {
      setLoadError("No encontramos tu perfil de empleado para esta compañía.");
      setLoading(false);
      return;
    }

    // CRITICAL: filter scheduled_shifts.deleted_at to hide soft-deleted shifts.
    // ALSO exclude removed/rejected assignments (set by trigger on soft-delete or by employee).
    // See src/lib/shifts/visibility.ts for the canonical rule.
    // Defense in depth: scope to the employee's own company so a stale
    // selection or upstream bug can never leak cross-tenant assignments.
    const { data: assignData } = await supabase
      .from("shift_assignments")
      .select(`id, status, response_status, accepted_shift_version, scheduled_shifts!inner (id, title, date, start_time, end_time, notes, status, slots, shift_code, shift_ref, meeting_point, meeting_time, special_instructions, company_id, operational_version, locations (name), clients (name))`)
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
        shift_code: a.scheduled_shifts.shift_code, shift_ref: (a.scheduled_shifts as any).shift_ref ?? null, meeting_point: a.scheduled_shifts.meeting_point,
        meeting_time: a.scheduled_shifts.meeting_time,
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
      .select(`id, title, date, start_time, end_time, notes, slots, claimable, publication_status, status, deleted_at, locations (name), clients (name), shift_assignments (id, status, response_status, is_draft_reservation)`)
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
      // Verdad canónica de publicación/cupo: nunca ofrecer un turno en
      // borrador, cancelado o con el cupo lleno.
      .filter((s: any) => canAnnounceOpenShift({
        shift: s,
        assignments: s.shift_assignments ?? [],
      }))
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
      setPageCache<ShiftsSnapshot>(PAGE_KEY, employeeId, { assignments: mapped, claimable: claimableFiltered });
    } catch (err: any) {
      console.error("[MyShifts] load failed", err);
      setLoadError(err?.message ?? "Could not load your shifts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [employeeId, isResolvingEmployee]);

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

      toast.success(t("portal.shifts.request_sent_title"), { description: claimedShift ? t("portal.shifts.request_sent_with_title", { title: claimedShift.title }) : t("portal.shifts.request_sent_desc") });
      await load();
    } catch (err: any) {
      // Rollback optimistic update
      if (claimedShift) setClaimable(prev => [...prev, claimedShift].sort((a, b) => a.date.localeCompare(b.date)));
      toast.error(t("common.error"), { description: err.message ?? t("portal.shifts.could_not_request") });
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

  // P0 — VWC Fase 3D: la respuesta del worker viaja por el carril único de
  // transición (expected_status + expected_version + auditoría). Sin fallback
  // directo: una versión vieja nunca puede revivir ni revertir un estado nuevo.
  const respondViaContract = async (
    assignmentId: string,
    transition: "accept" | "reject",
    reason?: string | null,
  ): Promise<{ ok: boolean; error?: string }> => {
    const assignment = assignments.find(a => a.id === assignmentId) as any;
    const result = await versionedAssignmentTransition({
      assignmentId,
      companyId: assignment?.company_id ?? assignment?.shift?.company_id ?? null,
      transition,
      expectedStatus: assignment?.status ?? null,
      expectedVersion: typeof assignment?.version === "number" ? assignment.version : null,
      reason: reason ?? null,
      surface: "worker_portal",
    });
    if (result.status === "applied") return { ok: true };
    if (result.status === "conflict") {
      const copy = assignmentConflictCopy(result);
      return { ok: false, error: `${copy.fact} ${copy.consequence} ${copy.action}` };
    }
    return { ok: false, error: result.message };
  };

  const acceptAssignment = async (assignmentId: string) => {
    setResponding(assignmentId);
    const res = await respondViaContract(assignmentId, "accept");
    if (!res.ok) toast.error(t("common.error"), { description: res.error });
    else { toast.success(t("portal.shifts.action.accept") + " ✓"); notifyAdminOfResponse(assignmentId, "confirmed"); }
    await load();
    setResponding(null);
  };

  const rejectAssignment = async () => {
    if (!rejectDialogId) return;
    setResponding(rejectDialogId);
    const reason = rejectReason.trim() || null;
    const res = await respondViaContract(rejectDialogId, "reject", reason);
    if (!res.ok) toast.error(t("common.error"), { description: res.error });
    else { toast.success(t("portal.shifts.rejected_toast")); notifyAdminOfResponse(rejectDialogId, "rejected"); }
    await load();
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

  // ── Phase H1/H2 — enrich History tab with REAL clock & period status.
  // Hook is called unconditionally (Rules of Hooks). It is a no-op when the
  // visible set is empty, so non-history tabs do not trigger any query.
  const portalCompanyId = assignments.find(a => a.shift.company_id)?.shift.company_id ?? null;
  const visibleHistoryShifts = activeTab === "history"
    ? filtered.slice(0, historyVisible).map(a => ({ shiftId: a.shift.id, date: a.shift.date }))
    : [];
  const workedHistory = useWorkedShiftHistory({
    employeeId: employeeId ?? null,
    companyId: portalCompanyId,
    visibleShifts: visibleHistoryShifts,
  });

  // History count is intentionally not shown as a badge — it grows unbounded
  // and creates noise (e.g. "99+"). Today/Upcoming/Available keep their counts.
  const tabs: { key: TabFilter; label: string; count: number; showCount: boolean }[] = [
    ...(claimable.length > 0 ? [{ key: "available" as TabFilter, label: t("portal.shifts.tab.available"), count: claimable.length, showCount: true }] : []),
    { key: "today", label: t("portal.shifts.tab.today"), count: todayCount, showCount: true },
    { key: "upcoming", label: t("portal.shifts.tab.upcoming"), count: upcomingCount, showCount: true },
    { key: "history", label: t("portal.shifts.tab.history"), count: pastCount, showCount: false },
  ];

  // Sync tab to URL for deep-link / back navigation
  const changeTab = (next: TabFilter) => {
    setActiveTab(next);
    setHistoryVisible(HISTORY_PAGE); // reset pagination on tab switch
    const sp = new URLSearchParams(searchParams);
    if (next === "today") sp.delete("tab"); else sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  const subtitle = (() => {
    if (todayCount > 0) return todayCount === 1 ? t("portal.shifts.subtitle.today_one") : t("portal.shifts.subtitle.today_many", { count: todayCount });
    if (upcomingCount > 0) return upcomingCount === 1 ? t("portal.shifts.subtitle.upcoming_one") : t("portal.shifts.subtitle.upcoming_many", { count: upcomingCount });
    return t("portal.shifts.subtitle.none");
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
          title={t("portal.shifts.could_not_load")}
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

  // Maps a worker assignment to the presentation-only AgendaItem contract
  // used by the mobile-agenda library. No business logic here.
  const mapToAgendaItem = (a: ShiftAssignment): AgendaItem => {
    const ds = getDisplayStatus(a);
    const status: AgendaStatus =
      ds === "confirmed" ? "confirmed"
      : ds === "needs_reacceptance" ? "needs_reacceptance"
      : ds === "rejected" ? "rejected"
      : isBefore(parseISO(a.shift.date), today) ? "past"
      : "pending";
    const start = (a.shift.start_time ?? "").slice(0, 5);
    const end = a.shift.end_time ? a.shift.end_time.slice(0, 5) : null;
    const meetingTime = a.shift.meeting_time ? a.shift.meeting_time.slice(0, 5) : null;
    return {
      id: a.id,
      date: a.shift.date,
      startTime: start,
      endTime: end,
      title: formatDisplayName(a.shift.title) || "Turno",
      subtitle: a.shift.client?.name
        ? `${formatDisplayName(a.shift.client.name)}${a.shift.location?.name ? ` · ${formatDisplayName(a.shift.location.name)}` : ""}`
        : a.shift.location?.name ? formatDisplayName(a.shift.location.name) : null,
      meetingPoint: a.shift.meeting_point
        ? { address: a.shift.meeting_point, time: meetingTime }
        : null,
      status,
    };
  };

  // Next upcoming assignment that still matters operationally (accepted, pending,
  // or needs_reacceptance). Used for the hero card on Today/Upcoming tabs.
  const nextHeroAssignment: ShiftAssignment | null = (() => {
    if (activeTab !== "today" && activeTab !== "upcoming") return null;
    return (
      filtered.find(
        (a) =>
          !isBefore(parseISO(a.shift.date), today) &&
          ["accepted", "pending", "needs_reacceptance"].includes(a.response_status),
      ) ?? null
    );
  })();

  const responseOwedFor = (a: ShiftAssignment) =>
    (a.response_status === "pending" || a.response_status === "needs_reacceptance") &&
    !isBefore(parseISO(a.shift.date), today);


  return (
    <div className="animate-fade-in pb-24 -mx-3 px-3 -mt-3 pt-3 bg-gradient-to-b from-sky-500/[0.04] via-background to-background min-h-[calc(100vh-4rem)]">
      {/* Minimal header — title only, subtitle merged into active tab context */}
      <div className="pt-1 pb-3">
        <h1 className="text-[22px] font-bold font-heading tracking-tight text-foreground leading-none">
          My Shifts
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

      {/* HERO — "Tu próxima jornada" on Today/Upcoming when an actionable shift exists. */}
      {nextHeroAssignment && (activeTab === "today" || activeTab === "upcoming") && (() => {
        const a = nextHeroAssignment;
        const owed = responseOwedFor(a);
        const accepted = a.response_status === "accepted";
        const today_ = isToday(parseISO(a.shift.date));
        const isClockable = accepted && today_;

        // Render SmartWorkCard (worker · standard) with the legacy
        // OperationalAgendaHero passed as `fallback` — strict no-regression:
        // if the VM can't be built, the worker still sees the original card
        // with the same actions.
        const legacyHero = (
          <OperationalAgendaHero
            eyebrow={t("portal.shifts.hero_eyebrow")}
            item={mapToAgendaItem(a)}
            onClick={() => setSelectedShift(a)}
            primaryAction={
              isClockable
                ? { label: t("portal.shifts.action.mark_in"), onClick: () => navigate(`/portal/clock?shiftId=${a.shift.id}`), variant: "primary", icon: LogIn }
                : owed
                ? { label: t("portal.shifts.action.accept"), onClick: () => acceptAssignment(a.id), variant: "primary", icon: Check, loading: responding === a.id }
                : undefined
            }
            secondaryAction={
              owed
                ? { label: t("portal.shifts.action.decline"), onClick: () => { setRejectDialogId(a.id); setRejectReason(""); }, variant: "ghost", icon: X }
                : undefined
            }
          />
        );

        return (
          <div className="mb-4">
            <SmartWorkCardHero
              assignment={a}
              isToday={today_}
              busy={responding === a.id}
              onAccept={() => acceptAssignment(a.id)}
              onClockIn={() => navigate(`/portal/clock?shiftId=${a.shift.id}`)}
              onViewDetails={() => setSelectedShift(a)}
              showDecline={owed}
              onDecline={() => { setRejectDialogId(a.id); setRejectReason(""); }}
              fallback={legacyHero}
            />
          </div>
        );
      })()}

      {/* Timeline list — Today/Upcoming use comfortable density, History uses compact + buckets. */}
      {activeTab !== "available" && filtered.length > 0 && (() => {
        const heroId = nextHeroAssignment?.id;
        const renderRow = (a: ShiftAssignment, idx: number, density: "comfortable" | "compact" = "comfortable") => {
          const owed = responseOwedFor(a);
          return (
            <OperationalTimelineRow
              key={a.id}
              item={mapToAgendaItem(a)}
              index={idx}
              density={density}
              onClick={() => setSelectedShift(a)}
              inlineActionLabel={owed ? t("portal.shifts.action.accept") : undefined}
              onInlineAction={owed ? () => acceptAssignment(a.id) : undefined}
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
            { key: "this-week", label: t("portal.shifts.history.this_week"), items: [] },
            { key: "last-week", label: t("portal.shifts.history.last_week"), items: [] },
            { key: "earlier", label: t("portal.shifts.history.earlier"), items: [] },
          ];

          for (const a of visible) {
            const d = parseISO(a.shift.date);
            if (d >= thisWeekStart && d <= thisWeekEnd) buckets[0].items.push(a);
            else if (d >= lastWeekStart && d <= lastWeekEnd) buckets[1].items.push(a);
            else buckets[2].items.push(a);
          }

          
          return (
            <div className="space-y-4">
              <p className="text-[11px] text-muted-foreground/60 px-1 -mt-1">
                {filtered.length === 1 ? t("portal.shifts.history.total_one") : t("portal.shifts.history.total_many", { count: filtered.length })}
              </p>

              {buckets.filter((b) => b.items.length > 0).map((b) => {
                const slices = b.items.map((a) => {
                  const w = workedHistory.byShiftId[a.shift.id];
                  return {
                    hasClosedTimeEntry: w?.hasClosedTimeEntry ?? false,
                    workedMinutes: w?.workedMinutes ?? 0,
                    workerStatus: w?.workerStatus ?? "no_period_yet",
                  };
                });
                return (
                <section key={b.key} className="space-y-2">
                  <AgendaSectionHeader title={b.label} />
                  <WeekHistorySummary total={b.items.length} slices={slices} />
                  <OperationalTimeline>
                    {b.items.map((a) => {
                      const w = workedHistory.byShiftId[a.shift.id];
                      const subtitleParts = [
                        a.shift.client?.name,
                        a.shift.location?.name,
                      ].filter(Boolean) as string[];
                      return (
                        <HistoryShiftRow
                          key={a.id}
                          shiftId={a.shift.id}
                          date={a.shift.date}
                          title={formatDisplayName(a.shift.title) || "Turno"}
                          subtitle={subtitleParts.length ? subtitleParts.map(formatDisplayName).join(" · ") : null}
                          scheduledStart={a.shift.start_time}
                          scheduledEnd={a.shift.end_time}
                          clockIn={w?.clockIn ?? null}
                          clockOut={w?.clockOut ?? null}
                          workedMinutes={w?.workedMinutes ?? 0}
                          hasOpenClock={w?.hasOpenClock ?? false}
                          hasClosedTimeEntry={w?.hasClosedTimeEntry ?? false}
                          workerStatus={w?.workerStatus ?? "no_period_yet"}
                          hasRide={w?.hasRide ?? false}
                          loading={workedHistory.loading && !w}
                          onClick={() => setSelectedShift(a)}
                        />
                      );
                    })}
                  </OperationalTimeline>
                </section>
                );
              })}

              {remaining > 0 && (
                <div className="pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHistoryVisible((v) => v + HISTORY_PAGE)}
                    className="w-full h-10 text-[12px] font-semibold rounded-xl text-muted-foreground hover:text-foreground"
                  >
                    {t("portal.shifts.history.load_more", { next: Math.min(remaining, HISTORY_PAGE), remaining })}
                  </Button>
                </div>
              )}
            </div>
          );
        }

        // Today / Upcoming — exclude hero item from the timeline to avoid duplication.
        const list = filtered.filter((a) => a.id !== heroId);
        if (list.length === 0) return null;
        return (
          <section className="space-y-2">
            <AgendaSectionHeader
              title={activeTab === "today" ? t("portal.shifts.section.today") : t("portal.shifts.section.this_week")}
              caption={list.length === 1 ? t("portal.shifts.section.count_one") : t("portal.shifts.section.count_many", { count: list.length })}
            />
            <OperationalTimeline>
              {list.map((a, i) => renderRow(a, i, "comfortable"))}
            </OperationalTimeline>
          </section>
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                      {t("portal.shifts.available.chip")}
                    </span>
                    {s.slots && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        {s.slots - s.assignedCount} {(s.slots - s.assignedCount) === 1 ? t("portal.shifts.available.slot_one") : t("portal.shifts.available.slot_many")}
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] font-bold text-foreground truncate">{formatDisplayName(s.title)}</p>
                  <p className="text-[12px] text-muted-foreground/80 mt-0.5">
                    {isToday(parseISO(s.date)) ? t("portal.shifts.today_label") : isTomorrow(parseISO(s.date)) ? t("portal.shifts.tomorrow_label") : format(parseISO(s.date), "EEE d MMM", { locale: enUS })}
                    {" · "}
                    <span className="font-semibold text-foreground">{t("portal.clock.clock_in_label")} <span className="tabular-nums font-mono">{s.start_time?.slice(0, 5)}</span></span>
                    {s.end_time && (
                      <span className="text-muted-foreground/70"> · {t("portal.shifts.ends_approx")} <span className="tabular-nums font-mono">{s.end_time?.slice(0, 5)}</span></span>
                    )}
                  </p>
                  {s.location && (
                    <p className="text-[12px] text-muted-foreground/70 mt-0.5 flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 shrink-0" /> {formatDisplayName(s.location.name)}
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
                {claiming === s.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("portal.shifts.available.requesting")}</> : <><HandMetal className="h-3.5 w-3.5" />{t("portal.shifts.available.request")}</>}
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
              {activeTab === "today" && t("portal.shifts.empty.today_title")}
              {activeTab === "upcoming" && t("portal.shifts.empty.upcoming_title")}
              {activeTab === "history" && t("portal.shifts.empty.history_title")}
            </p>
            <p className="text-xs text-muted-foreground/70 max-w-[240px] mx-auto">
              {activeTab === "today"
                ? t("portal.shifts.empty.today_body")
                : activeTab === "history"
                ? t("portal.shifts.empty.history_body")
                : t("portal.shifts.empty.default_body")
              }
            </p>
          </div>
        </div>
      )}


      {/* Shift detail drawer */}
      <PortalShiftDetailDrawer
        shift={selectedShift?.shift ?? null}
        assignmentStatus={selectedShift ? getDisplayStatus(selectedShift) : undefined}
        responseStatus={selectedShift?.response_status}
        onAccept={
          selectedShift &&
          (selectedShift.response_status === "pending" || selectedShift.response_status === "needs_reacceptance") &&
          !isBefore(parseISO(selectedShift.shift.date), today)
            ? () => acceptAssignment(selectedShift.id)
            : undefined
        }
        onReject={
          selectedShift &&
          (selectedShift.response_status === "pending" || selectedShift.response_status === "needs_reacceptance") &&
          !isBefore(parseISO(selectedShift.shift.date), today)
            ? () => { setRejectDialogId(selectedShift.id); setRejectReason(""); }
            : undefined
        }
        responding={!!selectedShift && responding === selectedShift.id}
        historyInfo={selectedShift ? workedHistory.byShiftId[selectedShift.shift.id] : undefined}
        historyLoading={workedHistory.loading}
        open={!!selectedShift}
        onOpenChange={o => { if (!o) setSelectedShift(null); }}
      />

      {/* Reject dialog */}
      <Dialog open={!!rejectDialogId} onOpenChange={o => { if (!o) { setRejectDialogId(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Decline Shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Puedes indicar un motivo (opcional).</p>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Motivo (opcional)..." rows={3} className="text-sm resize-none rounded-xl" />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setRejectDialogId(null); setRejectReason(""); }}>Cancelar</Button>
            <Button variant="destructive" size="sm" className="rounded-xl" onClick={rejectAssignment} disabled={responding === rejectDialogId}>
              {responding === rejectDialogId ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
