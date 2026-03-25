import { read, utils } from "xlsx";

export interface PayrollTruthRow {
  employee: string;
  firstName: string;
  lastName: string;
  employerIdentification: string;
  verificationSsnEin: string;
  phoneNumber: string;
  email: string;
  totalPay: number;
  hourlyRate: number | null;
  payperDay: number;
  ryde: number;
  tips: number;
  reimbursements: number;
  travelHours: number;
  otros: number;
  discount: number;
  total: number;
  shiftHours: number;
  /** Weekly total hours — "Total paid hours" / "Total work hours". Authoritative over shiftHours for closure. */
  totalPaidHours: number;
  observaciones: string;
}

interface ColumnDetection {
  index: number;
  header: string | null;
}

export interface PayrollTruthDebugRow {
  rowNumber: number;
  employee: string;
  rawTotal: unknown;
  parsedTotal: number;
  rawTotalPay: unknown;
  parsedTotalPay: number;
  rawPayperDay: unknown;
  parsedPayperDay: number;
  rawRyde: unknown;
  parsedRyde: number;
  rawHourlyRate: unknown;
  parsedHourlyRate: number | null;
}

export interface PayrollTruthParseResult {
  sheetUsed: string;
  parsedAt: string;
  primaryComparisonField: "TOTAL" | "Total Pay + Payper Day + Ryde";
  rawColumnNames: string[];
  detectedColumns: {
    employerIdentification: ColumnDetection;
    verificationSsnEin: ColumnDetection;
    firstName: ColumnDetection;
    lastName: ColumnDetection;
    phoneNumber: ColumnDetection;
    email: ColumnDetection;
    totalPay: ColumnDetection;
    payperDay: ColumnDetection;
    ryde: ColumnDetection;
    tips: ColumnDetection;
    reimbursements: ColumnDetection;
    travelHours: ColumnDetection;
    otros: ColumnDetection;
    discount: ColumnDetection;
    total: ColumnDetection;
    hourlyRate: ColumnDetection;
    shiftHours: ColumnDetection;
    observaciones: ColumnDetection;
  };
  rows: PayrollTruthRow[];
  debugRows: PayrollTruthDebugRow[];
}

function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00a0\s_]+/g, " ")
    .trim();
}

function normalizeEmployeeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map(h => normalizeColumnName(h));
  const normalizedAliases = aliases.map(a => normalizeColumnName(a));

  for (const alias of normalizedAliases) {
    const exact = normalizedHeaders.findIndex(h => h === alias);
    if (exact !== -1) return exact;
  }

  for (const alias of normalizedAliases) {
    const startsWith = normalizedHeaders.findIndex(h => h.startsWith(alias));
    if (startsWith !== -1) return startsWith;
  }

  for (const alias of normalizedAliases) {
    const contains = normalizedHeaders.findIndex(h => h.includes(alias));
    if (contains !== -1) return contains;
  }

  return -1;
}

function findTotalColumnIndex(headers: string[]): number {
  const normalizedHeaders = headers.map(h => normalizeColumnName(h));

  const exactTotal = normalizedHeaders.findIndex(h => h === "total");
  if (exactTotal !== -1) return exactTotal;

  const compactTotal = normalizedHeaders.findIndex(h => h.replace(/\s+/g, "") === "total");
  if (compactTotal !== -1) return compactTotal;

  return -1;
}

function parseLocalizedNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let str = String(value).trim();
  if (!str) return 0;

  const negativeByParens = /^\(.*\)$/.test(str);
  str = str.replace(/^\((.*)\)$/, "$1");
  str = str.replace(/[¤$\u20AC£¥\s\u00a0]/g, "");

  if (!str) return 0;

  const commaCount = (str.match(/,/g) || []).length;
  const dotCount = (str.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");
    if (lastComma > lastDot) {
      str = str.replace(/\./g, "").replace(/,/g, ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (commaCount > 0 && dotCount === 0) {
    str = /,\d{1,2}$/.test(str) ? str.replace(/,/g, ".") : str.replace(/,/g, "");
  } else if (dotCount > 1) {
    const parts = str.split(".");
    const decimal = parts.pop();
    str = `${parts.join("")}.${decimal}`;
  }

  const parsed = Number.parseFloat(str);
  const out = Number.isFinite(parsed) ? parsed : 0;
  return negativeByParens ? -out : out;
}

function isSummaryRow(employeeName: string): boolean {
  const normalized = normalizeEmployeeName(employeeName);
  if (!normalized) return true;
  if (normalized.startsWith("total ") || normalized === "total") return true;
  if (normalized.includes("total quality")) return true;
  if (normalized.startsWith("grand total") || normalized.startsWith("subtotal")) return true;
  return false;
}

function getColumnDetection(headers: string[], index: number): ColumnDetection {
  return { index, header: index >= 0 ? headers[index] : null };
}

export function parsePayrollTruthWorkbook(data: ArrayBuffer | Uint8Array): PayrollTruthParseResult {
  const wb = read(data, { type: "array" });
  const sheetUsed = wb.SheetNames.includes("PAYROLL") ? "PAYROLL" : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetUsed];

  const rows2d = utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  const headers = ((rows2d[0] || []) as unknown[]).map(v => String(v ?? ""));

  const firstNameIndex = findColumnIndex(headers, ["First name", "Firstname", "Employee first name"]);
  const lastNameIndex = findColumnIndex(headers, ["Last name", "Lastname", "Employee last name"]);
  const employerIdentificationIndex = findColumnIndex(headers, ["Employer identification", "Employer ID", "Employee ID"]);
  const verificationSsnEinIndex = findColumnIndex(headers, ["Verification SSN - EIN", "Verification SSN", "SSN", "SSN - EIN", "EIN"]);
  const phoneNumberIndex = findColumnIndex(headers, ["Phone number", "Phone", "Mobile", "Cell phone"]);
  const emailIndex = findColumnIndex(headers, ["Email", "E-mail"]);
  const totalPayIndex = findColumnIndex(headers, ["Total pay", "Total Pay", "Gross pay"]);
  const payperDayIndex = findColumnIndex(headers, ["Payper Day", "Pay per day", "Pay per Day"]);
  const rydeIndex = findColumnIndex(headers, ["Ryde", "Ride", "Rides"]);
  const totalIndex = findTotalColumnIndex(headers);
  const hourlyRateIndex = findColumnIndex(headers, ["Hourly rate (USD)", "Hourly rate", "Hourly rate USD"]);
  const shiftHoursIndex = findColumnIndex(headers, ["Shift hours"]);
  const totalPaidHoursIndex = findColumnIndex(headers, [
    "Total paid hours",
    "Total work hours",
    "Total hours",
    "Paid hours",
    "Horas totales",
    "Horas pagadas",
  ]);
  const tipsIndex = findColumnIndex(headers, ["Tips", "Propinas", "Tip"]);
  const reimbursementsIndex = findColumnIndex(headers, ["Reimbursements", "Reembolsos", "Reimbursement"]);
  const travelHoursIndex = findColumnIndex(headers, ["Travel Hours", "Travel hours", "Horas de viaje"]);
  const otrosIndex = findColumnIndex(headers, ["Otros", "Other", "Others", "Otros pagos"]);
  const discountIndex = findColumnIndex(headers, ["Discount", "Descuento", "Descuentos"]);
  const observacionesIndex = findColumnIndex(headers, ["Observaciones", "Observations", "Notes", "Notas"]);

  const byEmployee = new Map<string, PayrollTruthRow>();
  const debugRows: PayrollTruthDebugRow[] = [];

  for (let rowNumber = 2; rowNumber <= rows2d.length; rowNumber++) {
    const row = rows2d[rowNumber - 1] as unknown[] | undefined;
    if (!row || row.length === 0) continue;

    const firstName = String(firstNameIndex >= 0 ? row[firstNameIndex] ?? "" : "").trim();
    const lastName = String(lastNameIndex >= 0 ? row[lastNameIndex] ?? "" : "").trim();
    const employerIdentification = String(employerIdentificationIndex >= 0 ? row[employerIdentificationIndex] ?? "" : "").trim();
    const verificationSsnEin = String(verificationSsnEinIndex >= 0 ? row[verificationSsnEinIndex] ?? "" : "").trim();
    const phoneNumber = String(phoneNumberIndex >= 0 ? row[phoneNumberIndex] ?? "" : "").trim();
    const email = String(emailIndex >= 0 ? row[emailIndex] ?? "" : "").trim();
    const employee = `${firstName} ${lastName}`.trim();

    if (!employee || isSummaryRow(employee)) continue;

    const rawTotalPay = totalPayIndex >= 0 ? row[totalPayIndex] : null;
    const rawPayperDay = payperDayIndex >= 0 ? row[payperDayIndex] : null;
    const rawRyde = rydeIndex >= 0 ? row[rydeIndex] : null;
    const rawTotal = totalIndex >= 0 ? row[totalIndex] : null;
    const rawHourlyRate = hourlyRateIndex >= 0 ? row[hourlyRateIndex] : null;
    const rawShiftHours = shiftHoursIndex >= 0 ? row[shiftHoursIndex] : null;
    const rawTips = tipsIndex >= 0 ? row[tipsIndex] : null;
    const rawReimbursements = reimbursementsIndex >= 0 ? row[reimbursementsIndex] : null;
    const rawTravelHours = travelHoursIndex >= 0 ? row[travelHoursIndex] : null;
    const rawOtros = otrosIndex >= 0 ? row[otrosIndex] : null;
    const rawDiscount = discountIndex >= 0 ? row[discountIndex] : null;
    const rawObservaciones = observacionesIndex >= 0 ? String(row[observacionesIndex] ?? "").trim() : "";

    const parsedTotalPay = parseLocalizedNumber(rawTotalPay);
    const parsedPayperDay = parseLocalizedNumber(rawPayperDay);
    const parsedRyde = parseLocalizedNumber(rawRyde);
    const parsedTotal = parseLocalizedNumber(rawTotal);
    const parsedHourlyRate = rawHourlyRate == null || rawHourlyRate === "" ? null : parseLocalizedNumber(rawHourlyRate);
    const parsedShiftHours = parseLocalizedNumber(rawShiftHours);
    const parsedTips = parseLocalizedNumber(rawTips);
    const parsedReimbursements = parseLocalizedNumber(rawReimbursements);
    const parsedTravelHours = parseLocalizedNumber(rawTravelHours);
    const parsedOtros = parseLocalizedNumber(rawOtros);
    const parsedDiscount = parseLocalizedNumber(rawDiscount);

    const computedTotal = totalIndex >= 0 ? parsedTotal : parsedTotalPay + parsedPayperDay + parsedRyde + parsedTips + parsedReimbursements + parsedTravelHours + parsedOtros + parsedDiscount;

    if (debugRows.length < 5) {
      debugRows.push({
        rowNumber,
        employee,
        rawTotal,
        parsedTotal: computedTotal,
        rawTotalPay,
        parsedTotalPay,
        rawPayperDay,
        parsedPayperDay,
        rawRyde,
        parsedRyde,
        rawHourlyRate,
        parsedHourlyRate,
      });
    }

    const key = normalizeEmployeeName(employee);
    const existing = byEmployee.get(key);

    if (existing) {
      if (!existing.employerIdentification && employerIdentification) existing.employerIdentification = employerIdentification;
      if (!existing.verificationSsnEin && verificationSsnEin) existing.verificationSsnEin = verificationSsnEin;
      if (!existing.phoneNumber && phoneNumber) existing.phoneNumber = phoneNumber;
      if (!existing.email && email) existing.email = email;
      existing.totalPay += parsedTotalPay;
      existing.payperDay += parsedPayperDay;
      existing.ryde += parsedRyde;
      existing.tips += parsedTips;
      existing.reimbursements += parsedReimbursements;
      existing.travelHours += parsedTravelHours;
      existing.otros += parsedOtros;
      existing.discount += parsedDiscount;
      existing.total = Math.max(existing.total, computedTotal);
      existing.shiftHours += parsedShiftHours;
      if (parsedHourlyRate != null && existing.hourlyRate == null) {
        existing.hourlyRate = parsedHourlyRate;
      }
      if (rawObservaciones && !existing.observaciones.includes(rawObservaciones)) {
        existing.observaciones = existing.observaciones ? `${existing.observaciones}; ${rawObservaciones}` : rawObservaciones;
      }
    } else {
      byEmployee.set(key, {
        employee,
        firstName,
        lastName,
        employerIdentification,
        verificationSsnEin,
        phoneNumber,
        email,
        totalPay: parsedTotalPay,
        hourlyRate: parsedHourlyRate,
        payperDay: parsedPayperDay,
        ryde: parsedRyde,
        tips: parsedTips,
        reimbursements: parsedReimbursements,
        travelHours: parsedTravelHours,
        otros: parsedOtros,
        discount: parsedDiscount,
        total: computedTotal,
        shiftHours: parsedShiftHours,
        observaciones: rawObservaciones,
      });
    }
  }

  return {
    sheetUsed,
    parsedAt: new Date().toISOString(),
    primaryComparisonField: totalIndex >= 0 ? "TOTAL" : "Total Pay + Payper Day + Ryde",
    rawColumnNames: headers,
    detectedColumns: {
      employerIdentification: getColumnDetection(headers, employerIdentificationIndex),
      verificationSsnEin: getColumnDetection(headers, verificationSsnEinIndex),
      firstName: getColumnDetection(headers, firstNameIndex),
      lastName: getColumnDetection(headers, lastNameIndex),
      phoneNumber: getColumnDetection(headers, phoneNumberIndex),
      email: getColumnDetection(headers, emailIndex),
      totalPay: getColumnDetection(headers, totalPayIndex),
      payperDay: getColumnDetection(headers, payperDayIndex),
      ryde: getColumnDetection(headers, rydeIndex),
      tips: getColumnDetection(headers, tipsIndex),
      reimbursements: getColumnDetection(headers, reimbursementsIndex),
      travelHours: getColumnDetection(headers, travelHoursIndex),
      otros: getColumnDetection(headers, otrosIndex),
      discount: getColumnDetection(headers, discountIndex),
      total: getColumnDetection(headers, totalIndex),
      hourlyRate: getColumnDetection(headers, hourlyRateIndex),
      shiftHours: getColumnDetection(headers, shiftHoursIndex),
      observaciones: getColumnDetection(headers, observacionesIndex),
    },
    rows: Array.from(byEmployee.values()),
    debugRows,
  };
}
