/**
 * Ecosystem Profile Standard v1 — layer model and pure helpers.
 *
 * @status foundation-only — do not wire until E2 approved
 *
 * This module defines the canonical 4-layer model for worker identity across
 * the Stafly ecosystem (Core, Parceros, Public Passport). It contains ONLY
 * pure types and helpers — no React, no Supabase, no hooks, no I/O.
 *
 * See: docs/ECOSYSTEM_PROFILE_STANDARD.md
 */

/** The 4 canonical layers of worker identity. */
export type ProfileLayer = "L1" | "L2" | "L3" | "L4";

/** Provenance of a derived value when multiple sources may coexist. */
export type ProfileSource = "legacy" | "db" | "mixed" | "none";

/** Who is acting on the field. */
export type ProfileActor = "worker" | "admin_tenant" | "system" | "public";

/** Canonical field keys recognized by the standard. */
export type ProfileFieldKey =
  | "legal_name"
  | "display_name"
  | "photo"
  | "phone"
  | "email"
  | "address"
  | "emergency_contact"
  | "ssn_last4"
  | "tin_last4"
  | "primary_role"
  | "skills"
  | "languages"
  | "experience"
  | "reputation_score"
  | "consent_records";

/** Human-readable label for each layer. ES-first per Admin Desk policy. */
export const PROFILE_LAYER_LABELS: Record<ProfileLayer, string> = {
  L1: "Fiscal / sensible",
  L2: "Tenant operativo",
  L3: "Ecosistema",
  L4: "Passport público",
};

/** Short tooltip describing each layer. */
export const PROFILE_LAYER_DESCRIPTIONS: Record<ProfileLayer, string> = {
  L1: "Datos fiscales y sensibles. Solo admin del tenant y el worker dueño.",
  L2: "Datos operativos del tenant: contacto, dirección, compensación, documentos.",
  L3: "Perfil portátil cross-tenant: skills, idiomas, experiencia, visibilidad.",
  L4: "Vitrina pública vía slug. Gateado por consentimiento y RPC.",
};

/** Maps a canonical field to the lowest layer that owns it. */
export function getLayerForField(field: ProfileFieldKey): ProfileLayer {
  switch (field) {
    case "ssn_last4":
    case "tin_last4":
      return "L1";
    case "legal_name":
    case "phone":
    case "email":
    case "address":
    case "emergency_contact":
    case "photo":
    case "display_name":
    case "primary_role":
      return "L2";
    case "skills":
    case "languages":
    case "experience":
    case "reputation_score":
    case "consent_records":
      return "L3";
  }
}

/**
 * Pure permission check for the standard. Returns true if the actor is
 * allowed to edit the given field according to the v1 matrix. This is a
 * specification helper — surfaces still enforce their own RLS and guards.
 */
export function canEditField(field: ProfileFieldKey, actor: ProfileActor): boolean {
  if (actor === "public") return false;
  if (actor === "system") return field === "reputation_score";

  if (actor === "admin_tenant") {
    switch (field) {
      case "legal_name":
      case "primary_role":
        return true;
      default:
        return false;
    }
  }

  // actor === "worker"
  switch (field) {
    case "legal_name":
      return false;
    case "ssn_last4":
    case "tin_last4":
      return true; // via W-9 guided flow
    case "reputation_score":
      return false;
    default:
      return true;
  }
}
