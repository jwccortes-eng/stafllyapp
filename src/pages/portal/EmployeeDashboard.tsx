import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName } from "@/lib/format-helpers";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { usePortalModules } from "@/hooks/usePortalModules";
import {
  Wallet, Clock, CalendarDays,
  ArrowRight, LogIn, LogOut, MapPin, Timer,
  Bell, ChevronRight, AlertTriangle, Navigation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { format, parseISO, isToday, isTomorrow, startOfWeek, endOfWeek, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
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
  if (hrs > 0) return `Empieza en ${hrs}h ${mins}m`;
  return `Empieza en ${mins}m`;
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
  const { employeeId } = useAuth();
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
      supabase.from("shift_assignments")
        .select("status, scheduled_shifts!inner (id, title, date, start_time, end_time, status, meeting_point, locations (name), clients (name))")
        .eq("employee_id", employeeId).neq("status", "rejected")
        .gte("scheduled_shifts.date", today).order("created_at", { ascending: true }).limit(5),
      supabase.from("time_entries").select("id, clock_in, clock_out, shift_id").eq("employee_id", employeeId).is("clock_out", null).limit(1) as any,
      supabase.from("time_entries").select("clock_in, clock_out")
        .eq("employee_id", employeeId).gte("clock_in", weekStart).lte("clock_in", weekEnd),
    ]);

    const notifRes = await (supabase.from("notifications").select("id")
      .eq("recipient_id", employeeId!) as any).eq("is_read", false);

    setCompanyName(companyRes.data?.name ?? "");

    const activeClocks = (clockRes.data ?? []) as any[];
    if (activeClocks.length > 0) {
      setClockStatus({ isClockedIn: true, clockInTime: activeClocks[0].clock_in, shiftTitle: activeClocks[0].scheduled_shifts?.title ?? null });
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
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  })();

  const firstName = empName.split(" ")[0] || "";
  const lastName = empName.split(" ").slice(1).join(" ") || "";

  if (loading) {
    return (
      <div className="space-y-4 pt-2">
        <div className="h-16 animate-pulse bg-muted rounded-2xl" />
        <div className="h-36 animate-pulse bg-muted rounded-2xl" />
        <div className="h-20 animate-pulse bg-muted rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 animate-pulse bg-muted rounded-2xl" />
          <div className="h-20 animate-pulse bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  const countdown = nextShift && isToday(parseISO(nextShift.date))
    ? getCountdown(nextShift.date, nextShift.start_time)
    : null;

  const isTodayShift = nextShift ? isToday(parseISO(nextShift.date)) : false;
  const isTomorrowShift = nextShift ? isTomorrow(parseISO(nextShift.date)) : false;

  return (
    <div className="space-y-4">
      {/* ── Greeting ── */}
      <div className="flex items-center gap-3.5 pt-1">
        <EmployeeAvatar
          firstName={firstName}
          lastName={lastName}
          avatarUrl={empAvatar}
          size="lg"
          className="ring-2 ring-primary/15 shadow-md"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground">{greeting}</p>
          <h1 className="text-xl font-bold font-heading tracking-tight leading-tight text-foreground">
            {firstName}
          </h1>
          {companyName && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">{companyName}</p>
          )}
        </div>
      </div>

      {/* ── A. HERO: NEXT SHIFT ── */}
      {isModuleEnabled("my_shifts") && nextShift && (
        <div
          className={cn(
            "rounded-2xl border overflow-hidden cursor-pointer active:scale-[0.98] transition-all",
            isTodayShift
              ? "border-primary/30 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] shadow-[0_0_0_1px_hsl(var(--primary)/0.1)]"
              : "border-border/40 bg-card"
          )}
          onClick={() => navigate("/portal/shifts")}
        >
          {/* Countdown banner */}
          {countdown && (
            <div className="bg-primary/10 px-4 py-2 flex items-center gap-2 border-b border-primary/10">
              <Timer className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-primary">{countdown}</span>
            </div>
          )}

          <div className="p-4 space-y-3">
            {/* Day + time */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {isTodayShift && (
                  <span className="text-[9px] px-2.5 py-1 rounded-full font-bold bg-primary text-primary-foreground uppercase tracking-wider">
                    Hoy
                  </span>
                )}
                {isTomorrowShift && (
                  <span className="text-[9px] px-2.5 py-1 rounded-full font-bold bg-accent text-accent-foreground uppercase tracking-wider">
                    Mañana
                  </span>
                )}
                {!isTodayShift && !isTomorrowShift && (
                  <span className="text-[10px] font-semibold text-muted-foreground capitalize">
                    {format(parseISO(nextShift.date), "EEEE d MMM", { locale: es })}
                  </span>
                )}
                <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  {nextShift.start_time?.slice(0, 5)} – {nextShift.end_time?.slice(0, 5)}
                </span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
            </div>

            {/* Title */}
            <p className="text-base font-bold text-foreground leading-snug">{nextShift.title}</p>

            {/* Location */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {nextShift.location_name && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                  {nextShift.location_name}
                </span>
              )}
              {nextShift.client_name && (
                <span className="truncate">{nextShift.client_name}</span>
              )}
            </div>

            {/* Meeting point */}
            {nextShift.meeting_point && (
              <div className="flex items-center gap-1.5 text-[11px] text-primary/80 bg-primary/5 rounded-lg px-2.5 py-1.5">
                <Navigation className="h-3 w-3 shrink-0" />
                <span className="truncate font-medium">Punto de encuentro: {nextShift.meeting_point}</span>
              </div>
            )}

            {/* CTA */}
            {isTodayShift && (nextShift.status === "confirmed" || nextShift.status === "accepted") && isModuleEnabled("my_clock") && (
              <Button
                size="sm"
                className="w-full h-11 text-sm gap-2 font-bold mt-1"
                onClick={(e) => { e.stopPropagation(); navigate(`/portal/clock?shiftId=${nextShift.id}`); }}
              >
                <LogIn className="h-4 w-4" />
                Marcar Entrada
              </Button>
            )}
            {nextShift.status === "pending" && (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-10 text-xs font-bold border-warning/30 text-warning hover:bg-warning/5"
                onClick={(e) => { e.stopPropagation(); navigate("/portal/shifts"); }}
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                Pendiente de confirmar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* No shifts */}
      {isModuleEnabled("my_shifts") && !nextShift && (
        <Link to="/portal/shifts" className="block">
          <div className="rounded-2xl border border-dashed border-border/50 bg-muted/30 p-6 flex flex-col items-center gap-2">
            <CalendarDays className="h-7 w-7 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">Sin turnos programados</p>
            <span className="text-[11px] text-primary font-medium flex items-center gap-1">
              Ver turnos disponibles <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </Link>
      )}

      {/* ── B. ATTENTION REQUIRED ── */}
      {(pendingCount > 0 || unreadAlerts > 0) && (
        <div className="space-y-2">
          {pendingCount > 0 && (
            <Link to="/portal/shifts" className="block">
              <div className="rounded-xl border border-warning/25 bg-warning/[0.05] p-3.5 flex items-center gap-3 active:scale-[0.98] transition-all">
                <div className="h-9 w-9 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {pendingCount} turno{pendingCount > 1 ? "s" : ""} por confirmar
                  </p>
                  <p className="text-[11px] text-muted-foreground">Revisa y confirma tus asignaciones</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
              </div>
            </Link>
          )}
          {unreadAlerts > 0 && (
            <div className="rounded-xl border border-border/30 bg-card p-3.5 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {unreadAlerts} notificación{unreadAlerts > 1 ? "es" : ""}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
            </div>
          )}
        </div>
      )}

      {/* ── Clock action (compact) ── */}
      {isModuleEnabled("my_clock") && (
        <button
          className={cn(
            "w-full rounded-2xl p-3.5 transition-all active:scale-[0.98]",
            clockStatus.isClockedIn
              ? "bg-earning/8 border-2 border-earning/20"
              : "bg-card border border-border/40"
          )}
          onClick={() => navigate("/portal/clock")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center",
                clockStatus.isClockedIn ? "bg-earning/15" : "bg-muted/60"
              )}>
                <Clock className={cn("h-5 w-5", clockStatus.isClockedIn ? "text-earning" : "text-muted-foreground")} />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    clockStatus.isClockedIn ? "bg-earning animate-pulse" : "bg-muted-foreground/30"
                  )} />
                  <span className="text-xs font-semibold text-foreground">
                    {clockStatus.isClockedIn ? "En turno" : "Reloj"}
                  </span>
                </div>
                {clockStatus.isClockedIn && clockStatus.shiftTitle && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[160px]">{clockStatus.shiftTitle}</p>
                )}
              </div>
            </div>
            <div className={cn(
              "h-9 px-4 rounded-xl flex items-center gap-1.5 font-bold text-xs",
              clockStatus.isClockedIn
                ? "bg-earning text-earning-foreground"
                : "bg-muted text-foreground"
            )}>
              {clockStatus.isClockedIn ? <><LogOut className="h-3.5 w-3.5" /> Salida</> : <><LogIn className="h-3.5 w-3.5" /> Entrada</>}
            </div>
          </div>
        </button>
      )}

      {/* ── C. UPCOMING SHIFTS PREVIEW ── */}
      {upcomingShifts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Próximos turnos</h2>
            <Link to="/portal/shifts" className="text-[11px] text-primary font-semibold flex items-center gap-0.5">
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {upcomingShifts.map((s) => (
              <Link key={s.id} to="/portal/shifts" className="block">
                <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-border/30 bg-card/80 active:scale-[0.98] transition-all">
                  <div className="text-center shrink-0 w-10">
                    <p className="text-[9px] font-bold uppercase text-muted-foreground/60 leading-none">
                      {format(parseISO(s.date), "MMM", { locale: es })}
                    </p>
                    <p className="text-base font-bold text-foreground/70 leading-tight">
                      {format(parseISO(s.date), "d")}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-border/30 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                      </span>
                      {s.location_name && <span className="truncate">{s.location_name}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/20 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── D. Stats grid ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/40 bg-card p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center">
              <Timer className="h-3.5 w-3.5 text-accent-foreground" />
            </div>
          </div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Esta semana</p>
          <p className="text-xl font-bold font-heading tabular-nums leading-none mt-1">{weeklyHours}</p>
        </div>

        {isModuleEnabled("my_payments") && estimatedPay !== null && (
          <Link to="/portal/payments" className="block group">
            <div className="rounded-2xl border border-border/40 bg-card p-3.5 h-full transition-shadow hover:shadow-md">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pago estimado</p>
              <p className="text-xl font-bold font-heading tabular-nums leading-none mt-1">${estimatedPay.toFixed(2)}</p>
            </div>
          </Link>
        )}

        {(!isModuleEnabled("my_payments") || estimatedPay === null) && isModuleEnabled("my_shifts") && (
          <Link to="/portal/shifts" className="block group">
            <div className="rounded-2xl border border-border/40 bg-card p-3.5 h-full transition-shadow hover:shadow-md">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center">
                  <CalendarDays className="h-3.5 w-3.5 text-accent-foreground" />
                </div>
              </div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Turnos</p>
              <p className="text-xl font-bold font-heading tabular-nums leading-none mt-1">
                {(upcomingShifts.length + (nextShift ? 1 : 0))}
              </p>
            </div>
          </Link>
        )}
      </div>

      {/* ── Pending Reviews ── */}
      <PendingReviewPrompt />
    </div>
  );
}
