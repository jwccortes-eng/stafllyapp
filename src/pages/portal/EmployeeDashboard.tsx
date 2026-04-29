import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName, formatDisplayName } from "@/lib/format-helpers";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useEmployeeReadiness } from "@/hooks/useEmployeeReadiness";
import { Link } from "react-router-dom";
import { usePortalModules } from "@/hooks/usePortalModules";
import {
  Wallet, Clock, CalendarDays, ArrowRight, Timer,
  Bell, ChevronRight, TrendingUp,
  User, FileText, MessageCircle, LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isTomorrow, startOfWeek, endOfWeek } from "date-fns";
import { PendingReviewPrompt } from "@/components/reviews/PendingReviewPrompt";
import { NextBestActionCard } from "@/components/portal/home/NextBestActionCard";
import { TodayBlock } from "@/components/portal/home/TodayBlock";
import { ProfileReadinessStrip } from "@/components/portal/home/ProfileReadinessStrip";
import { WorkerHero, type WorkerHeroStatus } from "@/components/portal/home/WorkerHero";
import { QuickActions, type QuickAction } from "@/components/portal/home/QuickActions";
import { selectNextBestAction, type NbaShift } from "@/lib/portal/next-best-action";

interface NextShift {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  client_name: string | null;
  meeting_point: string | null;
  status: string;
}

