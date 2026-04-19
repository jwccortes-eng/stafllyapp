import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName } from "@/lib/format-helpers";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { Link, useNavigate } from "react-router-dom";
import { usePortalModules } from "@/hooks/usePortalModules";
import {
  Wallet, Clock, CalendarDays,
  ArrowRight, LogIn, LogOut, MapPin, Timer,
  Bell, ChevronRight, AlertTriangle, Navigation,
  Briefcase, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { format, parseISO, isToday, isTomorrow, startOfWeek, endOfWeek, differenceInMinutes } from "date-fns";
import { enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { PendingReviewPrompt } from "@/components/reviews/PendingReviewPrompt";

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

function getCountdown(dateStr: string, startTime: string): string | null {
  const now = new Date();
  const [h, m] = startTime.split(":").map(Number);
  const shiftStart = parseISO(dateStr);
  shiftStart.setHours(h, m, 0, 0);
  const diff = shiftStart.getTime() - now.getTime();
  if (diff < 0 || diff > 24 * 60 * 60 * 1000) return null;
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs > 0) return `in ${hrs}h ${mins}m`;
  return `in ${mins}m`;
}

function calcDuration(start: string, end: string): string {
  const s = new Date(`2000-01-01T${start}`);
  let e = new Date(`2000-01-01T${end}`);
  if (e <= s) e = new Date(e.getTime() + 86400000);
  const mins = differenceInMinutes(e, s);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function EmployeeDashboard() {
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const navigate = useNavigate();
  const { isModuleEnabled } = usePortalModules();
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
        .eq("employee_id", employeeId).neq("status", "rejected")
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
    if (mapped.length > 0) setNextShift(mapped[0]);
    setUpcomingShifts(mapped.slice(1, 4));

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

  const countdown = nextShift && isToday(parseISO(nextShift.date))
    ? getCountdown(nextShift.date, nextShift.start_time)
    : null;

  const isTodayShift = nextShift ? isToday(parseISO(nextShift.date)) : false;
  const isTomorrowShift = nextShift ? isTomorrow(parseISO(nextShift.date)) : false;
  const isConfirmed = nextShift && (nextShift.status === "confirmed" || nextShift.status === "accepted");
  const duration = nextShift ? calcDuration(nextShift.start_time, nextShift.end_time) : "";

  return (
    <div className="space-y-4 animate-fade-in pb-24">
      {/* ── Greeting — compact ── */}
      <div className="flex items-center gap-3">
        <EmployeeAvatar
          firstName={firstName}
          lastName={lastName}
          avatarUrl={empAvatar}
          size="md"
          className="ring-2 ring-primary/10"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground font-medium">{greeting},</p>
          <h1 className="text-lg font-bold font-heading tracking-tight leading-tight text-foreground truncate">
            {firstName}
          </h1>
        </div>
        {companyName && (
          <span className="text-[9px] text-muted-foreground/50 bg-muted/40 px-2 py-0.5 rounded-full font-medium shrink-0 max-w-[120px] truncate">
            {companyName}
          </span>
        )}
      </div>

      {/* ── Active clock banner — only when clocked in ── */}
      {isModuleEnabled("my_clock") && clockStatus.isClockedIn && (
        <button
          className="w-full rounded-2xl px-4 py-3 bg-[hsl(var(--status-confirmed)/0.06)] border-2 border-[hsl(var(--status-confirmed)/0.2)] transition-all active:scale-[0.98]"
          onClick={() => navigate("/portal/clock")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[hsl(var(--status-confirmed)/0.12)] flex items-center justify-center">
                <Clock className="h-4 w-4 text-[hsl(var(--status-confirmed))]" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[hsl(var(--status-confirmed))] animate-pulse" />
                  <span className="text-[13px] font-bold text-foreground">On shift</span>
                </div>
                {clockStatus.shiftTitle && (
                  <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{clockStatus.shiftTitle}</p>
                )}
              </div>
            </div>
            <div className="h-9 px-4 rounded-xl flex items-center gap-1.5 font-bold text-[12px] bg-[hsl(var(--status-confirmed))] text-white">
              <LogOut className="h-3.5 w-3.5" /> Clock Out
            </div>
          </div>
        </button>
      )}

      {/* ── Alerts row ── */}
      {pendingCount > 0 && (
        <Link to="/portal/shifts">
          <div className="rounded-2xl bg-[hsl(var(--status-pending)/0.08)] border border-[hsl(var(--status-pending)/0.15)] px-3.5 py-2.5 flex items-center gap-3 active:scale-[0.98] transition-all">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-pending))] shrink-0" />
             <p className="text-[13px] font-bold text-foreground flex-1">
              {pendingCount} shift{pendingCount > 1 ? "s" : ""} to confirm
            </p>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
          </div>
        </Link>
      )}

      {/* ── HERO: Next Shift ── */}
      {isModuleEnabled("my_shifts") && nextShift && (
        <div
          className={cn(
            "rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-all duration-200",
            isTodayShift
              ? "bg-gradient-to-br from-primary/[0.06] via-card to-card border-2 border-primary/20 shadow-[0_4px_24px_-8px_hsl(var(--primary)/0.15)]"
              : "bg-card border border-border/40 shadow-sm"
          )}
          onClick={() => navigate("/portal/shifts")}
        >
          {/* Countdown banner */}
          {countdown && isConfirmed && (
            <div className="bg-primary/8 px-4 py-1.5 flex items-center gap-2 border-b border-primary/10">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] font-bold text-primary tracking-wide">Starts {countdown}</span>
            </div>
          )}

          <div className="p-4 space-y-2.5">
            {/* Row 1: Day + time + duration */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isTodayShift && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-primary text-primary-foreground uppercase tracking-widest">Today</span>
                )}
                {isTomorrowShift && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-accent text-accent-foreground uppercase tracking-widest">Tomorrow</span>
                )}
                {!isTodayShift && !isTomorrowShift && (
                  <span className="text-[11px] font-semibold text-muted-foreground capitalize">
                    {format(parseISO(nextShift.date), "EEE d MMM")}
                  </span>
                )}
                <span className="text-sm font-bold text-foreground tabular-nums">
                  {nextShift.start_time?.slice(0, 5)} – {nextShift.end_time?.slice(0, 5)}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground/40 font-medium">{duration}</span>
            </div>

            {/* Title */}
            <p className="text-[15px] font-bold text-foreground leading-snug line-clamp-2">{nextShift.title}</p>

            {/* Location + Client — single line */}
            {(nextShift.location_name || nextShift.client_name) && (
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {nextShift.location_name && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0 text-primary/40" />
                    <span className="truncate">{nextShift.location_name}</span>
                  </span>
                )}
                {nextShift.client_name && (
                  <span className="flex items-center gap-1 truncate">
                    <Briefcase className="h-3 w-3 shrink-0 text-primary/40" />
                    <span className="truncate">{nextShift.client_name}</span>
                  </span>
                )}
              </div>
            )}

            {/* Meeting point */}
            {nextShift.meeting_point && (
              <div className="flex items-center gap-1.5 text-[11px] text-primary/80 bg-primary/[0.05] rounded-lg px-3 py-1.5">
                <Navigation className="h-3 w-3 shrink-0" />
                <span className="truncate font-medium">{nextShift.meeting_point}</span>
              </div>
            )}

            {/* CTA */}
            {isTodayShift && isConfirmed && isModuleEnabled("my_clock") && !clockStatus.isClockedIn && (
              <Button
                size="lg"
                className="w-full h-12 text-sm gap-2 font-bold rounded-xl shadow-lg shadow-primary/20"
                onClick={(e) => { e.stopPropagation(); navigate(`/portal/clock?shiftId=${nextShift.id}`); }}
              >
                <LogIn className="h-4 w-4" />
                Clock In
              </Button>
            )}
            {nextShift.status === "pending" && (
              <Button
                size="lg"
                variant="outline"
                className="w-full h-11 text-xs font-bold border-[hsl(var(--status-pending)/0.3)] text-[hsl(var(--status-pending))] hover:bg-[hsl(var(--status-pending)/0.05)] rounded-xl"
                onClick={(e) => { e.stopPropagation(); navigate("/portal/shifts"); }}
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                Confirm shift
              </Button>
            )}
          </div>
        </div>
      )}

      {/* No shifts */}
      {isModuleEnabled("my_shifts") && !nextShift && (
        <Link to="/portal/shifts" className="block">
          <div className="rounded-2xl border-2 border-dashed border-border/30 bg-muted/5 p-6 flex flex-col items-center gap-2 active:scale-[0.98] transition-all">
            <CalendarDays className="h-8 w-8 text-muted-foreground/20" />
             <p className="text-sm font-bold text-foreground">No scheduled shifts</p>
            <p className="text-[11px] text-muted-foreground/50">Assigned shifts will appear here</p>
          </div>
        </Link>
      )}

      {/* ── Stats row — tighter ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-card border border-border/30 p-3 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <Timer className="h-3.5 w-3.5 text-muted-foreground/40" />
          </div>
          <p className="text-base font-bold font-heading tabular-nums leading-none">{weeklyHours}</p>
          <p className="text-[8px] font-medium text-muted-foreground/50 uppercase tracking-wider mt-1">This week</p>
        </div>

        {isModuleEnabled("my_shifts") && (
          <Link to="/portal/shifts" className="block">
            <div className="rounded-2xl bg-card border border-border/30 p-3 shadow-sm h-full">
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarDays className="h-3.5 w-3.5 text-primary/40" />
              </div>
              <p className="text-base font-bold font-heading tabular-nums leading-none">
                {(upcomingShifts.length + (nextShift ? 1 : 0))}
              </p>
              <p className="text-[8px] font-medium text-muted-foreground/50 uppercase tracking-wider mt-1">Shifts</p>
            </div>
          </Link>
        )}

        {isModuleEnabled("my_payments") && estimatedPay !== null ? (
          <Link to="/portal/payments" className="block">
            <div className="rounded-2xl bg-card border border-border/30 p-3 shadow-sm h-full">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--status-confirmed))]" />
              </div>
              <p className="text-base font-bold font-heading tabular-nums leading-none">${estimatedPay.toFixed(0)}</p>
              <p className="text-[8px] font-medium text-muted-foreground/50 uppercase tracking-wider mt-1">Estimated</p>
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl bg-card border border-border/30 p-3 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground/30" />
            </div>
            <p className="text-base font-bold font-heading tabular-nums leading-none text-muted-foreground/30">—</p>
            <p className="text-[8px] font-medium text-muted-foreground/50 uppercase tracking-wider mt-1">Est. pay</p>
          </div>
        )}
      </div>

      {/* ── Upcoming shifts ── */}
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
                         <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-primary text-primary-foreground uppercase">Today</span>
                      ) : sIsTomorrow ? (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-accent text-accent-foreground uppercase">Tmw</span>
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
                      <p className="text-[12px] font-semibold text-foreground truncate">{s.title}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-0.5">
                        <span className="flex items-center gap-0.5 font-medium tabular-nums">
                          <Clock className="h-2.5 w-2.5" />
                          {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                        </span>
                        {s.location_name && <span className="truncate">{s.location_name}</span>}
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

      {/* ── Notifications badge ── */}
      {unreadAlerts > 0 && (
        <div className="rounded-xl bg-primary/[0.04] border border-primary/10 px-3.5 py-2.5 flex items-center gap-3">
          <Bell className="h-4 w-4 text-primary shrink-0" />
           <p className="text-[12px] font-semibold text-foreground flex-1">
            {unreadAlerts} unread notification{unreadAlerts > 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* ── Pending Reviews ── */}
      <PendingReviewPrompt />
    </div>
  );
}
