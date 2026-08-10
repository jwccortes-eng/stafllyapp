import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import {
  ShiftFormFields,
  EMPTY_SHIFT_FORM_STATE,
  shiftToFormState,
  formStateToShiftPayload,
  useShiftFormSignals,
  type ShiftFormState,
  type LocationOption,
} from "./ShiftFormFields";
import { ShiftFormShell } from "./ShiftFormShell";
import { WorkspaceSummary } from "./workspace/WorkspaceSummary";
import { ShiftDraftBanner, ShiftDraftStatusPill } from "./ShiftDraftBanner";
import { useShiftDraftAutosave } from "@/hooks/useShiftDraftAutosave";
import { syncShiftDriverRoles, driverIdsFromAssignments } from "@/lib/shifts/driver-sync";
import { notifyWarning } from "@/lib/feedback/notify";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { createClientCanonical } from "@/lib/clients/create-client";
import { QuickCreateClientDialog } from "@/components/clients/QuickCreateClientDialog";
import { getServiceCopilot } from "@/lib/shifts/service-copilot";
import { SERVICE_TEAM_ANCHOR, SERVICE_INFO_ANCHOR } from "@/lib/shifts/service-focus";
import { SERVICE_CLIENT_ANCHOR } from "@/lib/shifts/service-operational-readiness";
import {
  SERVICE_JOB_SITE_ANCHOR,
  SERVICE_MEETING_POINT_ANCHOR,
} from "@/lib/shifts/service-publish-readiness";
import { ServiceCopilotHeader } from "./copilot/ServiceCopilotHeader";
import { ServiceTimePanel } from "./copilot/ServiceTimePanel";
import { SmartStaffingPanel } from "./copilot/SmartStaffingPanel";
import { ShiftLifecycleTimeline } from "./ShiftLifecycleTimeline";
import type { Shift, SelectOption, Employee, Assignment } from "./types";

interface ShiftEditDialogProps {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: SelectOption[];
  locations: LocationOption[];
  employees?: Employee[];
  assignments?: Assignment[];
  onSave: (shiftId: string, updates: Partial<Shift> & Record<string, any>, oldShift: Shift) => Promise<void>;
  /** When false, hides the claimable checkbox */
  allowClaims?: boolean;
}

