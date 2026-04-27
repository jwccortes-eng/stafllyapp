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
  driverEmployeeId: string;
  // Selected workforce (only meaningful in CREATE)
  selectedEmployees: string[];
  // Premium structured locations
  meetingPointLocationId: string | null;
  jobSiteLocationId: string | null;
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
  noLocation: boolean;
  noTeam: boolean;
  conflictNames: string[];
  hasConflicts: boolean;
  payOverrideActive: boolean;
  jobSiteLabel: string | null;
  meetingPointLabel: string | null;
  clientName: string | null;
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
  const driverMissing = v.transportRequired && !v.driverEmployeeId;
  const noLocation =
    !v.locationId && !v.meetingPoint.trim() && !v.meetingPointLocationId && !v.jobSiteLocationId;
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

  const jobSiteLabel = useMemo(() => {
    if (v.locationId) {
      const loc = locations.find((l) => l.id === v.locationId);
      if (loc) return loc.address || loc.name || null;
    }
    return null;
  }, [v.locationId, locations]);

  const meetingPointLabel = useMemo(() => {
    return v.meetingPoint.trim() || null;
  }, [v.meetingPoint]);

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
  shift,
  qrAttendanceMode,
  qrToken,
  onQrUpdate,
  showEmployeePicker = false,
  adminError,
  companyId = null,
  renderInlineSummary = true,
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
    (patch: Partial<ShiftFormState>) => onChange(patch),
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

  return (
    <div className="space-y-3">
      <ShiftBasicInfoSection
        mode={mode}
        title={v.title}
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

      <JobSiteSection
        companyId={companyId}
        locationId={v.locationId}
        jobSiteLocationId={v.jobSiteLocationId}
        specialInstructions={v.specialInstructions}
        locations={locations}
        onChange={handlePatch}
        onQuickAddLocation={onQuickAddLocation}
      />

      <TransportationSection
        mode={mode}
        transportRequired={v.transportRequired}
        carCapacity={v.carCapacity}
        transportNotes={v.transportNotes}
        driverEmployeeId={v.driverEmployeeId}
        ridesNeeded={signals.ridesNeeded}
        driversInTeam={signals.driversInTeam}
        assignedCount={signals.assignedCount}
        capacityShortage={signals.capacityShortage}
        driversShortage={signals.driversShortage}
        capacityCovered={signals.capacityCovered}
        employees={employees}
        onChange={handlePatch}
      />

      <MeetingPointsSection
        transportRequired={v.transportRequired}
        meetingPoint={v.meetingPoint}
        meetingPointLocationId={v.meetingPointLocationId}
        companyId={companyId}
        onChange={handlePatch}
      />

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
        onChange={handlePatch}
      />

      <PaySection
        payType={v.payType}
        dayType={v.dayType}
        payOverride={v.payOverride}
        attendanceMode={v.attendanceMode}
        locationId={v.locationId}
        locations={locations}
        onChange={handlePatch}
      />

      <AdvancedDetailsSection
        mode={mode}
        notes={v.notes}
        attendanceMode={v.attendanceMode}
        clockMethod={v.clockMethod}
        shift={shift}
        qrAttendanceMode={qrAttendanceMode}
        qrToken={qrToken}
        onQrUpdate={onQrUpdate}
        onChange={handlePatch}
      />

      {/* Inline summary for legacy callers (mobile dialogs without a side panel). */}
      {renderInlineSummary && (
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
      )}
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
  selectedEmployees: [],
  meetingPointLocationId: null,
  jobSiteLocationId: null,
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
    selectedEmployees: [],
    meetingPointLocationId: s.meeting_point_location_id ?? null,
    jobSiteLocationId: s.job_site_location_id ?? null,
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
    driver_employee_id: s.driverEmployeeId || null,
    meeting_point_location_id: s.meetingPointLocationId || null,
    job_site_location_id: s.jobSiteLocationId || null,
  };
}
