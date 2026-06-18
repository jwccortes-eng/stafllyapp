/**
 * Stafly Worker Data Standard v1 — Phase 1A foundation.
 *
 * Pure helpers + canonical layer table for worker profile presentation.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SCOPE — PRESENTATION ONLY
 * ──────────────────────────────────────────────────────────────────────────
 * - No DB writes, no migrations, no schema changes.
 * - No payroll, time_entries, shift_assignments, scheduled_shifts, payments,
 *   bookings, auth, RLS, tenants, or edge-function coupling.
 * - No document approval / W-9 submission logic.
 * - No deletion of legacy fields — this module only classifies them so the
 *   UI can decide where to render each one (main view vs. audit collapsible).
 *
 * Companion to `src/lib/profile-layers.ts` (E1 standard L1–L4). This file
 * adds the operational 5-layer model (C1–C5) used by admin worker profile
 * and worker portal surfaces, plus three pure helpers consumers can use to
 * decide whether a field belongs in the main view or in the audit block.
 *
 * See: docs/ECOSYSTEM_PROFILE_STANDARD.md and the audit "Stafly Worker Data
 * Standard — Propuesta v1" approved for TestFlight 1.0 (8).
 */

/** Operational layer. */
export type WorkerDataLayer =
  | "C1" // Identity (contactability, recognition)
  | "C2" // Work relationship (tenant operational)
  | "C3" // Readiness / compliance
  | "C4" // Payroll / timekeeping (permission-gated)
  | "C5"; // Imported / audit (legacy, source provenance)

/** Where a given field should render in the admin profile UI. */
export type FieldView = "main" | "audit";

export interface FieldClassification {
  /** Snake_case canonical key — matches `employees` column when applicable. */
  key: string;
  /** Operational layer (C1–C5). */
  layer: WorkerDataLayer;
  /** Where the field should be rendered by default. */
  view: FieldView;
  /** Hide from main view when the value is empty/null. */
  hideIfEmpty: boolean;
  /** Field carries PII or fiscal/sensitive data; surfaces must gate it. */
  sensitive: boolean;
  /** Free-form note for maintainers — not rendered. */
  note?: string;
}

/**
 * Canonical classification table.
 *
 * Intentionally conservative: every entry mirrors a field that already
 * exists in the codebase and was reviewed in the Phase-1 audit. Adding a
 * key here does NOT make anything appear in the UI — surfaces opt-in by
 * calling the helpers below.
 */
