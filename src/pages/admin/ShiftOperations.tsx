import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import {
  readStage,
  isCommandCenterReturn,
  COMMAND_CENTER_ROUTE,
} from "@/lib/command-center/deep-link";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Loader2, ArrowLeft, Building2, MapPin, Clock, Users, Car, CalendarDays,
  Shield, MessageSquare, Phone, AlertTriangle, CheckCircle2, Plus, Send,
  FileText, Flag, Pencil, Hash, CreditCard, UserCheck, Truck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { isEmployeeDriver, type Shift, type Assignment, type Employee } from "@/components/shifts/types";
import { ShiftEditDialog } from "@/components/shifts/ShiftEditDialog";
import type { LocationOption } from "@/components/shifts/ShiftFormFields";
import { ShiftActionBar } from "@/components/shifts/ShiftActionBar";
import { StaffingRequiredBanner } from "@/components/shifts/StaffingRequiredBanner";
import {
  SmartSummaryCard, MissingItemsCard, RisksCard, NextActionsCard,
  AssignedTeamCard, CandidatesCard, WorkerPreviewCard, buildCandidatePool,
} from "@/components/shifts/ops/ShiftOpsBlocks";
import { AttendanceEvidenceCard } from "@/components/shifts/ops/AttendanceEvidenceCard";
import {
  getShiftOperationalStatus, getShiftMissingItems, getShiftRisks,
  getRecommendedNextActions, normalizeArea,
} from "@/lib/shifts/shift-operations-intelligence";
import { getShiftPhase, phaseChipClasses } from "@/lib/shifts/shift-phase";
import { displayShiftRef } from "@/lib/shifts/shift-ref";
import {
  deriveCloseoutReviewStatus, presentCloseoutReviewStatus, closeoutBadgeClasses,
} from "@/lib/shifts/closeout-review-status";
import { ShiftClosureCard } from "@/components/shifts/ShiftClosureCard";
import { useQueryClient } from "@tanstack/react-query";
import { versionedWrite, buildPatch, rowVersion } from "@/lib/data/versioned-write";
import { VersionConflictDialog, type VersionConflictInfo } from "@/components/data-integrity/VersionConflictDialog";
import { SHIFT_FIELD_LABELS } from "@/lib/shifts/field-labels";
import {
  reconcileServiceAfterSave, subscribeToServiceChanges, writeServiceRow, readServiceRow,
} from "@/lib/shifts/service-state";


import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ClipboardCheck, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { versionedAssignmentTransition, assignmentConflictCopy } from "@/lib/data/assignment-write";

interface ShiftDetail {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  slots: number;
  client_id: string | null;
  location_id: string | null;
  notes: string | null;
  pay_type: string;
  clock_method: string;
  transportation_required: boolean;
  car_capacity: number;
  transportation_notes: string | null;
  meeting_point: string | null;
  special_instructions: string | null;
  shift_admin_id: string | null;
  driver_employee_id: string | null;
  shift_code: string | null;
  shift_ref?: string | null;
  publication_status?: string | null;
}

interface AssignmentDetail {
  id: string;
  employee_id: string;
  status: string;
  assignment_role: string;
  employee?: { first_name: string; last_name: string; phone_number: string | null; county: string | null; has_car: string | null; can_drive: boolean | null };
}

interface TimelineEvent {
  id: string;
  event_type: string;
  description: string;
  actor_id: string | null;
  created_at: string;
  metadata: any;
}

interface ShiftNote {
  id: string;
  note_type: string;
  content: string;
  created_by: string;
  created_at: string;
  linked_employee_id: string | null;
}

const NOTE_TYPES = [
  { value: "internal", label: "Nota interna", icon: "📝" },
  { value: "call_log", label: "Registro de llamada", icon: "📞" },
  { value: "text_message", label: "Mensaje de texto", icon: "💬" },
  { value: "staffing", label: "Nota de staffing", icon: "👥" },
  { value: "transport", label: "Nota de transporte", icon: "🚗" },
  { value: "client", label: "Nota de cliente", icon: "🏢" },
  { value: "incident", label: "Incidente", icon: "⚠️" },
];

const EVENT_ICONS: Record<string, string> = {
  shift_created: "🆕", shift_edited: "✏️", employee_added: "➕", employee_removed: "➖",
  admin_assigned: "🛡️", driver_assigned: "🚗", transport_enabled: "🚐",
  message_sent: "📨", call_logged: "📞", comment_added: "💬",
  issue_flagged: "🚩", shift_started: "▶️", shift_completed: "✅",
  note_added: "📝", role_changed: "🔄",
};

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  staff: { label: "Staff", color: "bg-muted text-muted-foreground" },
  driver: { label: "Conductor", color: "bg-warning/10 text-warning border-warning/20" },
  shift_admin: { label: "Admin Turno", color: "bg-primary/10 text-primary border-primary/20" },
  shift_lead: { label: "Líder", color: "bg-earning/10 text-earning border-earning/20" },
  backup_admin: { label: "Backup Admin", color: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
  transport_lead: { label: "Líder Transporte", color: "bg-warning/10 text-warning border-warning/20" },
  check_in_admin: { label: "Check-in", color: "bg-info/10 text-info border-info/20" },
};

