/**
 * Platform-specific column mappings for the Import Wizard.
 * Each platform maps its export column headers → our internal field names.
 */

export type ImportPlatform = "connecteam" | "homebase" | "deputy" | "whenIwork";

export interface PlatformConfig {
  id: ImportPlatform;
  label: string;
  description: string;
  color: string; // tailwind class
  schedule: {
    /** Map: internal field → list of possible column names (case-insensitive) */
    columns: Record<string, string[]>;
    /** How to detect PayRide rows */
    payRidePatterns: RegExp[];
    /** How to detect Weekend Job / Daily rate */
    weekendJobPatterns: RegExp[];
    /** How to detect unavailable rows */
    unavailablePatterns: RegExp[];
  };
  timeclock: {
    columns: Record<string, string[]>;
    /** Patterns for unpaid / break entries to skip */
    unpaidPatterns: RegExp[];
  };
  payroll: {
    columns: Record<string, string[]>;
    /** Map: normalised column → concept mapping */
    conceptMap: Record<string, { conceptName: string; category: "extra" | "deduction" }>;
    /** Prefer second sheet in Excel? */
    preferSecondSheet?: boolean;
  };
}

/* ── Helper to find a value in a row using multiple possible column names ── */
export function resolveColumn(row: Record<string, string>, possibleNames: string[]): string {
  for (const name of possibleNames) {
    const lower = name.toLowerCase();
    for (const [key, val] of Object.entries(row)) {
      if (key.toLowerCase().trim() === lower) return (val ?? "").trim();
    }
  }
  return "";
}

