/**
 * E5.5 — Pure fixture builders for consent/visibility tests.
 *
 * No DB access, no network, no edge runtime imports.
 * Mirrors the shape consumed by toParcerosSyncBody().
 */

import type { ParcerosSyncPayload } from "../parceros-payload.ts";

export type ConsentStatus = "granted" | "revoked" | "missing";

export interface ConsentRecord {
  status: ConsentStatus;
  granted_at: string | null;
  revoked_at: string | null;
  version: string;
}

export function makeConsent(status: ConsentStatus): ConsentRecord {
  if (status === "granted") {
    return {
      status,
      granted_at: "2026-06-01T00:00:00.000Z",
      revoked_at: null,
      version: "v1",
    };
  }
  if (status === "revoked") {
    return {
      status,
      granted_at: "2026-05-01T00:00:00.000Z",
      revoked_at: "2026-06-10T00:00:00.000Z",
      version: "v1",
    };
  }
  return { status, granted_at: null, revoked_at: null, version: "v1" };
}

/**
 * Pure predicate mirroring the contract that parceros-sync MUST honor
 * when PARCEROS_CONSENT_MODE eventually flips to "enforce" (E5.6).
 *
 * Tested here against the consent record only — does NOT touch runtime.
 */
export function shouldPublishPassport(consent: ConsentRecord): boolean {
  if (!consent) return false;
  if (consent.status !== "granted") return false;
  if (!consent.granted_at) return false;
  if (consent.revoked_at) return false;
  return true;
}

export function buildFullVisibilityPayload(): ParcerosSyncPayload {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-17T00:00:00.000Z",
    source: "staflyapps",
    worker: {
      stafly_worker_id: "wp_e55_001",
      public_slug: "e55-worker",
      profile: {
        first_name: "Ana",
        last_name: "Rivera",
        headline: "Event captain",
        bio: null,
        city: "Brooklyn",
        state: "NY",
        country: "US",
        english_level: "advanced",
        years_of_experience: 5,
        verification_status: "verified",
        is_available_for_marketplace: true,
        avatar_url: "https://cdn.example.com/avatars/ana.jpg",
      },
      skills: [
        { name: "Catering", category: "hospitality", proficiency_level: "advanced", years_experience: 5 },
        { name: "Bartending", category: "hospitality", proficiency_level: "intermediate", years_experience: 3 },
      ],
      verified_metrics: {
        total_verified_hours: 240,
        total_verified_jobs: 18,
        total_companies_worked: 3,
        certifications_count: 2,
      },
      reputation: {
        overall_score: 4.7,
        punctuality: 4.8,
        quality: 4.6,
        service: 4.7,
        professionalism: 4.8,
        teamwork: 4.6,
        presentation: 4.5,
        total_reviews: 22,
        no_show_count: 0,
        cancellation_count: 1,
        score_version: 1,
        last_calculated_at: "2026-06-16T00:00:00.000Z",
      },
      badges: [
        { badge_code: "punctual", badge_name: "Puntual", emoji: "⏱️", earned_at: "2026-05-01T00:00:00.000Z" },
      ],
      work_history: [
        { company_name: "Acme Events", role_name: "Captain", date_start: "2025-01-01", date_end: "2025-12-01", total_hours: 180, is_verified: true },
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

export function withVisibilityOverrides(
  base: ParcerosSyncPayload,
  overrides: Partial<ParcerosSyncPayload["worker"]["visibility"]>,
): ParcerosSyncPayload {
  return {
    ...base,
    worker: {
      ...base.worker,
      visibility: { ...base.worker.visibility, ...overrides },
    },
  };
}
