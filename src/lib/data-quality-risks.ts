/**
 * Data Quality Risk helpers — Phase 1 (read-only, visual-first).
 *
 * Pure functions. No DB writes, no payroll math. These produce *signals* shown
 * to operators so they can decide what to clean before payroll, mass invites
 * or critical assignments.
 *
 * IMPORTANT:
 *  - Nothing here changes payroll calculations.
 *  - Nothing here disables/deactivates a worker.
 *  - These are visual badges; treat them as soft warnings only.
 */

import { normalizePhone } from "@/lib/phone";

export type RiskKey =
  | "duplicate_review"
  | "suspicious_email"
  | "missing_role"
  | "phone_invalid"
  | "historical_active"
  | "test_account"
  | "system_placeholder"
  | "missing_location"
  | "inactive_with_payroll";

export type PayrollReadiness = "ready" | "needs_review" | "blocked_visual";

export interface RiskTag {
  key: RiskKey;
  label: string;
  tone: "warning" | "destructive" | "muted";
  description: string;
}

const RISK_META: Record<RiskKey, Omit<RiskTag, "key">> = {
  duplicate_review:    { label: "Duplicate review",   tone: "warning",     description: "Shares phone, email or worker code with another record." },
  suspicious_email:    { label: "Suspicious email",   tone: "warning",     description: "Email looks shared, generic or like a placeholder." },
  missing_role:        { label: "Missing role",       tone: "muted",       description: "No employee role assigned." },
  phone_invalid:       { label: "Phone needs format", tone: "muted",       description: "Phone is missing or not a normalized 10-digit US number." },
  historical_active:   { label: "Historical active",  tone: "warning",     description: "Marked historical/legacy but portal access is still active." },
  test_account:        { label: "Test account",       tone: "destructive", description: "Name or email looks like a test, demo or QA account." },
  system_placeholder:  { label: "System placeholder", tone: "destructive", description: "Auto-generated placeholder (e.g. ‘System 3’). Not a real worker." },
  missing_location:    { label: "Missing location",   tone: "muted",       description: "City and state are both blank." },
  inactive_with_payroll: { label: "Inactive · payroll history", tone: "muted", description: "Inactive worker with prior payroll activity — keep for audit." },
};

const SHARED_EXACT_EMAIL = new Set([
  "qualitystaff@gmail.com",
  "noemail",
  "noemail@noemail.com",
  "test@test.com",
]);

const SHARED_EMAIL_RE = /^(test|example|admin@|info@|staffing@|office@|support@|noemail)|@example\./i;
const PLACEHOLDER_NAME_RE = /^\s*system\s*\d+\s*$/i;
const TEST_NAME_RE = /\b(test|demo|qa|prueba|sample|temp(orary)?)\b/i;
const HISTORICAL_ROLE_RE = /\b(historical|legacy|archived|old|previous)\b/i;

export interface AnalyzedEmployee {
  id: string;
  risks: RiskKey[];
  hasPayrollHistory: boolean; // best-effort signal (employer_identification + inactive)
}

export interface RiskAnalysisResult {
  byId: Map<string, RiskKey[]>;
  counts: Record<RiskKey, number>;
}

/**
 * Analyze a list of employee records and return per-row risk tags + aggregate counts.
 * The input shape is intentionally permissive — anything off the `employees` table.
 */
