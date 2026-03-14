/**
 * Parceros Integration – Shared Payload Types & Helpers
 *
 * Defines the EXACT contract between StaflyApps and Parceros.
 * Only public, verified, and worker-authorized data leaves this boundary.
 *
 * ❌ NEVER export: payroll, client details, private addresses, documents, notes
 */

// ── Internal StaflyApps payload (rich, for buildWorkerPayload) ──

export interface ParcerosSyncPayload {
  schema_version: "1.0";
  generated_at: string;
  source: "staflyapps";
  worker: ParceroWorkerData;
}

export interface ParceroWorkerData {
  stafly_worker_id: string;
  public_slug: string | null;

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

  skills: Array<{
    name: string;
    category: string | null;
    proficiency_level: string | null;
    years_experience: number | null;
  }>;

  verified_metrics: {
    total_verified_hours: number;
    total_verified_jobs: number;
    total_companies_worked: number;
    certifications_count: number;
  };

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

  badges: Array<{
    badge_code: string;
    badge_name: string;
    emoji: string | null;
    earned_at: string | null;
  }>;

  work_history: Array<{
    company_name: string;
    role_name: string | null;
    date_start: string | null;
    date_end: string | null;
    total_hours: number | null;
    is_verified: boolean;
  }>;

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

  profile_updated_at: string | null;
  passport_updated_at: string | null;
  reputation_updated_at: string | null;
}

// ── Parceros /sync-worker-passport contract (what Parceros actually expects) ──

export interface ParcerosSyncWorkerPassportBody {
  external_worker_id: string;
  display_name: string;
  skills: string[];
  years_experience: number | null;
  english_level: string | null;
  total_hours_worked: number;
  total_verified_jobs: number;
  total_companies_worked: number;
  reputation_score: number | null;
  ratings_breakdown: {
    punctuality: number | null;
    quality: number | null;
    service: number | null;
    professionalism: number | null;
    teamwork: number | null;
    presentation: number | null;
  };
  certifications_count: number;
  work_history_summary: string;
  last_synced_at: string;
  source: "staflyapps";
  external_data?: ParcerosSyncPayload;
}

// ── Parceros /webhook-receiver contract ──

export interface ParcerosWebhookBody {
  event_type: ParcerosEventType;
  source: "staflyapps";
  external_worker_id: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ── Event types ──

export type ParcerosEventType =
  | "worker.updated"
  | "review.created"
  | "reputation.updated"
  | "shift.completed"
  | "badge.earned"
  | "passport.consolidated";

// ── Transform helper: internal payload → Parceros sync body ──

export function toParcerosSyncBody(
  payload: ParcerosSyncPayload
): ParcerosSyncWorkerPassportBody {
  const w = payload.worker;
  const vis = w.visibility;

  // Build display name respecting visibility
  const parts: string[] = [];
  if (vis.show_first_name && w.profile.first_name) parts.push(w.profile.first_name);
  if (vis.show_last_name && w.profile.last_name) parts.push(w.profile.last_name);
  const displayName = parts.length > 0 ? parts.join(" ") : "Worker";

  // Work history summary: compact string (null if hidden)
  const whSummary = vis.show_work_history && w.work_history.length > 0
    ? w.work_history
        .slice(0, 5)
        .map((h) => `${h.company_name}${h.role_name ? ` (${h.role_name})` : ""}`)
        .join("; ")
    : vis.show_work_history
      ? "No verified work history"
      : null;

  // Reputation: null everything if show_reputation is off
  const repScore = vis.show_reputation ? w.reputation.overall_score : null;
  const ratingsBreakdown = vis.show_reputation
    ? {
        punctuality: w.reputation.punctuality,
        quality: w.reputation.quality,
        service: w.reputation.service,
        professionalism: w.reputation.professionalism,
        teamwork: w.reputation.teamwork,
        presentation: w.reputation.presentation,
      }
    : {
        punctuality: null,
        quality: null,
        service: null,
        professionalism: null,
        teamwork: null,
        presentation: null,
      };

  // Experience: null if hidden
  const yearsExp = vis.show_experience ? w.profile.years_of_experience : null;

  return {
    external_worker_id: w.stafly_worker_id,
    display_name: displayName,
    skills: vis.show_skills ? w.skills.map((s) => s.name).filter(Boolean) : [],
    years_experience: yearsExp,
    english_level: w.profile.english_level,
    total_hours_worked: w.verified_metrics.total_verified_hours,
    total_verified_jobs: w.verified_metrics.total_verified_jobs,
    total_companies_worked: w.verified_metrics.total_companies_worked,
    reputation_score: repScore,
    ratings_breakdown: ratingsBreakdown,
    certifications_count: w.verified_metrics.certifications_count,
    work_history_summary: whSummary,
    last_synced_at: payload.generated_at,
    source: "staflyapps",
    external_data: payload,
  };
}

// ── Data Exclusion List (documentation) ──
// NEVER included in any Parceros payload:
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
