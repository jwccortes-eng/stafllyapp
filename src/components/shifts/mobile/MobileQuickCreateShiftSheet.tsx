import { getAssignableWorkers } from "@/lib/shifts/assignable-workers";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, addDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Loader2, Check, Search, Users, X, ChevronLeft, ChevronRight,
  Building2, Clock, UserPlus, Plus, Minus, MapPin, ClipboardList,
  AlertTriangle, RotateCw, ArrowRightLeft, Hash,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  type CreateShiftDraftSnapshot,
  clearSession,
  isMeaningfulDraft,
  newSessionId,
  readSession,
  writeSession,
} from "@/lib/shifts/create-shift-session";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { notifySuccess, notifyError, notifyWarning } from "@/lib/feedback/notify";
import { SmartLocationField } from "@/components/shifts/form/SmartLocationField";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { assignWorkerToShift } from "@/lib/shifts/team-actions";
import {
  buildAssignOutcome,
  summarizeCreateResult,
  retryableOutcomes,
  type AssignOutcome,
  type CreateResultSummary,
} from "@/lib/shifts/assign-outcome";
import {
  EMPTY_DRIVER_PLAN,
  reconcileDriverPlan,
  toggleDriver,
  describeDriverPlan,
  assignmentRoleFor,
  primaryDriverId,
  driverSummaryLine,
  type DriverPlan,
} from "@/lib/shifts/driver-plan";
import type { Shift, Assignment, Employee, SelectOption } from "@/components/shifts/types";
import { useCompany } from "@/hooks/useCompany";
import { buildCreationConfirmation, type CreationConfirmation, type PersistedShiftFacts } from "@/lib/shifts/shift-ref";
import { ADMIN_LEX } from "@/lib/ox/lexicon";
import { useQueryClient } from "@tanstack/react-query";
import { reconcileServiceAfterSave, type ServiceRow } from "@/lib/shifts/service-state";


/**
 * MobileQuickCreateShiftSheet — OX-7 Fase 4 · "Create Shift, Operation First".
 *
 * El flujo sigue el pensamiento del operations manager, no el modelo de datos:
 *
 *   1. ¿Qué operación?      cliente · dónde · tipo de servicio
 *   2. ¿Cuándo?             fecha · horario
 *   3. ¿Con quién?          equipo (paso protagonista, pantalla completa)
 *   4. ¿Algo especial?      punto de encuentro · indicaciones (opcional)
 *   5. Confirmar            una sola acción
 *
 * Sin cambios de backend, RLS, payroll ni reglas de negocio: se usan las
 * mismas escrituras que ya existían (`scheduled_shifts` insert + RPC
 * `assign_worker_to_shift`, que aplica compliance y permisos server-side).
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  clients: SelectOption[];
  /** compat: las ubicaciones guardadas se resuelven en SmartLocationField */
  locations?: SelectOption[];
  requireClient: boolean;
  requireLocation: boolean;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultSlots?: number;
  /** Catálogo de personas activas para el paso "¿Con quién?" */
  employees?: Employee[];
  /** Turnos y asignaciones ya cargados: se usan para marcar ocupados ese día. */
  shifts?: Shift[];
  assignments?: Assignment[];
  onCreated: (shiftId: string, shiftDate: string) => void;
}

type StepKey = "operacion" | "cuando" | "equipo" | "extras" | "confirmar";

const STEPS: { key: StepKey; label: string; question: string }[] = [
  { key: "operacion", label: "Operación", question: "¿Qué operación vas a cubrir?" },
  { key: "cuando", label: "Cuándo", question: "¿Cuándo ocurre?" },
  { key: "equipo", label: "Equipo", question: "¿Con quién?" },
  { key: "extras", label: "Detalles", question: "¿Hace falta algo especial?" },
  { key: "confirmar", label: "Confirmar", question: "Todo listo" },
];

const SERVICE_TYPES = ["Catering", "Montaje", "Limpieza", "Cocina", "Seguridad", "Logística"];

const DURATIONS: { label: string; hours: number }[] = [
  { label: "4 h", hours: 4 },
  { label: "6 h", hours: 6 },
  { label: "8 h", hours: 8 },
  { label: "10 h", hours: 10 },
];

