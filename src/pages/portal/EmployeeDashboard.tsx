import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import {
  Wallet, Clock, Megaphone, CalendarDays,
  MapPin, ChevronRight, AlertCircle, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";

interface NextShift {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  status: string;
}

interface RecentAnnouncement {
  id: string;
  title: string;
  priority: string;
  published_at: string;
}

export default function EmployeeDashboard() {
  const { employeeId } = useAuth();
  const [empName, setEmpName] = useState("");
  const [nextShift, setNextShift] = useState<NextShift | null>(null);
  const [estimatedPay, setEstimatedPay] = useState<number | null>(null);
  const [announcements, setAnnouncements] = useState<RecentAnnouncement[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    async function load() {
      const { data: emp } = await supabase
        .from("employees")
        .select("first_name, last_name, company_id")
        .eq("id", employeeId)
        .maybeSingle();
      if (!emp) { setLoading(false); return; }

      setEmpName(`${emp.first_name} ${emp.last_name}`);
      const companyId = emp.company_id;
      const today = new Date().toISOString().split("T")[0];

      const [periodRes, assignRes, annRes] = await Promise.all([
        supabase.from("pay_periods").select("id, start_date, end_date, status, published_at")
          .eq("company_id", companyId).order("start_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("shift_assignments").select(`
          status,
          scheduled_shifts!inner (title, date, start_time, end_time, status, locations (name))
        `).eq("employee_id", employeeId).neq("status", "rejected")
          .gte("scheduled_shifts.date", today)
          .order("created_at", { ascending: true }).limit(10),
        supabase.from("announcements").select("id, title, priority, published_at")
          .eq("company_id", companyId).not("published_at", "is", null).is("deleted_at", null)
          .order("published_at", { ascending: false }).limit(3),
      ]);

      // Period & estimated pay
      if (periodRes.data) {
        const p = periodRes.data;
        const [bpRes, movRes] = await Promise.all([
          supabase.from("period_base_pay").select("base_total_pay")
            .eq("employee_id", employeeId!).eq("period_id", p.id).maybeSingle(),
          supabase.from("movements").select("total_value, concepts(category)")
            .eq("employee_id", employeeId!).eq("period_id", p.id),
        ]);
        const base = Number(bpRes.data?.base_total_pay) || 0;
        let extras = 0, deductions = 0;
        (movRes.data ?? []).forEach((m: any) => {
          if (m.concepts?.category === "extra") extras += Number(m.total_value) || 0;
          else deductions += Number(m.total_value) || 0;
        });
        setEstimatedPay(base + extras - deductions);
      }

      // Shifts
      const shifts = (assignRes.data ?? []) as any[];
      setUpcomingShifts(shifts.length);
      if (shifts.length > 0) {
        const s = shifts[0].scheduled_shifts;
        setNextShift({
          title: s.title,
          date: s.date,
          start_time: s.start_time,
          end_time: s.end_time,
          location_name: s.locations?.name ?? null,
          status: shifts[0].status,
        });
      }

      setAnnouncements((annRes.data ?? []) as RecentAnnouncement[]);
      setLoading(false);
    }
    load();
  }, [employeeId]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  })();

  const getDateLabel = (dateStr: string) => {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Hoy";
    if (isTomorrow(d)) return "Mañana";
    return format(d, "EEEE d MMM", { locale: es });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="pt-1">
        <p className="text-muted-foreground text-sm">
          {greeting} 👋
        </p>
        <h1 className="text-2xl font-bold font-heading tracking-tight mt-0.5">
          {empName.split(" ")[0]}
        </h1>
      </div>

      {/* Hero pay card — gradient */}
      {estimatedPay !== null && (
        <Link to="/portal/payments" className="block">
          <div className="rounded-2xl bg-gradient-to-br from-primary to-[hsl(243_75%_45%)] p-5 text-primary-foreground relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,hsl(243_75%_70%/0.3),transparent_60%)]" />
            <div className="relative">
              <p className="text-xs font-medium opacity-80 uppercase tracking-wider">Pago estimado</p>
              <p className="text-3xl font-bold font-heading mt-1 tracking-tight tabular-nums">
                ${estimatedPay.toFixed(2)}
              </p>
              <p className="text-[11px] opacity-70 mt-1">Periodo actual</p>
              <div className="flex items-center gap-1 mt-3 text-xs font-medium opacity-90">
                Ver nómina <ArrowRight className="h-3 w-3" />
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Next shift card */}
      {nextShift ? (
        <Link to="/portal/shifts" className="block">
          <div className={cn(
            "rounded-2xl border bg-card p-4 space-y-2 transition-all hover:shadow-sm",
            isToday(parseISO(nextShift.date)) && "ring-2 ring-primary/30"
          )}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Próximo turno</p>
              {isToday(parseISO(nextShift.date)) && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary text-primary-foreground animate-pulse">HOY</span>
              )}
            </div>
            <p className="text-sm font-semibold">{nextShift.title}</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 capitalize">
                <CalendarDays className="h-3.5 w-3.5" />
                {getDateLabel(nextShift.date)}
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="h-3.5 w-3.5" />
                {nextShift.start_time?.slice(0, 5)} – {nextShift.end_time?.slice(0, 5)}
              </span>
              {nextShift.location_name && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {nextShift.location_name}
                </span>
              )}
            </div>
          </div>
        </Link>
      ) : (
        <div className="rounded-2xl border bg-card p-4 text-center">
          <Clock className="h-6 w-6 text-muted-foreground/40 mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">Sin turnos próximos</p>
        </div>
      )}

      {/* Quick actions grid */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/portal/payments" className="rounded-2xl bg-card border p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors group">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Nómina</p>
            <p className="text-[10px] text-muted-foreground">Pagos y detalle</p>
          </div>
        </Link>
        <Link to="/portal/shifts" className="rounded-2xl bg-card border p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors group">
          <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-accent-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Turnos</p>
            <p className="text-[10px] text-muted-foreground">{upcomingShifts} próximos</p>
          </div>
        </Link>
      </div>

      {/* Recent announcements */}
      {announcements.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Megaphone className="h-3.5 w-3.5" />
              Últimas novedades
            </h2>
            <Link to="/portal/announcements" className="text-xs text-primary font-medium hover:underline">
              Ver feed
            </Link>
          </div>
          <div className="space-y-2">
            {announcements.map(a => (
              <Link
                key={a.id}
                to="/portal/announcements"
                className="flex items-center gap-3 rounded-2xl border bg-card p-3.5 hover:bg-accent/50 transition-colors"
              >
                {a.priority === "urgent" && (
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {a.published_at ? format(parseISO(a.published_at), "d MMM", { locale: es }) : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
