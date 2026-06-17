/**
 * E5.5 — Consent + Visibility enforcement tests (contract-level)
 *
 * Verifies the LOGICAL contract that Parceros sync MUST honor:
 *   - missing/revoked consent → shouldPublish=false (payload null in simulation)
 *   - profile_visibility=hidden → reduced payload, display_name="Worker"
 *   - per-field visibility flags → corresponding field nulled/emptied
 *   - E5.3 guardrail cross-check on every produced body
 *
 * Limitation (explicit): does NOT test runtime blocking of parceros-sync.
 * Today PARCEROS_CONSENT_MODE=log_only does not block. Real enforcement
 * is deferred to E5.6 (separate approval). No runtime, env, RLS, schema,
 * migration, edge-function, frontend, or production-data changes.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { toParcerosSyncBody } from "./parceros-payload.ts";
import { findForbiddenKeys } from "./parceros-forbidden-keys.ts";
import {
  buildFullVisibilityPayload,
  makeConsent,
  shouldPublishPassport,
  withVisibilityOverrides,
} from "./__fixtures__/passport-payloads.ts";

// ── C1: consent missing → shouldPublish=false / payload null in simulation ──
Deno.test("C1 consent missing → shouldPublish=false, simulated payload is null", () => {
  const consent = makeConsent("missing");
  assertEquals(shouldPublishPassport(consent), false);
  const simulatedPayload = shouldPublishPassport(consent)
    ? toParcerosSyncBody(buildFullVisibilityPayload())
    : null;
  assertEquals(simulatedPayload, null);
});

// ── C2: consent revoked → shouldPublish=false / payload null in simulation ──
Deno.test("C2 consent revoked → shouldPublish=false, simulated payload is null", () => {
  const consent = makeConsent("revoked");
  assertEquals(shouldPublishPassport(consent), false);
  const simulatedPayload = shouldPublishPassport(consent)
    ? toParcerosSyncBody(buildFullVisibilityPayload())
    : null;
  assertEquals(simulatedPayload, null);
});

// ── C3: consent granted + full visibility → complete payload ──
Deno.test("C3 consent granted + full visibility → complete payload", () => {
  const consent = makeConsent("granted");
  assertEquals(shouldPublishPassport(consent), true);

  const body = toParcerosSyncBody(buildFullVisibilityPayload());
  assertEquals(body.display_name, "Ana Rivera");
  assertEquals(body.skills.length > 0, true);
  assertEquals(body.years_experience, 5);
  assertEquals(body.reputation_score, 4.7);
  assertEquals(body.ratings_breakdown.punctuality, 4.8);
  assertEquals(typeof body.work_history_summary === "string", true);
  assertEquals(findForbiddenKeys(body), []);
});

// ── C4: profile_visibility=hidden → reduced payload ──
Deno.test("C4 profile_visibility=hidden → reduced payload, display_name='Worker'", () => {
  const payload = withVisibilityOverrides(buildFullVisibilityPayload(), {
    profile_visibility: "hidden",
    show_first_name: false,
    show_last_name: false,
    show_photo: false,
    show_skills: false,
    show_experience: false,
    show_reputation: false,
    show_work_history: false,
    show_city: false,
  });
  const body = toParcerosSyncBody(payload);
  assertEquals(body.display_name, "Worker");
  assertEquals(body.skills, []);
  assertEquals(body.years_experience, null);
  assertEquals(body.reputation_score, null);
  assertEquals(body.ratings_breakdown.punctuality, null);
  assertEquals(body.work_history_summary, null);
  assertEquals(findForbiddenKeys(body), []);
});

// ── C5: show_reputation=false → reputation_score null and ratings null ──
Deno.test("C5 show_reputation=false → reputation_score null and ratings nulled", () => {
  const payload = withVisibilityOverrides(buildFullVisibilityPayload(), {
    show_reputation: false,
  });
  const body = toParcerosSyncBody(payload);
  assertEquals(body.reputation_score, null);
  assertEquals(body.ratings_breakdown, {
    punctuality: null,
    communication: null,
    professionalism: null,
    service_attitude: null,
  });
  assertEquals(findForbiddenKeys(body), []);
});

// ── C6: show_work_history=false → work_history_summary null ──
Deno.test("C6 show_work_history=false → work_history_summary null", () => {
  const payload = withVisibilityOverrides(buildFullVisibilityPayload(), {
    show_work_history: false,
  });
  const body = toParcerosSyncBody(payload);
  assertEquals(body.work_history_summary, null);
  assertEquals(findForbiddenKeys(body), []);
});

// ── C7: show_skills=false → skills [] ──
Deno.test("C7 show_skills=false → skills []", () => {
  const payload = withVisibilityOverrides(buildFullVisibilityPayload(), {
    show_skills: false,
  });
  const body = toParcerosSyncBody(payload);
  assertEquals(body.skills, []);
  assertEquals(findForbiddenKeys(body), []);
});

// ── C8: show_city=false → city not exposed at top level ──
Deno.test("C8 show_city=false → city is not exposed in top-level contract", () => {
  const payload = withVisibilityOverrides(buildFullVisibilityPayload(), {
    show_city: false,
  });
  const body = toParcerosSyncBody(payload);
  // Parceros top-level contract intentionally does NOT expose city; verify it stays out.
  const topKeys = Object.keys(body);
  assertEquals(topKeys.includes("city"), false);
  assertEquals(topKeys.includes("location"), false);
  assertEquals(topKeys.includes("address"), false);
  assertEquals(findForbiddenKeys(body), []);
});

// ── C9: show_photo=false → avatar not exposed publicly ──
Deno.test("C9 show_photo=false → avatar not exposed in top-level contract", () => {
  const payload = withVisibilityOverrides(buildFullVisibilityPayload(), {
    show_photo: false,
  });
  const body = toParcerosSyncBody(payload);
  const topKeys = Object.keys(body);
  // Parceros top-level contract does NOT include avatar_url / photo_url; verify it stays out.
  assertEquals(topKeys.includes("avatar_url"), false);
  assertEquals(topKeys.includes("photo_url"), false);
  assertEquals(topKeys.includes("avatar"), false);
  assertEquals(findForbiddenKeys(body), []);
});

// ── C10: show_first_name=false + show_last_name=false → display_name='Worker' ──
Deno.test("C10 first+last hidden → display_name='Worker'", () => {
  const payload = withVisibilityOverrides(buildFullVisibilityPayload(), {
    show_first_name: false,
    show_last_name: false,
  });
  const body = toParcerosSyncBody(payload);
  assertEquals(body.display_name, "Worker");
  assertEquals(findForbiddenKeys(body), []);
});

// ── C11: E5.3 guardrail cross-check ──
Deno.test("C11 E5.3 cross-check → findForbiddenKeys(body) === [] for all visibility modes", () => {
  const full = toParcerosSyncBody(buildFullVisibilityPayload());
  const hidden = toParcerosSyncBody(
    withVisibilityOverrides(buildFullVisibilityPayload(), {
      profile_visibility: "hidden",
      show_first_name: false,
      show_last_name: false,
      show_photo: false,
      show_skills: false,
      show_experience: false,
      show_reputation: false,
      show_work_history: false,
      show_city: false,
    }),
  );
  assertEquals(findForbiddenKeys(full), []);
  assertEquals(findForbiddenKeys(hidden), []);
});
