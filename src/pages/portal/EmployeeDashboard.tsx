import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName } from "@/lib/format-helpers";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { usePortalModules } from "@/hooks/usePortalModules";
import {
  Wallet, Clock, Megaphone, CalendarDays,
  ArrowRight, LogIn, LogOut, MapPin, Timer,
  AlertTriangle, Bell, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { format, parseISO, isToday, isTomorrow, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";

interface NextShift {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  status: string;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  created_at: string;
  is_read: boolean;
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

    // Separate queries to avoid TS2589
    const upcomingRes = await supabase.from("shift_assignments").select("id")
      .eq("employee_id", employeeId).neq("status", "rejected");
    const notifRes = await (supabase.from("notifications").select("id")
      .eq("recipient_id", employeeId!) as any).eq("is_read", false);

    setCompanyName(companyRes.data?.name ?? "");

    // Clock status
    const activeClocks = (clockRes.data ?? []) as any[];
    if (activeClocks.length > 0) {
      setClockStatus({ isClockedIn: true, clockInTime: activeClocks[0].clock_in, shiftTitle: activeClocks[0].scheduled_shifts?.title ?? null });
    } else {
      setClockStatus({ isClockedIn: false, clockInTime: null, shiftTitle: null });
    }

    // Weekly hours
    let totalSec = 0;
    for (const e of (weekRes.data ?? []) as any[]) {
      const end = e.clock_out ? new Date(e.clock_out) : new Date();
      totalSec += (end.getTime() - new Date(e.clock_in).getTime()) / 1000;
    }
    const wh = Math.floor(totalSec / 3600);
    const wm = Math.floor((totalSec % 3600) / 60);
    setWeeklyHours(wm > 0 ? `${wh}h ${wm}m` : `${wh}h`);

    // Next shift
    const shifts = (assignRes.data ?? []) as any[];
    if (shifts.length > 0) {
      const s = shifts[0].scheduled_shifts;
      setNextShift({
        id: s.id, title: s.title, date: s.date,
        start_time: s.start_time, end_time: s.end_time,
        location_name: s.locations?.name ?? null, status: shifts[0].status,
      });
    }

    // Pay estimate
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

  const getDateLabel = (dateStr: string) => {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Hoy";
    if (isTomorrow(d)) return "Mañana";
    return format(d, "EEE d MMM", { locale: es });
  };

  if (loading) {
    return (
      <div className="space-y-4 pt-2">
        <div className="h-28 animate-pulse bg-muted rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-32 animate-pulse bg-muted rounded-2xl" />
          <div className="h-32 animate-pulse bg-muted rounded-2xl" />
        </div>
        <div className="h-24 animate-pulse bg-muted rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Greeting hero ── */}
      <div className="rounded-2xl gradient-primary p-5 text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,hsl(212_100%_73%/0.4),transparent_55%)]" />
        <div className="relative flex items-center gap-3.5">
          <EmployeeAvatar
            firstName={firstName}
            lastName={lastName}
            avatarUrl={empAvatar}
            size="lg"
            className="ring-2 ring-white/30 shadow-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium opacity-80">{greeting}</p>
            <h1 className="text-xl font-bold font-heading tracking-tight leading-tight">
              {firstName}
            </h1>
            {companyName && (
              <p className="text-[11px] opacity-70 mt-0.5">{companyName}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Clock action card — most prominent ── */}
      {isModuleEnabled("my_clock") && (
        <div
          className={cn(
            "rounded-2xl border p-4 transition-all active:scale-[0.98] cursor-pointer",
            clockStatus.isClockedIn
              ? "border-earning/30 bg-earning/5"
              : "border-primary/20 bg-primary/[0.03]"
          )}
          onClick={() => navigate("/portal/clock")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-12 w-12 rounded-2xl flex items-center justify-center",
                clockStatus.isClockedIn ? "bg-earning/10" : "bg-primary/10"
              )}>
                <Clock className={cn("h-6 w-6", clockStatus.isClockedIn ? "text-earning" : "text-primary")} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className={cn("h-2 w-2 rounded-full", clockStatus.isClockedIn ? "bg-earning animate-pulse" : "bg-muted-foreground/30")} />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {clockStatus.isClockedIn ? "En turno" : "Fuera de turno"}
                  </span>
                </div>
                {clockStatus.isClockedIn && clockStatus.shiftTitle && (
                  <p className="text-sm font-medium text-foreground mt-0.5 truncate max-w-[180px]">{clockStatus.shiftTitle}</p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant={clockStatus.isClockedIn ? "destructive" : "default"}
              className="h-10 px-5 text-sm gap-2 font-bold rounded-xl"
              onClick={e => { e.stopPropagation(); navigate("/portal/clock"); }}
            >
              {clockStatus.isClockedIn ? <><LogOut className="h-4 w-4" /> Salida</> : <><LogIn className="h-4 w-4" /> Entrada</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Stats row ── */}
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
            <div className="rounded-2xl border border-border/40 bg-card p-4 h-full hover-lift">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pago estimado</p>
              <p className="text-2xl font-bold font-heading tabular-nums leading-none mt-1">${estimatedPay.toFixed(2)}</p>
              <div className="flex items-center gap-1 mt-2 text-[10px] font-medium text-primary opacity-60 group-hover:opacity-100 transition-opacity">
                Ver nómina <ArrowRight className="h-2.5 w-2.5" />
              </div>
            </div>
          </Link>
        )}

        {/* If earnings not enabled, show upcoming shifts count */}
        {(!isModuleEnabled("my_payments") || estimatedPay === null) && isModuleEnabled("my_shifts") && (
          <Link to="/portal/shifts" className="block group">
            <div className="rounded-2xl border border-border/40 bg-card p-4 h-full hover-lift">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-xl bg-accent flex items-center justify-center">
                  <CalendarDays className="h-4 w-4 text-accent-foreground" />
                </div>
              </div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Turnos próximos</p>
              <p className="text-2xl font-bold font-heading tabular-nums leading-none mt-1">{upcomingCount}</p>
              <div className="flex items-center gap-1 mt-2 text-[10px] font-medium text-primary opacity-60 group-hover:opacity-100 transition-opacity">
                Ver turnos <ArrowRight className="h-2.5 w-2.5" />
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* ── Next shift card ── */}
      {isModuleEnabled("my_shifts") && nextShift && (
        <Link to="/portal/shifts" className="block group">
          <div className={cn(
            "rounded-2xl border border-border/40 bg-card p-4 hover-lift transition-all",
            isToday(parseISO(nextShift.date)) && "ring-2 ring-primary/20 border-primary/20"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
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
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground/30 shrink-0" />
            </div>
          </div>
        </Link>
      )}

      {/* ── No shifts placeholder ── */}
      {isModuleEnabled("my_shifts") && !nextShift && (
        <Link to="/portal/shifts" className="block">
          <div className="rounded-2xl border border-dashed border-primary/20 bg-primary/[0.02] p-6 flex flex-col items-center gap-2">
            <CalendarDays className="h-8 w-8 text-primary/30" />
            <p className="text-sm font-medium text-muted-foreground">Sin turnos programados</p>
            <span className="text-[11px] text-primary/60 font-medium flex items-center gap-1">
              Ver turnos disponibles <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </Link>
      )}

      {/* ── Quick alerts ── */}
      {unreadAlerts > 0 && (
        <div className="rounded-2xl border border-warning/20 bg-warning/[0.04] p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {unreadAlerts} {unreadAlerts === 1 ? "notificación pendiente" : "notificaciones pendientes"}
            </p>
            <p className="text-[11px] text-muted-foreground">Revisa tus alertas</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        </div>
      )}
    </div>
  );
}
