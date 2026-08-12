/**
 * Portal Shift Detail / Claim page
 * - Resolves a shift by id and shows clear, explicit availability state
 * - Primary action: Request shift (creates shift_requests row)
 * - Handles every edge case: deleted, full, already requested, already assigned, past
 *
 * This page is the destination for shift_claimable / shift_assigned notifications
 * when metadata.shift_id is present.
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, CalendarDays, Clock, MapPin, Briefcase, Navigation,
  HandMetal, CheckCircle2, AlertCircle, XCircle, Loader2, Hourglass,
} from "lucide-react";
import { format, parseISO, isToday, isTomorrow, isBefore, startOfDay } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { resolveServiceLocation, formatPlaceLine } from "@/lib/shifts/service-location";
import { resolveIdentityEmployeeIds } from "@/lib/identity/identity-set";

type AvailabilityState =
  | "loading"
  | "available"           // can request
  | "pending_approval"    // already requested by me
  | "assigned"            // already assigned to me
  | "full"                // no slots left
  | "not_claimable"       // exists but not open for claims
  | "past"                // date in the past
  | "deleted";            // soft-deleted or not found

interface ShiftDetail {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  meeting_point: string | null;
  meeting_time: string | null;
  special_instructions: string | null;
  slots: number | null;
  claimable: boolean;
  status: string;
  shift_code: string | null;
  shift_ref: string | null;
  location: { name: string; address?: string | null } | null;
  /** Modelo canónico de ubicación (destino + encuentro). */
  place: ReturnType<typeof resolveServiceLocation>;
  client: { name: string } | null;
  assignedCount: number;
}

