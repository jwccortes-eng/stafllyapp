import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName } from "@/lib/format-helpers";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { usePortalModules } from "@/hooks/usePortalModules";
import {
  Wallet, Clock, CalendarDays,
  ArrowRight, LogIn, LogOut, MapPin, Timer,
  Bell, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { format, parseISO, isToday, isTomorrow, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { AdminSummaryCard } from "@/components/dashboard/AdminSummaryCard";

interface NextShift {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  status: string;
}

export default function EmployeeDashboard() {
  const { employeeId } = useAuth();
  const navigate = useNavigate();
  const { isModuleEnabled } = usePortalModules();
  const [empName, setEmpName] = useState("");
  const [empAvatar, setEmpAvatar] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [nextShift, setNextShift] = useState<NextShift | null>(null);
  const [estimatedPay, setEstimatedPay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockStatus, setClockStatus] = useState<{
    isClockedIn: boolean;
    clockInTime: string | null;
    shiftTitle: string | null;
  }>({ isClockedIn: false, clockInTime: null, shiftTitle: null });
  const [weeklyHours, setWeeklyHours] = useState("0h");
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

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
        .select("status, scheduled_shifts!inner (id, title, date, start_time, end_time, status, locations (name))")
        .eq("employee_id", employeeId).neq("status", "rejected")
        .gte("scheduled_shifts.date", today).order("created_at", { ascending: true }).limit(1),
      supabase.from("time_entries").select("id, clock_in, clock_out, shift_id").eq("employee_id", employeeId).is("clock_out", null).limit(1) as any,
      supabase.from("time_entries").select("clock_in, clock_out")
        .eq("employee_id", employeeId).gte("clock_in", weekStart).lte("clock_in", weekEnd),
    ]);

    const upcomingRes = await supabase.from("shift_assignments").select("id")
      .eq("employee_id", employeeId).neq("status", "rejected");
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
    if (shifts.length > 0) {
      const s = shifts[0].scheduled_shifts;
      setNextShift({
        id: s.id, title: s.title, date: s.date,
        start_time: s.start_time, end_time: s.end_time,
        location_name: s.locations?.name ?? null, status: shifts[0].status,
      });
    }

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

    setUpcomingCount((upcomingRes.data ?? []).length);
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
        <div className="h-20 animate-pulse bg-muted rounded-2xl" />
        <div className="h-28 animate-pulse bg-muted rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 animate-pulse bg-muted rounded-2xl" />
          <div className="h-24 animate-pulse bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

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

      {/* ── Clock hero action ── */}
      {isModuleEnabled("my_clock") && (
        <button
          className={cn(
            "w-full rounded-2xl p-4 transition-all active:scale-[0.98]",
            clockStatus.isClockedIn
              ? "bg-earning/8 border-2 border-earning/20"
              : "gradient-primary text-primary-foreground shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.35)]"
          )}
          onClick={() => navigate("/portal/clock")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-12 w-12 rounded-2xl flex items-center justify-center",
                clockStatus.isClockedIn ? "bg-earning/15" : "bg-white/15"
              )}>
                <Clock className={cn("h-6 w-6", clockStatus.isClockedIn ? "text-earning" : "text-primary-foreground")} />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    clockStatus.isClockedIn ? "bg-earning animate-pulse" : "bg-white/40"
                  )} />
                  <span className={cn(
                    "text-xs font-semibold",
                    clockStatus.isClockedIn ? "text-foreground" : "text-primary-foreground/80"
                  )}>
                    {clockStatus.isClockedIn ? "En turno" : "Listo para trabajar"}
                  </span>
                </div>
                {clockStatus.isClockedIn && clockStatus.shiftTitle && (
                  <p className="text-sm font-medium text-foreground mt-0.5 truncate max-w-[180px]">{clockStatus.shiftTitle}</p>
                )}
              </div>
            </div>
            <div className={cn(
              "h-10 px-5 rounded-xl flex items-center gap-2 font-bold text-sm",
              clockStatus.isClockedIn
                ? "bg-earning text-earning-foreground"
                : "bg-white/20 text-primary-foreground"
            )}>
              {clockStatus.isClockedIn ? <><LogOut className="h-4 w-4" /> Salida</> : <><LogIn className="h-4 w-4" /> Entrada</>}
            </div>
          </div>
        </button>
      )}

      {/* ── Next shift card ── */}
      {isModuleEnabled("my_shifts") && nextShift && (
        <Link to="/portal/shifts" className="block group">
          <div className={cn(
            "rounded-2xl border bg-card p-4 transition-all",
            isToday(parseISO(nextShift.date))
              ? "border-primary/25 shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]"
              : "border-border/40"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-12 w-12 rounded-2xl flex flex-col items-center justify-center shrink-0",
                isToday(parseISO(nextShift.date)) ? "bg-primary text-primary-foreground" : "bg-muted/60"
              )}>
                <span className="text-[9px] font-bold uppercase leading-none">
                  {format(parseISO(nextShift.date), "MMM", { locale: es })}
                </span>
                <span className="text-lg font-bold leading-none">
                  {format(parseISO(nextShift.date), "d")}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {isToday(parseISO(nextShift.date)) && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-primary text-primary-foreground">HOY</span>
                  )}
                  {isTomorrow(parseISO(nextShift.date)) && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-accent text-accent-foreground">MAÑANA</span>
                  )}
                  <p className="text-sm font-semibold text-foreground truncate">{nextShift.title}</p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {nextShift.start_time?.slice(0, 5)} – {nextShift.end_time?.slice(0, 5)}
                  </span>
                  {nextShift.location_name && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {nextShift.location_name}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
            </div>
          </div>
        </Link>
      )}

      {/* ── No shifts placeholder ── */}
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

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Weekly hours */}
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-xl bg-accent flex items-center justify-center">
              <Timer className="h-4 w-4 text-accent-foreground" />
            </div>
          </div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Esta semana</p>
          <p className="text-2xl font-bold font-heading tabular-nums leading-none mt-1">{weeklyHours}</p>
        </div>

        {/* Pay estimate */}
        {isModuleEnabled("my_payments") && estimatedPay !== null && (
          <Link to="/portal/payments" className="block group">
            <div className="rounded-2xl border border-border/40 bg-card p-4 h-full transition-shadow hover:shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pago estimado</p>
              <p className="text-2xl font-bold font-heading tabular-nums leading-none mt-1">${estimatedPay.toFixed(2)}</p>
            </div>
          </Link>
        )}

        {(!isModuleEnabled("my_payments") || estimatedPay === null) && isModuleEnabled("my_shifts") && (
          <Link to="/portal/shifts" className="block group">
            <div className="rounded-2xl border border-border/40 bg-card p-4 h-full transition-shadow hover:shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-xl bg-accent flex items-center justify-center">
                  <CalendarDays className="h-4 w-4 text-accent-foreground" />
                </div>
              </div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Turnos próximos</p>
              <p className="text-2xl font-bold font-heading tabular-nums leading-none mt-1">{upcomingCount}</p>
            </div>
          </Link>
        )}
      </div>

      {/* ── Alerts ── */}
      {unreadAlerts > 0 && (
        <div className="rounded-2xl border border-warning/20 bg-warning/[0.04] p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {unreadAlerts} {unreadAlerts === 1 ? "notificación" : "notificaciones"}
            </p>
            <p className="text-[11px] text-muted-foreground">Revisa tus alertas</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        </div>
      )}
    </div>
  );
}
