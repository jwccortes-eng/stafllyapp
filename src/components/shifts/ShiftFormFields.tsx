/**
 * ShiftFormFields — single source of truth for all operational shift fields.
 *
 * This file defines:
 *  - The ShiftFormState shape + DB mappers (shiftToFormState / formStateToShiftPayload)
 *  - <ShiftFormFields/> — orchestrates the new section layout (memoized subsections)
 *  - useShiftFormSignals(state, refs) — derives the signals consumed by both the
 *    form sections and <ShiftSummaryPanel/>. Heavy work lives in useMemo so the
 *    parent re-render on every keystroke does not recompute everything.
 *
 * Public API (unchanged): EMPTY_SHIFT_FORM_STATE, shiftToFormState,
 * formStateToShiftPayload, ShiftFormState, LocationOption, ShiftFormFieldsProps.
 */
import { useCallback, useMemo } from "react";
import { isEmployeeDriver } from "./types";
import type { Employee, SelectOption, Shift, Assignment } from "./types";
import {
  defaultAttendanceModeForPayType,
  type ShiftAttendanceMode,
} from "@/lib/shift-attendance-mode";

import { ShiftBasicInfoSection } from "./form/ShiftBasicInfoSection";
import { JobSiteSection } from "./form/JobSiteSection";
import { TransportationSection } from "./form/TransportationSection";
import { MeetingPointsSection } from "./form/MeetingPointsSection";
import { TeamSection } from "./form/TeamSection";
import { PaySection } from "./form/PaySection";
import { AdvancedDetailsSection } from "./form/AdvancedDetailsSection";
import { ShiftSummaryPanel } from "./form/ShiftSummaryPanel";
import { ShiftWorkspaceLayout } from "./workspace/ShiftWorkspaceLayout";
import { ServiceStageLayout, type ServiceStageKey } from "./copilot/ServiceStageLayout";
import {
  SERVICE_TEAM_ANCHOR,
  SERVICE_PAY_ANCHOR,
  SERVICE_INFO_ANCHOR,
} from "@/lib/shifts/service-focus";
import { SERVICE_CLIENT_ANCHOR } from "@/lib/shifts/service-operational-readiness";
import {
  SERVICE_JOB_SITE_ANCHOR,
  SERVICE_MEETING_POINT_ANCHOR,
} from "@/lib/shifts/service-publish-readiness";
import { QuickCreateWorkspace } from "./workspace/QuickCreateWorkspace";
import { buildShiftDisplayName, isAutoDisplayName } from "@/lib/shifts/display-name";
import { useLocationsV2 } from "@/hooks/useLocationsV2";
import {
  getServicePublishReadiness,
  type ServiceRequirements,
} from "@/lib/shifts/service-publish-readiness";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface LocationOption extends SelectOption {
  address?: string;
  client_id?: string | null;
  default_pay_type?: string | null;
  default_clock_method?: string | null;
  require_car?: boolean | null;
  default_instructions?: string | null;
}

/** All operational fields a shift exposes. Single source of truth. */
export interface ShiftFormState {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  slots: string;
  clientId: string;
  locationId: string;
  notes: string;
  claimable: boolean;
  meetingPoint: string;
  specialInstructions: string;
  payType: "hourly" | "daily";
  dayType: "full_day" | "half_day";
  payOverride: boolean;
  shiftAdminId: string;
  clockMethod: "mobile" | "kiosk" | "both";
  attendanceMode: ShiftAttendanceMode;
  meetingTime: string;
  // Transport
  transportRequired: boolean;
  carCapacity: string;
  transportNotes: string;
  /** LEGADO: driver principal (`scheduled_shifts.driver_employee_id`). Se deriva de driverIds[0]. */
  driverEmployeeId: string;
  /** P0.3 — todos los conductores del turno (modelo real: shift_assignments.assignment_role). */
  driverIds: string[];
  // Selected workforce (only meaningful in CREATE)
  selectedEmployees: string[];
  // Premium structured locations
  meetingPointLocationId: string | null;
  jobSiteLocationId: string | null;
  /**
   * One-off Job Site address (free text, written to `scheduled_shifts.job_site_address`).
   * Used when the operator pastes/searches an address that should NOT pollute
   * `locations_v2`. Empty when a saved/premium job site is picked.
   */
  jobSiteAddress: string;
}

