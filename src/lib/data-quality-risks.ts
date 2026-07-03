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
import type { WorkerDocumentSignals } from "@/lib/documents-signals";

export type RiskKey =
  | "pending_identity"
  | "duplicate_review"
  | "suspicious_email"
  | "missing_role"
  | "phone_invalid"
  | "historical_active"
  | "test_account"
  | "system_placeholder"
  | "missing_location"
  | "inactive_with_payroll"
  // Profile completeness — Phase 2 actionable signals.
  | "missing_phone"
  | "missing_email"
  | "missing_photo"
  | "missing_emergency_contact"
  | "portal_not_active"
  // Document compliance risks (only set when document signals are provided).
  | "missing_required_document"
  | "pending_document_review"
  | "expired_document"
  | "expiring_document"
  | "rejected_document";

export type PayrollReadiness = "ready" | "needs_review" | "blocked_visual";

export interface RiskTag {
  key: RiskKey;
  label: string;
  tone: "warning" | "destructive" | "muted";
  description: string;
}

const RISK_META: Record<RiskKey, Omit<RiskTag, "key">> = {
  pending_identity:    { label: "Pending identity",       tone: "destructive", description: "Identidad no resuelta (placeholder, emergency o unresolved). Revisar antes de asignar o aprobar payroll." },
  duplicate_review:    { label: "Revisión de duplicados", tone: "warning",     description: "Comparte teléfono, email o código con otro registro." },
  suspicious_email:    { label: "Email sospechoso",     tone: "warning",     description: "Email parece compartido, genérico o un placeholder." },
  missing_role:        { label: "Falta rol",             tone: "muted",       description: "Sin rol asignado." },
  phone_invalid:       { label: "Teléfono mal formado",  tone: "muted",       description: "El teléfono no está normalizado a 10 dígitos US." },
  historical_active:   { label: "Histórico activo",      tone: "warning",     description: "Marcado como histórico/legacy pero el portal sigue activo." },
  test_account:        { label: "Cuenta de prueba",      tone: "destructive", description: "Nombre o email parece cuenta de test, demo o QA." },
  system_placeholder:  { label: "Placeholder del sistema", tone: "destructive", description: "Placeholder auto-generado (p. ej. ‘System 3’). No es un trabajador real." },
  missing_location:    { label: "Falta ubicación",       tone: "muted",       description: "Ciudad y estado están vacíos." },
  inactive_with_payroll: { label: "Inactivo · historial payroll", tone: "muted", description: "Inactivo con historial de payroll — mantener para auditoría." },
  missing_phone:       { label: "Falta teléfono",        tone: "warning",     description: "Sin teléfono. Requerido para invitar, contactar y comunicaciones de payroll." },
  missing_email:       { label: "Falta email",           tone: "muted",       description: "Sin email. Opcional pero útil para invitaciones y reportes." },
  missing_photo:       { label: "Falta foto",            tone: "muted",       description: "Sin foto de perfil. Requerida para reconocimiento facial e identidad." },
  missing_emergency_contact: { label: "Sin contacto de emergencia", tone: "muted", description: "Sin nombre ni teléfono de contacto de emergencia." },
  portal_not_active:   { label: "Portal inactivo",       tone: "muted",       description: "Aún no ha enlazado una cuenta de portal (sin user_id)." },
  missing_required_document: { label: "Documentos faltantes", tone: "warning",     description: "Uno o más documentos requeridos aún no están aprobados." },
  pending_document_review:   { label: "Documentos pendientes", tone: "muted",       description: "Documento(s) subidos esperando revisión del admin." },
  expired_document:          { label: "Documentos expirados", tone: "destructive", description: "Al menos un documento pasó su fecha de expiración." },
  expiring_document:         { label: "Documentos por expirar", tone: "warning",     description: "Al menos un documento expira en los próximos 30 días." },
  rejected_document:         { label: "Documentos rechazados", tone: "warning",     description: "Un documento subido fue rechazado y necesita reemplazo." },
};

/**
 * Curated subset surfaced in the compact Action Center on /app/employees.
 * The full grid stays available behind the "Ver diagnóstico completo" toggle.
 */
export const PRIMARY_RISK_KEYS: RiskKey[] = [
  "pending_identity",
  "missing_required_document",
  "duplicate_review",
  "portal_not_active",
  "missing_phone",
  "expired_document",
];

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
 *
 * @param employees       Employee records (already scoped by selectedCompanyId).
 * @param documentSignals Optional Map<employee_id, WorkerDocumentSignals> — when
 *                        provided, document-compliance risks (missing/pending/
 *                        expired/expiring/rejected) are added to each row.
 *                        Backwards compatible: when omitted, document risks are
 *                        not produced and counts stay at zero.
 */
export function analyzeEmployeeRisks(
  employees: any[],
  documentSignals?: Map<string, WorkerDocumentSignals>,
): RiskAnalysisResult {
  const byId = new Map<string, RiskKey[]>();
  const counts: Record<RiskKey, number> = {
    pending_identity: 0,
    duplicate_review: 0,
    suspicious_email: 0,
    missing_role: 0,
    phone_invalid: 0,
    historical_active: 0,
    test_account: 0,
    system_placeholder: 0,
    missing_location: 0,
    inactive_with_payroll: 0,
    missing_phone: 0,
    missing_email: 0,
    missing_photo: 0,
    missing_emergency_contact: 0,
    portal_not_active: 0,
    missing_required_document: 0,
    pending_document_review: 0,
    expired_document: 0,
    expiring_document: 0,
    rejected_document: 0,
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

    // Phase 2 — actionable profile-completeness signals (active workers only).
    if (isActive) {
      const phoneRaw = (e?.phone_number ?? "").toString().trim();
      if (!phoneRaw) tags.push("missing_phone");

      if (!emailRaw) tags.push("missing_email");

      const avatar = (e?.avatar_url ?? "").toString().trim();
      if (!avatar) tags.push("missing_photo");

      const ecName = (e?.emergency_contact_name ?? "").toString().trim();
      const ecPhone = (e?.emergency_contact_phone ?? "").toString().trim();
      if (!ecName && !ecPhone) tags.push("missing_emergency_contact");

      if (!portalActive) tags.push("portal_not_active");
    }

    // Document compliance risks — only computed when caller passes signals.
    // Only surface for active workers; we do not want to nag inactive records.
    const docSig = documentSignals?.get(e.id);
    if (docSig && isActive) {
      if (docSig.missingRequiredLabels.length > 0) tags.push("missing_required_document");
      if (docSig.pendingCount > 0) tags.push("pending_document_review");
      if (docSig.expiredCount > 0) tags.push("expired_document");
      if (docSig.expiringSoonCount > 0) tags.push("expiring_document");
      if (docSig.rejectedCount > 0) tags.push("rejected_document");
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
    risks.includes("missing_role") ||
    risks.includes("missing_phone") ||
    risks.includes("missing_required_document") ||
    risks.includes("expired_document") ||
    risks.includes("rejected_document")
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
  "expired_document",
  "rejected_document",
  "missing_required_document",
  "duplicate_review",
  "historical_active",
  "expiring_document",
  "pending_document_review",
  "suspicious_email",
  "missing_phone",
  "phone_invalid",
  "missing_email",
  "missing_photo",
  "missing_emergency_contact",
  "portal_not_active",
  "missing_role",
  "missing_location",
  "inactive_with_payroll",
];

export const READINESS_LABEL: Record<PayrollReadiness, string> = {
  ready: "Listos para payroll",
  needs_review: "Necesitan revisión",
  blocked_visual: "Riesgo payroll",
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
