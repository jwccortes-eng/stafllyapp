import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Clock, LogIn, LogOut, MapPin, Timer, CalendarDays, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";

interface TimeEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  notes: string | null;
  break_minutes: number | null;
  shift_id: string | null;
}

export default function PortalClock() {
  const { employeeId } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const shiftIdParam = searchParams.get("shiftId");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [shiftInfo, setShiftInfo] = useState<{
    id: string; title: string; start_time: string; end_time: string;
    location_name?: string; client_name?: string;
  } | null>(null);

  // Live clock tick
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }

    // Get employee company
    const { data: emp } = await supabase
      .from("employees")
      .select("company_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (emp) setCompanyId(emp.company_id);

    const today = new Date();
    const dayStart = startOfDay(today).toISOString();
    const dayEnd = endOfDay(today).toISOString();

    const { data: entries } = await supabase
      .from("time_entries")
      .select("id, clock_in, clock_out, status, notes, break_minutes, shift_id")
      .eq("employee_id", employeeId)
      .gte("clock_in", dayStart)
      .lte("clock_in", dayEnd)
      .order("clock_in", { ascending: false });

    const list = (entries ?? []) as TimeEntry[];
    setTodayEntries(list);
    setActiveEntry(list.find((e) => !e.clock_out) ?? null);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load shift info when shiftId param is present
  useEffect(() => {
    if (!shiftIdParam) { setShiftInfo(null); return; }
    (async () => {
      const { data } = await supabase
        .from("scheduled_shifts")
        .select("id, title, start_time, end_time, locations (name), clients (name)")
        .eq("id", shiftIdParam)
        .maybeSingle();
      if (data) {
        setShiftInfo({
          id: data.id,
          title: data.title,
          start_time: data.start_time,
          end_time: data.end_time,
          location_name: (data.locations as any)?.name,
          client_name: (data.clients as any)?.name,
        });
      }
    })();
  }, [shiftIdParam]);

  const handleClockIn = async () => {
    if (!employeeId || !companyId) return;
    setActing(true);
    try {
      const { error } = await supabase.from("time_entries").insert({
        employee_id: employeeId,
        company_id: companyId,
        clock_in: new Date().toISOString(),
        status: "pending",
        shift_id: shiftInfo?.id ?? null,
      });
      if (error) throw error;
      toast({ title: "Entrada registrada", description: shiftInfo ? `Fichaje vinculado a: ${shiftInfo.title}` : "Tu hora de entrada fue registrada correctamente." });
      // Clear shift param after successful clock-in
      if (shiftIdParam) setSearchParams({}, { replace: true });
      setShiftInfo(null);
      await loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "No se pudo registrar la entrada.", variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeEntry) return;
    setActing(true);
    try {
      const { error } = await supabase
        .from("time_entries")
        .update({ clock_out: new Date().toISOString() })
        .eq("id", activeEntry.id);
      if (error) throw error;
      toast({ title: "Salida registrada", description: "Tu hora de salida fue registrada correctamente." });
      await loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "No se pudo registrar la salida.", variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const getElapsed = () => {
    if (!activeEntry) return null;
    const start = new Date(activeEntry.clock_in);
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getDuration = (entry: TimeEntry) => {
    if (!entry.clock_out) return "En curso";
    const start = new Date(entry.clock_in);
    const end = new Date(entry.clock_out);
    const diff = Math.floor((end.getTime() - start.getTime()) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const totalHoursToday = () => {
    let total = 0;
    for (const entry of todayEntries) {
      const start = new Date(entry.clock_in);
      const end = entry.clock_out ? new Date(entry.clock_out) : now;
      total += (end.getTime() - start.getTime()) / 1000;
    }
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return `${h}h ${m}m`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-48 animate-pulse bg-muted rounded-2xl" />
        <div className="h-24 animate-pulse bg-muted rounded-2xl" />
      </div>
    );
  }

  const isClockedIn = !!activeEntry;

  return (
    <div className="space-y-6">
      {/* Current time & date */}
      <div className="text-center space-y-1">
        <p className="text-4xl font-bold font-heading tracking-tight tabular-nums text-foreground">
          {format(now, "HH:mm:ss")}
        </p>
        <p className="text-sm text-muted-foreground capitalize">
          {format(now, "EEEE, d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Status card */}
      <div
        className={cn(
          "rounded-2xl p-6 text-center relative overflow-hidden transition-colors",
          isClockedIn
            ? "bg-gradient-to-br from-earning to-earning/80 text-earning-foreground"
            : "bg-card border text-foreground"
        )}
      >
        {isClockedIn && (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,hsl(0_0%_100%/0.12),transparent_60%)]" />
        )}
        <div className="relative space-y-3">
          <div className="flex items-center justify-center gap-2">
            <div
              className={cn(
                "h-3 w-3 rounded-full",
                isClockedIn ? "bg-earning-foreground animate-pulse" : "bg-muted-foreground/30"
              )}
            />
            <span className="text-sm font-semibold uppercase tracking-wider">
              {isClockedIn ? "En turno" : "Fuera de turno"}
            </span>
          </div>

          {isClockedIn && (
            <>
              <p className="text-3xl font-bold tabular-nums font-heading">{getElapsed()}</p>
              <p className="text-xs opacity-80">
                Entrada: {format(new Date(activeEntry!.clock_in), "HH:mm")}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Linked shift info card */}
      {shiftInfo && !isClockedIn && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Turno seleccionado</p>
          <p className="text-sm font-bold text-foreground">{shiftInfo.title}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {shiftInfo.start_time.slice(0, 5)} – {shiftInfo.end_time.slice(0, 5)}
            </span>
            {shiftInfo.location_name && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {shiftInfo.location_name}
              </span>
            )}
            {shiftInfo.client_name && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {shiftInfo.client_name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Clock in/out button */}
      <Button
        onClick={isClockedIn ? handleClockOut : handleClockIn}
        disabled={acting || !companyId}
        className={cn(
          "w-full h-16 rounded-2xl text-lg font-bold gap-3 shadow-lg transition-all active:scale-[0.97]",
          isClockedIn
            ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            : "bg-primary hover:bg-primary/90 text-primary-foreground"
        )}
      >
        {acting ? (
          <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : isClockedIn ? (
          <>
            <LogOut className="h-5 w-5" />
            Marcar Salida
          </>
        ) : (
          <>
            <LogIn className="h-5 w-5" />
            Marcar Entrada
          </>
        )}
      </Button>

      {/* Today summary */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border bg-card p-3.5">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Timer className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Horas hoy</span>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums">{totalHoursToday()}</p>
        </div>
        <div className="rounded-2xl border bg-card p-3.5">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Registros</span>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums">{todayEntries.length}</p>
        </div>
      </div>

      {/* Daily history */}
      {todayEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Historial de hoy
          </h3>
          <div className="space-y-2">
            {todayEntries.map((entry) => {
              const isActive = !entry.clock_out;
              return (
                <div
                  key={entry.id}
                  className={cn(
                    "rounded-2xl border bg-card p-4 flex items-center gap-3",
                    isActive && "border-earning/20 bg-earning/5"
                  )}
                >
                  <div
                    className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                      isActive
                        ? "bg-earning/10 text-earning"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Clock className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {format(new Date(entry.clock_in), "HH:mm")}
                      </span>
                      <span className="text-muted-foreground text-xs">→</span>
                      <span className="text-sm font-semibold">
                        {entry.clock_out
                          ? format(new Date(entry.clock_out), "HH:mm")
                          : "—"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {isActive ? (
                        <span className="text-earning font-medium">En curso</span>
                      ) : (
                        getDuration(entry)
                      )}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                    entry.status === "approved"
                        ? "bg-earning/10 text-earning"
                        : entry.status === "rejected"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning/10 text-warning"
                    )}
                  >
                    {entry.status === "approved"
                      ? "Aprobado"
                      : entry.status === "rejected"
                      ? "Rechazado"
                      : "Pendiente"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {todayEntries.length === 0 && !isClockedIn && (
        <div className="text-center py-8 space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Clock className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No hay registros hoy</p>
          <p className="text-xs text-muted-foreground">
            Presiona el botón para marcar tu entrada
          </p>
        </div>
      )}
    </div>
  );
}
