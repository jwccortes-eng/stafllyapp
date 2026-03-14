/**
 * Parceros Integration – Shared Payload Types & Builder
 *
 * This module defines the EXACT contract between StaflyApps and Parceros.
 * Only public, verified, and worker-authorized data leaves this boundary.
 *
 * ❌ NEVER export: payroll, client details, private addresses, documents, notes
 */

// ── Payload Types ──────────────────────────────────────────────

export interface ParcerosSyncPayload {
  /** Schema version for forward compatibility */
  schema_version: "1.0";
  /** ISO-8601 timestamp when payload was generated */
  generated_at: string;
  /** StaflyApps source identifier */
  source: "stafly_apps";
  /** The worker data */
  worker: ParceroWorkerData;
}

export interface ParceroWorkerData {
  /** StaflyApps internal worker_profile_id (UUID) */
  stafly_worker_id: string;
  /** Public slug for cross-platform linking */
  public_slug: string | null;

  // ── Profile (filtered by visibility) ──
  profile: {
    first_name: string | null;
    last_name: string | null;
    headline: string | null;
    bio: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    english_level: string | null;
    years_of_experience: number | null;
    verification_status: string | null;
    is_available_for_marketplace: boolean;
    avatar_url: string | null;
  };

  // ── Skills ──
  skills: Array<{
    name: string;
    category: string | null;
    proficiency_level: string | null;
    years_experience: number | null;
  }>;

  // ── Verified Metrics (from passport) ──
  verified_metrics: {
    total_verified_hours: number;
    total_verified_jobs: number;
    total_companies_worked: number;
    certifications_count: number;
  };

  // ── Reputation ──
  reputation: {
    overall_score: number | null;
    punctuality: number | null;
    quality: number | null;
    service: number | null;
    professionalism: number | null;
    teamwork: number | null;
    presentation: number | null;
    total_reviews: number | null;
    no_show_count: number | null;
    cancellation_count: number | null;
    score_version: number | null;
    last_calculated_at: string | null;
  };

  // ── Badges ──
  badges: Array<{
    badge_code: string;
    badge_name: string;
    emoji: string | null;
    earned_at: string | null;
  }>;

  // ── Work History Summary (anonymized companies) ──
  work_history: Array<{
    company_name: string;
    role_name: string | null;
    date_start: string | null;
    date_end: string | null;
    total_hours: number | null;
    is_verified: boolean;
  }>;

  // ── Visibility Permissions (what Parceros can show) ──
  visibility: {
    show_first_name: boolean;
    show_last_name: boolean;
    show_photo: boolean;
    show_skills: boolean;
    show_experience: boolean;
    show_reputation: boolean;
    show_work_history: boolean;
    show_city: boolean;
    show_approximate_location: boolean;
    profile_visibility: string | null;
  };

  // ── Timestamps ──
  profile_updated_at: string | null;
  passport_updated_at: string | null;
  reputation_updated_at: string | null;
}

// ── Event Types for future webhook dispatching ──

export type ParcerosEventType =
  | "worker.updated"
  | "review.created"
  | "reputation.updated"
  | "shift.completed"
  | "badge.earned"
  | "passport.consolidated";

export interface ParcerosEvent {
  event_type: ParcerosEventType;
  occurred_at: string;
  source: "stafly_apps";
  stafly_worker_id: string;
  /** Partial or full payload depending on event */
  data: Partial<ParceroWorkerData> | Record<string, unknown>;
}

// ── Data Exclusion List (documentation) ──
// The following data is NEVER included in any Parceros payload:
// - payroll amounts, rates, movements, period_base_pay
// - client IDs, client names (from clients table), internal client details
// - employee exact addresses, phone numbers, email
// - emergency contacts
// - private documents (worker_documents)
// - internal notes, manager notes
// - access PINs, user_ids from auth system
// - SSN/TIN data (contractor_w9)
// - time_entries raw data
// - shift assignments details
// - conversation/chat messages