export default function PortalShiftDetail() {
  const { shiftId } = useParams<{ shiftId: string }>();
  const navigate = useNavigate();
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const [state, setState] = useState<AvailabilityState>("loading");
  const [shift, setShift] = useState<ShiftDetail | null>(null);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    if (!shiftId || !employeeId) return;
    setState("loading");

    // Fetch shift WITHOUT filtering deleted_at — we want to detect deleted state
    const { data: s } = await supabase
      .from("scheduled_shifts")
      .select(`id, title, date, start_time, end_time, notes, meeting_point, meeting_time, special_instructions,
               slots, claimable, status, shift_code, shift_ref, deleted_at, publication_status,
               job_site_address, job_site_location_id, location_id, meeting_point_location_id, transportation_required,
               locations (name, address, latitude, longitude), clients (name),
               shift_assignments (id, employee_id, status, is_draft_reservation)`)
      .eq("id", shiftId)
      .maybeSingle();

    if (!s || (s as any).deleted_at) {
      setState("deleted");
      return;
    }

    // Drafts / cancelled / archived must never expose detail to a worker.
    // Treat as "no longer available" using the existing "deleted" UX state.
    const pubStatus = (s as any).publication_status ?? "published";
    if (pubStatus !== "published") {
      setState("deleted");
      return;
    }

    const assignments = ((s as any).shift_assignments ?? []) as { employee_id: string; status: string; is_draft_reservation?: boolean }[];
    // Exclude draft reservations from the active set so a placeholder doesn't
    // appear as someone else's claim or as my own assignment.
    const activeAssignments = assignments.filter(
      a => a.status !== "removed" && a.status !== "rejected" && a.is_draft_reservation !== true
    );
    const myAssignment = activeAssignments.find(a => a.employee_id === employeeId);

    const detail: ShiftDetail = {
      id: s.id,
      title: s.title,
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      notes: s.notes,
      meeting_point: (s as any).meeting_point ?? null,
      meeting_time: (s as any).meeting_time ?? null,
      special_instructions: (s as any).special_instructions ?? null,
      slots: s.slots,
      claimable: (s as any).claimable ?? false,
      status: s.status,
      shift_code: (s as any).shift_code ?? null,
      shift_ref: (s as any).shift_ref ?? null,
      location: (s as any).locations ?? null,
      place: resolveServiceLocation({
        location_id: (s as any).location_id ?? null,
        job_site_location_id: (s as any).job_site_location_id ?? null,
        job_site_address: (s as any).job_site_address ?? null,
        meeting_point: (s as any).meeting_point ?? null,
        meeting_point_location_id: (s as any).meeting_point_location_id ?? null,
        transportation_required: (s as any).transportation_required ?? false,
        legacyVenue: (s as any).locations ?? null,
      }),
      client: (s as any).clients ?? null,
      assignedCount: activeAssignments.length,
    };
    setShift(detail);

    // State resolution (priority order matters)
    if (myAssignment) { setState("assigned"); return; }

    // Check existing pending request
    const { data: existingReq } = await supabase
      .from("shift_requests")
      .select("id, status")
      .eq("shift_id", shiftId).eq("employee_id", employeeId)
      .maybeSingle();
    if (existingReq && existingReq.status === "pending") { setState("pending_approval"); return; }

    if (isBefore(parseISO(detail.date), startOfDay(new Date()))) { setState("past"); return; }
    if (!detail.claimable || !["open", "published"].includes(detail.status)) { setState("not_claimable"); return; }
    if (detail.slots && detail.assignedCount >= detail.slots) { setState("full"); return; }

    setState("available");
  }, [shiftId, employeeId]);

  useEffect(() => { load(); }, [load]);

  const handleRequest = async () => {
    if (!shift || !employeeId) return;
    setRequesting(true);
    try {
      const { data: emp } = await supabase.from("employees").select("company_id").eq("id", employeeId).maybeSingle();
      if (!emp) throw new Error("Employee not found");

      // Race-condition guard
      const { data: cur } = await supabase.from("scheduled_shifts")
        .select("slots, deleted_at, claimable, status, publication_status, shift_assignments(id, status, is_draft_reservation)").eq("id", shift.id).maybeSingle();
      if (!cur || (cur as any).deleted_at) throw new Error("This shift is no longer available");
      if (((cur as any).publication_status ?? "published") !== "published") {
        throw new Error("This shift is no longer available");
      }
      if (!(cur as any).claimable || !["open", "published"].includes(cur.status)) {
        throw new Error("This shift is no longer open for requests");
      }
      const filled = ((cur as any).shift_assignments ?? []).filter(
        (a: any) => a.status !== "removed" && a.status !== "rejected" && a.is_draft_reservation !== true
      ).length;
      if (cur.slots && filled >= cur.slots) throw new Error("This shift is already full");

      const { error } = await supabase.from("shift_requests").insert({
        shift_id: shift.id, employee_id: employeeId, company_id: emp.company_id, status: "pending",
      } as any);
      if (error) throw error;

      if (navigator.vibrate) navigator.vibrate(80);
      toast.success("✅ ¡Solicitud enviada!", { description: "Te avisaremos cuando se revise." });
      setState("pending_approval");
    } catch (e: any) {
      toast.error("No pudimos enviar la solicitud", { description: e.message });
      await load();
    } finally {
      setRequesting(false);
    }
  };

  // ── Loading
  if (state === "loading") {
    return (
      <div className="space-y-3 pt-2 animate-pulse">
        <div className="h-8 w-32 bg-muted rounded" />
        <div className="h-40 bg-muted rounded-2xl" />
        <div className="h-12 bg-muted rounded-xl" />
      </div>
    );
  }

  // ── Not found / deleted — minimal state
  if (state === "deleted" || !shift) {
    return (
      <div className="pb-24 animate-fade-in">
        <BackBar onBack={() => navigate("/portal/shifts")} />
        <EmptyState
          icon={<XCircle className="h-10 w-10 text-muted-foreground/30" />}
          title="Turno no disponible"
          body="Este turno fue eliminado o ya no es accesible."
          actionLabel="Volver a mis turnos"
          onAction={() => navigate("/portal/shifts")}
        />
      </div>
    );
  }

  const dateLabel = isToday(parseISO(shift.date))
    ? "Today"
    : isTomorrow(parseISO(shift.date))
    ? "Tomorrow"
    : format(parseISO(shift.date), "EEEE d MMM", { locale: es });

  const slotsLeft = shift.slots ? Math.max(0, shift.slots - shift.assignedCount) : null;

  return (
    <div className="pb-24 animate-fade-in">
      <BackBar onBack={() => navigate(-1)} />

      {/* ── State banner — explicit, glanceable */}
      <StateBanner state={state} />

      {/* ── Hero card */}
      <div className="rounded-2xl bg-card border border-border/40 shadow-sm overflow-hidden mb-4">
        <div className="p-4 space-y-3">
          {/* Date chip + slots */}
          <div className="flex items-center justify-between">
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest",
              isToday(parseISO(shift.date)) ? "bg-primary text-primary-foreground" :
              isTomorrow(parseISO(shift.date)) ? "bg-accent text-accent-foreground" :
              "bg-muted text-muted-foreground"
            )}>
              {dateLabel}
            </span>
            {slotsLeft !== null && state === "available" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary">
                {slotsLeft} {slotsLeft === 1 ? "cupo disponible" : "cupos disponibles"}
              </span>
            )}
          </div>

          {/* Work route — Clock In protagonist */}
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground/65 leading-none mb-1">
              Clock In
            </p>
            <p className="text-[32px] leading-none font-bold font-mono tabular-nums text-foreground">
              {shift.start_time?.slice(0, 5)}
            </p>
            <p className="text-[10.5px] text-muted-foreground/65 mt-1.5 tabular-nums">
              Ends approx. {shift.end_time?.slice(0, 5)} · salida estimada
            </p>
          </div>

          {/* Title */}
          <h1 className="text-lg font-bold font-heading leading-tight text-foreground">
            {shift.title}
          </h1>

          {/* Meta rows */}
          <div className="space-y-2 pt-1">
            <Row
              icon={<Briefcase className="h-3.5 w-3.5" />}
              label="Cliente"
              value={shift.client?.name ?? "Por confirmar"}
              muted={!shift.client?.name}
            />
            <Row
              icon={<MapPin className="h-3.5 w-3.5" />}
              label="Dónde"
              value={formatPlaceLine(shift.place.destination) ?? "Por confirmar"}
              muted={!shift.place.destination}
            />
            {shift.place.requiresMeetingPoint && shift.place.meetingPoint ? (
              <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-primary/[0.05] border border-primary/10">
                <Navigation className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70">Punto de encuentro</p>
                  <p className="text-[12px] text-foreground font-medium leading-snug">{formatPlaceLine(shift.place.meetingPoint)}</p>
                </div>
                {shift.meeting_time && (
                  <div className="shrink-0 text-right">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary/70 leading-none mb-0.5">Hora</p>
                    <p className="text-[15px] font-bold font-mono tabular-nums text-foreground leading-none">
                      {shift.meeting_time.slice(0, 5)}
                    </p>
                  </div>
                )}
              </div>
            ) : shift.place.requiresMeetingPoint ? (
              <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-muted/20 border border-dashed border-border/40">
                <Navigation className="h-3.5 w-3.5 text-muted-foreground/60 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Punto de encuentro</p>
                  <p className="text-[12px] italic text-muted-foreground/70 leading-snug">Por confirmar</p>
                </div>
              </div>
            ) : null}
            {shift.notes && (
              <div className="rounded-xl bg-muted/30 border border-border/30 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1">Notas</p>
                <p className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-line">{shift.notes}</p>
              </div>
            )}
            {shift.special_instructions && (
              <div className="rounded-xl bg-amber-500/[0.08] border border-amber-500/20 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">Importante</p>
                <p className="text-[12px] text-foreground/90 leading-relaxed whitespace-pre-line">{shift.special_instructions}</p>
              </div>
            )}
          </div>

          {/* Payroll disclaimer */}
          <p className="text-[10px] text-muted-foreground/55 leading-relaxed italic pt-1">
            Las horas programadas son una estimación. La nómina usa las horas reales registradas.
          </p>
        </div>
      </div>

      {/* ── Primary CTA */}
      {state === "available" && (
        <Button
          size="lg"
          className="w-full h-12 text-sm font-bold rounded-xl shadow-lg shadow-primary/20 gap-2"
          onClick={handleRequest}
          disabled={requesting}
        >
          {requesting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Enviando solicitud...</>
          ) : (
            <><HandMetal className="h-4 w-4" /> Solicitar turno</>
          )}
        </Button>
      )}

      {state === "pending_approval" && (
        <Button
          variant="outline"
          size="lg"
          className="w-full h-12 text-sm font-semibold rounded-xl gap-2"
          onClick={() => navigate("/portal/shifts")}
        >
          <Hourglass className="h-4 w-4" /> Volver a mis turnos
        </Button>
      )}

      {(state === "assigned" || state === "full" || state === "not_claimable" || state === "past") && (
        <Button
          variant="outline"
          size="lg"
          className="w-full h-12 text-sm font-semibold rounded-xl"
          onClick={() => navigate("/portal/shifts")}
        >
          Volver a mis turnos
        </Button>
      )}
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground mb-3 -ml-1 px-1 py-1 rounded-lg active:scale-95 transition-all"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Volver
    </button>
  );
}