function toMinutes(t: string) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fromMinutes(total: number) {
  const m = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function durationHours(start: string, end: string) {
  const diff = (toMinutes(end) - toMinutes(start) + 1440) % 1440;
  return diff / 60;
}

function shortDate(iso: string) {
  try {
    return format(parseISO(iso), "EEE d MMM", { locale: es });
  } catch {
    return iso;
  }
}

function fullName(e: Employee) {
  return `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Trabajador";
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("");
}

/* ─────────── Paso 1: selector de cliente en pantalla completa ─────────── */
function ClientPickerSheet({
  open, onOpenChange, clients, value, onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: SelectOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? clients.filter(c => c.name.toLowerCase().includes(t)) : clients;
  }, [clients, q]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80dvh] rounded-t-3xl p-0 flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-border/40">
          <p className="text-base font-semibold">¿Para qué cliente?</p>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar cliente…"
              className="h-12 pl-9 text-base"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {clients.length === 0 ? "Aún no hay clientes en esta empresa." : "Sin resultados."}
            </p>
          ) : filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onChange(c.id); onOpenChange(false); setQ(""); }}
              className={cn(
                "w-full min-h-[56px] flex items-center gap-3 px-3 rounded-xl text-left active:bg-muted/60 transition-colors",
                c.id === value && "bg-primary/5",
              )}
            >
              <ClientAvatar name={c.name} clientId={c.id} size="sm" />
              <span className="text-[15px] font-medium truncate flex-1">{c.name}</span>
              {c.id === value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
        <div
          className="shrink-0 border-t border-border/40 px-5 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <Button variant="outline" className="w-full h-12" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MobileQuickCreateShiftSheet({
  open, onOpenChange, companyId, clients,
  requireClient, requireLocation,
  defaultStartTime = "09:00",
  defaultEndTime = "17:00",
  defaultSlots = 1,
  employees = [],
  shifts = [],
  assignments = [],
  onCreated,
}: Props) {
  const queryClient = useQueryClient();
  const { user, role, hasModuleAccess } = useAuth();
  const { can } = usePermissions();
  const canCreate = can("service.create");
  const navigate = useNavigate();
  const { companies, setSelectedCompanyId } = useCompany();
  const companyName = companies.find(c => c.id === companyId)?.name ?? "Empresa sin nombre";

  const todayStr = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const [step, setStep] = useState<StepKey>("operacion");
  const [clientId, setClientId] = useState("");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [serviceType, setServiceType] = useState("");
  const [jobSiteAddress, setJobSiteAddress] = useState("");
  const [jobSiteLocationId, setJobSiteLocationId] = useState<string | null>(null);

  const [date, setDate] = useState(todayStr);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);

  const [slots, setSlots] = useState<number>(Math.max(1, defaultSlots));
  const [team, setTeam] = useState<string[]>([]);
  const [teamQuery, setTeamQuery] = useState("");
  /* P0.2 — multi-driver: el backend soporta N drivers (una fila por persona en
   * shift_assignments con assignment_role='driver'). Aquí sólo se expone. */
  const [driverPlan, setDriverPlan] = useState<DriverPlan>(EMPTY_DRIVER_PLAN);

  const [meetingPoint, setMeetingPoint] = useState("");
  const [meetingPointLocationId, setMeetingPointLocationId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);

  /* ── FASE 4.1 · hardening transaccional ──
   * submitLockRef: bloquea el doble tap (el estado `saving` es asíncrono).
   * createdShiftIdRef: si el turno ya se insertó, un reintento NUNCA crea otro;
   *   sólo reintenta las asignaciones que fallaron.
   */
  const submitLockRef = useRef(false);
  const createdShiftIdRef = useRef<string | null>(null);
  const persistedRef = useRef<PersistedShiftFacts | null>(null);
  const [outcomes, setOutcomes] = useState<AssignOutcome[]>([]);
  const [result, setResult] = useState<CreateResultSummary | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  /** Confirmación basada en lo REALMENTE persistido (empresa incluida). */
  const [confirmation, setConfirmation] = useState<CreationConfirmation | null>(null);
  /** Empresa con la que se abrió el wizard: si cambia a mitad, se bloquea. */
  const lockedCompanyIdRef = useRef<string | null>(null);
  const [companyChanged, setCompanyChanged] = useState(false);

  /* ── P0 · SESIÓN DE TRABAJO ──
   * El wizard es un documento abierto, no un formulario desechable. El estado
   * vive en `sessionStorage` (aislado por pestaña, usuario y empresa). No se
   * crea ninguna entidad de negocio hasta pulsar "Crear turno".
   */
  const sessionIdRef = useRef<string>(newSessionId());
  /** Evita autoguardar antes de haber intentado restaurar (no pisar el borrador). */
  const sessionReadyRef = useRef(false);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    if (lockedCompanyIdRef.current && companyId && companyId !== lockedCompanyIdRef.current) {
      setCompanyChanged(true);
    }
  }, [companyId, open]);


  useEffect(() => {
    if (!open) return;
    sessionReadyRef.current = false;

    // Estado base de una sesión nueva.
    const applyFresh = () => {
      setStep("operacion");
      setClientId("");
      setServiceType("");
      setJobSiteAddress("");
      setJobSiteLocationId(null);
      setDate(todayStr);
      setStartTime(defaultStartTime);
      setEndTime(defaultEndTime);
      setSlots(Math.max(1, defaultSlots));
      setTeam([]);
      setDriverPlan(EMPTY_DRIVER_PLAN);
      setMeetingPoint("");
      setMeetingPointLocationId(null);
      setNotes("");
      setRestoredAt(null);
    };

    setTeamQuery("");
    setSaving(false);
    setOutcomes([]);
    setResult(null);
    setConfirmClose(false);
    setConfirmation(null);
    setCompanyChanged(false);
    lockedCompanyIdRef.current = companyId;
    submitLockRef.current = false;
    createdShiftIdRef.current = null;

    const baseline = {
      date: todayStr,
      startTime: defaultStartTime,
      endTime: defaultEndTime,
      slots: Math.max(1, defaultSlots),
    };
    const saved = readSession(user?.id, companyId);

    if (saved && isMeaningfulDraft(saved.draft, baseline)) {
      // Restauración automática: mismo usuario, misma empresa, misma pestaña.
      sessionIdRef.current = saved.sessionId;
      const d = saved.draft;
      setStep((STEPS.some(x => x.key === d.step) ? d.step : "operacion") as StepKey);
      setClientId(d.clientId);
      setServiceType(d.serviceType);
      setJobSiteAddress(d.jobSiteAddress);
      setJobSiteLocationId(d.jobSiteLocationId);
      setDate(d.date || todayStr);
      setStartTime(d.startTime || defaultStartTime);
      setEndTime(d.endTime || defaultEndTime);
      setSlots(Math.max(1, d.slots || 1));
      setTeam(d.team);
      setDriverPlan({
        transportRequired: d.transportRequired,
        driversRequired: d.driversRequired,
        driverIds: d.driverIds.filter(id => d.team.includes(id)),
      });
      setMeetingPoint(d.meetingPoint);
      setMeetingPointLocationId(d.meetingPointLocationId);
      setNotes(d.notes);
      setRestoredAt(saved.updatedAt);
    } else {
      sessionIdRef.current = newSessionId();
      applyFresh();
    }

    sessionReadyRef.current = true;
    // `companyId` queda fuera de deps a propósito: se fija al abrir y un cambio
    // posterior debe BLOQUEAR el wizard, no reiniciarlo en silencio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, todayStr, defaultStartTime, defaultEndTime, defaultSlots]);

  /** Foto actual del documento. */
  const draftSnapshot: CreateShiftDraftSnapshot = useMemo(() => ({
    step,
    clientId,
    serviceType,
    jobSiteAddress,
    jobSiteLocationId,
    date,
    startTime,
    endTime,
    slots,
    team,
    driverIds: driverPlan.driverIds,
    transportRequired: driverPlan.transportRequired,
    driversRequired: driverPlan.driversRequired,
    meetingPoint,
    meetingPointLocationId,
    notes,
  }), [
    step, clientId, serviceType, jobSiteAddress, jobSiteLocationId,
    date, startTime, endTime, slots, team, driverPlan,
    meetingPoint, meetingPointLocationId, notes,
  ]);

  /* Autoguardado local. Nunca escribe en base de datos. */
  useEffect(() => {
    if (!open || !sessionReadyRef.current) return;
    if (result || saving) return; // ya no es un documento en edición
    if (companyChanged) return;   // empresa distinta: no contaminar el borrador
    const baseline = {
      date: todayStr,
      startTime: defaultStartTime,
      endTime: defaultEndTime,
      slots: Math.max(1, defaultSlots),
    };
    // Un documento en blanco no se guarda: no queremos "restaurar" la nada.
    if (!isMeaningfulDraft(draftSnapshot, baseline)) {
      clearSession(user?.id, lockedCompanyIdRef.current ?? companyId);
      return;
    }
    writeSession({
      sessionId: sessionIdRef.current,
      userId: user?.id,
      companyId: lockedCompanyIdRef.current ?? companyId,
      draft: draftSnapshot,
    });
  }, [open, draftSnapshot, result, saving, companyChanged, user?.id, companyId, todayStr, defaultStartTime, defaultEndTime, defaultSlots]);

  /** Limpieza total de la sesión local (crear o descartar). */
  const endSession = () => {
    clearSession(user?.id, lockedCompanyIdRef.current ?? companyId);
    sessionReadyRef.current = false;
    sessionIdRef.current = newSessionId();
    setRestoredAt(null);
  };


  const client = useMemo(() => clients.find(c => c.id === clientId) ?? null, [clients, clientId]);
  const hasJobSite = !!(jobSiteLocationId || jobSiteAddress.trim());
  const timesInvalid = !startTime || !endTime || toMinutes(startTime) === toMinutes(endTime);

  /* ── Personas: ocupadas ese mismo día (informativo, no bloquea) ── */
  const busyIds = useMemo(() => {
    const sameDay = new Set(shifts.filter(s => s.date === date).map(s => s.id));
    const set = new Set<string>();
    assignments.forEach(a => {
      if (sameDay.has(a.shift_id) && !["removed", "rejected"].includes(a.status)) {
        set.add(a.employee_id);
      }
    });
    return set;
  }, [shifts, assignments, date]);

  const roster = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    // Contrato canónico único de trabajadores asignables.
    const list = getAssignableWorkers(employees);
    const matched = q
      ? list.filter(e => fullName(e).toLowerCase().includes(q))
      : list;
    return [...matched].sort((a, b) => {
      const sa = (team.includes(a.id) ? 0 : 1) - 0 + (busyIds.has(a.id) ? 2 : 0);
      const sb = (team.includes(b.id) ? 0 : 1) - 0 + (busyIds.has(b.id) ? 2 : 0);
      if (sa !== sb) return sa - sb;
      return fullName(a).localeCompare(fullName(b));
    });
  }, [employees, teamQuery, team, busyIds]);

  const coverage = slots > 0 ? Math.min(100, Math.round((team.length / slots) * 100)) : 0;

  /* ── Validación por paso (misma semántica que antes, sin bloqueos nuevos) ── */
  const stepIndex = STEPS.findIndex(s => s.key === step);
  const stepBlocker: string | null = (() => {
    if (!companyId) return "Selecciona una empresa antes de crear un turno.";
    if (!canCreate) return "No tienes permiso para crear turnos en esta empresa.";
    if (step === "operacion") {
      if (requireClient && !clientId) return "Elige el cliente de esta operación.";
      if (requireLocation && !hasJobSite) return "Indica dónde ocurre el trabajo.";
      return null;
    }
    if (step === "cuando") {
      if (!date) return "Elige la fecha.";
      if (timesInvalid) return "La hora de inicio y fin no pueden ser iguales.";
      return null;
    }
    if (step === "equipo" && slots < 1) return "Necesitas al menos una persona.";
    return null;
  })();

  const goNext = () => {
    if (stepBlocker) return;
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.key);
  };
  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.key);
    else requestClose();
  };

  /** Hay trabajo del operador que se perdería al cerrar. */
  const isDirty =
    !!clientId || !!serviceType || !!jobSiteAddress.trim() || !!jobSiteLocationId ||
    team.length > 0 || !!meetingPoint.trim() || !!notes.trim() ||
    date !== todayStr || startTime !== defaultStartTime || endTime !== defaultEndTime;

  function requestClose() {
    if (saving) return;
    if (result) { onOpenChange(false); return; }
    if (isDirty) { setConfirmClose(true); return; }
    onOpenChange(false);
  }


  const toggleWorker = (id: string) => {
    setTeam(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      setDriverPlan(p => reconcileDriverPlan(p, next));
      return next;
    });
  };

  const toggleDriverFor = (id: string) => {
    setDriverPlan(p => toggleDriver(p, id, team));
  };

  const driverStatus = describeDriverPlan(driverPlan);

  const shiftTitle = useMemo(() => {
    const parts = [serviceType || "Turno", client?.name].filter(Boolean);
    return parts.join(" · ");
  }, [serviceType, client]);

  /**
   * Ejecuta las asignaciones de forma secuencial y devuelve el resultado
   * por persona. La RPC es la única autoridad (compliance/permisos).
   */
  const runAssignments = async (shiftId: string, ids: string[]): Promise<AssignOutcome[]> => {
    const out: AssignOutcome[] = [];
    for (const employeeId of ids) {
      const person = employees.find(x => x.id === employeeId);
      const name = person ? fullName(person) : "Trabajador";
      try {
        await assignWorkerToShift({
          shiftId,
          employeeId,
          assignmentRole: assignmentRoleFor(driverPlan, employeeId),
          source: "mobile_create_shift",
        });
        out.push(buildAssignOutcome(employeeId, name, null));
      } catch (e) {
        out.push(buildAssignOutcome(employeeId, name, e));
      }
    }
    return out;
  };

  const handleCreate = async () => {
    if (!companyId || submitLockRef.current || stepBlocker) return;
    // Nunca se crea con una empresa distinta a la que abrió el wizard.
    if (companyChanged && !createdShiftIdRef.current) return;
    submitLockRef.current = true;
    setSaving(true);
    try {
      // Idempotencia: si el turno ya existe (reintento tras fallo parcial),
      // NO se vuelve a insertar.
      let shiftId = createdShiftIdRef.current;

      if (!shiftId) {
        const insertData: any = {
          company_id: companyId,
          title: shiftTitle,
          date,
          start_time: startTime,
          end_time: endTime,
          slots,
          client_id: clientId || null,
          job_site_address: jobSiteAddress.trim() || null,
          job_site_location_id: jobSiteLocationId || null,
          meeting_point: meetingPoint.trim() || null,
          meeting_point_location_id: meetingPointLocationId || null,
          notes: notes.trim() || null,
          created_by: user?.id ?? null,
          status: "published",
          publication_status: "published",
          published_at: new Date().toISOString(),
          published_by: user?.id ?? null,
          claimable: false,
          // Transporte: driver_employee_id es sólo el driver PRINCIPAL (legado).
          // Los demás drivers viven en shift_assignments con role='driver'.
          transportation_required: driverPlan.transportRequired,
          driver_employee_id: primaryDriverId(driverPlan),
        };

        const { data, error } = await supabase
          .from("scheduled_shifts")
          .insert(insertData)
          .select("*")
          .single();
        if (error) throw error;
        const row: any = data;
        persistedRef.current = {
          shiftId: row.id as string,
          companyId: row.company_id as string,
          shiftRef: (row.shift_ref ?? null) as string | null,
          title: row.title as string,
          date: row.date as string,
          startTime: row.start_time as string,
          endTime: row.end_time as string,
          slots: Number(row.slots ?? slots),
        };
        shiftId = data!.id as string;
        createdShiftIdRef.current = shiftId;
      }

      // Sólo se intentan las personas que aún no están resueltas: evita duplicar.
      const pendingIds = outcomes.length > 0
        ? retryableOutcomes(outcomes).map(o => o.employeeId)
        : team;

      const fresh = await runAssignments(shiftId, pendingIds);
      const merged: AssignOutcome[] = [
        ...outcomes.filter(o => !pendingIds.includes(o.employeeId)),
        ...fresh,
      ];
      const ordered = team
        .map(id => merged.find(o => o.employeeId === id))
        .filter(Boolean) as AssignOutcome[];

      setOutcomes(ordered);
      const summary = summarizeCreateResult(ordered, team.length);
      setResult(summary);
      // El documento dejó de existir: el turno ya es real. Limpieza inmediata.
      endSession();

      // Confirmación con la empresa REALMENTE persistida, nunca la asumida.
      const persisted = persistedRef.current;
      const conf = persisted
        ? buildCreationConfirmation({
            persisted,
            expectedCompanyId: lockedCompanyIdRef.current ?? companyId,
            companyNameById: (id) => companies.find(c => c.id === id)?.name ?? null,
            assignedCount: summary.okCount,
            requestedCount: team.length,
          })
        : null;
      setConfirmation(conf);

      // Auditoría: siempre refleja el resultado real, incluidos los fallos.
      try {
        await supabase.rpc("log_activity_detailed", {
          _action: "publicar_turno",
          _entity_type: "scheduled_shift",
          _entity_id: shiftId,
          _company_id: companyId,
          _details: {
            source: "mobile_create_shift_flow",
            result: summary.kind,
            requested: team.length,
            assigned: summary.okCount,
            drivers_required: driverPlan.driversRequired,
            drivers_selected: driverPlan.driverIds.length,
            drivers_assigned: ordered.filter(o => o.ok && driverPlan.driverIds.includes(o.employeeId)).length,
            shift_ref: persisted?.shiftRef ?? null,
            persisted_company_id: persisted?.companyId ?? null,
            failed: ordered.filter(o => !o.ok).map(o => ({ employee_id: o.employeeId, code: o.code })),
          },
          _old_data: null,
          _new_data: {
            title: shiftTitle, date, start_time: startTime, end_time: endTime,
            slots, publication_status: "published",
          },
        } as any);
      } catch { /* no bloqueante */ }

      // La confirmación no es el final del guardado: primero reconciliamos la
      // misma fuente canónica que consumen detalle, listas y calendario.
      await reconcileServiceAfterSave(
        queryClient,
        companyId,
        shiftId,
        persistedRef.current ? ({
          id: shiftId,
          company_id: persistedRef.current.companyId,
          shift_ref: persistedRef.current.shiftRef,
          title: persistedRef.current.title,
          date: persistedRef.current.date,
          start_time: persistedRef.current.startTime,
          end_time: persistedRef.current.endTime,
          slots: persistedRef.current.slots,
        } as ServiceRow) : null,
      );
      onCreated(shiftId, date);

      if (summary.kind === "created_partial") {
        notifyWarning({
          title: summary.title,
          fact: summary.fact,
          consequence: "El turno ya está publicado; revisa quién quedó fuera.",
          key: "create-shift",
        });
      } else {
        notifySuccess({
          title: conf?.title ?? summary.title,
          fact: `${conf?.refLabel ?? ""} · ${shiftTitle} · ${shortDate(date)} ${startTime}–${endTime}.`.replace(/^ · /, ""),
          consequence: conf ? `Quedó en ${conf.companyName}. ${summary.fact}` : summary.fact,
          key: "create-shift",
        });
      }
      // El sheet permanece abierto en la pantalla de confirmación: el operador
      // ve el número del turno y la empresa antes de salir.
    } catch (e: any) {
      const created = !!createdShiftIdRef.current;
      notifyError({
        title: created ? "El turno se creó, pero el equipo no" : "No se pudo crear el turno",
        fact: created
          ? "El turno está publicado; las asignaciones quedaron pendientes."
          : "El turno no se guardó y no se asignó a nadie.",
        consequence: "Reintentar no crea un turno duplicado.",
        action: { label: "Reintentar", onClick: () => { void handleCreate(); } },
        cause: e,
        key: "create-shift",
      });
    } finally {
      submitLockRef.current = false;
      setSaving(false);
    }
  };


  const current = STEPS[stepIndex];
  const isTeamStep = step === "equipo";
  const canRetryAssignments = retryableOutcomes(outcomes).length > 0;

  /* ── Pantalla de confirmación + resultado por persona ── */
  const resultView = result ? (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {confirmation && (
        <div className={cn(
          "rounded-2xl border p-4",
          confirmation.kind === "context_mismatch"
            ? "border-status-warning/40 bg-status-warning/5"
            : "border-status-success/40 bg-status-success/5",
        )}>
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {confirmation.kind === "context_mismatch"
              ? <AlertTriangle className="h-4 w-4 text-status-warning shrink-0" />
              : <Check className="h-4 w-4 text-status-success shrink-0" />}
            {confirmation.title}
          </p>
          <p className="mt-2 flex items-center gap-2 text-[20px] font-bold tracking-tight">
            <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
            {confirmation.refLabel}
          </p>
          <p className="mt-1 flex items-center gap-2 text-[13px] font-medium">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {confirmation.companyName}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">{confirmation.scheduleLine}</p>
          <p className="text-[13px] text-muted-foreground">{confirmation.teamLine}</p>
          {confirmation.warning && (
            <p className="mt-2 text-[13px] font-medium text-status-warning">{confirmation.warning}</p>
          )}
        </div>
      )}

      {result.kind === "created_partial" && (
        <div className="rounded-2xl border border-status-warning/40 bg-status-warning/5 p-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <AlertTriangle className="h-4 w-4 text-status-warning shrink-0" />
            {result.title}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">{result.fact}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            El turno ya está publicado. Nada de esto afecta payroll.
          </p>
        </div>
      )}


      {outcomes.length > 0 && (
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
        {outcomes.map(o => (
          <div key={o.employeeId} className="flex items-start gap-3 px-4 py-3">
            <span className={cn(
              "h-9 w-9 rounded-full inline-flex items-center justify-center text-xs font-bold shrink-0",
              o.ok ? "bg-status-success/15 text-status-success" : "bg-status-warning/15 text-status-warning",
            )}>
              {o.ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium break-words">
                {o.name}
                {driverPlan.driverIds.includes(o.employeeId) && (
                  <span className="ml-2 align-middle rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    Driver
                  </span>
                )}
              </span>
              <span className="block text-[13px] text-muted-foreground break-words">{o.reason}</span>
              {!o.ok && (
                <span className="mt-0.5 block text-[13px] font-medium break-words">{o.nextAction}</span>
              )}
            </span>
          </div>
        ))}
      </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (v) onOpenChange(true); else requestClose(); }}>

        <SheetContent
          side="bottom"
          className="h-[95dvh] rounded-t-3xl p-0 flex flex-col overflow-hidden gap-0"
        >
          {/* Cabecera: misión, no formulario */}
          <div className="shrink-0 px-4 pt-3 pb-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              {!result ? (
                <button
                  type="button"
                  onClick={goBack}
                  aria-label="Volver"
                  className="h-11 w-11 -ml-2 rounded-full inline-flex items-center justify-center active:bg-muted"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : <span className="h-11 w-11 -ml-2" />}
              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold truncate">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{companyName}</span>
                  <span className="shrink-0">· {result ? "Resultado" : `Paso ${stepIndex + 1}/${STEPS.length}`}</span>
                </p>
                <h2 className="text-[17px] font-bold leading-tight truncate">
                  {result
                    ? (confirmation?.kind === "context_mismatch" ? "Revisa dónde quedó el turno" : "Turno creado")
                    : current.question}
                </h2>
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Cerrar"
                className="h-11 w-11 -mr-2 rounded-full inline-flex items-center justify-center active:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Progreso */}
            <div className="mt-2.5 flex gap-1">
              {STEPS.map((s, i) => (
                <span
                  key={s.key}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    result || i <= stepIndex ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>
          </div>

          {result ? resultView : (
          <div className={cn("flex-1 overflow-y-auto", isTeamStep ? "px-0 py-0" : "px-4 py-4 space-y-5")}>

            {/* P0 · sesión restaurada: el operador vuelve a su documento, no a un formulario vacío. */}
            {restoredAt && (
              <div className={cn(
                "flex items-start gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-3.5 py-3",
                isTeamStep && "mx-4 mt-4",
              )}>
                <RotateCw className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">Seguimos donde lo dejaste</p>
                  <p className="text-[12px] text-muted-foreground">
                    Nada se ha creado todavía. Se guarda en esta pestaña hasta que pulses "Crear turno".
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmClose(true)}
                  className="shrink-0 h-11 px-3 -my-1 text-[12px] font-semibold text-muted-foreground active:text-foreground"
                >
                  Descartar
                </button>
              </div>
            )}



            {/* ── PASO 1 · ¿Qué operación? ── */}
            {step === "operacion" && (
              <>
                <button
                  type="button"
                  onClick={() => setClientPickerOpen(true)}
                  className="w-full min-h-[64px] rounded-2xl border border-border/60 bg-card px-4 flex items-center gap-3 text-left active:bg-muted/50 transition-colors"
                >
                  {client ? <ClientAvatar name={client.name} clientId={client.id} size="sm" /> : (
                    <span className="h-9 w-9 rounded-full bg-muted inline-flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] text-muted-foreground">
                      Cliente {requireClient && <span className="text-destructive">*</span>}
                    </span>
                    <span className="block text-[15px] font-semibold truncate">
                      {client?.name ?? "Elegir cliente"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>

                <div className="space-y-2">
                  <Label className="text-[13px] flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    Dónde ocurre {requireLocation && <span className="text-destructive">*</span>}
                  </Label>
                  <SmartLocationField
                    companyId={companyId}
                    kind="job_site"
                    title="Dirección del trabajo"
                    helper="Pega la dirección que te envió el cliente o usa una ubicación guardada."
                    freeTextValue={jobSiteAddress}
                    savedLocationId={jobSiteLocationId}
                    onFreeText={setJobSiteAddress}
                    onSavedLocation={(id) => {
                      setJobSiteLocationId(id);
                      if (id) setJobSiteAddress("");
                    }}
                    placeholder="Ej. 1601 Broadway, New York"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px]">Tipo de servicio</Label>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_TYPES.map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setServiceType(prev => prev === t ? "" : t)}
                        className={cn(
                          "min-h-[44px] px-4 rounded-full border text-sm font-medium transition-colors",
                          serviceType === t
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border/60 bg-card active:bg-muted",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={SERVICE_TYPES.includes(serviceType) ? "" : serviceType}
                    onChange={e => setServiceType(e.target.value)}
                    placeholder="U otro nombre para la operación…"
                    className="h-12 text-base"
                  />
                </div>
              </>
            )}

            {/* ── PASO 2 · ¿Cuándo? ── */}
            {step === "cuando" && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map(offset => {
                    const iso = format(addDays(new Date(), offset), "yyyy-MM-dd");
                    const label = offset === 0 ? "Hoy" : offset === 1 ? "Mañana" : shortDate(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setDate(iso)}
                        className={cn(
                          "min-h-[56px] rounded-2xl border text-sm font-semibold capitalize transition-colors",
                          date === iso
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border/60 bg-card active:bg-muted",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Otra fecha</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="h-12 text-base"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Entrada</Label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Salida</Label>
                    <Input
                      type="time"
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                      className="h-12 text-base"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px]">Duración</Label>
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map(d => {
                      const active = Math.abs(durationHours(startTime, endTime) - d.hours) < 0.01;
                      return (
                        <button
                          key={d.hours}
                          type="button"
                          onClick={() => setEndTime(fromMinutes(toMinutes(startTime) + d.hours * 60))}
                          className={cn(
                            "min-h-[44px] px-4 rounded-full border text-sm font-medium transition-colors",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border/60 bg-card active:bg-muted",
                          )}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {timesInvalid
                      ? "Ajusta el horario: inicio y fin no pueden coincidir."
                      : `${durationHours(startTime, endTime).toFixed(1).replace(".0", "")} h de operación`}
                  </p>
                </div>
              </>
            )}

            {/* ── PASO 3 · ¿Con quién? (protagonista) ── */}
            {isTeamStep && (
              <div className="flex flex-col h-full">
                <div className="shrink-0 px-4 pt-3 pb-3 space-y-3 border-b border-border/40 bg-card/40">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold">
                        {team.length} de {slots} {slots === 1 ? "persona" : "personas"}
                      </p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            coverage >= 100 ? "bg-status-success" : coverage > 0 ? "bg-status-warning" : "bg-muted-foreground/30",
                          )}
                          style={{ width: `${coverage}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Menos plazas"
                        onClick={() => setSlots(s => Math.max(1, s - 1))}
                        className="h-11 w-11 rounded-xl border border-border/60 inline-flex items-center justify-center active:bg-muted"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-base font-bold tabular-nums">{slots}</span>
                      <button
                        type="button"
                        aria-label="Más plazas"
                        onClick={() => setSlots(s => s + 1)}
                        className="h-11 w-11 rounded-xl border border-border/60 inline-flex items-center justify-center active:bg-muted"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                    <Input
                      value={teamQuery}
                      onChange={e => setTeamQuery(e.target.value)}
                      placeholder="Buscar persona…"
                      className="h-12 pl-9 text-base"
                    />
                  </div>

                  {/* P0.2 · Transporte y drivers (varios drivers permitidos) */}
                  <div className="rounded-2xl border border-border/60 bg-card px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold">Drivers necesarios</span>
                        <span className={cn(
                          "block text-[12px]",
                          driverStatus.tone === "warning" ? "text-status-warning"
                            : driverStatus.tone === "success" ? "text-status-success"
                              : "text-muted-foreground",
                        )}>
                          {driverStatus.counterLabel}
                        </span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Menos drivers"
                          onClick={() => setDriverPlan(p => {
                            const next = Math.max(0, p.driversRequired - 1);
                            return { ...p, driversRequired: next, transportRequired: next > 0 || p.driverIds.length > 0 };
                          })}
                          className="h-11 w-11 rounded-xl border border-border/60 inline-flex items-center justify-center active:bg-muted"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center text-base font-bold tabular-nums">{driverPlan.driversRequired}</span>
                        <button
                          type="button"
                          aria-label="Más drivers"
                          onClick={() => setDriverPlan(p => ({ ...p, driversRequired: p.driversRequired + 1, transportRequired: true }))}
                          className="h-11 w-11 rounded-xl border border-border/60 inline-flex items-center justify-center active:bg-muted"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {driverPlan.driversRequired > 0 && (
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {driverStatus.hint} Marca “Driver” en cada persona que conduce.
                      </p>
                    )}
                  </div>
                </div>


                <div className="flex-1 overflow-y-auto px-2 py-2">
                  {roster.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                      <Users className="h-6 w-6 mx-auto text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        {employees.length === 0
                          ? "No hay personas activas en esta empresa."
                          : "Nadie coincide con esa búsqueda."}
                      </p>
                    </div>
                  ) : roster.map(e => {
                    const name = fullName(e);
                    const selected = team.includes(e.id);
                    const busy = busyIds.has(e.id);
                    const isDriver = driverPlan.driverIds.includes(e.id);
                    return (
                      <div
                        key={e.id}
                        className={cn(
                          "w-full min-h-[60px] flex items-center gap-2 pr-2 rounded-2xl transition-colors",
                          selected && "bg-primary/5",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleWorker(e.id)}
                          className="flex-1 min-w-0 min-h-[60px] flex items-center gap-3 px-3 text-left rounded-2xl active:bg-muted/60"
                        >
                          <span className={cn(
                            "h-10 w-10 rounded-full inline-flex items-center justify-center text-xs font-bold shrink-0",
                            selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                          )}>
                            {selected ? <Check className="h-4 w-4" /> : initials(name)}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[15px] font-medium truncate">{name}</span>
                            <span className={cn(
                              "block text-[12px]",
                              busy ? "text-status-warning" : "text-muted-foreground",
                            )}>
                              {busy ? "Ya tiene turno ese día" : "Disponible"}
                              {isDriver && " · conduce"}
                            </span>
                          </span>
                        </button>
                        {selected && (
                          <button
                            type="button"
                            aria-pressed={isDriver}
                            aria-label={isDriver ? `Quitar driver a ${name}` : `Marcar a ${name} como driver`}
                            onClick={() => toggleDriverFor(e.id)}
                            className={cn(
                              "shrink-0 h-11 min-w-[64px] px-3 rounded-xl border text-[12px] font-semibold inline-flex items-center justify-center active:bg-muted",
                              isDriver
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border/60 text-muted-foreground",
                            )}
                          >
                            Driver
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── PASO 4 · ¿Algo especial? ── */}
            {step === "extras" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Todo esto es opcional. Si no aplica, continúa.
                </p>
                <div className="space-y-2">
                  <Label className="text-[13px]">Punto de encuentro</Label>
                  <SmartLocationField
                    companyId={companyId}
                    kind="meeting_point"
                    title="Punto de encuentro"
                    helper="Lugar donde el equipo se reúne antes del job site."
                    freeTextValue={meetingPoint}
                    savedLocationId={meetingPointLocationId}
                    onFreeText={setMeetingPoint}
                    onSavedLocation={(id, addr) => {
                      setMeetingPointLocationId(id);
                      setMeetingPoint(addr ?? (id ? meetingPoint : ""));
                    }}
                    placeholder="Ej. Chase Bank 74 & Roosevelt"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] flex items-center gap-1.5">
                    <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                    Indicaciones para el equipo
                  </Label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Ej. Entrar por la puerta lateral, uniforme negro…"
                    rows={4}
                    className="text-base"
                  />
                </div>
              </>
            )}

            {/* ── PASO 5 · Confirmar ── */}
            {step === "confirmar" && (
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <SummaryRow
                  icon={<Building2 className="h-4 w-4" />}
                  label="Cliente"
                  value={client?.name ?? "Sin cliente"}
                  hint={serviceType || undefined}
                  onEdit={() => setStep("operacion")}
                />
                <SummaryRow
                  icon={<Clock className="h-4 w-4" />}
                  label="Horario"
                  value={`${shortDate(date)} · ${startTime}–${endTime}`}
                  hint={`${durationHours(startTime, endTime).toFixed(1).replace(".0", "")} h`}
                  onEdit={() => setStep("cuando")}
                />
                <SummaryRow
                  icon={<UserPlus className="h-4 w-4" />}
                  label="Equipo"
                  value={team.length === 0
                    ? "Sin asignar todavía"
                    : `${team.length} ${team.length === 1 ? "persona" : "personas"}`}
                  hint={`Cobertura ${coverage}% de ${slots}`}
                  tone={team.length >= slots ? "success" : "warning"}
                  onEdit={() => setStep("equipo")}
                />
                <SummaryRow
                  icon={<Users className="h-4 w-4" />}
                  label="Transporte"
                  value={driverSummaryLine(driverPlan)}
                  hint={driverPlan.driversRequired > 0 ? driverStatus.hint : undefined}
                  tone={driverPlan.driversRequired === 0
                    ? undefined
                    : driverStatus.incomplete ? "warning" : "success"}
                  onEdit={() => setStep("equipo")}
                  last
                />

              </div>
            )}
          </div>
          )}

          {/* Footer: una sola acción */}
          <div
            className="shrink-0 border-t border-border/40 bg-background/95 backdrop-blur-sm px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
          >
            {result ? (
              <div className="space-y-2">
                {canRetryAssignments && (
                  <Button
                    variant="outline"
                    className="w-full h-12 text-base font-semibold rounded-2xl"
                    disabled={saving}
                    onClick={handleCreate}
                  >
                    {saving
                      ? <Loader2 className="h-5 w-5 animate-spin" />
                      : <><RotateCw className="h-4 w-4 mr-2" />Reintentar los que fallaron</>}
                  </Button>
                )}
                {confirmation?.kind === "context_mismatch" && (
                  <Button
                    variant="outline"
                    className="w-full h-12 text-base font-semibold rounded-2xl"
                    onClick={() => {
                      setSelectedCompanyId(confirmation.companyId);
                      onOpenChange(false);
                    }}
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Cambiar a {confirmation.companyName}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full h-12 text-base font-semibold rounded-2xl"
                  disabled={saving}
                  onClick={() => {
                    const id = createdShiftIdRef.current;
                    onOpenChange(false);
                    if (id) navigate(`/app/shifts?shift=${id}&manageTeam=1`);
                  }}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Operar equipo
                </Button>
                <Button
                  className="w-full h-14 text-base font-semibold rounded-2xl"
                  disabled={saving}
                  onClick={() => {
                    const id = createdShiftIdRef.current;
                    onOpenChange(false);
                    if (id) navigate(`/app/shifts?shift=${id}`);
                  }}
                >
                  Ver turno
                </Button>
              </div>
            ) : (
              <>
                {stepBlocker && (
                  <p className="text-xs text-destructive mb-2">{stepBlocker}</p>
                )}
                {step === "confirmar" ? (
                  <Button
                    className="w-full h-14 text-base font-semibold rounded-2xl"
                    disabled={saving || !!stepBlocker}
                    onClick={handleCreate}
                  >
                    {saving
                      ? <Loader2 className="h-5 w-5 animate-spin" />
                      : driverPlan.driverIds.length > 0
                        ? `Crear turno y confirmar ${driverPlan.driverIds.length} ${driverPlan.driverIds.length === 1 ? "driver" : "drivers"}`
                        : `Crear ${ADMIN_LEX.entity}`}
                  </Button>
                ) : (
                  <Button
                    className="w-full h-14 text-base font-semibold rounded-2xl"
                    disabled={!!stepBlocker}
                    onClick={goNext}
                  >
                    {isTeamStep && team.length === 0 ? "Continuar sin equipo" : "Continuar"}
                    <ChevronRight className="h-5 w-5 ml-1" />
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Confirmación de cierre con cambios sin guardar */}
          {/* Cambio de empresa a mitad del wizard: se bloquea, nunca silencioso */}
          {companyChanged && !result && (
            <div className="absolute inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-end">
              <div
                className="w-full rounded-t-3xl border-t border-border/60 bg-card p-5 space-y-3"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
              >
                <p className="flex items-center gap-2 text-[17px] font-bold">
                  <ArrowRightLeft className="h-4 w-4 text-status-warning shrink-0" />
                  Cambió la empresa activa
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Este turno se estaba armando para otra empresa. No se creó nada.
                  Para evitar crearlo en el lugar equivocado, cierra y empieza de nuevo.
                </p>
                <Button
                  className="w-full h-12 rounded-2xl"
                  onClick={() => { setCompanyChanged(false); onOpenChange(false); }}
                >
                  Cerrar y empezar de nuevo
                </Button>
              </div>
            </div>
          )}

          {confirmClose && (
            <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end">
              <div
                className="w-full rounded-t-3xl border-t border-border/60 bg-card p-5 space-y-3"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
              >
                <p className="text-[17px] font-bold">¿Salir de este turno?</p>
                <p className="text-[13px] text-muted-foreground">
                  Todavía no se ha creado nada. Puedes salir y volver: lo que llevas escrito
                  te espera en esta pestaña. Si lo descartas, se borra.
                </p>
                <Button
                  variant="outline"
                  className="w-full h-12 rounded-2xl"
                  onClick={() => setConfirmClose(false)}
                >
                  Seguir editando
                </Button>
                <Button
                  className="w-full h-12 rounded-2xl"
                  onClick={() => { setConfirmClose(false); onOpenChange(false); }}
                >
                  Salir y guardar para después
                </Button>
                <Button
                  variant="destructive"
                  className="w-full h-12 rounded-2xl"
                  onClick={() => { endSession(); setConfirmClose(false); onOpenChange(false); }}
                >
                  Descartar el turno
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ClientPickerSheet
        open={clientPickerOpen}
        onOpenChange={setClientPickerOpen}
        clients={clients}
        value={clientId}
        onChange={setClientId}
      />

    </>
  );
}

function SummaryRow({
  icon, label, value, hint, onEdit, tone, last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  onEdit: () => void;
  tone?: "success" | "warning";
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "w-full min-h-[64px] flex items-center gap-3 px-4 text-left active:bg-muted/50 transition-colors",
        !last && "border-b border-border/40",
      )}
    >
      <span className="h-9 w-9 rounded-full bg-muted inline-flex items-center justify-center text-muted-foreground shrink-0">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] text-muted-foreground">{label}</span>
        <span className="block text-[15px] font-semibold truncate">{value}</span>
      </span>
      {hint && (
        <span className={cn(
          "text-[12px] font-medium shrink-0",
          tone === "success" ? "text-status-success"
            : tone === "warning" ? "text-status-warning"
              : "text-muted-foreground",
        )}>
          {hint}
        </span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}