/* ── Helper that returns matching key for resolveColumn ── */
export function findColumnKey(row: Record<string, string>, possibleNames: string[]): string | null {
  for (const name of possibleNames) {
    const lower = name.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().trim() === lower) return key;
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   CONNECTEAM
   ═══════════════════════════════════════════════════════════════ */
const connecteam: PlatformConfig = {
  id: "connecteam",
  label: "Connecteam",
  description: "Schedule, Time Clock y Payroll exports de Connecteam",
  color: "text-blue-600",
  schedule: {
    columns: {
      date: ["Date"],
      shiftTitle: ["Shift title"],
      start: ["Start"],
      end: ["End"],
      job: ["Job"],
      subItem: ["Sub item"],
      users: ["Users"],
      address: ["Address"],
      note: ["Note"],
      tags: ["Shift tags"],
      availabilityStatus: ["Availability status"],
      lastStatus: ["Last Status"],
    },
    payRidePatterns: [/pay\s*ride/i, /pagar/i, /1\/2\s*ride/i, /^99\s*[-–]/],
    weekendJobPatterns: [/weekend\s*j[oa]b/i],
    unavailablePatterns: [/^unavailable$/i],
  },
  timeclock: {
    columns: {
      shiftNumber: ["Shift Number"],
      type: ["Type"],
      firstName: ["First name"],
      lastName: ["Last name"],
      startDate: ["Start Date"],
      clockIn: ["In"],
      endDate: ["End Date"],
      clockOut: ["Out"],
      shiftHours: ["Shift hours"],
      hourlyRate: ["Hourly rate (USD)", "Hourly rate"],
      scheduledShiftTitle: ["Scheduled shift title"],
      employeeNotes: ["Employee notes"],
      managerNotes: ["Manager notes"],
    },
    unpaidPatterns: [/unpaid/i, /no\s*pay/i, /sin\s*pago/i],
  },
  payroll: {
    columns: {
      firstName: ["First name"],
      lastName: ["Last name"],
    },
    conceptMap: {
      "payper day": { conceptName: "Weekend Job", category: "extra" },
      "ryde": { conceptName: "Pago de Transporte Regular", category: "extra" },
      "tips": { conceptName: "Propinas", category: "extra" },
      "reimbursements": { conceptName: "Reintegros", category: "extra" },
      "travel hours": { conceptName: "Horas de viaje", category: "extra" },
      "otros": { conceptName: "Otros pagos", category: "extra" },
      "discount": { conceptName: "Descuentos", category: "deduction" },
    },
    preferSecondSheet: true,
  },
};

/* ═══════════════════════════════════════════════════════════════
   HOMEBASE
   ═══════════════════════════════════════════════════════════════ */
const homebase: PlatformConfig = {
  id: "homebase",
  label: "Homebase",
  description: "Exportaciones de Schedule, Time Clock y Payroll de Homebase",
  color: "text-green-600",
  schedule: {
    columns: {
      date: ["Date", "Shift Date"],
      shiftTitle: ["Shift", "Shift Name", "Position"],
      start: ["Start", "Start Time", "Shift Start"],
      end: ["End", "End Time", "Shift End"],
      job: ["Role", "Job", "Department", "Location"],
      subItem: ["Position", "Sub item"],
      users: ["Employee", "Team Member", "Name", "Users"],
      address: ["Location", "Address"],
      note: ["Notes", "Note"],
      tags: ["Tags", "Shift tags"],
      availabilityStatus: ["Status", "Availability status"],
      lastStatus: ["Confirmation", "Last Status"],
    },
    payRidePatterns: [/pay\s*ride/i, /transport/i],
    weekendJobPatterns: [/weekend\s*j[oa]b/i, /flat\s*rate/i, /daily\s*rate/i],
    unavailablePatterns: [/^unavailable$/i, /^time\s*off$/i, /^pto$/i],
  },
  timeclock: {
    columns: {
      shiftNumber: ["Shift Number", "ID", "#"],
      type: ["Type", "Entry Type"],
      firstName: ["First name", "First Name"],
      lastName: ["Last name", "Last Name"],
      startDate: ["Date", "Start Date", "Clock In Date"],
      clockIn: ["Clock In", "In", "Time In", "Start Time"],
      endDate: ["End Date", "Clock Out Date"],
      clockOut: ["Clock Out", "Out", "Time Out", "End Time"],
      shiftHours: ["Hours", "Total Hours", "Shift hours", "Duration"],
      hourlyRate: ["Rate", "Hourly Rate", "Pay Rate", "Hourly rate (USD)"],
      scheduledShiftTitle: ["Shift", "Scheduled shift title", "Position"],
      employeeNotes: ["Employee notes", "Notes"],
      managerNotes: ["Manager notes", "Manager Notes"],
    },
    unpaidPatterns: [/unpaid/i, /break/i, /no\s*pay/i],
  },
  payroll: {
    columns: {
      firstName: ["First name", "First Name", "Employee First Name"],
      lastName: ["Last name", "Last Name", "Employee Last Name"],
    },
    conceptMap: {
      "payper day": { conceptName: "Weekend Job", category: "extra" },
      "tips": { conceptName: "Propinas", category: "extra" },
      "reimbursements": { conceptName: "Reintegros", category: "extra" },
      "reimbursement": { conceptName: "Reintegros", category: "extra" },
      "bonus": { conceptName: "Bonificaciones", category: "extra" },
      "mileage": { conceptName: "Pago de Transporte Regular", category: "extra" },
      "ryde": { conceptName: "Pago de Transporte Regular", category: "extra" },
      "deductions": { conceptName: "Descuentos", category: "deduction" },
      "discount": { conceptName: "Descuentos", category: "deduction" },
    },
    preferSecondSheet: false,
  },
};

/* ═══════════════════════════════════════════════════════════════
   DEPUTY
   ═══════════════════════════════════════════════════════════════ */
const deputy: PlatformConfig = {
  id: "deputy",
  label: "Deputy",
  description: "Exportaciones de Schedule, Timesheet y Payroll de Deputy",
  color: "text-purple-600",
  schedule: {
    columns: {
      date: ["Date", "Shift Date", "Start Date"],
      shiftTitle: ["Shift", "Shift Name", "Shift title"],
      start: ["Start Time", "Start", "Shift Start"],
      end: ["End Time", "End", "Shift End"],
      job: ["Area", "Location", "Department", "Job"],
      subItem: ["Role", "Sub item"],
      users: ["Employee", "Staff", "Name", "Users"],
      address: ["Location Address", "Address"],
      note: ["Comment", "Notes", "Note"],
      tags: ["Tags", "Shift tags"],
      availabilityStatus: ["Status", "Availability status"],
      lastStatus: ["Confirmed", "Last Status", "Approval"],
    },
    payRidePatterns: [/pay\s*ride/i, /transport/i, /travel/i],
    weekendJobPatterns: [/weekend\s*j[oa]b/i, /flat\s*rate/i, /daily/i],
    unavailablePatterns: [/^unavailable$/i, /^leave$/i, /^absent$/i],
  },
  timeclock: {
    columns: {
      shiftNumber: ["Timesheet ID", "ID", "Shift Number"],
      type: ["Type", "Timesheet Type"],
      firstName: ["First Name", "First name", "Given Name"],
      lastName: ["Last Name", "Last name", "Surname"],
      startDate: ["Date", "Start Date", "Timesheet Date"],
      clockIn: ["Start Time", "Clock In", "In"],
      endDate: ["End Date"],
      clockOut: ["End Time", "Clock Out", "Out"],
      shiftHours: ["Total Hours", "Hours Worked", "Shift hours", "Duration"],
      hourlyRate: ["Pay Rate", "Hourly Rate", "Rate", "Hourly rate (USD)"],
      scheduledShiftTitle: ["Shift", "Linked Shift", "Scheduled shift title"],
      employeeNotes: ["Employee Comment", "Employee notes"],
      managerNotes: ["Manager Comment", "Manager notes"],
    },
    unpaidPatterns: [/unpaid/i, /break/i, /meal/i],
  },
  payroll: {
    columns: {
      firstName: ["First Name", "First name", "Given Name"],
      lastName: ["Last Name", "Last name", "Surname"],
    },
    conceptMap: {
      "payper day": { conceptName: "Weekend Job", category: "extra" },
      "tips": { conceptName: "Propinas", category: "extra" },
      "allowance": { conceptName: "Reintegros", category: "extra" },
      "reimbursements": { conceptName: "Reintegros", category: "extra" },
      "bonus": { conceptName: "Bonificaciones", category: "extra" },
      "travel": { conceptName: "Pago de Transporte Regular", category: "extra" },
      "ryde": { conceptName: "Pago de Transporte Regular", category: "extra" },
      "deductions": { conceptName: "Descuentos", category: "deduction" },
      "discount": { conceptName: "Descuentos", category: "deduction" },
    },
    preferSecondSheet: false,
  },
};

/* ═══════════════════════════════════════════════════════════════
   WHEN I WORK
   ═══════════════════════════════════════════════════════════════ */
const whenIwork: PlatformConfig = {
  id: "whenIwork",
  label: "When I Work",
  description: "Exportaciones de Schedule, Attendance y Payroll de When I Work",
  color: "text-orange-600",
  schedule: {
    columns: {
      date: ["Date", "Shift Date", "Start Date"],
      shiftTitle: ["Shift Name", "Shift", "Position", "Shift title"],
      start: ["Start Time", "Start"],
      end: ["End Time", "End"],
      job: ["Position", "Job Site", "Location", "Job"],
      subItem: ["Schedule", "Sub item"],
      users: ["Employee", "Assigned To", "Name", "Users"],
      address: ["Site Address", "Location", "Address"],
      note: ["Notes", "Shift Notes", "Note"],
      tags: ["Tags", "Color", "Shift tags"],
      availabilityStatus: ["Status", "Availability", "Availability status"],
      lastStatus: ["Published", "Last Status", "Acknowledged"],
    },
    payRidePatterns: [/pay\s*ride/i, /transport/i],
    weekendJobPatterns: [/weekend\s*j[oa]b/i, /flat\s*rate/i, /daily/i],
    unavailablePatterns: [/^unavailable$/i, /^time\s*off$/i, /^request\s*off$/i],
  },
  timeclock: {
    columns: {
      shiftNumber: ["ID", "Entry #", "Shift Number"],
      type: ["Type", "Entry Type"],
      firstName: ["First Name", "First name"],
      lastName: ["Last Name", "Last name"],
      startDate: ["Date", "Start Date", "Clock-in Date"],
      clockIn: ["Clock-in", "Clock In", "In", "Start Time"],
      endDate: ["End Date", "Clock-out Date"],
      clockOut: ["Clock-out", "Clock Out", "Out", "End Time"],
      shiftHours: ["Total", "Hours", "Shift hours", "Duration"],
      hourlyRate: ["Rate", "Pay Rate", "Hourly rate (USD)"],
      scheduledShiftTitle: ["Linked Shift", "Shift", "Scheduled shift title"],
      employeeNotes: ["Notes", "Employee notes"],
      managerNotes: ["Alert Notes", "Manager notes"],
    },
    unpaidPatterns: [/unpaid/i, /break/i, /no\s*pay/i],
  },
  payroll: {
    columns: {
      firstName: ["First Name", "First name"],
      lastName: ["Last Name", "Last name"],
    },
    conceptMap: {
      "payper day": { conceptName: "Weekend Job", category: "extra" },
      "tips": { conceptName: "Propinas", category: "extra" },
      "reimbursement": { conceptName: "Reintegros", category: "extra" },
      "reimbursements": { conceptName: "Reintegros", category: "extra" },
      "bonus": { conceptName: "Bonificaciones", category: "extra" },
      "mileage": { conceptName: "Pago de Transporte Regular", category: "extra" },
      "ryde": { conceptName: "Pago de Transporte Regular", category: "extra" },
      "discount": { conceptName: "Descuentos", category: "deduction" },
      "deductions": { conceptName: "Descuentos", category: "deduction" },
    },
    preferSecondSheet: false,
  },
};

/* ═══════════════════════════════════════════════════════════════
   REGISTRY
   ═══════════════════════════════════════════════════════════════ */
export const PLATFORM_CONFIGS: Record<ImportPlatform, PlatformConfig> = {
  connecteam,
  homebase,
  deputy,
  whenIwork,
};

export const PLATFORM_LIST: PlatformConfig[] = [connecteam, homebase, deputy, whenIwork];