function Row({ icon, label, value, muted }: { icon: React.ReactNode; label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="text-muted-foreground/50">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">{label}</p>
        <p className={cn("text-[12.5px] truncate", muted ? "italic text-muted-foreground/70" : "text-foreground font-medium")}>{value}</p>
      </div>
    </div>
  );
}

function StateBanner({ state }: { state: AvailabilityState }) {
  if (state === "available") return null;

  const config: Record<string, { icon: React.ReactNode; label: string; sub: string; tone: string }> = {
    pending_approval: {
      icon: <Hourglass className="h-4 w-4" />,
      label: "Solicitud pendiente",
      sub: "Te avisaremos cuando se revise.",
      tone: "bg-amber-500/[0.08] border-amber-500/20 text-amber-700 dark:text-amber-400",
    },
    assigned: {
      icon: <CheckCircle2 className="h-4 w-4" />,
      label: "Ya estás asignado",
      sub: "Búscalo en My Shifts.",
      tone: "bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-700 dark:text-emerald-400",
    },
    full: {
      icon: <AlertCircle className="h-4 w-4" />,
      label: "Sin cupos disponibles",
      sub: "Todos los lugares están ocupados.",
      tone: "bg-muted/40 border-border/40 text-muted-foreground",
    },
    not_claimable: {
      icon: <AlertCircle className="h-4 w-4" />,
      label: "No abierto a solicitudes",
      sub: "Este turno no acepta solicitudes en este momento.",
      tone: "bg-muted/40 border-border/40 text-muted-foreground",
    },
    past: {
      icon: <XCircle className="h-4 w-4" />,
      label: "Turno ya pasó",
      sub: "Este turno ya finalizó.",
      tone: "bg-muted/40 border-border/40 text-muted-foreground",
    },
  };

  const c = config[state];
  if (!c) return null;

  return (
    <div className={cn("rounded-2xl border px-4 py-3 flex items-start gap-3 mb-3", c.tone)}>
      <div className="shrink-0 mt-0.5">{c.icon}</div>
      <div className="min-w-0">
        <p className="text-[13px] font-bold leading-tight">{c.label}</p>
        <p className="text-[11px] opacity-80 mt-0.5">{c.sub}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body, actionLabel, onAction }: {
  icon: React.ReactNode; title: string; body: string; actionLabel: string; onAction: () => void;
}) {
  return (
    <div className="text-center py-16 space-y-3">
      <div className="h-16 w-16 mx-auto rounded-2xl bg-muted/30 border border-border/15 flex items-center justify-center">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground/60 max-w-[260px] mx-auto">{body}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onAction} className="rounded-xl">
        {actionLabel}
      </Button>
    </div>
  );
}