export interface ShiftFormFieldsProps {
  mode: "create" | "edit";
  value: ShiftFormState;
  onChange: (patch: Partial<ShiftFormState>) => void;

  /** Reference data */
  clients: SelectOption[];
  locations: LocationOption[];
  employees: Employee[];
  shifts?: Shift[];
  assignments?: Assignment[];

  availabilityConfigs?: any[];
  availabilityOverrides?: any[];

  allowClaims?: boolean;

  onQuickAddClient?: (name: string) => Promise<void>;
  onQuickAddLocation?: (name: string, address: string) => Promise<void>;
  onAddNewEmployee?: () => void;
  /** Phase 2C-A — Emergency worker create entry from combobox */
  onAddEmergencyWorker?: () => void;

  /** EDIT mode only */
  shift?: Shift | null;
  qrAttendanceMode?: string;
  qrToken?: string | null;
  onQrUpdate?: (updates: { qr_attendance_mode?: string; qr_token?: string | null }) => void;

  showEmployeePicker?: boolean;
  adminError?: string | null;
  companyId?: string | null;

  /**
   * When true, the legacy bottom "Resumen final" card is rendered inline.
   * Defaults to true so existing callers (mobile dialogs) keep their summary.
   * The new full-screen shells set this to false and render <ShiftSummaryPanel/>
   * in the right column instead.
   */
  renderInlineSummary?: boolean;

  /**
   * Layout mode:
   *  - "stack" (default): vertical stack of sections, identical to legacy.
   *  - "workspace": premium desktop 2-column grid with auto display-name banner.
   *    Activate from the create/edit dialogs on lg+ viewports.
   */
  layout?: "stack" | "workspace";