export function analyzeEmployeeRisks(employees: any[]): RiskAnalysisResult {
  const byId = new Map<string, RiskKey[]>();
  const counts: Record<RiskKey, number> = {
    duplicate_review: 0,
    suspicious_email: 0,
    missing_role: 0,
    phone_invalid: 0,
    historical_active: 0,
    test_account: 0,
    system_placeholder: 0,
    missing_location: 0,
    inactive_with_payroll: 0,
  };

  // Build duplicate buckets (shared definition with the Workers duplicate detector).
  const emailUsage = new Map<string, number>();
  for (const e of employees) {
    const em = (e?.email ?? "").trim().toLowerCase();
    if (em) emailUsage.set(em, (emailUsage.get(em) ?? 0) + 1);
  }
  const isSharedEmail = (em: string) =>
    !em || SHARED_EXACT_EMAIL.has(em) || SHARED_EMAIL_RE.test(em) || (emailUsage.get(em) ?? 0) >= 5;

  const phoneMap = new Map<string, string[]>();
  const emailMap = new Map<string, string[]>();
  const eidMap = new Map<string, string[]>();
  for (const e of employees) {
    const phone = normalizePhone((e as any).phone_number);
    if (phone) {
      const arr = phoneMap.get(phone) ?? [];
      arr.push(e.id);
      phoneMap.set(phone, arr);
    }
    const em = (e?.email ?? "").trim().toLowerCase();
    if (em && !isSharedEmail(em)) {
      const arr = emailMap.get(em) ?? [];
      arr.push(e.id);
      emailMap.set(em, arr);
    }
    const eid = ((e as any).employer_identification ?? "").toString().trim().toLowerCase();
    if (eid) {
      const arr = eidMap.get(eid) ?? [];
      arr.push(e.id);
      eidMap.set(eid, arr);
    }
  }
  const dupMembers = new Set<string>();
  for (const m of [phoneMap, emailMap, eidMap]) {
    for (const ids of m.values()) {
      if (ids.length > 1) ids.forEach((id) => dupMembers.add(id));
    }
  }

  for (const e of employees) {
    const tags: RiskKey[] = [];
    const fullName = `${e?.first_name ?? ""} ${e?.last_name ?? ""}`.trim();
    const emailRaw = (e?.email ?? "").trim();
    const emailLc = emailRaw.toLowerCase();
    const role = (e?.employee_role ?? "").toString().trim();
    const phoneNorm = normalizePhone(e?.phone_number);
    const isActive = e?.is_active !== false;
    const portalActive = !!e?.user_id;

    // System placeholder — highest signal first.
    if (PLACEHOLDER_NAME_RE.test(fullName) || /^system$/i.test(e?.first_name ?? "")) {
      tags.push("system_placeholder");
    }

    // Test / demo / QA.
    if (TEST_NAME_RE.test(fullName) || TEST_NAME_RE.test(emailLc)) {
      tags.push("test_account");
    }

    if (dupMembers.has(e.id)) tags.push("duplicate_review");
    if (emailRaw && isSharedEmail(emailLc)) tags.push("suspicious_email");
    if (!role) tags.push("missing_role");
    if (!phoneNorm || phoneNorm.length !== 10) tags.push("phone_invalid");

    if ((HISTORICAL_ROLE_RE.test(role) || HISTORICAL_ROLE_RE.test(e?.groups ?? "")) && portalActive && isActive) {
      tags.push("historical_active");
    }

    const city = (e?.address_city ?? "").toString().trim();
    const state = (e?.address_state ?? "").toString().trim();
    if (!city && !state) tags.push("missing_location");

    if (!isActive && (e?.employer_identification || e?.connecteam_employee_id)) {
      tags.push("inactive_with_payroll");
    }

    if (tags.length > 0) {
      // Dedupe while preserving order.
      const unique = Array.from(new Set(tags));
      byId.set(e.id, unique);
      for (const k of unique) counts[k] += 1;
    }
  }

  return { byId, counts };
}

/**
 * Translate a set of risks into a non-binding payroll readiness signal.
 *  - blocked_visual: never run payroll for this row (test, system placeholder).
 *  - needs_review:   operator should look before payroll (duplicate, suspicious data).
 *  - ready:          no detected risks.
 *
 * NOTE: This does NOT change payroll calculations. It is a UI hint only.
 */
export function computePayrollReadiness(risks: RiskKey[]): PayrollReadiness {
  if (risks.includes("system_placeholder") || risks.includes("test_account")) {
    return "blocked_visual";
  }
  if (
    risks.includes("duplicate_review") ||
    risks.includes("suspicious_email") ||
    risks.includes("phone_invalid") ||
    risks.includes("historical_active") ||
    risks.includes("missing_role")
  ) {
    return "needs_review";
  }
  return "ready";
}

export function getRiskMeta(key: RiskKey): RiskTag {
  return { key, ...RISK_META[key] };
}

export const RISK_ORDER: RiskKey[] = [
  "system_placeholder",
  "test_account",
  "duplicate_review",
  "historical_active",
  "suspicious_email",
  "phone_invalid",
  "missing_role",
  "missing_location",
  "inactive_with_payroll",
];

export const READINESS_LABEL: Record<PayrollReadiness, string> = {
  ready: "Payroll ready",
  needs_review: "Needs review",
  blocked_visual: "Payroll risk",
};

/**
 * Build a CSV string with the visible risks for the given employees.
 * Pure function — caller is responsible for triggering the download.
 */
export function buildRiskReportCsv(
  employees: any[],
  byId: Map<string, RiskKey[]>,
): string {
  const header = [
    "worker_id",
    "first_name",
    "last_name",
    "email",
    "phone_number",
    "employer_identification",
    "is_active",
    "portal_active",
    "payroll_readiness",
    "risk_tags",
  ];
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const e of employees) {
    const risks = byId.get(e.id) ?? [];
    if (risks.length === 0) continue;
    lines.push([
      e.id,
      e.first_name ?? "",
      e.last_name ?? "",
      e.email ?? "",
      e.phone_number ?? "",
      e.employer_identification ?? "",
      e.is_active === false ? "false" : "true",
      e.user_id ? "true" : "false",
      computePayrollReadiness(risks),
      risks.join("|"),
    ].map(escape).join(","));
  }
  return lines.join("\n");
}
