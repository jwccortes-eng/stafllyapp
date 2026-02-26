import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CalendarDays, Clock, MapPin, CheckCircle2, XCircle, AlertCircle, HandMetal, Users, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isBefore, startOfDay, isToday, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ShiftAssignment {
  id: string;
  status: string;
  shift: {
    id: string;
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
    status: string;
    slots: number | null;
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

export default function MyShifts() {
  const { employeeId } = useAuth();
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [claimable, setClaimable] = useState<ClaimableShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    if (!employeeId) return;

    // Fetch employee company
    const { data: emp } = await supabase
      .from("employees")
      .select("company_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (!emp) { setLoading(false); return; }

    // Fetch assignments
    const { data: assignData } = await supabase
      .from("shift_assignments")
      .select(`
        id, status,
        scheduled_shifts!inner (
          id, title, date, start_time, end_time, notes, status, slots,
          locations (name),
          clients (name)
        )
      `)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });

    const mapped: ShiftAssignment[] = (assignData ?? []).map((a: any) => ({
      id: a.id,
      status: a.status,
      shift: {
        id: a.scheduled_shifts.id,
        title: a.scheduled_shifts.title,
        date: a.scheduled_shifts.date,
        start_time: a.scheduled_shifts.start_time,
        end_time: a.scheduled_shifts.end_time,
        notes: a.scheduled_shifts.notes,
        status: a.scheduled_shifts.status,
        slots: a.scheduled_shifts.slots,
        location: a.scheduled_shifts.locations,
        client: a.scheduled_shifts.clients,
      },
    }));
    setAssignments(mapped);

    // Fetch claimable shifts
    const today = new Date().toISOString().split("T")[0];
    const { data: claimData } = await supabase
      .from("scheduled_shifts")
      .select(`
        id, title, date, start_time, end_time, notes, slots,
        locations (name),
        clients (name),
        shift_assignments (id)
      `)
      .eq("company_id", emp.company_id)
      .eq("claimable", true)
      .eq("status", "open")
      .is("deleted_at", null)
      .gte("date", today)
      .order("date", { ascending: true });

    const myShiftIds = new Set(mapped.map(a => a.shift.id));
    const claimableFiltered: ClaimableShift[] = (claimData ?? [])
      .filter((s: any) => !myShiftIds.has(s.id))
      .filter((s: any) => {
        const assignedCount = s.shift_assignments?.length ?? 0;
        return !s.slots || assignedCount < s.slots;
      })
      .map((s: any) => ({
        id: s.id,
        title: s.title,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        notes: s.notes,
        slots: s.slots,
        location: s.locations,
        client: s.clients,
        assignedCount: s.shift_assignments?.length ?? 0,
      }));

    setClaimable(claimableFiltered);
    setLoading(false);
  };

  useEffect(() => { load(); }, [employeeId]);

  const claimShift = async (shiftId: string) => {
    if (!employeeId) return;
    setClaiming(shiftId);

    const { data: emp } = await supabase
      .from("employees")
      .select("company_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (!emp) { setClaiming(null); return; }

    const { error } = await supabase.from("shift_assignments").insert({
      shift_id: shiftId,
      employee_id: employeeId,
      company_id: emp.company_id,
      status: "pending",
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "¡Turno reclamado!", description: "Tu solicitud está pendiente de aprobación" });
      await load();
    }
    setClaiming(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  const today = startOfDay(new Date());
  const upcoming = assignments.filter(a => !isBefore(parseISO(a.shift.date), today));
  const past = assignments.filter(a => isBefore(parseISO(a.shift.date), today));

  const statusConfig: Record<string, { icon: any; label: string; cls: string; bgCls: string }> = {
    confirmed: { icon: CheckCircle2, label: "Confirmado", cls: "text-earning", bgCls: "bg-earning/10" },
    pending: { icon: AlertCircle, label: "Pendiente", cls: "text-warning", bgCls: "bg-warning/10" },
    rejected: { icon: XCircle, label: "Rechazado", cls: "text-deduction", bgCls: "bg-deduction/10" },
  };

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return "Hoy";
    if (isTomorrow(date)) return "Mañana";
    return format(date, "EEEE d MMM", { locale: es });
  };

  const renderShift = (a: ShiftAssignment) => {
    const cfg = statusConfig[a.status] || statusConfig.pending;
    const StatusIcon = cfg.icon;
    const dateLabel = getDateLabel(a.shift.date);
    const isTodayShift = isToday(parseISO(a.shift.date));

    return (
      <div
        key={a.id}
        className={cn(
          "rounded-2xl border bg-card p-4 space-y-3 transition-all",
          isTodayShift && "ring-2 ring-primary/30 shadow-sm"
        )}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isTodayShift && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary text-primary-foreground">HOY</span>
              )}
              <p className="text-sm font-semibold text-foreground">{a.shift.title}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1 capitalize">
              {dateLabel}
            </p>
          </div>
          <div className={cn("flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full", cfg.cls, cfg.bgCls)}>
            <StatusIcon className="h-3.5 w-3.5" />
            {cfg.label}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium">
            <Clock className="h-3.5 w-3.5" />
            {a.shift.start_time?.slice(0, 5)} – {a.shift.end_time?.slice(0, 5)}
          </span>
          {a.shift.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {a.shift.location.name}
            </span>
          )}
          {a.shift.client && (
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {a.shift.client.name}
            </span>
          )}
        </div>

        {a.shift.notes && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2 leading-relaxed">{a.shift.notes}</p>
        )}
      </div>
    );
  };

  const renderClaimable = (s: ClaimableShift) => {
    const spotsLeft = s.slots ? s.slots - s.assignedCount : null;
    return (
      <div key={s.id} className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{s.title}</p>
            <p className="text-xs text-muted-foreground mt-1 capitalize">
              {getDateLabel(s.date)}
            </p>
          </div>
          {spotsLeft !== null && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-primary/10 text-primary">
              {spotsLeft} lugar{spotsLeft !== 1 ? "es" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium">
            <Clock className="h-3.5 w-3.5" />
            {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
          </span>
          {s.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {s.location.name}
            </span>
          )}
        </div>

        <Button
          size="sm"
          className="w-full"
          onClick={() => claimShift(s.id)}
          disabled={claiming === s.id}
        >
          {claiming === s.id ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Reclamando...</>
          ) : (
            <><HandMetal className="h-3.5 w-3.5 mr-1.5" />Reclamar turno</>
          )}
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight">Mis Turnos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {upcoming.length} próximo{upcoming.length !== 1 ? "s" : ""} · {past.length} pasado{past.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Claimable shifts */}
      {claimable.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
            <HandMetal className="h-3.5 w-3.5" />
            Turnos disponibles
          </h2>
          <div className="space-y-2">{claimable.map(renderClaimable)}</div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Próximos</h2>
          <div className="space-y-2">{upcoming.map(renderShift)}</div>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pasados</h2>
          <div className="space-y-2 opacity-70">{past.map(renderShift)}</div>
        </div>
      )}

      {assignments.length === 0 && claimable.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No tienes turnos asignados</p>
        </div>
      )}
    </div>
  );
}