export default function EmployeeDashboard() {
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const { isModuleEnabled } = usePortalModules();
  const readiness = useEmployeeReadiness(employeeId);
  const [empName, setEmpName] = useState("");
  const [empAvatar, setEmpAvatar] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [nextShift, setNextShift] = useState<NextShift | null>(null);
  const [upcomingShifts, setUpcomingShifts] = useState<NextShift[]>([]);
  const [estimatedPay, setEstimatedPay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockStatus, setClockStatus] = useState<{
    isClockedIn: boolean;
    clockInTime: string | null;
    shiftTitle: string | null;
  }>({ isClockedIn: false, clockInTime: null, shiftTitle: null });
  const [weeklyHours, setWeeklyHours] = useState("0h");
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [claimableCount, setClaimableCount] = useState(0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    if (!employeeId) { setLoading(false); return; }
    setLoading(true);

    const { data: emp } = await supabase
      .from("employees")
      .select("first_name, last_name, company_id, avatar_url")
      .eq("id", employeeId)
      .maybeSingle();
    if (!emp) { setLoading(false); return; }

    setEmpName(formatPersonName(`${emp.first_name} ${emp.last_name}`));
    setEmpAvatar(emp.avatar_url);

    const today = new Date().toISOString().split("T")[0];
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

    const [companyRes, periodRes, assignRes, clockRes, weekRes] = await Promise.all([
      supabase.from("companies").select("name").eq("id", emp.company_id).maybeSingle(),
      supabase.from("pay_periods").select("id, start_date, end_date, status, published_at")
        .eq("company_id", emp.company_id).order("start_date", { ascending: false }).limit(1).maybeSingle(),
      // Hide soft-deleted shifts (see src/lib/shifts/visibility.ts)
      supabase.from("shift_assignments")
        .select("status, scheduled_shifts!inner (id, title, date, start_time, end_time, status, meeting_point, locations (name), clients (name))")
        .eq("employee_id", employeeId)
        .eq("company_id", emp.company_id)
        .eq("is_draft_reservation", false)
        .not("status", "in", "(removed,rejected)")
        .eq("scheduled_shifts.publication_status", "published")
        .not("scheduled_shifts.status", "in", "(cancelled,canceled)")
        .is("scheduled_shifts.deleted_at", null)
        .gte("scheduled_shifts.date", today).order("created_at", { ascending: true }).limit(5),
      supabase.from("time_entries").select("id, clock_in, clock_out, shift_id, scheduled_shifts(title)").eq("employee_id", employeeId).is("clock_out", null).limit(1) as any,
      supabase.from("time_entries").select("clock_in, clock_out")
        .eq("employee_id", employeeId).gte("clock_in", weekStart).lte("clock_in", weekEnd),
    ]);

    const notifRes = await (supabase.from("notifications").select("id")
      .eq("recipient_id", employeeId!) as any).eq("is_read", false);

    setCompanyName(companyRes.data?.name ?? "");

    const activeClocks = (clockRes.data ?? []) as any[];
    if (activeClocks.length > 0) {
      const ac = activeClocks[0];
      setClockStatus({ isClockedIn: true, clockInTime: ac.clock_in, shiftTitle: ac.scheduled_shifts?.title ?? null });
    } else {
      setClockStatus({ isClockedIn: false, clockInTime: null, shiftTitle: null });
    }

    let totalSec = 0;
    for (const e of (weekRes.data ?? []) as any[]) {
      const end = e.clock_out ? new Date(e.clock_out) : new Date();
      totalSec += (end.getTime() - new Date(e.clock_in).getTime()) / 1000;
    }
    const wh = Math.floor(totalSec / 3600);
    const wm = Math.floor((totalSec % 3600) / 60);
    setWeeklyHours(wm > 0 ? `${wh}h ${wm}m` : `${wh}h`);

    const shifts = (assignRes.data ?? []) as any[];
    let pCount = 0;
    const mapped: NextShift[] = shifts.map((a: any) => {
      const s = a.scheduled_shifts;
      if (a.status === "pending") pCount++;
      return {
        id: s.id, title: s.title, date: s.date,
        start_time: s.start_time, end_time: s.end_time,
        location_name: s.locations?.name ?? null,
        client_name: s.clients?.name ?? null,
        meeting_point: s.meeting_point ?? null,
        status: a.status,
      };
    });
    setPendingCount(pCount);
    setNextShift(mapped[0] ?? null);
    setUpcomingShifts(mapped.slice(1, 4));

    // Count claimable shifts (open/published, future, not full, not already mine)
    const myShiftIds = new Set(mapped.map(s => s.id));
    // Align with PortalShiftDetail / MyShifts: pending requests hide the shift
    const { data: myPendingReqs } = await supabase
      .from("shift_requests")
      .select("shift_id")
      .eq("employee_id", employeeId!)
      .eq("status", "pending");
    const pendingRequestShiftIds = new Set((myPendingReqs ?? []).map((r: any) => r.shift_id as string));
    const { data: claimRows } = await supabase
      .from("scheduled_shifts")
      .select("id, slots, shift_assignments(id, status)")
      .eq("company_id", emp.company_id)
      .eq("claimable", true)
      .in("status", ["open", "published"])
      .is("deleted_at", null)
      .gte("date", today);
    const cCount = (claimRows ?? []).filter((s: any) => {
      if (myShiftIds.has(s.id)) return false;
      if (pendingRequestShiftIds.has(s.id)) return false;
      const active = (s.shift_assignments ?? []).filter((a: any) => a.status !== "removed" && a.status !== "rejected").length;
      return !s.slots || active < s.slots;
    }).length;
    setClaimableCount(cCount);

    if (periodRes.data) {
      const p = periodRes.data;
      const [bpRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("base_total_pay").eq("employee_id", employeeId!).eq("period_id", p.id).maybeSingle(),
        supabase.from("movements").select("total_value, concepts(category)").eq("employee_id", employeeId!).eq("period_id", p.id),
      ]);
      const base = Number(bpRes.data?.base_total_pay) || 0;
      let extras = 0, deductions = 0;
      (movRes.data ?? []).forEach((m: any) => {
        if (m.concepts?.category === "extra") extras += Number(m.total_value) || 0;
        else deductions += Number(m.total_value) || 0;
      });
      setEstimatedPay(base + extras - deductions);
    }

    setUnreadAlerts((notifRes?.data ?? []).length);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { loadData(); }, [loadData]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = empName.split(" ")[0] || "";
  const lastName = empName.split(" ").slice(1).join(" ") || "";

  // ── Build NBA shift snapshot from existing fetched data ──
  // NOTE: All hooks must be declared before any early return to satisfy
  // React's Rules of Hooks. Do not move these below the `if (loading)` guard.
  const nbaShift: NbaShift | null = useMemo(() => (
    nextShift
      ? {
          id: nextShift.id,
          title: nextShift.title,
          date: nextShift.date,
          start_time: nextShift.start_time,
          end_time: nextShift.end_time,
          status: nextShift.status,
          client_name: nextShift.client_name,
          location_name: nextShift.location_name,
          meeting_point: nextShift.meeting_point,
        }
      : null
  ), [nextShift]);

  const nba = useMemo(() => selectNextBestAction({
    clockStatus: { isClockedIn: clockStatus.isClockedIn, shiftTitle: clockStatus.shiftTitle },
    nextShift: nbaShift,
    pendingCount,
    claimableCount,
    readinessStatus: readiness.status,
    readinessMissingPersonal: readiness.missingPersonal.length,
    readinessMissingDocs: readiness.missingDocuments.length,
    now,
  }), [
    clockStatus.isClockedIn, clockStatus.shiftTitle, nbaShift, pendingCount,
    claimableCount, readiness.status, readiness.missingPersonal.length,
    readiness.missingDocuments.length, now,
  ]);

  if (loading) {
    return (
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-muted animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-3 w-32 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="h-32 animate-pulse bg-muted rounded-2xl" />
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-muted rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const nbaCoversToday = (
    nba.kind === "clocked_in" ||
    nba.kind === "clock_in_now" ||
    nba.kind === "next_shift_today" ||
    nba.kind === "confirm_shift"
  );
  const showTodayBlock = nbaShift && isToday(parseISO(nbaShift.date)) && !nbaCoversToday;
  const showFutureBlock =
    nbaShift && !isToday(parseISO(nbaShift.date)) &&
    nba.kind !== "next_shift_future";

  // ── Hero status — single source of truth derived from clockStatus + readiness ──
  // No new queries: same fields the rest of the page already uses.
  const heroStatus: WorkerHeroStatus = clockStatus.isClockedIn
    ? "on_shift"
    : (readiness.status && readiness.status !== "ready" && readiness.status !== "active")
    ? "incomplete"
    : "ready";

  // ── Quick actions — only show modules the worker has access to ──
  const quickActions: QuickAction[] = [
    { id: "profile", label: "My profile", href: "/portal/profile", icon: User, accent: "muted" },
    isModuleEnabled("my_documents") || isModuleEnabled("my_w9")
      ? { id: "documents", label: "Documents", href: "/portal/documents", icon: FileText, accent: "warning" as const }
      : null,
    isModuleEnabled("my_shifts")
      ? { id: "shifts", label: "My shifts", href: "/portal/shifts", icon: CalendarDays, accent: "primary" as const }
      : null,
    isModuleEnabled("my_clock")
      ? { id: "clock", label: "Clock", href: "/portal/clock", icon: Clock, accent: "earning" as const }
      : null,
    isModuleEnabled("my_chat")
      ? { id: "chat", label: "Support", href: "/portal/chat", icon: MessageCircle, accent: "muted" as const }
      : null,
  ].filter(Boolean) as QuickAction[];

  return (
    <div className="space-y-4 animate-fade-in pb-28">
      {/* ── Worker Hero — premium emotional intro ── */}
      <WorkerHero
        firstName={firstName}
        lastName={lastName}
        greeting={greeting}
        companyName={companyName || null}
        avatarUrl={empAvatar}
        status={heroStatus}
      />

      {/* ── Next Best Action — single dynamic card ── */}
      <NextBestActionCard nba={nba} />

      {/* ── Today / Future shift detail (only if NBA isn't already showing it) ── */}
      {(showTodayBlock || showFutureBlock) && nbaShift && (
        <TodayBlock shift={nbaShift} />
      )}

      {/* ── Profile readiness strip (auto-hides if NBA already surfaces it) ── */}
      <ProfileReadinessStrip nbaKind={nba.kind} />

      {/* ── Your week — mini stats grid ── */}
      <section aria-label="Your week" className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Your week
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-card border border-border/40 p-3 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Timer className="h-3.5 w-3.5 text-muted-foreground/55" />
            </div>
            <p className="text-lg font-bold font-heading tabular-nums leading-none text-foreground">
              {weeklyHours}
            </p>
            <p className="text-[9.5px] font-semibold text-muted-foreground/65 uppercase tracking-wider mt-1.5">
              This week
            </p>
          </div>

          {isModuleEnabled("my_shifts") ? (
            <Link to="/portal/shifts" className="block">
              <div className="rounded-2xl bg-card border border-border/40 p-3 shadow-sm h-full active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-primary/70" />
                </div>
                <p className="text-lg font-bold font-heading tabular-nums leading-none text-foreground">
                  {(upcomingShifts.length + (nextShift ? 1 : 0))}
                </p>
                <p className="text-[9.5px] font-semibold text-muted-foreground/65 uppercase tracking-wider mt-1.5">
                  Shifts
                </p>
              </div>
            </Link>
          ) : (
            <div className="rounded-2xl bg-card border border-border/40 p-3 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/35" />
              </div>
              <p className="text-lg font-bold font-heading tabular-nums leading-none text-muted-foreground/40">—</p>
              <p className="text-[9.5px] font-semibold text-muted-foreground/65 uppercase tracking-wider mt-1.5">
                Shifts
              </p>
            </div>
          )}

          {isModuleEnabled("my_payments") && estimatedPay !== null ? (
            <Link to="/portal/payments" className="block">
              <div className="rounded-2xl bg-card border border-border/40 p-3 shadow-sm h-full active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--status-confirmed))]" />
                </div>
                <p className="text-lg font-bold font-heading tabular-nums leading-none text-foreground">
                  ${estimatedPay.toFixed(0)}
                </p>
                <p className="text-[9.5px] font-semibold text-muted-foreground/65 uppercase tracking-wider mt-1.5">
                  Est. pay
                </p>
              </div>
            </Link>
          ) : (
            <div className="rounded-2xl bg-card border border-border/40 p-3 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Wallet className="h-3.5 w-3.5 text-muted-foreground/35" />
              </div>
              <p className="text-lg font-bold font-heading tabular-nums leading-none text-muted-foreground/40">—</p>
              <p className="text-[9.5px] font-semibold text-muted-foreground/65 uppercase tracking-wider mt-1.5">
                Est. pay
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Quick actions — premium 2-col grid ── */}
      <QuickActions actions={quickActions} />


      {/* ── Upcoming shifts (skip first; it's already in NBA / TodayBlock) ── */}
      {upcomingShifts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-foreground">Upcoming</h2>
            <Link to="/portal/shifts" className="text-[11px] text-primary font-semibold flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-1.5">
            {upcomingShifts.map((s) => {
              const sIsToday = isToday(parseISO(s.date));
              const sIsTomorrow = isTomorrow(parseISO(s.date));
              return (
                <Link key={s.id} to="/portal/shifts" className="block">
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card border shadow-sm active:scale-[0.98] transition-all",
                    sIsToday ? "border-primary/15" : "border-border/30"
                  )}>
                    <div className="text-center shrink-0 w-9">
                      {sIsToday ? (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-primary/12 text-primary tracking-wide">Today</span>
                      ) : sIsTomorrow ? (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-accent/40 text-accent-foreground tracking-wide">Tmw</span>
                      ) : (
                        <>
                          <p className="text-[7px] font-bold uppercase text-muted-foreground/40 leading-none">
                            {format(parseISO(s.date), "MMM")}
                          </p>
                          <p className="text-sm font-bold text-foreground leading-tight tabular-nums">
                            {format(parseISO(s.date), "d")}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-foreground truncate">
                        {formatDisplayName(s.title)}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-0.5">
                        <span className="flex items-center gap-0.5 font-medium tabular-nums">
                          <Clock className="h-2.5 w-2.5" />
                          {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                        </span>
                        {s.location_name && <span className="truncate">{formatDisplayName(s.location_name)}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/15 shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty upcoming state — only when no shifts at all ── */}
      {!nextShift && upcomingShifts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/50 bg-card/50 px-4 py-5 text-center">
          <div className="h-10 w-10 mx-auto rounded-xl bg-muted/60 flex items-center justify-center mb-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground/60" />
          </div>
          <p className="text-[13px] font-semibold text-foreground">No upcoming shift yet</p>
          <p className="text-[11.5px] text-muted-foreground/75 mt-1 leading-relaxed max-w-[260px] mx-auto">
            We'll notify you when something is assigned.
          </p>
        </div>
      )}

      {/* ── Notifications badge ── */}
      {unreadAlerts > 0 && (
        <div className="rounded-xl bg-primary/[0.04] border border-primary/10 px-3.5 py-2.5 flex items-center gap-3">
          <Bell className="h-4 w-4 text-primary shrink-0" />
          <p className="text-[12px] font-semibold text-foreground flex-1">
            {unreadAlerts} unread notification{unreadAlerts > 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* ── Need help? — calm support entry, only if chat module enabled ── */}
      {isModuleEnabled("my_chat") && (
        <Link to="/portal/chat" className="block">
          <div className="rounded-2xl border border-border/40 bg-card px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition-all shadow-sm">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <LifeBuoy className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground leading-tight">Need help?</p>
              <p className="text-[11px] text-muted-foreground/75 mt-0.5">Reach out to your supervisor.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
          </div>
        </Link>
      )}

      {/* ── Pending Reviews ── */}
      <PendingReviewPrompt />
    </div>
  );
}
