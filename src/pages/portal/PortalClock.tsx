import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Clock, LogIn, LogOut, MapPin, Timer, CalendarDays, Users, AlertCircle, FileText, Hash, ArrowLeft, ShieldAlert } from "lucide-react";
import staflyMascotChecklist from "@/assets/stafly-mascot-checklist.png";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

interface TimeEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  notes: string | null;
  break_minutes: number | null;
  shift_id: string | null;
}

interface TodayShift {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  shift_code: string | null;
  location_name?: string;
  client_name?: string;
}

/** Check if current time is at or after the shift start_time (tolerance = 0 min) */
function isClockInAllowed(shift: TodayShift): { allowed: boolean; message: string } {
  const now = new Date();
  const [h, m] = shift.start_time.split(":").map(Number);
  const shiftStart = new Date();
  shiftStart.setHours(h, m, 0, 0);

  if (now < shiftStart) {
    const diffMin = Math.ceil((shiftStart.getTime() - now.getTime()) / 60000);
    return {
      allowed: false,
      message: `Faltan ${diffMin} min para el inicio del turno (${shift.start_time.slice(0, 5)}). No puedes fichar antes de la hora programada.`,
    };
  }
  return { allowed: true, message: "" };
}

/** Check if clock-out is within shift schedule. If outside, returns review required. */
function isClockOutWithinSchedule(shift: TodayShift | null): { withinSchedule: boolean; message: string } {
  if (!shift) return { withinSchedule: true, message: "" };

  const now = new Date();
  const [eh, em] = shift.end_time.split(":").map(Number);
  const shiftEnd = new Date();
  shiftEnd.setHours(eh, em, 0, 0);

  const [sh, sm] = shift.start_time.split(":").map(Number);
  const shiftStart = new Date();
  shiftStart.setHours(sh, sm, 0, 0);

  // If clock-out is before shift start or after shift end → needs review
  if (now < shiftStart || now > shiftEnd) {
    return {
      withinSchedule: false,
      message: `La salida está fuera del horario programado (${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}). Se generará una solicitud de revisión.`,
    };
  }
  return { withinSchedule: true, message: "" };
}

