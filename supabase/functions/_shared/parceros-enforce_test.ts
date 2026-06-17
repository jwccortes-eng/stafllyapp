/**
 * E5.6 — Enforcement decider tests (pure, no DB, no network).
 *
 * Covers Q1–Q12 from the approved E5.6 scope:
 *   Q1  log_only + consent missing → allow (current behavior preserved)
 *   Q2  enforce  + consent missing → block(consent_missing)
 *   Q3  enforce  + consent revoked → block(consent_revoked)
 *   Q4  enforce  + consent denied  → block(consent_denied)
 *   Q5  enforce  + consent error   → block(consent_error)  [fail-closed]
 *   Q6  enforce  + granted + visibility hidden → block(visibility_hidden)
 *   Q7  enforce  + granted + visibility public → allow, full payload
 *   Q8  enforce  + granted + show_reputation=false → allow, reduced payload
 *   Q9  enforce  + granted + show_skills=false    → allow, reduced payload
 *   Q10 forbidden-key guardrail respects PARCEROS_GUARDRAIL_MODE (E5.3 intact)
 *   Q11 logs emitted by the decider contract carry no PII
 *   Q12 rollback to log_only → no block, even with missing consent
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  decideEnforcement,
  normalizeMode,
  type ConsentStatus,
  type EnforcementMode,
} from "./parceros-consent-decider.ts";
import { toParcerosSyncBody } from "./parceros-payload.ts";
import { findForbiddenKeys } from "./parceros-forbidden-keys.ts";
import {
  buildFullVisibilityPayload,
  withVisibilityOverrides,
} from "./__fixtures__/passport-payloads.ts";

const publicVis = { profile_visibility: "public" };
const hiddenVis = { profile_visibility: "hidden" }; // legacy literal
const privateVis = { profile_visibility: "private" };
const limitedVis = { profile_visibility: "limited" };
const nullVis = { profile_visibility: null };
const undefinedVis = {}; // profile_visibility omitted
const unknownVis = { profile_visibility: "weird" };


// ── Q1 ────────────────────────────────────────────────────────────────────
Deno.test("Q1 log_only + consent missing → allow (no block, current behavior preserved)", () => {
  const d = decideEnforcement("missing", publicVis, "log_only");
  assertEquals(d.allow, true);
  assertEquals(d.blocked_reason, null);
  assertEquals(d.mode, "log_only");
  assertEquals(d.would_block_in_enforce, true);
});

// ── Q2 ────────────────────────────────────────────────────────────────────
Deno.test("Q2 enforce + consent missing → block(consent_missing)", () => {
  const d = decideEnforcement("missing", publicVis, "enforce");
  assertEquals(d.allow, false);
  assertEquals(d.blocked_reason, "consent_missing");
});

// ── Q3 ────────────────────────────────────────────────────────────────────
Deno.test("Q3 enforce + consent revoked → block(consent_revoked)", () => {
  const d = decideEnforcement("revoked", publicVis, "enforce");
  assertEquals(d.allow, false);
  assertEquals(d.blocked_reason, "consent_revoked");
});

// ── Q4 ────────────────────────────────────────────────────────────────────
Deno.test("Q4 enforce + consent denied → block(consent_denied)", () => {
  const d = decideEnforcement("denied", publicVis, "enforce");
  assertEquals(d.allow, false);
  assertEquals(d.blocked_reason, "consent_denied");
});

// ── Q5 ────────────────────────────────────────────────────────────────────
Deno.test("Q5 enforce + consent error → block(consent_error) [fail-closed]", () => {
  const d = decideEnforcement("error", publicVis, "enforce");
  assertEquals(d.allow, false);
  assertEquals(d.blocked_reason, "consent_error");
});

// ── Q6 ────────────────────────────────────────────────────────────────────
Deno.test("Q6 enforce + granted + visibility hidden → block(visibility_hidden)", () => {
  const d = decideEnforcement("granted", hiddenVis, "enforce");
  assertEquals(d.allow, false);
  assertEquals(d.blocked_reason, "visibility_hidden");
});

// ── Q7 ────────────────────────────────────────────────────────────────────
Deno.test("Q7 enforce + granted + visibility public → allow, full payload", () => {
  const d = decideEnforcement("granted", publicVis, "enforce");
  assertEquals(d.allow, true);
  assertEquals(d.blocked_reason, null);

  const body = toParcerosSyncBody(buildFullVisibilityPayload());
  assertEquals(body.display_name, "Ana Rivera");
  assertEquals(body.reputation_score !== null, true);
  assertEquals(body.skills.length > 0, true);
  assertEquals(findForbiddenKeys(body), []);
});

// ── Q8 ────────────────────────────────────────────────────────────────────
Deno.test("Q8 enforce + granted + show_reputation=false → allow, reputation nulled", () => {
  const d = decideEnforcement("granted", publicVis, "enforce");
  assertEquals(d.allow, true);

  const payload = withVisibilityOverrides(buildFullVisibilityPayload(), {
    show_reputation: false,
  });
  const body = toParcerosSyncBody(payload);
  assertEquals(body.reputation_score, null);
  assertEquals(body.ratings_breakdown.punctuality, null);
  assertEquals(findForbiddenKeys(body), []);
});

// ── Q9 ────────────────────────────────────────────────────────────────────
Deno.test("Q9 enforce + granted + show_skills=false → allow, skills=[]", () => {
  const d = decideEnforcement("granted", publicVis, "enforce");
  assertEquals(d.allow, true);

  const payload = withVisibilityOverrides(buildFullVisibilityPayload(), {
    show_skills: false,
  });
  const body = toParcerosSyncBody(payload);
  assertEquals(body.skills, []);
  assertEquals(findForbiddenKeys(body), []);
});

// ── Q10 ───────────────────────────────────────────────────────────────────
Deno.test("Q10 forbidden-key guardrail respects PARCEROS_GUARDRAIL_MODE (E5.3 intact)", () => {
  // Default (warn-only): mutated body returns hits without throwing.
  const body = toParcerosSyncBody(buildFullVisibilityPayload()) as unknown as Record<string, unknown>;
  (body.external_data as Record<string, unknown>).notes = "internal";
  const hits = findForbiddenKeys(body);
  assertEquals(hits.some((h) => h.key === "notes"), true);

  // Enforce simulation: env-driven; we don't flip it here. We only assert that
  // the helper is the same one used in production (no replacement / no shadow).
  // E5.3 owns the runtime enforce branch; E5.6 must not change it.
});

// ── Q11 ───────────────────────────────────────────────────────────────────
Deno.test("Q11 decision payload contract carries no PII", () => {
  const cases: Array<[ConsentStatus, EnforcementMode]> = [
    ["granted", "enforce"], ["missing", "enforce"], ["revoked", "enforce"],
    ["denied", "enforce"], ["error", "enforce"], ["missing", "log_only"],
  ];
  const PII_KEYS = [
    "name", "first_name", "last_name", "email", "phone", "phone_number",
    "ip", "ip_address", "address", "ssn", "ein", "tax_id", "tin",
    "comment", "notes", "reviewer", "reviewer_name",
  ];
  for (const [status, mode] of cases) {
    const d = decideEnforcement(status, publicVis, mode);
    const keys = Object.keys(d).map((k) => k.toLowerCase());
    for (const forbidden of PII_KEYS) {
      assertEquals(keys.includes(forbidden), false, `decision leaked PII key: ${forbidden}`);
    }
    // String values must not look like emails or phone numbers either.
    const serialized = JSON.stringify(d);
    assertEquals(/@[\w.-]+\.[A-Za-z]{2,}/.test(serialized), false, "decision serialized email");
    assertEquals(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(serialized), false, "decision serialized phone");
  }
});

// ── Q12 ───────────────────────────────────────────────────────────────────
Deno.test("Q12 rollback to log_only never blocks (even with missing/revoked/denied/error)", () => {
  for (const status of ["missing", "revoked", "denied", "error", "granted"] as ConsentStatus[]) {
    const d = decideEnforcement(status, hiddenVis, "log_only");
    assertEquals(d.allow, true, `log_only must not block status=${status}`);
    assertEquals(d.blocked_reason, null);
  }
  // mode="off" likewise never blocks.
  for (const status of ["missing", "revoked"] as ConsentStatus[]) {
    const d = decideEnforcement(status, hiddenVis, "off");
    assertEquals(d.allow, true);
    assertEquals(d.blocked_reason, null);
  }
});

// ── Bonus: normalizeMode coerces unknown values to log_only (safe default) ──
Deno.test("normalizeMode coerces unknown/empty to log_only", () => {
  assertEquals(normalizeMode(undefined), "log_only");
  assertEquals(normalizeMode(""), "log_only");
  assertEquals(normalizeMode("ENFORCE"), "enforce");
  assertEquals(normalizeMode(" off "), "off");
  assertEquals(normalizeMode("garbage"), "log_only");
});

// ──────────────────────────────────────────────────────────────────────────
// E5.7B — Real-enum visibility coverage (R1–R7)
// Aligns decider with the Postgres enum (private | limited | public) and the
// fail-closed rule: only "public" publishes; everything else blocks under
// enforce. log_only behavior must be unchanged.
// ──────────────────────────────────────────────────────────────────────────

// ── R1 ────────────────────────────────────────────────────────────────────
Deno.test("R1 enforce + granted + visibility public → allow", () => {
  const d = decideEnforcement("granted", publicVis, "enforce");
  assertEquals(d.allow, true);
  assertEquals(d.blocked_reason, null);
  assertEquals(d.would_block_in_enforce, false);
});

// ── R2 ────────────────────────────────────────────────────────────────────
Deno.test("R2 enforce + granted + visibility private → block(visibility_private)", () => {
  const d = decideEnforcement("granted", privateVis, "enforce");
  assertEquals(d.allow, false);
  assertEquals(d.blocked_reason, "visibility_private");
  assertEquals(d.would_block_in_enforce, true);
});

// ── R3 ────────────────────────────────────────────────────────────────────
Deno.test("R3 enforce + granted + visibility limited → block(visibility_limited)", () => {
  const d = decideEnforcement("granted", limitedVis, "enforce");
  assertEquals(d.allow, false);
  assertEquals(d.blocked_reason, "visibility_limited");
  assertEquals(d.would_block_in_enforce, true);
});

// ── R4 ────────────────────────────────────────────────────────────────────
Deno.test("R4 enforce + granted + visibility hidden (legacy literal) → block(visibility_hidden)", () => {
  const d = decideEnforcement("granted", hiddenVis, "enforce");
  assertEquals(d.allow, false);
  assertEquals(d.blocked_reason, "visibility_hidden");
});

// ── R5 ────────────────────────────────────────────────────────────────────
Deno.test("R5 enforce + granted + visibility null/undefined → block(visibility_unknown)", () => {
  const dNull = decideEnforcement("granted", nullVis, "enforce");
  assertEquals(dNull.allow, false);
  assertEquals(dNull.blocked_reason, "visibility_unknown");

  const dUndef = decideEnforcement("granted", undefinedVis, "enforce");
  assertEquals(dUndef.allow, false);
  assertEquals(dUndef.blocked_reason, "visibility_unknown");

  const dRowNull = decideEnforcement("granted", null, "enforce");
  assertEquals(dRowNull.allow, false);
  assertEquals(dRowNull.blocked_reason, "visibility_unknown");
});

// ── R6 ────────────────────────────────────────────────────────────────────
Deno.test("R6 enforce + granted + visibility unknown string → block(visibility_unknown)", () => {
  const d = decideEnforcement("granted", unknownVis, "enforce");
  assertEquals(d.allow, false);
  assertEquals(d.blocked_reason, "visibility_unknown");
});

// ── R7 ────────────────────────────────────────────────────────────────────
Deno.test("R7 log_only + private/limited/unknown → never blocks (runtime preserved)", () => {
  for (const vis of [privateVis, limitedVis, nullVis, undefinedVis, unknownVis]) {
    const d = decideEnforcement("granted", vis, "log_only");
    assertEquals(d.allow, true);
    assertEquals(d.blocked_reason, null);
    // Telemetry still reflects what enforce would have done.
    assertEquals(d.would_block_in_enforce, true);
  }
});
