/**
 * Cross-context card: shows the admin's own next shift + clock status
 * when they also have an employee profile (dual access).
 * Displayed on the Admin Dashboard for dual-access users.
 */
import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { cn } from "@/lib/utils";
import { Clock, CalendarDays, MapPin, ArrowLeftRight, LogIn, LogOut, Timer, ChevronRight } from "lucide-react";
import { format, parseISO, isToday, isTomorrow, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";

export function MyShiftCard() {
  const { canAccessPortal, canAccessAdmin, setActiveMode } = useAuth();
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const navigate = useNavigate();
  const [nextShift, setNextShift] = useState<{
    title: string; date: string; start_time: string; end_time: string; location_name: string | null;
  } | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState("0h");
  const [loading, setLoading] = useState(true);

  // Only render for dual-access users viewing admin dashboard
  const shouldShow = canAccessAdmin && canAccessPortal && !!employeeId;

  const loadData = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const ws = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
    const we = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

    const [assignRes, clockRes, weekRes] = await Promise.all([
      supabase.from("shift_assignments")
        .select("status, scheduled_shifts!inner (id, title, date, start_time, end_time, status, locations (name))")
        .eq("employee_id", employeeId).neq("status", "rejected")
        .gte("scheduled_shifts.date", today).order("created_at", { ascending: true }).limit(1),
      supabase.from("time_entries").select("id").eq("employee_id", employeeId).is("clock_out", null).limit(1),
      supabase.from("time_entries").select("clock_in, clock_out")
        .eq("employee_id", employeeId).gte("clock_in", ws).lte("clock_in", we),
    ]);

    setClockedIn((clockRes.data ?? []).length > 0);

    const shifts = (assignRes.data ?? []) as any[];
    if (shifts.length > 0) {
      const s = shifts[0].scheduled_shifts;
      setNextShift({
        title: s.title, date: s.date,
        start_time: s.start_time, end_time: s.end_time,
        location_name: s.locations?.name ?? null,
      });
    }

    let totalSec = 0;
    for (const e of (weekRes.data ?? []) as any[]) {
      const end = e.clock_out ? new Date(e.clock_out) : new Date();
      totalSec += (end.getTime() - new Date(e.clock_in).getTime()) / 1000;
    }
    const wh = Math.floor(totalSec / 3600);
    const wm = Math.floor((totalSec % 3600) / 60);
    setWeeklyHours(wm > 0 ? `${wh}h ${wm}m` : `${wh}h`);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { if (shouldShow) loadData(); }, [shouldShow, loadData]);

  if (!shouldShow || loading) return null;

  const goToPortal = () => {
    setActiveMode('employee');
    navigate('/portal');
  };

  return (
    <div className="rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold font-heading text-foreground">Mi Portal</h3>
        </div>
        <button
          onClick={goToPortal}
          className="text-[11px] text-primary font-medium hover:underline flex items-center gap-0.5 group"
        >
          Ir al portal <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      <div className="px-5 pb-4 space-y-3">
        {/* Clock status + weekly hours */}
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold",
            clockedIn
              ? "bg-earning/10 text-earning"
              : "bg-muted text-muted-foreground"
          )}>
            {clockedIn ? <><LogIn className="h-3.5 w-3.5" /> En turno</> : <><Clock className="h-3.5 w-3.5" /> Sin fichar</>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="h-3.5 w-3.5" />
            <span className="font-semibold tabular-nums">{weeklyHours}</span>
            <span>esta semana</span>
          </div>
        </div>

        {/* Next shift */}
        {nextShift ? (
          <button
            onClick={goToPortal}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/30 hover:border-primary/20 transition-all text-left group"
          >
            <div className={cn(
              "h-11 w-11 rounded-xl flex flex-col items-center justify-center shrink-0",
              isToday(parseISO(nextShift.date)) ? "bg-primary text-primary-foreground" : "bg-muted"
            )}>
              <span className="text-[8px] font-bold uppercase leading-none">
                {format(parseISO(nextShift.date), "MMM", { locale: es })}
              </span>
              <span className="text-base font-bold leading-none">
                {format(parseISO(nextShift.date), "d")}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {isToday(parseISO(nextShift.date)) && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-primary text-primary-foreground">HOY</span>
                )}
                {isTomorrow(parseISO(nextShift.date)) && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-accent text-accent-foreground">MAÑANA</span>
                )}
                <p className="text-xs font-semibold text-foreground truncate">{nextShift.title}</p>
              </div>
              <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground mt-0.5">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {nextShift.start_time?.slice(0, 5)} – {nextShift.end_time?.slice(0, 5)}
                </span>
                {nextShift.location_name && (
                  <span className="flex items-center gap-0.5 truncate">
                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                    {nextShift.location_name}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary shrink-0" />
          </button>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-dashed border-border/40">
            <CalendarDays className="h-4 w-4 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Sin turnos próximos</p>
          </div>
        )}
      </div>
    </div>
  );
}