export default function PortalClock() {
  const { employeeId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [todayShifts, setTodayShifts] = useState<TodayShift[]>([]);
  const [selectedShift, setSelectedShift] = useState<TodayShift | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [clockInBlocked, setClockInBlocked] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Re-check clock-in eligibility when selected shift or time changes
  useEffect(() => {
    if (!selectedShift) { setClockInBlocked(null); return; }
    const check = isClockInAllowed(selectedShift);
    setClockInBlocked(check.allowed ? null : check.message);
  }, [selectedShift, now]);

  const loadData = useCallback(async () => {
    if (!employeeId) { setLoading(false); return; }

    const { data: emp } = await supabase
      .from("employees").select("company_id").eq("id", employeeId).maybeSingle();
    if (emp) setCompanyId(emp.company_id);

    const today = new Date();
    const dayStart = startOfDay(today).toISOString();
    const dayEnd = endOfDay(today).toISOString();
    const todayStr = format(today, "yyyy-MM-dd");

    const [entriesRes, shiftsRes] = await Promise.all([
      supabase.from("time_entries")
        .select("id, clock_in, clock_out, status, notes, break_minutes, shift_id")
        .eq("employee_id", employeeId)
        .gte("clock_in", dayStart).lte("clock_in", dayEnd)
        .order("clock_in", { ascending: false }),
      supabase.from("shift_assignments")
        .select("shift_id, status, scheduled_shifts!inner(id, title, start_time, end_time, shift_code, date, locations(name), clients(name))")
        .eq("employee_id", employeeId)
        .eq("scheduled_shifts.date", todayStr)
        .in("status", ["confirmed", "pending"]),
    ]);

    const list = (entriesRes.data ?? []) as TimeEntry[];
    setTodayEntries(list);
    setActiveEntry(list.find((e) => !e.clock_out) ?? null);

    const mappedShifts: TodayShift[] = (shiftsRes.data ?? []).map((sa: any) => ({
      id: sa.scheduled_shifts.id,
      title: sa.scheduled_shifts.title,
      start_time: sa.scheduled_shifts.start_time,
      end_time: sa.scheduled_shifts.end_time,
      shift_code: sa.scheduled_shifts.shift_code,
      location_name: sa.scheduled_shifts.locations?.name,
      client_name: sa.scheduled_shifts.clients?.name,
    }));
    setTodayShifts(mappedShifts);

    if (mappedShifts.length === 1 && !list.find(e => !e.clock_out)) {
      setSelectedShift(mappedShifts[0]);
    }

    setLoading(false);
  }, [employeeId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleClockIn = async () => {
    if (!employeeId || !companyId || !selectedShift) return;

    // Final validation
    const check = isClockInAllowed(selectedShift);
    if (!check.allowed) {
      toast({ title: "No permitido", description: check.message, variant: "destructive" });
      return;
    }

    setActing(true);
    try {
      const { error } = await supabase.from("time_entries").insert({
        employee_id: employeeId, company_id: companyId,
        clock_in: new Date().toISOString(), status: "pending",
        shift_id: selectedShift.id,
      });
      if (error) throw error;
      toast({ title: "Entrada registrada", description: `Turno: ${selectedShift.title} (#${(selectedShift.shift_code || "").padStart(4, "0")})` });
      setSelectedShift(null);
      await loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "No se pudo registrar.", variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleClockOut = async () => {
    if (!activeEntry || !companyId || !employeeId) return;

    // Find the shift associated with the active entry
    const activeShift = todayShifts.find(s => s.id === activeEntry.shift_id) ?? null;
    const scheduleCheck = isClockOutWithinSchedule(activeShift);

    setActing(true);
    try {
      const clockOutTime = new Date().toISOString();

      if (!scheduleCheck.withinSchedule) {
        // Clock-out outside schedule → mark as "pending" and create a review ticket
        const { error } = await supabase.from("time_entries")
          .update({ clock_out: clockOutTime, status: "pending", notes: `⚠️ Salida fuera de horario programado. ${scheduleCheck.message}` })
          .eq("id", activeEntry.id);
        if (error) throw error;

        // Create a ticket for admin review
        await supabase.from("employee_tickets").insert({
          company_id: companyId,
          employee_id: employeeId,
          subject: "Salida fuera de horario programado",
          description: `Clock-out registrado a las ${format(new Date(), "HH:mm")} fuera del horario del turno "${activeShift?.title ?? "N/A"}" (${activeShift?.start_time?.slice(0, 5) ?? "?"} - ${activeShift?.end_time?.slice(0, 5) ?? "?"}). Requiere revisión antes de consolidar.`,
          type: "time_adjustment",
          source: "auto",
          priority: "medium",
          status: "new",
          source_entity_type: "time_entry",
          source_entity_id: activeEntry.id,
        });

        toast({
          title: "Salida registrada (en revisión)",
          description: "Tu salida está fuera del horario programado. Se generó una solicitud de revisión.",
        });
      } else {
        const { error } = await supabase.from("time_entries")
          .update({ clock_out: clockOutTime }).eq("id", activeEntry.id);
        if (error) throw error;
        toast({ title: "Salida registrada" });
      }

      await loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "No se pudo registrar.", variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleSendTimeRequest = async () => {
    if (!employeeId || !companyId || !requestMessage.trim()) return;
    setSendingRequest(true);
    try {
      await supabase.from("notifications").insert({
        company_id: companyId,
        recipient_id: companyId,
        recipient_type: "company",
        type: "manual_time_request",
        title: "Solicitud de horario no capturado",
        body: requestMessage.trim(),
        metadata: { employee_id: employeeId, request_date: format(new Date(), "yyyy-MM-dd") },
      } as any);
      toast({ title: "Solicitud enviada", description: "Tu supervisor revisará la solicitud." });
      setRequestOpen(false);
      setRequestMessage("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSendingRequest(false); }
  };

  const getElapsed = () => {
    if (!activeEntry) return null;
    const diff = Math.floor((now.getTime() - new Date(activeEntry.clock_in).getTime()) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getDuration = (entry: TimeEntry) => {
    if (!entry.clock_out) return "En curso";
    const diff = Math.floor((new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 1000);
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  };

  const totalHoursToday = () => {
    let total = 0;
    for (const entry of todayEntries) {
      const end = entry.clock_out ? new Date(entry.clock_out) : now;
      total += (end.getTime() - new Date(entry.clock_in).getTime()) / 1000;
    }
    return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
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
    <div className="space-y-5">
      {/* Back button */}
      <button
        onClick={() => navigate("/portal")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors -mb-2"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver
      </button>

      {/* Current time */}
      <div className="text-center space-y-0.5">
        <p className="text-4xl font-bold font-heading tracking-tight tabular-nums text-foreground">
          {format(now, "HH:mm:ss")}
        </p>
        <p className="text-sm text-muted-foreground capitalize">
          {format(now, "EEEE, d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Status card */}
      <div className={cn(
        "rounded-2xl p-5 text-center relative overflow-hidden transition-colors",
        isClockedIn
          ? "bg-gradient-to-br from-earning to-earning/80 text-earning-foreground"
          : "bg-card border text-foreground"
      )}>
        {isClockedIn && <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,hsl(0_0%_100%/0.12),transparent_60%)]" />}
        <div className="relative space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className={cn("h-2.5 w-2.5 rounded-full", isClockedIn ? "bg-earning-foreground animate-pulse" : "bg-muted-foreground/30")} />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isClockedIn ? "En turno" : "Fuera de turno"}
            </span>
          </div>
          {isClockedIn && (
            <>
              <p className="text-3xl font-bold tabular-nums font-heading">{getElapsed()}</p>
              <p className="text-xs opacity-80">Entrada: {format(new Date(activeEntry!.clock_in), "HH:mm")}</p>
            </>
          )}
        </div>
      </div>

      {/* Shift selection (only when NOT clocked in) */}
      {!isClockedIn && (
        <>
          {todayShifts.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Selecciona tu turno para fichar
              </p>
              <div className="space-y-1.5">
                {todayShifts.map(s => {
                  const isSelected = selectedShift?.id === s.id;
                  const alreadyClockedShift = todayEntries.some(e => e.shift_id === s.id);
                  const timeCheck = isClockInAllowed(s);
                  return (
                    <button
                      key={s.id}
                      disabled={alreadyClockedShift}
                      onClick={() => setSelectedShift(isSelected ? null : s)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-all",
                        isSelected && "border-primary bg-primary/5 ring-2 ring-primary/20",
                        !isSelected && !alreadyClockedShift && "border-border hover:border-primary/30 hover:bg-muted/30",
                        alreadyClockedShift && "opacity-50 cursor-not-allowed bg-muted/20",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {s.shift_code && (
                            <span className="text-[9px] font-mono font-bold text-primary bg-primary/10 rounded px-1 py-px">
                              #{(s.shift_code).padStart(4, "0")}
                            </span>
                          )}
                          <span className="text-sm font-semibold">{s.title}</span>
                        </div>
                        {alreadyClockedShift && (
                          <span className="text-[9px] font-semibold text-earning">Completado</span>
                        )}
                        {!alreadyClockedShift && !timeCheck.allowed && (
                          <span className="text-[9px] font-semibold text-warning flex items-center gap-0.5">
                            <ShieldAlert className="h-2.5 w-2.5" />
                            No disponible aún
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                        </span>
                        {s.location_name && (
                          <span className="flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5" />
                            {s.location_name}
                          </span>
                        )}
                        {s.client_name && (
                          <span className="flex items-center gap-0.5">
                            <Users className="h-2.5 w-2.5" />
                            {s.client_name}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground">Sin turnos asignados hoy</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  No tienes turnos programados para hoy. Si crees que es un error, envía una solicitud.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Clock-in blocked warning */}
      {!isClockedIn && clockInBlocked && selectedShift && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <p className="text-[11px] text-warning font-medium leading-relaxed">{clockInBlocked}</p>
        </div>
      )}

      {/* Clock in/out button */}
      {isClockedIn ? (
        <Button
          onClick={handleClockOut}
          disabled={acting}
          className="w-full h-16 rounded-2xl text-lg font-bold gap-3 shadow-xl transition-all active:scale-[0.95] bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        >
          {acting ? <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <><LogOut className="h-5 w-5" /> Marcar Salida</>}
        </Button>
      ) : (
        <Button
          onClick={handleClockIn}
          disabled={acting || !companyId || !selectedShift || !!clockInBlocked}
          className="w-full h-16 rounded-2xl text-lg font-bold gap-3 shadow-xl transition-all active:scale-[0.95] gradient-primary text-white hover:shadow-2xl disabled:opacity-50"
        >
          {acting ? <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <><LogIn className="h-5 w-5" /> Marcar Entrada</>}
        </Button>
      )}

      {/* Manual time request */}
      {!isClockedIn && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground gap-1.5"
          onClick={() => setRequestOpen(true)}
        >
          <FileText className="h-3.5 w-3.5" />
          Solicitar horario no capturado
        </Button>
      )}

      {/* Today summary */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border bg-card p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Timer className="h-3 w-3" />
            <span className="text-[9px] font-semibold uppercase tracking-wider">Horas hoy</span>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums">{totalHoursToday()}</p>
        </div>
        <div className="rounded-2xl border bg-card p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <CalendarDays className="h-3 w-3" />
            <span className="text-[9px] font-semibold uppercase tracking-wider">Registros</span>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums">{todayEntries.length}</p>
        </div>
      </div>

      {/* Daily history */}
      {todayEntries.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Historial de hoy</h3>
          {todayEntries.map((entry) => {
            const isActive = !entry.clock_out;
            return (
              <div key={entry.id} className={cn(
                "rounded-xl border bg-card p-3 flex items-center gap-3",
                isActive && "border-earning/20 bg-earning/5"
              )}>
                <div className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                  isActive ? "bg-earning/10 text-earning" : "bg-muted text-muted-foreground"
                )}>
                  <Clock className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{format(new Date(entry.clock_in), "HH:mm")}</span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className="text-sm font-semibold">{entry.clock_out ? format(new Date(entry.clock_out), "HH:mm") : "—"}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {isActive ? <span className="text-earning font-medium">En curso</span> : getDuration(entry)}
                  </p>
                </div>
                <span className={cn(
                  "text-[9px] px-2 py-0.5 rounded-full font-semibold",
                  entry.status === "approved" ? "bg-earning/10 text-earning" :
                  entry.status === "rejected" ? "bg-destructive/10 text-destructive" :
                  "bg-warning/10 text-warning"
                )}>
                  {entry.status === "approved" ? "Aprobado" : entry.status === "rejected" ? "Rechazado" : "Pendiente"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {todayEntries.length === 0 && !isClockedIn && todayShifts.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <img src={staflyMascotChecklist} alt="" className="h-16 w-16 mx-auto opacity-60 drop-shadow-md" />
          <p className="text-sm font-semibold text-foreground">No hay registros hoy</p>
          <p className="text-xs text-muted-foreground max-w-[220px] mx-auto">
            No tienes turnos programados para el día de hoy
          </p>
        </div>
      )}

      {/* Manual time request dialog */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Solicitar horario no capturado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Describe la situación y las horas que trabajaste. Tu supervisor revisará la solicitud.
            </p>
            <Textarea
              value={requestMessage}
              onChange={e => setRequestMessage(e.target.value)}
              placeholder="Ej: Trabajé de 8:00 a 17:00 pero no pude marcar entrada por problemas con la app..."
              rows={4}
              className="text-sm resize-none"
            />
            <Button
              onClick={handleSendTimeRequest}
              disabled={sendingRequest || !requestMessage.trim()}
              className="w-full h-9 text-sm"
            >
              {sendingRequest ? <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" /> : null}
              Enviar solicitud
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
