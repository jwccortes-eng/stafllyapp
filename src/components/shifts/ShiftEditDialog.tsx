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
import { ShiftSummaryPanel } from "./form/ShiftSummaryPanel";
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

  useEffect(() => {
    if (shift && open) {
      setForm(shiftToFormState(shift));
      const s = shift as any;
      setQrAttendanceMode(s.qr_attendance_mode || "disabled");
      setQrToken(s.qr_token || null);
    }
  }, [shift, open]);

  // Derived signals — recomputed only when their slice of state changes.
  const signals = useShiftFormSignals({
    v: form,
    mode: "edit",
    shift,
    employees,
    shifts: [],
    assignments,
    clients,
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

  const hasAcceptedAssignments = shiftAssignedIds.length > 0;

  if (!shift) return null;
  if (shift.status === "locked") return null;

  const handleSave = async () => {
    if (!form.date) return;
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
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const payTypeLabel =
    form.payType === "daily"
      ? `por día · ${form.dayType === "full_day" ? "día completo" : "medio día"}`
      : "por hora";

  const summary = (
    <ShiftSummaryPanel
      mode="edit"
      title={form.title}
      clientName={signals.clientName}
      date={form.date}
      startTime={form.startTime}
      endTime={form.endTime}
      slotsNum={signals.slotsNum}
      assignedCount={signals.assignedCount}
      ridesNeeded={signals.ridesNeeded}
      transportRequired={form.transportRequired}
      driversInTeam={signals.driversInTeam}
      jobSiteLabel={signals.jobSiteLabel}
      meetingPointLabel={signals.meetingPointLabel}
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
      payTypeLabel={payTypeLabel}
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
    >
      <ShiftFormFields
        mode="edit"
        companyId={(shift as any).company_id ?? null}
        value={form}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        clients={clients}
        locations={locations}
        employees={employees}
        assignments={assignments}
        allowClaims={allowClaims}
        shift={shift}
        qrAttendanceMode={qrAttendanceMode}
        qrToken={qrToken}
        onQrUpdate={(updates) => {
          if (updates.qr_attendance_mode !== undefined) setQrAttendanceMode(updates.qr_attendance_mode);
          if (updates.qr_token !== undefined) setQrToken(updates.qr_token);
        }}
        adminError={adminError}
        renderInlineSummary={false}
      />
    </ShiftFormShell>
  );
}