  /**
   * SERVICE COPILOT — contenido de solo lectura de las etapas que el formulario
   * no posee (Tiempo e Historial). Cuando se provee en modo edición, el editor
   * se organiza por etapas en vez de un formulario largo.
   */
  copilotStages?: {
    tiempo?: React.ReactNode;
    historial?: React.ReactNode;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Derived signals — memoized once and shared across sections + summary
// ────────────────────────────────────────────────────────────────────────────

export interface ShiftFormSignals {
  slotsNum: number;
  capacityNum: number;
  ridesNeeded: number;
  shiftAssignedIds: string[];
  assignedCount: number;
  driversInTeam: number;
  driversShortage: boolean;
  capacityShortage: boolean;
  capacityCovered: boolean;
  adminCandidates: Employee[];
  adminMissing: boolean;
  adminInvalid: boolean;
  driverMissing: boolean;
  /** Sin LUGAR DEL SERVICIO. El punto de encuentro nunca lo satisface. */
  noLocation: boolean;
  noTeam: boolean;
  conflictNames: string[];
  hasConflicts: boolean;
  payOverrideActive: boolean;
  jobSiteLabel: string | null;
  meetingPointLabel: string | null;
  clientName: string | null;
  /** Estado canónico de publicación — única fuente para todas las superficies. */
  readiness: ReturnType<typeof getServicePublishReadiness>;
}

interface SignalsInput {
  v: ShiftFormState;
  mode: "create" | "edit";
  shift?: Shift | null;
  employees: Employee[];
  shifts: Shift[];
  assignments: Assignment[];
  clients: SelectOption[];
  locations: LocationOption[];
  showEmployeePicker: boolean;
  /** Necesario para resolver nombres de lugares guardados (locations_v2). */
  companyId?: string | null;
  /** Reglas de publicación de la empresa. */
  requirements?: ServiceRequirements;
}

export function useShiftFormSignals({
  v,
  mode,
  shift,
  employees,
  shifts,
  assignments,
  clients,
  locations,
  showEmployeePicker,
  companyId = null,
  requirements,
}: SignalsInput): ShiftFormSignals {
  const slotsNum = parseInt(v.slots) || 0;
  const capacityNum = parseInt(v.carCapacity) || 5;
  const ridesNeeded = v.transportRequired
    ? Math.ceil(Math.max(slotsNum, 1) / Math.max(capacityNum, 1))
    : 0;

  const shiftAssignedIds = useMemo(
    () =>
      mode === "edit" && shift
        ? assignments
            .filter((a) => a.shift_id === shift.id && a.status !== "rejected" && a.status !== "removed")
            .map((a) => a.employee_id)
        : v.selectedEmployees,
    [mode, shift, assignments, v.selectedEmployees],
  );
  const assignedCount = shiftAssignedIds.length;

  const adminCandidates = useMemo(
    () => (assignedCount > 0 ? employees.filter((e) => shiftAssignedIds.includes(e.id)) : employees),
    [shiftAssignedIds, assignedCount, employees],
  );

  const assignedKey = shiftAssignedIds.join(",");
  const driversInTeam = useMemo(() => {
    const ids = new Set(
      shiftAssignedIds.filter((id) => {
        const emp = employees.find((e) => e.id === id);
        return emp ? isEmployeeDriver(emp) : false;
      }),
    );
    if (v.driverEmployeeId && shiftAssignedIds.includes(v.driverEmployeeId)) {
      ids.add(v.driverEmployeeId);
    }
    return ids.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedKey, employees, v.driverEmployeeId]);

  const driversShortage = v.transportRequired && assignedCount > 0 && driversInTeam < ridesNeeded;
  const capacityShortage =
    v.transportRequired && slotsNum > 0 && capacityNum * ridesNeeded < slotsNum;
  const capacityCovered = v.transportRequired && slotsNum > 0 && !capacityShortage;
  const adminMissing = assignedCount > 0 && !v.shiftAdminId;
  const adminInvalid = !!v.shiftAdminId && assignedCount > 0 && !shiftAssignedIds.includes(v.shiftAdminId);
  const driverMissing = v.transportRequired && (v.driverIds?.length ?? 0) === 0 && !v.driverEmployeeId;
  // P0 — LUGAR DEL SERVICIO ≠ PUNTO DE ENCUENTRO.
  // El punto de encuentro no puede satisfacer el requisito de lugar del servicio.
  const readiness = getServicePublishReadiness({
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    title: v.title,
    clientId: v.clientId,
    locationId: v.locationId,
    jobSiteLocationId: v.jobSiteLocationId,
    jobSiteAddress: v.jobSiteAddress,
    meetingPoint: v.meetingPoint,
    meetingPointLocationId: v.meetingPointLocationId,
    transportRequired: v.transportRequired,
    driverIds: v.driverIds ?? [],
    driverEmployeeId: v.driverEmployeeId,
    shiftAdminId: v.shiftAdminId,
    assignedCount,
    claimable: v.claimable,
    requirements,
  });
  const noLocation = !readiness.hasJobSite;
  const noTeam = showEmployeePicker && assignedCount === 0 && !v.claimable;

  const currentShiftId = mode === "edit" && shift ? shift.id : null;
  const conflictNames = useMemo<string[]>(() => {
    const names: string[] = [];
    if (!v.date || !v.startTime || !v.endTime || assignedCount === 0) return names;
    const sStart = v.startTime;
    const sEnd = v.endTime;
    for (const empId of shiftAssignedIds) {
      const otherAssignments = assignments.filter(
        (a) =>
          a.employee_id === empId &&
          a.shift_id !== currentShiftId &&
          a.status !== "rejected" &&
          a.status !== "removed",
      );
      for (const oa of otherAssignments) {
        const other = shifts.find((sh) => sh.id === oa.shift_id);
        if (!other || (other as any).date !== v.date) continue;
        const oStart = ((other as any).start_time ?? "").slice(0, 5);
        const oEnd = ((other as any).end_time ?? "").slice(0, 5);
        if (oStart && oEnd && oStart < sEnd && oEnd > sStart) {
          const emp = employees.find((e) => e.id === empId);
          const name = emp ? `${emp.first_name} ${emp.last_name}` : "Empleado";
          if (!names.includes(name)) names.push(name);
          break;
        }
      }
    }
    return names;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedKey, v.date, v.startTime, v.endTime, currentShiftId, shifts, assignments, employees]);

  const { data: savedLocationsV2 } = useLocationsV2(companyId);

  const jobSiteLabel = useMemo(() => {
    if (v.locationId) {
      const loc = locations.find((l) => l.id === v.locationId);
      if (loc) return loc.address || loc.name || null;
    }
    if (v.jobSiteLocationId) {
      const saved = (savedLocationsV2 ?? []).find((l) => l.id === v.jobSiteLocationId);
      if (saved) return saved.name || saved.formatted_address || "Lugar guardado";
      return "Lugar guardado";
    }
    if (v.jobSiteAddress.trim()) return v.jobSiteAddress.trim();
    return null;
  }, [v.locationId, v.jobSiteLocationId, v.jobSiteAddress, locations, savedLocationsV2]);

  const meetingPointLabel = useMemo(() => {
    if (v.meetingPoint.trim()) return v.meetingPoint.trim();
    if (v.meetingPointLocationId) {
      const saved = (savedLocationsV2 ?? []).find((l) => l.id === v.meetingPointLocationId);
      if (saved) return saved.name || saved.formatted_address || "Punto guardado";
      return "Punto guardado";
    }
    return null;
  }, [v.meetingPoint, v.meetingPointLocationId, savedLocationsV2]);

  const clientName = useMemo(() => {
    if (!v.clientId) return null;
    return clients.find((c) => c.id === v.clientId)?.name ?? null;
  }, [v.clientId, clients]);

  return {
    slotsNum,
    capacityNum,
    ridesNeeded,
    shiftAssignedIds,
    assignedCount,
    driversInTeam,
    driversShortage,
    capacityShortage,
    capacityCovered,
    adminCandidates,
    adminMissing,
    adminInvalid,
    driverMissing,
    noLocation,
    noTeam,
    conflictNames,
    hasConflicts: conflictNames.length > 0,
    payOverrideActive: v.payOverride,
    jobSiteLabel,
    meetingPointLabel,
    clientName,
    readiness,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function ShiftFormFields({
  mode,
  value: v,
  onChange,
  clients,
  locations,
  employees,
  shifts = [],
  assignments = [],
  availabilityConfigs,
  availabilityOverrides,
  allowClaims = true,
  onQuickAddClient,
  onQuickAddLocation,
  onAddNewEmployee,
  onAddEmergencyWorker,
  shift,
  qrAttendanceMode,
  qrToken,
  onQrUpdate,
  showEmployeePicker = false,
  adminError,
  companyId = null,
  renderInlineSummary = true,
  layout = "stack",
}: ShiftFormFieldsProps) {
  const signals = useShiftFormSignals({
    v,
    mode,
    shift,
    employees,
    shifts,
    assignments,
    clients,
    locations,
    showEmployeePicker,
  });

  // Stable patch handler — defined in this component to keep referential
  // equality across re-renders so memoized children only re-render when
  // their own slice of the state changes.
  const handlePatch = useCallback(
    (patch: Partial<ShiftFormState>) =>
      onChange(
        patch.driverIds
          ? { ...patch, driverEmployeeId: patch.driverIds[0] ?? "" }
          : patch,
      ),
    [onChange],
  );

  const toggleEmployee = useCallback(
    (id: string) => {
      onChange({
        selectedEmployees: v.selectedEmployees.includes(id)
          ? v.selectedEmployees.filter((x) => x !== id)
          : [...v.selectedEmployees, id],
      });
    },
    [onChange, v.selectedEmployees],
  );

  const payTypeLabel =
    v.payType === "daily" ? `por día · ${v.dayType === "full_day" ? "día completo" : "medio día"}` : "por hora";

  const basicInfoNode = (
    <ShiftBasicInfoSection
      mode={mode}
      clientId={v.clientId}
      date={v.date}
      startTime={v.startTime}
      endTime={v.endTime}
      meetingTime={v.meetingTime}
      slots={v.slots}
      clients={clients}
      onChange={handlePatch}
      onQuickAddClient={onQuickAddClient}
    />
  );

  const jobSiteNode = (
    <JobSiteSection
      companyId={companyId}
      locationId={v.locationId}
      jobSiteLocationId={v.jobSiteLocationId}
      jobSiteAddress={v.jobSiteAddress}
      specialInstructions={v.specialInstructions}
      locations={locations}
      onChange={handlePatch}
      onQuickAddLocation={onQuickAddLocation}
    />
  );

  const transportationNode = (
    <TransportationSection
      mode={mode}
      transportRequired={v.transportRequired}
      carCapacity={v.carCapacity}
      transportNotes={v.transportNotes}
      driverIds={v.driverIds ?? []}
      ridesNeeded={signals.ridesNeeded}
      driversInTeam={signals.driversInTeam}
      assignedCount={signals.assignedCount}
      capacityShortage={signals.capacityShortage}
      driversShortage={signals.driversShortage}
      capacityCovered={signals.capacityCovered}
      employees={employees}
      onChange={handlePatch}
    />
  );

  const meetingPointsNode = (
    <MeetingPointsSection
      transportRequired={v.transportRequired}
      meetingPoint={v.meetingPoint}
      meetingPointLocationId={v.meetingPointLocationId}
      companyId={companyId}
      jobSiteMissing={!signals.readiness.hasJobSite}
      onChange={handlePatch}
    />
  );

  const teamNode = (
    <TeamSection
      mode={mode}
      showEmployeePicker={showEmployeePicker}
      allowClaims={allowClaims}
      claimable={v.claimable}
      selectedEmployees={v.selectedEmployees}
      shiftAdminId={v.shiftAdminId}
      adminCandidates={signals.adminCandidates}
      employees={employees}
      shifts={shifts}
      assignments={assignments}
      shiftDate={v.date}
      shiftStart={v.startTime}
      shiftEnd={v.endTime}
      slotsNum={signals.slotsNum}
      transportRequired={v.transportRequired}
      availabilityConfigs={availabilityConfigs}
      availabilityOverrides={availabilityOverrides}
      assignedCount={signals.assignedCount}
      adminError={adminError}
      onToggleEmployee={toggleEmployee}
      onAddNewEmployee={onAddNewEmployee}
      onAddEmergencyWorker={onAddEmergencyWorker}
      onChange={handlePatch}
    />
  );

  const payNode = (
    <PaySection
      payType={v.payType}
      dayType={v.dayType}
      payOverride={v.payOverride}
      attendanceMode={v.attendanceMode}
      locationId={v.locationId}
      locations={locations}
      onChange={handlePatch}
    />
  );

  const advancedNode = (
    <AdvancedDetailsSection
      mode={mode}
      title={v.title}
      notes={v.notes}
      attendanceMode={v.attendanceMode}
      clockMethod={v.clockMethod}
      shift={shift}
      qrAttendanceMode={qrAttendanceMode}
      qrToken={qrToken}
      onQrUpdate={onQrUpdate}
      onChange={handlePatch}
    />
  );

  const inlineSummaryNode = renderInlineSummary ? (
    <ShiftSummaryPanel
      mode={mode}
      title={v.title}
      clientName={signals.clientName}
      date={v.date}
      startTime={v.startTime}
      endTime={v.endTime}
      slotsNum={signals.slotsNum}
      assignedCount={signals.assignedCount}
      ridesNeeded={signals.ridesNeeded}
      transportRequired={v.transportRequired}
      driversInTeam={signals.driversInTeam}
      jobSiteLabel={signals.jobSiteLabel}
      meetingPointLabel={signals.meetingPointLabel}
      dateMissing={!v.date}
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
  ) : null;

  if (layout === "workspace") {
    const displayNameInput = {
      manualTitle: v.title,
      clientName: signals.clientName,
      startTime: v.startTime,
    };
    const displayName = buildShiftDisplayName(displayNameInput);
    const auto = isAutoDisplayName(displayNameInput);

    // CREATE — premium quick-create flow: primary card first, secondary
    // sections collapsed into accordion below so the operator can ship a
    // shift in seconds and complete details later.
    if (mode === "create") {
      return (
        <QuickCreateWorkspace
          displayName={displayName}
          displayNameHint={
            auto
              ? "Generado automáticamente desde cliente, tipo y hora. Puedes asignar una etiqueta interna en Más detalles."
              : "Etiqueta interna definida manualmente."
          }
          formState={v}
          onPatch={handlePatch}
          slotsNum={signals.slotsNum}
          isDraftContext={true}
          primary={basicInfoNode}
          team={teamNode}
          location={
            <>
              {jobSiteNode}
              {meetingPointsNode}
            </>
          }
          transportation={transportationNode}
          pay={payNode}
          advanced={advancedNode}
        />
      );
    }

    // EDIT — SERVICE COPILOT: el editor se organiza por etapas cuando el
    // contenedor aporta las etapas de solo lectura (Tiempo · Historial).
    if (copilotStages) {
      const anchorStage: Record<string, ServiceStageKey> = {
        [SERVICE_CLIENT_ANCHOR]: "resumen",
        [SERVICE_JOB_SITE_ANCHOR]: "resumen",
        [SERVICE_TEAM_ANCHOR]: "equipo",
        [SERVICE_MEETING_POINT_ANCHOR]: "operacion",
        [SERVICE_INFO_ANCHOR]: "operacion",
        [SERVICE_PAY_ANCHOR]: "pago",
      };
      return (
        <ServiceStageLayout
          anchorStage={anchorStage}
          stages={{
            resumen: (
              <>
                {basicInfoNode}
                {jobSiteNode}
              </>
            ),
            equipo: (
              <div id={SERVICE_TEAM_ANCHOR} className="space-y-3 scroll-mt-24">
                {teamNode}
                {transportationNode}
              </div>
            ),
            operacion: (
              <div id={SERVICE_INFO_ANCHOR} className="space-y-3 scroll-mt-24">
                {meetingPointsNode}
                {advancedNode}
              </div>
            ),
            tiempo: copilotStages.tiempo,
            pago: (
              <div id={SERVICE_PAY_ANCHOR} className="space-y-3 scroll-mt-24">
                {payNode}
              </div>
            ),
            historial: copilotStages.historial,
          }}
        />
      );
    }

    return (
      <ShiftWorkspaceLayout
        displayName={displayName}
        displayNameHint={
          auto
            ? "Generado automáticamente desde cliente, tipo y hora. Puedes asignar una etiqueta interna en Información principal."
            : "Etiqueta interna definida manualmente."
        }
        whatWhere={
          <>
            {basicInfoNode}
            {jobSiteNode}
            {meetingPointsNode}
          </>
        }
        teamOps={
          <>
            {teamNode}
            {transportationNode}
            {payNode}
          </>
        }
        advanced={advancedNode}
      />
    );
  }

  return (
    <div className="space-y-3">
      {basicInfoNode}
      {jobSiteNode}
      {transportationNode}
      {meetingPointsNode}
      {teamNode}
      {payNode}
      {advancedNode}
      {inlineSummaryNode}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Defaults + DB mappers (UNCHANGED — public contract)
// ────────────────────────────────────────────────────────────────────────────

export const EMPTY_SHIFT_FORM_STATE: ShiftFormState = {
  title: "",
  date: "",
  startTime: "08:00",
  endTime: "17:00",
  slots: "1",
  clientId: "",
  locationId: "",
  notes: "",
  claimable: false,
  meetingPoint: "",
  specialInstructions: "",
  payType: "hourly",
  dayType: "full_day",
  payOverride: false,
  shiftAdminId: "",
  clockMethod: "both",
  attendanceMode: "clock",
  meetingTime: "",
  transportRequired: false,
  carCapacity: "5",
  transportNotes: "",
  driverEmployeeId: "",
  driverIds: [],
  selectedEmployees: [],
  meetingPointLocationId: null,
  jobSiteLocationId: null,
  jobSiteAddress: "",
};

export function shiftToFormState(shift: Shift): ShiftFormState {
  const s = shift as any;
  return {
    title: s.title ?? "",
    date: s.date ?? "",
    startTime: (s.start_time ?? "08:00").slice(0, 5),
    endTime: (s.end_time ?? "17:00").slice(0, 5),
    slots: String(s.slots ?? 1),
    clientId: s.client_id ?? "",
    locationId: s.location_id ?? "",
    notes: s.notes ?? "",
    claimable: !!s.claimable,
    meetingPoint: s.meeting_point ?? "",
    specialInstructions: s.special_instructions ?? "",
    payType: (s.pay_type as "hourly" | "daily") ?? "hourly",
    dayType: (s.day_type as "full_day" | "half_day") ?? "full_day",
    payOverride:
      s.pay_override === true || s.pay_override === false
        ? !!s.pay_override
        : s.pay_type !== undefined && s.pay_type !== null,
    shiftAdminId: s.shift_admin_id ?? "",
    clockMethod: (s.clock_method as "mobile" | "kiosk" | "both") ?? "both",
    attendanceMode:
      (s.attendance_mode as ShiftAttendanceMode | undefined) ?? defaultAttendanceModeForPayType(s.pay_type),
    meetingTime: s.meeting_time ? String(s.meeting_time).slice(0, 5) : "",
    transportRequired: !!s.transportation_required,
    carCapacity: String(s.car_capacity ?? 5),
    transportNotes: s.transportation_notes ?? "",
    driverEmployeeId: s.driver_employee_id ?? "",
    driverIds: s.driver_employee_id ? [s.driver_employee_id] : [],
    selectedEmployees: [],
    meetingPointLocationId: s.meeting_point_location_id ?? null,
    jobSiteLocationId: s.job_site_location_id ?? null,
    jobSiteAddress: s.job_site_address ?? "",
  };
}

export function formStateToShiftPayload(s: ShiftFormState, allowClaims: boolean): Record<string, any> {
  return {
    title: s.title.trim(),
    date: s.date,
    start_time: s.startTime,
    end_time: s.endTime,
    slots: parseInt(s.slots) || 1,
    client_id: s.clientId || null,
    location_id: s.locationId || null,
    notes: s.notes.trim() || null,
    claimable: allowClaims ? s.claimable : false,
    meeting_point: s.meetingPoint.trim() || null,
    special_instructions: s.specialInstructions.trim() || null,
    pay_type: s.payType,
    day_type: s.payType === "daily" ? s.dayType : "full_day",
    pay_override: !!s.payOverride,
    shift_admin_id: s.shiftAdminId || null,
    clock_method: s.clockMethod,
    attendance_mode: s.attendanceMode,
    meeting_time: s.meetingTime ? s.meetingTime : null,
    transportation_required: s.transportRequired,
    car_capacity: parseInt(s.carCapacity) || 5,
    transportation_notes: s.transportNotes.trim() || null,
    // LEGADO: primer driver. El resto vive en shift_assignments.assignment_role.
    driver_employee_id: (s.driverIds?.[0] ?? s.driverEmployeeId) || null,
    meeting_point_location_id: s.meetingPointLocationId || null,
    job_site_location_id: s.jobSiteLocationId || null,
    job_site_address: s.jobSiteAddress.trim() || null,
  };
}