export default function ShiftOperations() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const shiftId = searchParams.get("id");

  const [shift, setShift] = useState<ShiftDetail | null>(null);
  const [serviceConflict, setServiceConflict] = useState<VersionConflictInfo | null>(null);

  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [notes, setNotes] = useState<ShiftNote[]>([]);
  const [clientName, setClientName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [loading, setLoading] = useState(true);
  // STAFLY-CTX-001 — background refresh indicator (no reemplaza la vista).
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Note form
  const [newNoteType, setNewNoteType] = useState("internal");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Staff list for role assignment
  const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string; county: string | null; has_car: string | null; can_drive: boolean | null; phone_number: string | null }[]>([]);

  // Edit dialog reference data
  const [clientsList, setClientsList] = useState<{ id: string; name: string }[]>([]);
  const [locationsList, setLocationsList] = useState<LocationOption[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [hasTimeEntries, setHasTimeEntries] = useState(false);
  // Sprint 42 — read-only closeout review row (`shift_closeout_reports`)
  const [closeoutRow, setCloseoutRow] = useState<{
    status: string | null;
    review_status: string | null;
    final_approval_status: string | null;
  } | null>(null);
  const staffingRef = useRef<HTMLDivElement | null>(null);
  const scrollToStaffing = () => staffingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  /* P1 Command Center — la alerta abre la ETAPA exacta, no la pantalla. */
  const requestedStage = readStage(searchParams);
  const focusEmployeeId = searchParams.get("focus");
  const cameFromCommandCenter = isCommandCenterReturn(searchParams);

  useEffect(() => {
    if (loading || !shift || !requestedStage) return;
    // Se ancla después del render de la fase, por eso el frame diferido.
    const raf = requestAnimationFrame(() => {
      const target =
        (focusEmployeeId &&
          document.querySelector<HTMLElement>(`[data-employee-id="${focusEmployeeId}"]`)) ||
        document.querySelector<HTMLElement>(`[data-stage="${requestedStage}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (target && focusEmployeeId) {
        target.setAttribute("data-focused", "true");
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [loading, shift, requestedStage, focusEmployeeId]);

  useEffect(() => {
    // Reset stale state immediately when the shift or company changes, so the
    // page never renders a previous shift while the new one is loading. This
    // also forces a clean re-render of ShiftActionBar / StaffingRequiredBanner
    // so they don't carry over a "locked / blocked" badge from another shift.
    setShift(null);
    setAssignments([]);
    setTimeline([]);
    setNotes([]);
    setClientName("");
    setLocationName("");
    setLocationAddress("");
    setHasTimeEntries(false);
    setCloseoutRow(null);
    setLoading(true);
    if (shiftId && selectedCompanyId) {
      loadAll();
    }
    // location.key changes on every navigate(), so volver al mismo turno fuerza refetch
    // y evita el estado stale que requería recargar la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId, selectedCompanyId, location.key]);

  // STAFLY-CTX-001 — Operational Resume Fix.
  // Antes: focus + visibilitychange llamaban `loadAll()` que hacía
  // `setLoading(true)` y reemplazaba toda la pantalla por skeleton, perdiendo
  // formularios y scroll. Ahora coalescemos ambos eventos en una ventana
  // corta y ejecutamos un refresh en background que NO toca `loading`.
  useEffect(() => {
    if (!shiftId || !selectedCompanyId) return;
    let lastRun = 0;
    let timer: number | null = null;
    const COALESCE_MS = 1500;
    const MIN_INTERVAL_MS = 10_000;

    const scheduleRefresh = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastRun < MIN_INTERVAL_MS) return;
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        lastRun = Date.now();
        void loadAll({ background: true });
      }, COALESCE_MS);
    };

    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", scheduleRefresh);
    return () => {
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", scheduleRefresh);
      if (timer !== null) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId, selectedCompanyId]);

  // P0.1 — cualquier cambio del servicio en otra superficie refresca esta pantalla.
  useEffect(() => {
    return subscribeToServiceChanges(({ companyId, shiftId: changedId }) => {
      if (companyId === selectedCompanyId && changedId === shiftId) {
        void loadAll({ background: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, shiftId]);

  const loadAll = async (opts?: { background?: boolean }) => {
    if (!shiftId || !selectedCompanyId) return;
    const background = opts?.background === true;
    // Solo mostramos el skeleton de pantalla completa en la carga inicial.
    // Los refreshes en background mantienen el contenido montado y solo
    // muestran un indicador discreto "Actualizando…".
    if (background) setIsRefreshing(true);
    else setLoading(true);

    const [shiftRes, assignRes, timelineRes, notesRes, empsRes, clientsRes, locsRes] = await Promise.all([
      supabase.from("scheduled_shifts").select("*").eq("id", shiftId).eq("company_id", selectedCompanyId).maybeSingle(),
      supabase.from("shift_assignments").select("id, employee_id, status, assignment_role, company_id, version, employees(first_name, last_name, phone_number, county, has_car, can_drive)").eq("shift_id", shiftId) as any,
      supabase.from("shift_timeline").select("*").eq("shift_id", shiftId).order("created_at", { ascending: false }),
      supabase.from("shift_notes").select("*").eq("shift_id", shiftId).order("created_at", { ascending: false }),
      supabase.from("employees").select("id, first_name, last_name, county, has_car, can_drive, phone_number").eq("company_id", selectedCompanyId).eq("is_active", true),
      supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId).order("name"),
      supabase.from("locations").select("id, name, address, client_id").eq("company_id", selectedCompanyId).order("name"),
    ]);

    setClientsList((clientsRes.data ?? []) as any);
    setLocationsList((locsRes.data ?? []) as any);

    if (shiftRes.data) {
      const s = shiftRes.data as any;
      // P0.1 — esta pantalla ya no es dueña del servicio: publica la fila en la
      // fuente canónica y renderiza esa misma versión.
      writeServiceRow(queryClient, selectedCompanyId, s);
      setShift(s);
      // Fetch client/location names
      if (s.client_id) {
        const { data: cl } = await supabase.from("clients").select("name").eq("id", s.client_id).single();
        setClientName(cl?.name ?? "");
      }
      if (s.location_id) {
        const { data: loc } = await supabase.from("locations").select("name, address").eq("id", s.location_id).single();
        setLocationName(loc?.name ?? "");
        setLocationAddress(loc?.address ?? "");
      }
    }

    setAssignments((assignRes.data ?? []).map((a: any) => ({ ...a, employee: a.employees })));
    setTimeline((timelineRes.data ?? []) as TimelineEvent[]);
    setNotes((notesRes.data ?? []) as ShiftNote[]);
    setEmployees((empsRes.data ?? []) as any[]);

    // Read-only check: does this shift already have any time_entries?
    // Only used to soft-block edit from the action bar; never mutates anything.
    const { count: teCount } = await supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("shift_id", shiftId);
    setHasTimeEntries((teCount ?? 0) > 0);

    // Sprint 42 — read-only lifecycle row from Centro de Validación.
    // Never mutates. `maybeSingle()` because most shifts don't have a closeout yet.
    const { data: closeout } = await supabase
      .from("shift_closeout_reports")
      .select("status, review_status, final_approval_status")
      .eq("shift_id", shiftId)
      .maybeSingle();
    setCloseoutRow(closeout ?? null);

    if (background) setIsRefreshing(false);
    else setLoading(false);
  };

  const handleAddNote = async () => {
    if (!newNoteContent.trim() || !shiftId || !selectedCompanyId || !user) return;
    setSavingNote(true);
    const { error } = await supabase.from("shift_notes").insert({
      shift_id: shiftId,
      company_id: selectedCompanyId,
      note_type: newNoteType,
      content: newNoteContent.trim(),
      created_by: user.id,
    } as any);
    if (error) toast.error(error.message);
    else {
      toast.success("Nota agregada");
      // Also add to timeline
      await supabase.from("shift_timeline").insert({
        shift_id: shiftId,
        company_id: selectedCompanyId,
        event_type: "note_added",
        description: `Nota (${NOTE_TYPES.find(n => n.value === newNoteType)?.label}): ${newNoteContent.trim().slice(0, 80)}`,
        actor_id: user.id,
      } as any);
      setNewNoteContent("");
      loadAll();
    }
    setSavingNote(false);
  };

  const handleRoleChange = async (assignmentId: string, newRole: string) => {
    // P0 — VWC Fase 3D: el rol es estado compartido → carril único de transición.
    const current = (assignments as any[]).find(a => a.id === assignmentId);
    const result = await versionedAssignmentTransition({
      assignmentId,
      companyId: current?.company_id ?? selectedCompanyId,
      transition: "set_role",
      role: newRole,
      expectedStatus: current?.status ?? null,
      expectedVersion: typeof current?.version === "number" ? current.version : null,
      reason: "role_changed",
      surface: "shift_operations",
    });
    if (result.status === "conflict") {
      const copy = assignmentConflictCopy(result);
      toast.error(copy.title, { description: `${copy.fact} ${copy.action}` });
      loadAll();
      return;
    }
    if (result.status !== "applied") {
      toast.error(result.message);
      return;
    }
    toast.success("Rol actualizado");
    if (shiftId && selectedCompanyId && user) {
      await supabase.from("shift_timeline").insert({
        shift_id: shiftId,
        company_id: selectedCompanyId,
        event_type: "role_changed",
        description: `Rol cambiado a ${ROLE_LABELS[newRole]?.label ?? newRole}`,
        actor_id: user.id,
        metadata: { assignment_id: assignmentId, new_role: newRole },
      } as any);
    }
    loadAll();
  };


  const handleEditSave = async (id: string, updates: any, oldShift: any) => {
    if (oldShift.status === "locked" || oldShift.status === "archived" || oldShift.status === "cancelled") {
      toast.error("Este turno no se puede editar");
      return;
    }
    // VWC — PATCH parcial + expected_version. Nunca snapshot completo.
    const patch = buildPatch(oldShift, updates as Record<string, any>);
    if (Object.keys(patch).length === 0) { toast.info("Sin cambios"); return; }
    const saveResult = await versionedWrite({
      entity: "scheduled_shifts",
      id,
      companyId: selectedCompanyId ?? null,
      patch,
      expectedVersion: rowVersion(readServiceRow(queryClient, selectedCompanyId, id)) ?? rowVersion(oldShift),
      surface: "shift_operations",
    });
    if (saveResult.status === "conflict") {
      setServiceConflict({
        patch,
        serverRow: saveResult.row,
        actualVersion: saveResult.actualVersion,
        expectedVersion: saveResult.expectedVersion,
        updatedAt: saveResult.updatedAt,
      });
      return;
    }
    if (saveResult.status !== "applied") {
      toast.error(saveResult.status === "noop" ? "Sin cambios" : saveResult.message);
      return;
    }

    if (selectedCompanyId && user) {
      await supabase.from("shift_timeline").insert({
        shift_id: id,
        company_id: selectedCompanyId,
        event_type: "shift_edited",
        description: "Turno editado desde Centro de Operaciones",
        actor_id: user.id,
        metadata: { fields: Object.keys(updates) },
      } as any);
    }
    toast.success("Turno actualizado");
    await reconcileServiceAfterSave(queryClient, selectedCompanyId, id, saveResult.row as any);
    loadAll({ background: true });
  };
  const totalAssigned = assignments.length;
  const confirmed = assignments.filter(a => a.status === "confirmed").length;
  const pending = assignments.filter(a => a.status === "pending").length;
  const rejected = assignments.filter(a => a.status === "rejected").length;
  const driverIds = useMemo(() => {
    const s = new Set<string>();
    if (shift?.driver_employee_id) s.add(shift.driver_employee_id);
    assignments.forEach(a => {
      if (a.assignment_role === "driver" && a.employee_id) s.add(a.employee_id);
    });
    return s;
  }, [shift?.driver_employee_id, assignments]);
  const drivers = driverIds.size;
  const admins = assignments.filter(a => ["shift_admin", "shift_lead", "backup_admin", "check_in_admin"].includes(a.assignment_role)).length;
  const carsNeeded = shift?.transportation_required ? Math.ceil(totalAssigned / (shift.car_capacity || 5)) : 0;

  const handleDisableTransport = async () => {
    if (!shift) return;
    if (!window.confirm("Este turno dejará de pedir conductor. ¿Continuar?")) return;
    const result = await versionedWrite({
      entity: "scheduled_shifts",
      id: shift.id,
      companyId: selectedCompanyId ?? (shift as any).company_id ?? null,
      patch: { transportation_required: false },
      expectedVersion:
        rowVersion(readServiceRow(queryClient, selectedCompanyId, shift.id)) ?? rowVersion(shift as any),
      surface: "shift_operations_transport",
    });
    if (result.status === "conflict") {
      setServiceConflict({
        patch: { transportation_required: false },
        serverRow: result.row,
        actualVersion: result.actualVersion,
        expectedVersion: result.expectedVersion,
        updatedAt: result.updatedAt,
      });
      return;
    }
    if (result.status !== "applied") {
      toast.error(result.status === "noop" ? "Sin cambios" : result.message);
      return;
    }

    if (selectedCompanyId && user) {
      await supabase.from("shift_timeline").insert({
        shift_id: shift.id,
        company_id: selectedCompanyId,
        event_type: "shift_edited",
        description: "Requerimiento de transporte apagado",
        actor_id: user.id,
        metadata: { fields: ["transportation_required"], value: false },
      } as any);
    }
    toast.success("Requerimiento de transporte apagado");
    loadAll();
  };

  // Group assignments by normalized area (Queens/QUEENS/Queens, NY → "Queens")
  const byArea = useMemo(() => {
    const map = new Map<string, AssignmentDetail[]>();
    assignments.forEach(a => {
      const area = normalizeArea(a.employee?.county ?? "") || "Sin zona";
      if (!map.has(area)) map.set(area, []);
      map.get(area)!.push(a);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [assignments]);

  if (!shiftId) return <div className="p-8 text-center text-muted-foreground">No se especificó turno</div>;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (!shift) return (
    <div className="p-8 text-center text-muted-foreground">
      <p>Turno no encontrado</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/app/shifts")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Volver a turnos
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/shifts")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold font-heading">{shift.title}</h1>
            {displayShiftRef(shift as any) !== "—" && (
              <span className="font-mono text-[11px] text-muted-foreground">{displayShiftRef(shift as any)}</span>
            )}
            <Badge variant={shift.status === "published" ? "default" : shift.status === "locked" ? "secondary" : "outline"} className="text-[10px]">
              {shift.status}
            </Badge>
            {isRefreshing && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                aria-live="polite"
                data-testid="shift-ops-refresh-chip"
              >
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Actualizando…
              </span>
            )}
            {(() => {
              const info = getShiftPhase(shift);
              return (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    phaseChipClasses(info.tone),
                  )}
                  data-testid="shift-phase-chip"
                >
                  <Timer className="h-2.5 w-2.5" />
                  {info.label}
                </span>
              );
            })()}
            {(() => {
              const status = deriveCloseoutReviewStatus(closeoutRow, shift.date);
              const p = presentCloseoutReviewStatus(status);
              return (
                <Link
                  to={`/app/payroll-review-queue?shiftId=${encodeURIComponent(shift.id)}`}
                  title={`${p.description} · Estado leído desde Centro de Validación. No cambia payroll.`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold hover:opacity-90 transition",
                    closeoutBadgeClasses(p.tone),
                  )}
                  data-testid="closeout-review-badge"
                  data-status={status}
                >
                  <ClipboardCheck className="h-2.5 w-2.5" />
                  {p.label}
                </Link>
              );
            })()}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Centro de Operaciones del Turno
          </p>
        </div>
      </div>

      {/* Phase 1 QW#1 — Unified Shift Action Bar */}
      {selectedCompanyId && (
        <ShiftActionBar
          shift={shift as any}
          assignments={assignments as any}
          companyId={selectedCompanyId}
          userId={user?.id ?? null}
          hasTimeEntries={hasTimeEntries}
          onEdit={() => setEditOpen(true)}
          onScrollToStaffing={scrollToStaffing}
        />
      )}

      {/* Soft restriction banner — fichajes presentes pero operación sigue activa */}
      {hasTimeEntries && !["locked", "archived", "cancelled"].includes(shift.status) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-xs leading-relaxed">
            <p className="font-semibold text-amber-700 dark:text-amber-300 mb-0.5">
              Edición de datos base restringida porque ya hay fichajes.
            </p>
            <p className="text-muted-foreground">
              Puedes revisar asistencia, validar presencia, agregar notas y preparar auditoría.
            </p>
          </div>
        </div>
      )}

      {/* Sprint 40 — Phase-aware Command Center layout.
          Same components as before, reordered by shift phase so the most
          urgent block sits above the fold. UI-only, zero writes on mount. */}
      {(() => {
        const phaseInfo = getShiftPhase(shift);
        const phase = phaseInfo.phase;

        // P0 Service Location SSOT: sin booleanos inline. El resolver canónico
        // vive dentro de shift-operations-intelligence.
        const status = getShiftOperationalStatus(shift as any, assignments as any);
        const missing = getShiftMissingItems(shift as any, assignments as any);
        const risks = getShiftRisks(shift as any, assignments as any);
        const actions = getRecommendedNextActions(shift as any, assignments as any, missing, risks);
        const { recommended, pool } = buildCandidatePool(employees as any, assignments as any, locationName || null);

        const activeAssigned = assignments.filter(a => a.status !== "rejected").length;
        const shortStaffed = (shift.slots ?? 0) > activeAssigned;
        // Only surface StaffingRequiredBanner while it can still be acted on.
        const showStaffingBanner = shortStaffed && (phase === "before" || phase === "imminent" || phase === "in_progress");

        // Transport shortfall auto-elevation
        const transportShort = shift.transportation_required && drivers < carsNeeded;

        // Recent attendance validation notes (24h) — read-only, from already
        // loaded `notes`. No extra query, no writes.
        const recentValidations = notes.filter(n => {
          if (n.note_type !== "attendance_validation") return false;
          const age = Date.now() - new Date(n.created_at).getTime();
          return age <= 24 * 60 * 60 * 1000;
        });

        const attendanceEvidenceBlock = selectedCompanyId ? (
          <div data-stage="attendance" className="scroll-mt-24">
          <AttendanceEvidenceCard
            shift={{ id: shift.id, date: shift.date, start_time: shift.start_time, end_time: shift.end_time, status: shift.status }}
            assignments={assignments as any}
            companyId={selectedCompanyId}
            userId={user?.id ?? null}
          />
          </div>
        ) : null;

        const nextActionsBlock = (
          <NextActionsCard
            actions={actions}
            handlers={{
              onEditShift: () => setEditOpen(true),
              onAssignWorker: scrollToStaffing,
              onMessagePending: () => toast.info("Mensajería masiva próximamente"),
              onPublish: () => setEditOpen(true),
            }}
          />
        );

        const assignedTeamBlock = <AssignedTeamCard assignments={assignments as any} />;

        const candidatesBlock = (
          <div ref={staffingRef} data-stage="team" className="scroll-mt-24">
            <CandidatesCard
              recommended={recommended}
              pool={pool}
              shiftAreaHint={locationName || null}
              onAssign={async (employeeId) => {
                if (!shiftId || !selectedCompanyId) return;
                // Alta idempotente por RPC: nunca insertamos la tabla directo.
                const { error } = await supabase.rpc("assign_worker_to_shift" as any, {
                  p_shift_id: shiftId,
                  p_employee_id: employeeId,
                  p_assignment_role: "staff",
                  p_reason: "manual_assign",
                  p_source: "shift_operations",
                } as any);
                if (error) toast.error(error.message);
                else { toast.success("Worker asignado"); loadAll(); }
              }}
            />
          </div>
        );

        // P0 OX — terminal closure action (evaluates real time entries, never touches payroll).
        const closeoutCard = selectedCompanyId ? (
          <div data-stage="time" className="scroll-mt-24">
          <ShiftClosureCard
            companyId={selectedCompanyId}
            shiftId={shift.id}
            shiftEnded={phase === "after" || phase === "closed"}
            assignedCount={assignments.length}
            onClosed={loadAll}
          />
          </div>
        ) : null;



        const recentValidationsBanner = recentValidations.length > 0 && (phase === "in_progress" || phase === "after" || phase === "closed") ? (
          <div className="rounded-xl border border-info/25 bg-info/[0.05] px-4 py-2.5 flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-info mt-0.5 shrink-0" />
            <div className="flex-1 text-[11px] leading-relaxed">
              <p className="font-semibold text-info">
                {recentValidations.length} validación{recentValidations.length === 1 ? "" : "es"} de asistencia en las últimas 24h.
              </p>
              <p className="text-muted-foreground">
                Revisa la evidencia abajo antes de cerrar el turno o mandar a payroll.
              </p>
            </div>
          </div>
        ) : null;

        const transportAlertBanner = transportShort && (phase === "before" || phase === "imminent" || phase === "in_progress") ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/[0.05] px-4 py-2.5 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1 text-[11px] leading-relaxed">
              <p className="font-semibold text-destructive">
                Faltan {carsNeeded - drivers} conductor(es) para cubrir transporte.
              </p>
              <p className="text-muted-foreground">
                Asigna el rol "Conductor" desde staffing para cerrar la capacidad de vehículos.
              </p>
            </div>
          </div>
        ) : null;

        // Sidebar (right column) is stable across phases.
        const sidebar = (
          <div className="space-y-4">
            <MissingItemsCard items={missing} onEdit={() => setEditOpen(true)} />
            <RisksCard risks={risks} />
            <WorkerPreviewCard
              shift={shift as any}
              clientName={clientName}
              locationName={locationName}
              locationAddress={locationAddress}
            />
          </div>
        );

        // Main column ordering per phase
        let main: React.ReactNode;
        if (phase === "before") {
          main = (
            <div className="lg:col-span-2 space-y-4">
              <SmartSummaryCard status={status} />
              {nextActionsBlock}
              {candidatesBlock}
              {assignedTeamBlock}
              {attendanceEvidenceBlock}
            </div>
          );
        } else if (phase === "imminent" || phase === "in_progress") {
          main = (
            <div className="lg:col-span-2 space-y-4">
              <SmartSummaryCard status={status} />
              {attendanceEvidenceBlock}
              {assignedTeamBlock}
              {nextActionsBlock}
              {candidatesBlock}
            </div>
          );
        } else if (phase === "after") {
          main = (
            <div className="lg:col-span-2 space-y-4">
              {closeoutCard}
              {attendanceEvidenceBlock}
              <SmartSummaryCard status={status} />
              {assignedTeamBlock}
              {nextActionsBlock}
              {candidatesBlock}
            </div>
          );
        } else {
          // closed
          main = (
            <div className="lg:col-span-2 space-y-4">
              {closeoutCard}
              <SmartSummaryCard status={status} />
              {attendanceEvidenceBlock}
              {assignedTeamBlock}
            </div>
          );
        }

        return (
          <>
            {showStaffingBanner && (
              <StaffingRequiredBanner
                slots={shift.slots ?? 0}
                assigned={activeAssigned}
                pending={assignments.filter(a => a.status === "pending").length}
                rejected={assignments.filter(a => a.status === "rejected").length}
                specialInstructions={shift.special_instructions}
                isDraft={shift.status === "draft" || shift.publication_status === "draft"}
                onScrollToStaffing={scrollToStaffing}
              />
            )}
            {transportAlertBanner}
            {recentValidationsBanner}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {main}
              {sidebar}
            </div>
          </>
        );
      })()}


      {/* Detalle avanzado (legacy panels) — collapsed by default, hidden when empty */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5">
            <ChevronDown className="h-3.5 w-3.5" /> Más detalles · resumen, staff por área, transporte, cronología y notas
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>

      {/* A) Shift Summary (legacy) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Summary card */}
          <div data-stage="summary" className="rounded-2xl border border-border/40 bg-card p-5 space-y-4 scroll-mt-24">
            <h2 className="text-sm font-bold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Resumen del turno</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Fecha", value: format(new Date(shift.date + "T12:00:00"), "EEE d MMM yyyy", { locale: es }), icon: CalendarDays },
                { label: "Horario", value: `${shift.start_time.slice(0, 5)} – ${shift.end_time.slice(0, 5)}`, icon: Clock },
                { label: "Cliente", value: clientName || "—", icon: Building2 },
                { label: "Ubicación", value: locationName || "—", icon: MapPin },
              ].map(item => (
                <div key={item.label} className="rounded-xl bg-muted/30 p-3">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1"><item.icon className="h-3 w-3" />{item.label}</p>
                  <p className="text-sm font-semibold mt-0.5 truncate">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> Pago</p>
                <p className="text-sm font-semibold mt-0.5">{shift.pay_type === "daily" ? "📅 Día" : "⏱ Hora"}</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Fichaje</p>
                <p className="text-sm font-semibold mt-0.5">{shift.clock_method === "mobile" ? "📱 Móvil" : shift.clock_method === "kiosk" ? "🖥 Kiosk" : "📱🖥 Ambos"}</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Car className="h-3 w-3" /> Transporte</p>
                <p className="text-sm font-semibold mt-0.5">{shift.transportation_required ? "✅ Requerido" : "❌ No"}</p>
              </div>
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" /> Plazas</p>
                <p className="text-sm font-semibold mt-0.5">{shift.slots ?? 1}</p>
              </div>
            </div>
            {/* P1 — etapa "operación": destino, punto de encuentro, transporte. */}
            <div data-stage="operation" className="scroll-mt-24" />
            {(shift.meeting_point || shift.special_instructions || locationAddress) && (
              <div className="rounded-xl bg-primary/[0.03] border border-primary/10 p-3 space-y-1.5">
                {(shift.meeting_point || locationAddress) && (
                  <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">📍 Punto de encuentro:</span> {shift.meeting_point || locationAddress}</p>
                )}
                {shift.special_instructions && (
                  <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">📋 Instrucciones:</span> {shift.special_instructions}</p>
                )}
              </div>
            )}
          </div>

          {/* B) Staffing Board */}
          <div ref={staffingRef} data-stage="team" className="rounded-2xl border border-border/40 bg-card p-5 space-y-4 scroll-mt-24">
            <h2 className="text-sm font-bold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Staffing Board</h2>
            {/* KPI chips */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Plazas", value: shift.slots ?? 1, color: "text-foreground" },
                { label: "Asignados", value: totalAssigned, color: "text-primary" },
                { label: "Confirmados", value: confirmed, color: "text-earning" },
                { label: "Pendientes", value: pending, color: "text-warning" },
                { label: "Rechazados", value: rejected, color: "text-destructive" },
                { label: "Conductores", value: drivers, color: "text-warning" },
                { label: "Admins", value: admins, color: "text-primary" },
              ].map(k => (
                <div key={k.label} className="flex items-center gap-1.5 rounded-lg bg-muted/30 px-2.5 py-1.5">
                  <span className={cn("text-sm font-bold tabular-nums", k.color)}>{k.value}</span>
                  <span className="text-[10px] text-muted-foreground">{k.label}</span>
                </div>
              ))}
            </div>
            {/* Assignment list */}
            <div className="space-y-1.5">
              {assignments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No hay asignaciones aún</p>
              ) : assignments.map(a => {
                const emp = a.employee;
                const roleInfo = ROLE_LABELS[a.assignment_role] || ROLE_LABELS.staff;
                return (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors px-3 py-2.5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                        {emp ? `${emp.first_name[0]}${emp.last_name[0]}` : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{emp ? `${emp.first_name} ${emp.last_name}` : a.employee_id}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {emp?.phone_number && <span className="text-[10px] text-muted-foreground">{emp.phone_number}</span>}
                        {emp?.county && <span className="text-[10px] text-muted-foreground/50">• {emp.county}</span>}
                        {emp && isEmployeeDriver(emp) && <Car className="h-2.5 w-2.5 text-warning" />}
                      </div>
                    </div>
                    {/* Role selector */}
                    <Select value={a.assignment_role} onValueChange={v => handleRoleChange(a.id, v)}>
                      <SelectTrigger className={cn("h-7 text-[10px] font-semibold w-auto min-w-[110px] border rounded-lg", roleInfo.color)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Status badge */}
                    <Badge variant={a.status === "confirmed" ? "default" : a.status === "rejected" ? "destructive" : "outline"} className="text-[9px] shrink-0">
                      {a.status === "confirmed" ? "✅" : a.status === "rejected" ? "❌" : "⏳"} {a.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          {/* C) Staff by Area — assigned + unassigned pool */}
          <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
            <h2 className="text-sm font-bold flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Staff por Área</h2>
            {/* Assigned by area */}
            {byArea.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {byArea.map(([area, areaAssignments]) => (
                  <div key={area} className="rounded-xl border border-border/30 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold">{area}</p>
                      <Badge variant="secondary" className="text-[9px]">{areaAssignments.length}</Badge>
                    </div>
                    <div className="space-y-1">
                      {areaAssignments.map(a => (
                        <div key={a.id} className="flex items-center gap-2 text-[11px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          <span className="truncate">{a.employee?.first_name} {a.employee?.last_name}</span>
                          <span className="text-muted-foreground/50 ml-auto text-[9px]">{ROLE_LABELS[a.assignment_role]?.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Legacy "Disponibles para asignar" pool removed —
                "Candidatos recomendados" / "Pool de workers" arriba ya lo cubre
                con normalización de áreas y ranking. */}
          </div>
        </div>

        {/* Right column: Transport, Timeline, Notes */}
        <div className="space-y-4">
          {/* D) Transport Panel */}
          {shift.transportation_required && (
            <div className="rounded-2xl border border-warning/20 bg-warning/[0.03] p-4 space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2"><Truck className="h-4 w-4 text-warning" /> Transporte</h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-card p-2.5 border border-border/30">
                  <p className="text-[10px] text-muted-foreground">Carros necesarios</p>
                  <p className="text-lg font-bold text-warning">{carsNeeded}</p>
                </div>
                <div className="rounded-lg bg-card p-2.5 border border-border/30">
                  <p className="text-[10px] text-muted-foreground">Conductores</p>
                  <p className="text-lg font-bold">{drivers}</p>
                </div>
              </div>
              {drivers < carsNeeded && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <p className="text-[10px] text-destructive font-medium">
                    Faltan {carsNeeded - drivers} conductor(es). Asigna el rol "Conductor" al staffing.
                  </p>
                </div>
              )}
              {shift.transportation_notes && (
                <p className="text-[11px] text-muted-foreground">📝 {shift.transportation_notes}</p>
              )}
              <div className="pt-2 border-t border-warning/15 space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-[11px]"
                  onClick={handleDisableTransport}
                >
                  Apagar requerimiento de transporte
                </Button>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Usa esto si este turno no necesita vehículos coordinados.
                </p>
              </div>
            </div>
          )}

          {/* E) Timeline — auto-hidden when no events */}
          {timeline.length > 0 && (
            <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Cronología</h2>
              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                {timeline.map(evt => (
                  <div key={evt.id} className="flex gap-2.5">
                    <span className="text-sm mt-0.5 shrink-0">{EVENT_ICONS[evt.event_type] || "📌"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-foreground leading-snug">{evt.description}</p>
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                        {format(new Date(evt.created_at), "d MMM HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* F) Admin Notes — auto-hidden when no notes */}
          {notes.length > 0 && (
            <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Notas & Comunicación</h2>
              {/* Add note form */}
              <div className="space-y-2 bg-muted/20 rounded-xl p-3">
                <div className="flex gap-2">
                  <Select value={newNoteType} onValueChange={setNewNoteType}>
                    <SelectTrigger className="h-8 text-[10px] w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NOTE_TYPES.map(nt => (
                        <SelectItem key={nt.value} value={nt.value} className="text-xs">{nt.icon} {nt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={newNoteContent}
                  onChange={e => setNewNoteContent(e.target.value)}
                  placeholder="Escribe una nota..."
                  rows={2}
                  className="text-xs resize-none"
                />
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={savingNote || !newNoteContent.trim()}
                  className="w-full h-7 text-xs"
                >
                  {savingNote ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Agregar nota
                </Button>
              </div>
              {/* Notes list */}
              <div className="space-y-2 max-h-[350px] overflow-y-auto scrollbar-thin">
                {notes.map(n => {
                  const ntInfo = NOTE_TYPES.find(nt => nt.value === n.note_type);
                  return (
                    <div key={n.id} className="rounded-lg bg-muted/20 p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold">{ntInfo?.icon} {ntInfo?.label ?? n.note_type}</span>
                        <span className="text-[9px] text-muted-foreground/50">{format(new Date(n.created_at), "d MMM HH:mm", { locale: es })}</span>
                      </div>
                      <p className="text-[11px] text-foreground whitespace-pre-wrap">{n.content}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        </div>
        </CollapsibleContent>
      </Collapsible>

      <ShiftEditDialog
        shift={shift as unknown as Shift}
        open={editOpen}
        onOpenChange={setEditOpen}
        clients={clientsList}
        locations={locationsList}
        employees={employees as unknown as Employee[]}
        assignments={assignments as unknown as Assignment[]}
        onSave={handleEditSave}
      />

      <VersionConflictDialog
        open={!!serviceConflict}
        conflict={serviceConflict}
        entityLabel="este servicio"
        fieldLabels={SHIFT_FIELD_LABELS}
        onKeepMine={() => {
          if (!serviceConflict || !shift) return;
          const server = (serviceConflict.serverRow ?? shift) as any;
          const patch = serviceConflict.patch;
          setServiceConflict(null);
          void handleEditSave(shift.id, patch, { ...server, version: serviceConflict.actualVersion });
        }}
        onReload={async () => {
          if (!shift) return;
          await reconcileServiceAfterSave(queryClient, selectedCompanyId, shift.id);
          setServiceConflict(null);
          loadAll({ background: true });
        }}
        onCancel={() => setServiceConflict(null)}
      />
    </div>
  );
}