export function ShiftEditDialog({
  shift,
  open,
  onOpenChange,
  clients,
  locations,
  employees = [],
  assignments = [],
  onSave,
  allowClaims = true,
}: ShiftEditDialogProps) {
  const [form, setForm] = useState<ShiftFormState>(EMPTY_SHIFT_FORM_STATE);
  const [qrAttendanceMode, setQrAttendanceMode] = useState("disabled");
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * Clientes creados dentro del propio editor (Fase B/E — completar sin salir).
   * Se fusionan con la lista del padre para que el combobox los muestre sin
   * refrescar la pantalla ni perder el servicio abierto.
   */
  const [inlineClients, setInlineClients] = useState<SelectOption[]>([]);
  // S4-FIX1 — explicit user-interaction flag. JSON diff alone was unreliable
  // for the edit dialog (re-mounted shift snapshots, field normalization,
  // child callbacks that patch back identical values), so any actual user
  // edit also flips this and forces the unsaved-changes guard to engage.
  const [touched, setTouched] = useState(false);
  const { user } = useAuth();

  const clientOptions = useMemo(() => {
    const seen = new Set(clients.map((c) => c.id));
    return [...clients, ...inlineClients.filter((c) => !seen.has(c.id))];
  }, [clients, inlineClients]);

  /**
   * CLIENT TRUTH LAYER V1 — el alta rápida usa el helper canónico.
   * Nunca crea en silencio: si hay coincidencia, abre el diálogo de decisión.
   */
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientName, setQuickClientName] = useState("");

  const selectClient = (client: { id: string; name: string }, origin: "created" | "existing") => {
    setInlineClients((prev) =>
      prev.some((c) => c.id === client.id)
        ? prev
        : [...prev, { id: client.id, name: client.name } as SelectOption],
    );
    setForm((prev) => ({ ...prev, clientId: client.id }));
    setTouched(true);
    toast.success(
      origin === "created" ? `Cliente "${client.name}" creado` : `Cliente "${client.name}" seleccionado`,
      { description: "Seleccionado en este servicio. Guarda para aplicarlo." },
    );
  };

  const handleQuickAddClient = async (name: string) => {
    const companyId = (shift as any)?.company_id ?? null;
    if (!companyId || !name.trim()) return;
    const result = await createClientCanonical({ companyId, name });
    if (result.status === "created") {
      selectClient(result.client, "created");
      return;
    }
    if (result.status === "error" || result.status === "blocked") {
      toast.error("No se pudo crear el cliente", { description: result.reason });
      return;
    }
    // exact_match / possible_duplicate → decide la persona.
    setQuickClientName(name.trim());
    setQuickClientOpen(true);
  };



  useEffect(() => {
    if (shift && open) {
      const base = shiftToFormState(shift);
      // P0.3 — los drivers reales viven en shift_assignments.assignment_role.
      setForm({
        ...base,
        driverIds: driverIdsFromAssignments(
          assignments as any[],
          shift.id,
          (shift as any).driver_employee_id,
        ),
      });
      const s = shift as any;
      setQrAttendanceMode(s.qr_attendance_mode || "disabled");
      setQrToken(s.qr_token || null);
      setTouched(false); // S4-FIX1 — fresh open = clean slate
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, open, assignments]);

  // S3 — Local autosave (no DB writes). Snapshot only fields the operator edits.
  const autosaveData = useMemo(() => ({ form, qrAttendanceMode }), [form, qrAttendanceMode]);
  const autosave = useShiftDraftAutosave({
    enabled: open && !!shift,
    companyId: (shift as any)?.company_id ?? null,
    userId: user?.id ?? null,
    mode: "edit",
    shiftId: shift?.id ?? null,
    data: autosaveData,
  });

  // Derived signals — recomputed only when their slice of state changes.
  const signals = useShiftFormSignals({
    v: form,
    mode: "edit",
    shift,
    employees,
    shifts: [],
    assignments,
    clients: clientOptions,
    locations,
    showEmployeePicker: false,
  });

  const shiftAssignedIds = signals.shiftAssignedIds;
  const adminIsAssigned = !form.shiftAdminId || shiftAssignedIds.includes(form.shiftAdminId);
  const adminMissing = !form.shiftAdminId && shiftAssignedIds.length > 0;
  const adminError = adminMissing
    ? "Obligatorio: selecciona un responsable antes de guardar."
    : (form.shiftAdminId && !adminIsAssigned && shiftAssignedIds.length > 0
        ? "El admin seleccionado no está asignado al turno."
        : null);

  // Detect material changes that would require re-acceptance
  const hasMaterialChange = useMemo(() => {
    if (!shift) return false;
    const s = shift as any;
    return (
      form.date !== s.date ||
      form.startTime !== s.start_time?.slice(0, 5) ||
      form.endTime !== s.end_time?.slice(0, 5) ||
      form.locationId !== (s.location_id || "") ||
      form.title.trim() !== (s.title || "") ||
      form.meetingPoint.trim() !== (s.meeting_point || "") ||
      form.notes.trim() !== (s.notes || "") ||
      form.specialInstructions.trim() !== (s.special_instructions || "") ||
      form.payType !== (s.pay_type || "hourly")
    );
  }, [shift, form]);

  // S4 — Dirty detection for unsaved-changes guard. Compares the live form +
  // qrAttendanceMode against the snapshot derived from the original shift.
  // Purely local; no DB reads/writes.
  const isDirty = useMemo(() => {
    if (!shift) return false;
    if (touched) return true; // S4-FIX1 — explicit user interaction always wins
    const initial = shiftToFormState(shift);
    const initialQr = (shift as any)?.qr_attendance_mode || "disabled";
    try {
      return (
        JSON.stringify(form) !== JSON.stringify(initial) ||
        qrAttendanceMode !== initialQr
      );
    } catch {
      return true;
    }
  }, [shift, form, qrAttendanceMode, touched]);

  const hasAcceptedAssignments = shiftAssignedIds.length > 0;

  if (!shift) return null;
  if (shift.status === "locked") return null;

  const handleSave = async () => {
    if (saving) return; // double-tap guard — never allows a second UPDATE
    if (!form.date) return;
    // Time sanity: block only the impossible case (identical start/end).
    // Overnight shifts (end < start) stay allowed — they are legitimate.
    if (form.startTime && form.endTime && form.startTime === form.endTime) {
      toast.error("La hora final debe ser distinta de la hora de inicio.");
      return;
    }
    if (shiftAssignedIds.length > 0 && !form.shiftAdminId) {
      toast.error("Selecciona un admin del turno antes de guardar. El responsable operativo es obligatorio.");
      return;
    }
    if (form.shiftAdminId && shiftAssignedIds.length > 0 && !shiftAssignedIds.includes(form.shiftAdminId)) {
      toast.error("El admin del turno debe ser uno de los empleados asignados.");
      return;
    }

    setSaving(true);
    try {
      const payload = formStateToShiftPayload(form, allowClaims);
      await onSave(shift.id, { ...payload, qr_attendance_mode: qrAttendanceMode }, shift);
      // Roles de conductor: sólo assignment_role + el campo legado. Nunca horas ni payroll.
      try {
        await syncShiftDriverRoles(shift.id, form.driverIds ?? []);
      } catch (driverError) {
        notifyWarning({
          key: "shift-driver-sync",
          title: "El turno se guardó, pero los conductores no",
          fact: "No pudimos actualizar quién maneja en este turno.",
          consequence: "El equipo verá los conductores anteriores hasta que lo reintentes.",
          cause: driverError,
        });
      }
      autosave.clear(); // S3 — successful save → drop local draft
      setTouched(false); // S4-FIX1 — saved → no longer dirty
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  // ── SERVICE COPILOT — UNA sola lectura del servicio (readiness + siguiente
  // paso + checklist). Motor puro: no consulta nada y no muta nada.
  const publicationStatus = (shift as any)?.publication_status ?? null;
  const daysUntil = (() => {
    if (!form.date) return null;
    const today = new Date();
    const base = new Date(`${form.date}T00:00:00`);
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return Math.round((base.getTime() - t0) / 86_400_000);
  })();

  const copilot = useMemo(
    () =>
      getServiceCopilot({
        clientId: form.clientId,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        hasVenue: Boolean(
          form.locationId || form.jobSiteLocationId || (form.jobSiteAddress ?? "").trim(),
        ),
        meetingRequired: form.transportRequired,
        hasMeetingPoint: Boolean(form.meetingPoint.trim() || form.meetingPointLocationId),
        slots: signals.slotsNum,
        assignedCount: signals.assignedCount,
        claimable: form.claimable,
        publicationStatus,
        shiftId: shift.id,
        serviceRef: (shift as any).shift_ref ?? null,
        clientName: signals.clientName,
        infoComplete: Boolean(form.title.trim()) && signals.readiness.blockers.length === 0,
        daysUntil,
        anchors: {
          client: SERVICE_CLIENT_ANCHOR,
          date: SERVICE_CLIENT_ANCHOR,
          schedule: SERVICE_CLIENT_ANCHOR,
          venue: SERVICE_JOB_SITE_ANCHOR,
          staffing: SERVICE_TEAM_ANCHOR,
          meeting_point: SERVICE_MEETING_POINT_ANCHOR,
          info: SERVICE_INFO_ANCHOR,
        },
      }),
    [
      form.clientId, form.date, form.startTime, form.endTime, form.locationId,
      form.jobSiteLocationId, form.jobSiteAddress, form.transportRequired,
      form.meetingPoint, form.meetingPointLocationId, form.claimable, form.title,
      signals.slotsNum, signals.assignedCount, signals.readiness.blockers.length,
      publicationStatus, daysUntil, shift.id, signals.clientName,
    ],
  );

  const statusTone =
    publicationStatus === "published"
      ? "published"
      : publicationStatus === "cancelled"
        ? "cancelled"
        : publicationStatus === "archived"
          ? "closed"
          : "draft";
  const statusLabel =
    publicationStatus === "published"
      ? "Publicado"
      : publicationStatus === "cancelled"
        ? "Cancelado"
        : publicationStatus === "archived"
          ? "Archivado"
          : "Borrador";

  const payTypeLabel =
    form.payType === "daily"
      ? `por día · ${form.dayType === "full_day" ? "día completo" : "medio día"}`
      : "por hora";

  const summary = (
    <WorkspaceSummary
      mode="edit"
      title={form.title}
      date={form.date}
      startTime={form.startTime}
      endTime={form.endTime}
      meetingTime={form.meetingTime}
      clientId={form.clientId}
      locationId={form.locationId}
      jobSiteLocationId={form.jobSiteLocationId}
      jobSiteAddress={form.jobSiteAddress}
      meetingPoint={form.meetingPoint}
      meetingPointLocationId={form.meetingPointLocationId}
      transportRequired={form.transportRequired}
      claimable={form.claimable}
      clientName={signals.clientName}
      jobSiteLabel={signals.jobSiteLabel}
      meetingPointLabel={signals.meetingPointLabel}
      slotsNum={signals.slotsNum}
      assignedCount={signals.assignedCount}
      ridesNeeded={signals.ridesNeeded}
      driversInTeam={signals.driversInTeam}
      payTypeLabel={payTypeLabel}
      dateMissing={!form.date}
      adminMissing={signals.adminMissing}
      adminInvalid={signals.adminInvalid}
      noLocation={signals.noLocation}
      noTeam={signals.noTeam}
      driverMissing={signals.driverMissing}
      driversShortage={signals.driversShortage}
      capacityShortage={signals.capacityShortage}
      hasConflicts={signals.hasConflicts}
      conflictNames={signals.conflictNames}
      payOverrideActive={signals.payOverrideActive}
      publicationStatus={(shift as any).publication_status ?? null}
      timezone={(shift as any).timezone ?? null}
      publishBlockers={signals.readiness.blockers}
      copilot={copilot}
    />
  );

  const footerBanner =
    hasMaterialChange && hasAcceptedAssignments ? (
      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[hsl(var(--status-pending)/0.08)] border border-[hsl(var(--status-pending)/0.2)]">
        <AlertCircle className="h-4 w-4 text-[hsl(var(--status-pending))] shrink-0 mt-0.5" />
        <p className="text-[11px] text-[hsl(var(--status-pending))] font-medium leading-snug">
          Este cambio requerirá nueva aceptación de los {shiftAssignedIds.length} empleado
          {shiftAssignedIds.length > 1 ? "s" : ""} asignado{shiftAssignedIds.length > 1 ? "s" : ""}.
        </p>
      </div>
    ) : null;

  return (
    <ShiftFormShell
      open={open}
      onOpenChange={onOpenChange}
      mode="edit"
      clientName={signals.clientName}
      date={form.date}
      startTime={form.startTime}
      endTime={form.endTime}
      onSave={handleSave}
      saving={saving}
      saveDisabled={!form.date || (shiftAssignedIds.length > 0 && (!form.shiftAdminId || !adminIsAssigned))}
      footerBanner={footerBanner}
      summary={summary}
      headerSummary={
        <ServiceCopilotHeader
          clientId={form.clientId || null}
          clientName={signals.clientName}
          serviceRef={(shift as any).shift_ref ?? null}
          date={form.date}
          startTime={form.startTime}
          endTime={form.endTime}
          statusLabel={statusLabel}
          statusTone={statusTone}
          readiness={copilot.readiness}
          band={copilot.band}
        />
      }
      isDirty={isDirty}
      onDiscard={() => { autosave.clear(); setTouched(false); }}
    >
      {autosave.draftAvailable && (
        <ShiftDraftBanner
          savedAt={autosave.draftAvailable.savedAt}
          onRestore={() => {
            const d: any = autosave.draftAvailable?.data;
            if (d?.form) setForm(d.form as ShiftFormState);
            if (typeof d?.qrAttendanceMode === "string") setQrAttendanceMode(d.qrAttendanceMode);
            setTouched(true); // S4-FIX1 — restored draft = unsaved work
            autosave.dismissBanner();
          }}
          onDiscard={() => { autosave.clear(); setTouched(false); }}
        />
      )}
      <div className="flex justify-end">
        <ShiftDraftStatusPill status={autosave.status} />
      </div>
      <ShiftFormFields
        layout="workspace"
        mode="edit"
        companyId={(shift as any).company_id ?? null}
        value={form}
        onChange={(patch) => { setForm((prev) => ({ ...prev, ...patch })); setTouched(true); }}
        clients={clientOptions}
        onQuickAddClient={handleQuickAddClient}
        locations={locations}
        employees={employees}
        assignments={assignments}
        allowClaims={allowClaims}
        shift={shift}
        qrAttendanceMode={qrAttendanceMode}
        qrToken={qrToken}
        onQrUpdate={(updates) => {
          if (updates.qr_attendance_mode !== undefined) { setQrAttendanceMode(updates.qr_attendance_mode); setTouched(true); }
          if (updates.qr_token !== undefined) setQrToken(updates.qr_token);
        }}
        adminError={adminError}
        renderInlineSummary={false}
        copilotStages={{
          staffing: (
            <SmartStaffingPanel
              shift={shift}
              employees={employees}
              assignments={assignments}
              companyId={(shift as any).company_id ?? null}
              slots={signals.slotsNum}
              assignedCount={signals.assignedCount}
            />
          ),
          tiempo: (
            <ServiceTimePanel
              shiftId={shift.id}
              date={form.date}
              startTime={form.startTime}
              endTime={form.endTime}
              assignedCount={signals.assignedCount}
              isPast={daysUntil !== null && daysUntil < 0}
            />
          ),
          historial: (
            <ShiftLifecycleTimeline
              shift={{
                id: shift.id,
                date: form.date,
                start_time: form.startTime,
                end_time: form.endTime,
                slots: signals.slotsNum,
                status: shift.status,
                publication_status: publicationStatus,
              }}
              assignments={assignments}
            />
          ),
        }}
      />
      <QuickCreateClientDialog
        open={quickClientOpen}
        onOpenChange={setQuickClientOpen}
        companyId={(shift as any)?.company_id ?? null}
        initialName={quickClientName}
        onResolved={(client, origin) => selectClient(client, origin)}
      />
    </ShiftFormShell>
  );
}
