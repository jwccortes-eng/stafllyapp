import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CalendarDays, Clock, MapPin, CheckCircle2, XCircle, AlertCircle, HandMetal, Users, Loader2, ThumbsUp, ThumbsDown, LogIn, ChevronRight, ChevronDown, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

import { cn } from "@/lib/utils";
import { format, parseISO, isBefore, startOfDay, isToday, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { PortalShiftDetailDrawer } from "@/components/portal/PortalShiftDetailDrawer";

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
    shift_code?: string | null;
    meeting_point?: string | null;
    special_instructions?: string | null;
    company_id?: string;
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

/* ── Compact past shift card ── */
function PastShiftCard({ assignment: a, statusConfig, onClick }: { assignment: ShiftAssignment; statusConfig: Record<string, any>; onClick: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[a.status] || statusConfig.pending;
  const StatusIcon = cfg.icon;
  const dateLabel = format(parseISO(a.shift.date), "d MMM", { locale: es });
  const hasDetails = !!(a.shift.notes || a.shift.meeting_point || a.shift.special_instructions);

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 transition-all duration-200">
      {/* Compact row */}
      <div
        className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer active:scale-[0.99]"
        onClick={onClick}
      >
        {/* Date pill */}
        <div className="text-center shrink-0 w-10">
          <p className="text-[10px] font-bold uppercase text-muted-foreground/60 leading-none">{format(parseISO(a.shift.date), "MMM", { locale: es })}</p>
          <p className="text-base font-bold text-foreground/70 leading-tight">{format(parseISO(a.shift.date), "d")}</p>
        </div>

        <div className="h-8 w-px bg-border/40 shrink-0" />

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground/80 truncate">{a.shift.title}</p>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70 mt-0.5">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {a.shift.start_time?.slice(0, 5)}–{a.shift.end_time?.slice(0, 5)}
            </span>
            {a.shift.client && (
              <span className="truncate">{a.shift.client.name}</span>
            )}
          </div>
        </div>

        {/* Status dot */}
        <div className={cn("h-2 w-2 rounded-full shrink-0", cfg.cls === "text-earning" ? "bg-earning" : cfg.cls === "text-warning" ? "bg-warning" : "bg-deduction")} />

        {/* Expand toggle */}
        {hasDetails && (
          <button
            className="p-1 rounded-lg hover:bg-muted/60 text-muted-foreground/40 transition-colors"
            onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")} />
          </button>
        )}
      </div>

      {/* Expandable details */}
      {expanded && hasDetails && (
        <div className="px-3.5 pb-3 pt-0 space-y-1.5 animate-fade-in border-t border-border/20 mx-3">
          {a.shift.notes && (
            <div className="flex items-start gap-2 pt-2">
              <FileText className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{a.shift.notes}</p>
            </div>
          )}
          {a.shift.meeting_point && (
            <div className="flex items-start gap-2">
              <MapPin className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground/70">{a.shift.meeting_point}</p>
            </div>
          )}
          {a.shift.special_instructions && (
            <div className="flex items-start gap-2">
              <AlertCircle className="h-3 w-3 text-warning/60 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground/70">{a.shift.special_instructions}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MyShifts() {
  const { employeeId } = useAuth();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [claimable, setClaimable] = useState<ClaimableShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedShift, setSelectedShift] = useState<ShiftAssignment | null>(null);
  const { toast } = useToast();

  const load = async () => {
    if (!employeeId) {
      setAssignments([]);
      setClaimable([]);
      setLoading(false);
      return;
    }

    setLoading(true);

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
          id, title, date, start_time, end_time, notes, status, slots, shift_code, meeting_point, special_instructions, company_id,
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
        shift_code: a.scheduled_shifts.shift_code,
        meeting_point: a.scheduled_shifts.meeting_point,
        special_instructions: a.scheduled_shifts.special_instructions,
        company_id: a.scheduled_shifts.company_id,
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

    // Check if already requested
    const { data: existing } = await supabase
      .from("shift_requests")
      .select("id")
      .eq("shift_id", shiftId)
      .eq("employee_id", employeeId)
      .maybeSingle();

    if (existing) {
      toast({ title: "Ya solicitaste este turno", description: "Tu solicitud está siendo revisada", variant: "destructive" });
      setClaiming(null);
      return;
    }

    const { error } = await supabase.from("shift_requests").insert({
      shift_id: shiftId,
      employee_id: employeeId,
      company_id: emp.company_id,
      status: "pending",
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "¡Solicitud enviada!", description: "Te notificaremos cuando sea revisada por un administrador" });
      await load();
    }
    setClaiming(null);
  };

  const acceptAssignment = async (assignmentId: string) => {
    setResponding(assignmentId);
    const { error } = await supabase
      .from("shift_assignments")
      .update({ status: "confirmed", responded_at: new Date().toISOString() } as any)
      .eq("id", assignmentId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "¡Turno aceptado!", description: "Has confirmado tu asignación" });
      await load();
    }
    setResponding(null);
  };

  const rejectAssignment = async () => {
    if (!rejectDialogId) return;
    setResponding(rejectDialogId);
    const { error } = await supabase
      .from("shift_assignments")
      .update({
        status: "rejected",
        responded_at: new Date().toISOString(),
        rejection_reason: rejectReason.trim() || null,
      } as any)
      .eq("id", rejectDialogId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Turno rechazado", description: "Se notificará al administrador" });
      await load();
    }
    setResponding(null);
    setRejectDialogId(null);
    setRejectReason("");
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
    accepted: { icon: CheckCircle2, label: "Aceptado", cls: "text-earning", bgCls: "bg-earning/10" },
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
          "rounded-2xl border border-border/40 bg-card p-4 space-y-3 transition-all duration-200 shadow-xs active:scale-[0.98] cursor-pointer",
          isTodayShift && "ring-2 ring-primary/20 border-primary/20 shadow-md"
        )}
        onClick={() => setSelectedShift(a)}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isTodayShift && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary text-primary-foreground">Hoy</span>
              )}
              <p className="text-sm font-semibold text-foreground truncate">{a.shift.title}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1 capitalize">
              {dateLabel}
            </p>
          </div>
          <div className={cn("flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full", cfg.cls, cfg.bgCls)}>
            <StatusIcon className="h-3.5 w-3.5" />
            {cfg.label}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 ml-1 shrink-0" />
        </div>

        {/* Compact info row: time + location + client */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5 font-medium">
            <Clock className="h-3.5 w-3.5" />
            {a.shift.start_time?.slice(0, 5)} – {a.shift.end_time?.slice(0, 5)}
          </span>
          {a.shift.location && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{a.shift.location.name}</span>
            </span>
          )}
          {a.shift.client && (
            <span className="flex items-center gap-1 truncate">
              <Users className="h-3 w-3 shrink-0" />
              <span className="truncate">{a.shift.client.name}</span>
            </span>
          )}
        </div>

        {/* Notes hidden — only in detail drawer */}

        {/* Accept/Reject buttons for non-past shifts that can be changed */}
        {a.status === "pending" && !isBefore(parseISO(a.shift.date), today) && (
          <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              className="flex-1 h-9 text-xs gap-1.5"
              onClick={() => acceptAssignment(a.id)}
              disabled={responding === a.id}
            >
              {responding === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
              Aceptar turno
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 text-xs gap-1.5 text-destructive hover:text-destructive"
              onClick={() => { setRejectDialogId(a.id); setRejectReason(""); }}
              disabled={responding === a.id}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              Rechazar
            </Button>
          </div>
        )}

        {/* Reject option for accepted/confirmed upcoming shifts */}
        {(a.status === "accepted" || a.status === "confirmed") && !isBefore(parseISO(a.shift.date), today) && !isTodayShift && (
          <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs gap-1.5 text-destructive hover:text-destructive"
              onClick={() => { setRejectDialogId(a.id); setRejectReason(""); }}
              disabled={responding === a.id}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              No puedo asistir
            </Button>
          </div>
        )}

        {/* Clock In button for confirmed today shifts */}
        {(a.status === "confirmed" || a.status === "accepted") && isTodayShift && (
          <div onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              className="w-full h-10 text-sm gap-2 font-bold"
              onClick={() => navigate(`/portal/clock?shiftId=${a.shift.id}`)}
            >
              <LogIn className="h-4 w-4" />
              Marcar Entrada
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderClaimable = (s: ClaimableShift) => {
    const spotsLeft = s.slots ? s.slots - s.assignedCount : null;
    return (
      <div key={s.id} className="rounded-2xl border border-dashed border-primary/25 bg-primary/5 p-4 space-y-3 transition-all duration-200 active:scale-[0.98]">
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
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Enviando solicitud...</>
          ) : (
            <><HandMetal className="h-3.5 w-3.5 mr-1.5" />Solicitar turno</>
          )}
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        variant="1"
        icon={CalendarDays}
        title="Mis Turnos"
        subtitle={`${upcoming.length} próximo${upcoming.length !== 1 ? "s" : ""} · ${past.length} pasado${past.length !== 1 ? "s" : ""}`}
      />

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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Pasados ({past.length})
          </h2>
          <div className="space-y-1.5">
            {past.map(a => <PastShiftCard key={a.id} assignment={a} statusConfig={statusConfig} onClick={() => setSelectedShift(a)} />)}
          </div>
        </div>
      )}

      {assignments.length === 0 && claimable.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center">
            <CalendarDays className="h-8 w-8 text-primary/40" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Sin turnos asignados</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
              Aún no tienes turnos programados. Cuando haya turnos disponibles, aparecerán aquí.
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            Contacta a tu supervisor si crees que deberías tener turnos asignados.
          </p>
        </div>
      )}

      {assignments.length === 0 && claimable.length > 0 && (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5 text-center space-y-2">
          <HandMetal className="h-6 w-6 text-primary mx-auto" />
          <p className="text-sm font-semibold text-foreground">¡Hay turnos disponibles!</p>
          <p className="text-xs text-muted-foreground">
            No tienes turnos asignados, pero puedes solicitar los turnos abiertos de arriba.
          </p>
        </div>
      )}

      {/* Shift detail drawer */}
      <PortalShiftDetailDrawer
        shift={selectedShift?.shift ?? null}
        assignmentStatus={selectedShift?.status}
        open={!!selectedShift}
        onOpenChange={o => { if (!o) setSelectedShift(null); }}
      />

      {/* Reject assignment dialog */}
      <Dialog open={!!rejectDialogId} onOpenChange={o => { if (!o) { setRejectDialogId(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Rechazar turno</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Indica opcionalmente el motivo por el que no puedes tomar este turno.
            </p>
            <Textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Motivo (opcional)..."
              rows={3}
              className="text-sm resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setRejectDialogId(null); setRejectReason(""); }}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={rejectAssignment} disabled={responding === rejectDialogId}>
              {responding === rejectDialogId ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