const TABLE: Record<string, FieldClassification> = {
  // ── C1 · Identity ──────────────────────────────────────────────────────
  legal_name:       { key: "legal_name",       layer: "C1", view: "main",  hideIfEmpty: false, sensitive: false },
  preferred_name:   { key: "preferred_name",   layer: "C1", view: "main",  hideIfEmpty: true,  sensitive: false },
  avatar_url:       { key: "avatar_url",       layer: "C1", view: "main",  hideIfEmpty: false, sensitive: false },
  phone_number:     { key: "phone_number",     layer: "C1", view: "main",  hideIfEmpty: false, sensitive: true,  note: "PII — privileged only cross-tenant" },
  email:            { key: "email",            layer: "C1", view: "main",  hideIfEmpty: true,  sensitive: true,  note: "PII" },
  preferred_language:{key: "preferred_language",layer:"C1", view: "main",  hideIfEmpty: true,  sensitive: false },
  gender:           { key: "gender",           layer: "C1", view: "main",  hideIfEmpty: true,  sensitive: false },
  birthday:         { key: "birthday",         layer: "C1", view: "main",  hideIfEmpty: true,  sensitive: false, note: "Display-only birthday; DOB for payroll lives in audit." },

  // ── C2 · Work relationship ─────────────────────────────────────────────
  company_id:       { key: "company_id",       layer: "C2", view: "audit", hideIfEmpty: false, sensitive: false },
  employee_role:    { key: "employee_role",    layer: "C2", view: "main",  hideIfEmpty: true,  sensitive: false },
  worker_type:      { key: "worker_type",      layer: "C2", view: "main",  hideIfEmpty: true,  sensitive: false },
  direct_manager:   { key: "direct_manager",   layer: "C2", view: "audit", hideIfEmpty: true,  sensitive: false, note: "Free-text legacy manager string — moved out of main view in IA v3." },
  recommended_by:   { key: "recommended_by",   layer: "C2", view: "audit", hideIfEmpty: true,  sensitive: false },
  start_date:       { key: "start_date",       layer: "C2", view: "main",  hideIfEmpty: false, sensitive: false },
  end_date:         { key: "end_date",         layer: "C2", view: "main",  hideIfEmpty: true,  sensitive: false, note: "Only render when set." },
  profile_status:   { key: "profile_status",   layer: "C2", view: "main",  hideIfEmpty: false, sensitive: false },
  is_active:        { key: "is_active",        layer: "C2", view: "main",  hideIfEmpty: false, sensitive: false },
  portal_access_enabled:{key:"portal_access_enabled",layer:"C2",view:"main",hideIfEmpty:false,sensitive:false },
  driver_status:    { key: "driver_status",    layer: "C2", view: "main",  hideIfEmpty: false, sensitive: false, note: "Derived; never mutate isEmployeeDriver()." },

  // ── C3 · Readiness / compliance ────────────────────────────────────────
  w9_status:        { key: "w9_status",        layer: "C3", view: "main",  hideIfEmpty: false, sensitive: false },
  gov_id_status:    { key: "gov_id_status",    layer: "C3", view: "main",  hideIfEmpty: false, sensitive: false },
  drivers_license_status:{key:"drivers_license_status",layer:"C3",view:"main",hideIfEmpty:true,sensitive:false,note:"Hide when driver_status !== 'driver'." },
  photo_review_status:{key:"photo_review_status",layer:"C3",view:"main", hideIfEmpty: false, sensitive: false },
  onboarding_status:{ key: "onboarding_status",layer: "C3", view: "main",  hideIfEmpty: false, sensitive: false },
  emergency_contact_name:{key:"emergency_contact_name",layer:"C3",view:"main",hideIfEmpty:true,sensitive:true },
  emergency_contact_phone:{key:"emergency_contact_phone",layer:"C3",view:"main",hideIfEmpty:true,sensitive:true },
  address_structured:{key:"address_structured",layer:"C3", view: "main",  hideIfEmpty: true,  sensitive: true },

  // ── C4 · Payroll / timekeeping (permission-gated) ──────────────────────
  date_of_birth:    { key: "date_of_birth",    layer: "C4", view: "audit", hideIfEmpty: true,  sensitive: true,  note: "DOB only visible to payroll admins." },
  ssn_last4:        { key: "ssn_last4",        layer: "C4", view: "audit", hideIfEmpty: true,  sensitive: true,  note: "Masked. Never expose full SSN." },
  compensation_profile_id:{key:"compensation_profile_id",layer:"C4",view:"audit",hideIfEmpty:true,sensitive:true },

  // ── C5 · Imported / audit ──────────────────────────────────────────────
  connecteam_employee_id:{key:"connecteam_employee_id",layer:"C5",view:"audit",hideIfEmpty:true,sensitive:false },
  connecteam_manager:{key:"connecteam_manager",layer:"C5",view:"audit",hideIfEmpty:true,sensitive:false },
  added_via:        { key: "added_via",        layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  added_by:         { key: "added_by",         layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  date_added:       { key: "date_added",       layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  groups:           { key: "groups",           layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  tags:             { key: "tags",             layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  english_level:    { key: "english_level",    layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  qualify:          { key: "qualify",          layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  country_code:     { key: "country_code",     layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  county:           { key: "county",           layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  address:          { key: "address",          layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: true,  note: "Legacy free-text address. Structured replacement is address_structured (C3)." },
  has_car:          { key: "has_car",          layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false, note: "Raw legacy field; surface via derived driver_status only." },
  can_drive:        { key: "can_drive",        layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false, note: "Raw legacy field; surface via derived driver_status only." },
  merged_into_employee_id:{key:"merged_into_employee_id",layer:"C5",view:"audit",hideIfEmpty:true,sensitive:false },
  created_from_reconciliation:{key:"created_from_reconciliation",layer:"C5",view:"audit",hideIfEmpty:true,sensitive:false },
  last_login:       { key: "last_login",       layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  source:           { key: "source",           layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  import_source:    { key: "import_source",    layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  person_type_guess:{ key: "person_type_guess",layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
  payroll_safe:     { key: "payroll_safe",     layer: "C5", view: "audit", hideIfEmpty: true,  sensitive: false },
};

/** Unknown keys fall back to this safe classification (main, never hide). */
const DEFAULT_CLASSIFICATION: FieldClassification = {
  key: "__unknown__",
  layer: "C2",
  view: "main",
  hideIfEmpty: false,
  sensitive: false,
  note: "Unknown key — caller should treat conservatively.",
};

/**
 * Returns the canonical classification for a field key, or a safe default
 * when the key isn't registered yet. Pure and synchronous.
 */
export function getFieldClassification(key: string): FieldClassification {
  return TABLE[key] ?? { ...DEFAULT_CLASSIFICATION, key };
}

/**
 * Returns true when a field should be rendered in the main profile view
 * given its current value. Empty-aware: respects `hideIfEmpty` for null /
 * undefined / "" / [] values. Pure.
 */
export function shouldShowInMain(key: string, value: unknown): boolean {
  const c = getFieldClassification(key);
  if (c.view !== "main") return false;
  if (!c.hideIfEmpty) return true;
  return !isEmptyValue(value);
}

/**
 * True when the field belongs in the "Datos importados y auditoría"
 * collapsible (or another audit-only surface) — i.e. legacy/import data
 * that should not appear in the operational main view. Pure.
 */
export function isAuditOnly(key: string): boolean {
  return getFieldClassification(key).view === "audit";
}

/** Internal — treats null/undefined/""/empty-array as empty. */
function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
