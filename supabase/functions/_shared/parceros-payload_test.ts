/**
 * E5.3 — Parceros payload guardrail tests
 *
 * Verifies:
 *  - happy path produces 0 forbidden hits
 *  - visibility=false fixture produces 0 forbidden hits
 *  - mutated fixtures (notes / company_id / phone) are detected
 *  - toParcerosSyncBody output shape is stable (keys match snapshot)
 *
 * Does NOT touch DB, RLS, edge function behavior, or production data.
 */

import {
  assertEquals,
  assertGreater,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  toParcerosSyncBody,
  type ParcerosSyncPayload,
} from "./parceros-payload.ts";
import {
  findForbiddenKeys,
  PARCEROS_FORBIDDEN_KEYS,
} from "./parceros-forbidden-keys.ts";

// ── Fixtures ───────────────────────────────────────────────────────────────

function happyPayload(): ParcerosSyncPayload {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-17T00:00:00.000Z",
    source: "staflyapps",
    worker: {
      stafly_worker_id: "wp_demo_001",
      public_slug: "demo-worker",
      profile: {
        first_name: "Demo",
        last_name: "Worker",
        headline: "Reliable operator",
        bio: null,
        city: "Brooklyn",
        state: "NY",
        country: "US",
        english_level: "intermediate",
        years_of_experience: 3,
        verification_status: "verified",
        is_available_for_marketplace: true,
        avatar_url: null,
      },
      skills: [
        { name: "Bartending", category: "hospitality", proficiency_level: "advanced", years_experience: 3 },
      ],
      verified_metrics: {
        total_verified_hours: 120,
        total_verified_jobs: 8,
        total_companies_worked: 2,
        certifications_count: 1,
      },
      reputation: {
        overall_score: 4.6,
        punctuality: 4.7,
        quality: 4.5,
        service: 4.6,
        professionalism: 4.8,
        teamwork: 4.5,
        presentation: 4.4,
        total_reviews: 12,
        no_show_count: 0,
        cancellation_count: 0,
        score_version: 1,
        last_calculated_at: "2026-06-16T00:00:00.000Z",
      },
      badges: [
        { badge_code: "punctual", badge_name: "Puntual", emoji: "⏱️", earned_at: "2026-05-01T00:00:00.000Z" },
      ],
      work_history: [
        { company_name: "Acme Events", role_name: "Bartender", date_start: "2025-01-01", date_end: "2025-06-01", total_hours: 80, is_verified: true },
      ],
      visibility: {
        show_first_name: true,
        show_last_name: true,
        show_photo: true,
        show_skills: true,
        show_experience: true,
        show_reputation: true,
        show_work_history: true,
        show_city: true,
        show_approximate_location: true,
        profile_visibility: "public",
      },
      profile_updated_at: "2026-06-15T00:00:00.000Z",
      passport_updated_at: "2026-06-15T00:00:00.000Z",
      reputation_updated_at: "2026-06-16T00:00:00.000Z",
    },
  };
}

function hiddenPayload(): ParcerosSyncPayload {
  const p = happyPayload();
  p.worker.visibility = {
    show_first_name: false,
    show_last_name: false,
    show_photo: false,
    show_skills: false,
    show_experience: false,
    show_reputation: false,
    show_work_history: false,
    show_city: false,
    show_approximate_location: false,
    profile_visibility: "hidden",
  };
  return p;
}

const EXPECTED_TOP_LEVEL_KEYS = [
  "external_worker_id",
  "display_name",
  "skills",
  "years_experience",
  "english_level",
  "total_hours_worked",
  "total_verified_jobs",
  "total_companies_worked",
  "reputation_score",
  "ratings_breakdown",
  "certifications_count",
  "work_history_summary",
  "last_synced_at",
  "source",
  "external_data",
].sort();

// ── Tests ──────────────────────────────────────────────────────────────────

Deno.test("happy path → 0 forbidden hits", () => {
  const body = toParcerosSyncBody(happyPayload());
  const hits = findForbiddenKeys(body);
  assertEquals(hits, [], `expected 0 forbidden hits, got: ${JSON.stringify(hits)}`);
});

Deno.test("visibility=false fixture → 0 forbidden hits + safe defaults", () => {
  const body = toParcerosSyncBody(hiddenPayload());
  const hits = findForbiddenKeys(body);
  assertEquals(hits, []);
  assertEquals(body.display_name, "Worker");
  assertEquals(body.skills, []);
  assertEquals(body.reputation_score, null);
  assertEquals(body.years_experience, null);
});

Deno.test("mutated fixture with `notes` → forbidden key detected", () => {
  const body = toParcerosSyncBody(happyPayload()) as unknown as Record<string, unknown>;
  (body.external_data as Record<string, unknown>).notes = "internal private note";
  const hits = findForbiddenKeys(body);
  assertGreater(hits.length, 0);
  assertEquals(hits.some((h) => h.key === "notes"), true);
});

Deno.test("mutated fixture with `company_id` → forbidden key detected", () => {
  const body = toParcerosSyncBody(happyPayload()) as unknown as Record<string, unknown>;
  (body.external_data as Record<string, unknown>).company_id = "tenant-abc";
  const hits = findForbiddenKeys(body);
  assertEquals(hits.some((h) => h.key === "company_id"), true);
});

Deno.test("mutated fixture with `phone` → forbidden key detected", () => {
  const body = toParcerosSyncBody(happyPayload()) as unknown as Record<string, unknown>;
  ((body.external_data as Record<string, unknown>).worker as Record<string, unknown>).phone = "5550100";
  const hits = findForbiddenKeys(body);
  assertEquals(hits.some((h) => h.key === "phone"), true);
});

Deno.test("output shape is stable (top-level keys)", () => {
  const body = toParcerosSyncBody(happyPayload());
  const keys = Object.keys(body).sort();
  assertEquals(keys, EXPECTED_TOP_LEVEL_KEYS);
});

Deno.test("forbidden list covers all required categories", () => {
  const set = new Set(PARCEROS_FORBIDDEN_KEYS.map((k) => k.toLowerCase()));
  for (const k of [
    "comment", "comments", "note", "notes", "private", "private_notes",
    "tag", "tags", "flag", "flags",
    "reviewer", "reviewer_id", "reviewer_name",
    "shift_id", "client_id", "client_name",
    "location_id", "location_name",
    "company_id", "company_name", "tenant_id",
    "employee_id", "internal_id", "reviewed_employee_id", "worker_profile_id",
    "ssn", "ein", "tax_id",
    "phone", "phone_number", "email", "address",
  ]) {
    assertEquals(set.has(k), true, `missing forbidden key: ${k}`);
  }
});

Deno.test("allowlisted contract IDs do NOT trigger guardrail", () => {
  const obj = { external_worker_id: "wp_x", stafly_worker_id: "wp_y" };
  assertEquals(findForbiddenKeys(obj), []);
});
