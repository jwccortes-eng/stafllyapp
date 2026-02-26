import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CalendarDays, Clock, MapPin, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isAfter, isBefore, startOfDay } from "date-fns";
import { es } from "date-fns/locale";

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
    location?: { name: string } | null;
    client?: { name: string } | null;
  };
}

export default function MyShifts() {
  const { employeeId } = useAuth();
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    async function load() {
      const { data } = await supabase
        .from("shift_assignments")
        .select(`
          id, status,
          scheduled_shifts!inner (
            id, title, date, start_time, end_time, notes, status,
            locations (name),
            clients (name)
          )
        `)
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });

      const mapped: ShiftAssignment[] = (data ?? []).map((a: any) => ({
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
          location: a.scheduled_shifts.locations,
          client: a.scheduled_shifts.clients,
        },
      }));

      setAssignments(mapped);
      setLoading(false);
    }
    load();
  }, [employeeId]);

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

  const statusConfig: Record<string, { icon: any; label: string; cls: string }> = {
    confirmed: { icon: CheckCircle2, label: "Confirmado", cls: "text-earning" },
    pending: { icon: AlertCircle, label: "Pendiente", cls: "text-warning" },
    rejected: { icon: XCircle, label: "Rechazado", cls: "text-deduction" },
  };

  const renderShift = (a: ShiftAssignment) => {
    const cfg = statusConfig[a.status] || statusConfig.pending;
    const StatusIcon = cfg.icon;
    return (
      <div key={a.id} className="rounded-2xl border bg-card p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{a.shift.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(parseISO(a.shift.date), "EEEE d MMM", { locale: es })}
            </p>
          </div>
          <div className={cn("flex items-center gap-1 text-xs font-medium", cfg.cls)}>
            <StatusIcon className="h-3.5 w-3.5" />
            {cfg.label}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {a.shift.start_time?.slice(0, 5)} – {a.shift.end_time?.slice(0, 5)}
          </span>
          {a.shift.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {a.shift.location.name}
            </span>
          )}
        </div>
        {a.shift.notes && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">{a.shift.notes}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight">Mis Turnos</h1>
        <p className="text-sm text-muted-foreground mt-1">{assignments.length} turnos asignados</p>
      </div>

      {assignments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No tienes turnos asignados</p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Próximos</h2>
              <div className="space-y-2">{upcoming.map(renderShift)}</div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pasados</h2>
              <div className="space-y-2">{past.map(renderShift)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
