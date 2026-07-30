/**
 * oai-observe — Operational Authorization Intelligence F1 Stage 1 ingest.
 *
 * THIS FUNCTION DECIDES NOTHING AND DELIVERS NOTHING.
 * It stores simulated evaluation evidence. It never reads or writes any
 * operational table, never approves a document, never assigns a shift and
 * never emits a message. `observation_only` is forced to true and the database
 * rejects any other value.
 *
 * Closed contract: only the whitelisted fields below are persisted. Every other
 * key in the payload is discarded, and any key with delivery semantics or any
 * value that looks like PII causes an outright rejection (never a silent clean).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OUTCOMES = new Set([
  "authorized",
  "authorized_with_conditions",
  "decision_required",
  "not_authorized",
  "legally_prohibited",
  "insufficient_evidence",
  "expired_authorization",
  "revoked",
  "unknown",
]);
const READINESS = new Set(["blocked", "warned", "clear", "unknown"]);
const SURFACES = new Set([
  "shift_detail",
  "quick_create",
  "roster",
  "mobile_assign",
  "documents",
  "unknown",
]);
const TRIGGERS = new Set([
  "assignment_attempt",
  "block_shown",
  "warning_shown",
  "assignment_completed",
  "assignment_abandoned",
  "navigation",
  "document_review_observed",
  "persistence_check",
]);
const HUMAN_ACTIONS = new Set([
  "proceeded",
  "abandoned",
  "navigated_away",
  "rejected_ready_worker",
  "not_observed",
]);
const ASSIGNMENT_RESULTS = new Set(["assigned", "not_assigned", "unknown"]);
const AUTHORITY = new Set(["explicit", "unresolved", "not_observable"]);
const SOURCES = new Set([
  "legal_regulatory",
  "client",
  "location",
  "role_service",
  "company_policy",
  "operational_preference",
  "unclassified",
  "none",
]);
const EVENTUAL = new Set([
  "evidence_completed_before_shift",
  "evidence_completed_after_shift",
  "evidence_pending_at_payroll",
  "evidence_still_pending",
  "unknown",
]);

/** Anything matching these means the caller tried to persist PII. */
const PII_PATTERNS: Array<[string, RegExp]> = [
  ["email", /[\w.+-]+@[\w-]+\.[\w.]+/],
  ["phone", /\+?\d[\d\s().-]{8,}\d/],
  ["token", /\b(?:ey[A-Za-z0-9_-]{10,}|sk_[A-Za-z0-9]{10,}|bearer\s+\S+)/i],
];

/** Delivery / queue semantics are structurally forbidden in OAI. */
const FORBIDDEN_KEYS = [
  "sent_at",
  "retry_count",
  "delivery_status",
  "delivered_at",
  "recipient",
  "recipients",
  "recipient_id",
  "channel",
  "channel_provider",
  "push_token",
  "device_token",
  "queue",
  // decision semantics: OAI observes, it never authorises.
  "decision",
  "approved",
  "authorized_by",
  "override",
];

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), { status, headers: JSON_HEADERS });
}

function strArray(value: unknown, max = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string")
    .slice(0, max)
    .map((v) => String(v).slice(0, 120));
}

function intVal(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function pick(value: unknown, allowed: Set<string>, fallback: string): string {
  const s = String(value ?? "");
  return allowed.has(s) ? s : fallback;
}

function ref(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 64) : null;
}

function scanPii(value: unknown, findings: Set<string>): void {
  if (typeof value === "string") {
    for (const [name, re] of PII_PATTERNS) if (re.test(value)) findings.add(name);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => scanPii(v, findings));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((v) => scanPii(v, findings));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "method_not_allowed");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return fail(401, "unauthorized");

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: claimsData, error: claimsError } = await anon.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsError || !claimsData?.claims) return fail(401, "unauthorized");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "invalid_json");
  }

  const input = (body.observation ?? {}) as Record<string, unknown>;

  // --- closed contract -----------------------------------------------------
  if (typeof input.observation_id !== "string" || !UUID.test(input.observation_id)) {
    return fail(400, "invalid_observation_id");
  }
  if (typeof input.correlation_id !== "string" || !UUID.test(input.correlation_id)) {
    return fail(400, "invalid_correlation_id");
  }
  if (typeof input.company_id !== "string" || !UUID.test(input.company_id)) {
    return fail(400, "invalid_company_id");
  }
  if (typeof input.worker_ref !== "string" || input.worker_ref.length === 0) {
    return fail(400, "invalid_worker_ref");
  }
  if (!OUTCOMES.has(String(input.simulated_oai_outcome))) {
    return fail(400, "invalid_simulated_outcome");
  }
  if (input.observation_only === false) return fail(400, "observation_only_must_be_true");

  // --- anti-delivery / anti-decision guard ---------------------------------
  for (const key of FORBIDDEN_KEYS) {
    if (key in input) return fail(400, "delivery_or_decision_semantics_forbidden", { field: key });
  }

  // --- privacy gate: reject, never sanitise --------------------------------
  const findings = new Set<string>();
  scanPii(input, findings);
  if (findings.size > 0) return fail(422, "pii_rejected", { findings: [...findings] });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- pilot allowlist: no live window => nothing is stored ----------------
  const { data: pilot } = await service
    .from("oai_pilot_allowlist")
    .select("company_id, environment, window_starts_at, window_ends_at, daily_cap")
    .eq("company_id", input.company_id)
    .maybeSingle();

  if (!pilot) return fail(403, "company_not_in_pilot");
  const now = Date.now();
  if (new Date(pilot.window_starts_at).getTime() > now) return fail(403, "pilot_window_not_open");
  if (new Date(pilot.window_ends_at).getTime() < now) return fail(403, "pilot_window_expired");

  const day = new Date().toISOString().slice(0, 10);
  const { count } = await service
    .from("oai_observations")
    .select("observation_id", { count: "exact", head: true })
    .eq("company_id", input.company_id)
    .gte("observed_at", `${day}T00:00:00Z`);

  const usedToday = count ?? 0;
  const readiness = pick(input.system_readiness_state, READINESS, "unknown");
  const contradiction = input.contradiction_detected === true;

  const bumpMetrics = async (persisted: number) => {
    const { data: current } = await service
      .from("oai_observation_daily_metrics")
      .select("*")
      .eq("company_id", input.company_id as string)
      .eq("window_day", day)
      .maybeSingle();
    const base = (current ?? {}) as Record<string, number>;
    await service.from("oai_observation_daily_metrics").upsert(
      {
        company_id: input.company_id as string,
        window_day: day,
        total_observations: (base.total_observations ?? 0) + 1,
        blocked_count: (base.blocked_count ?? 0) + (readiness === "blocked" ? 1 : 0),
        warned_count: (base.warned_count ?? 0) + (readiness === "warned" ? 1 : 0),
        assigned_after_negative:
          (base.assigned_after_negative ?? 0) +
          (readiness !== "clear" && String(input.assignment_result) === "assigned" ? 1 : 0),
        contradictions: (base.contradictions ?? 0) + (contradiction ? 1 : 0),
        unclassified_requirements:
          (base.unclassified_requirements ?? 0) + strArray(input.unclassified_requirements).length,
        authority_unresolved:
          (base.authority_unresolved ?? 0) + (String(input.authority_status) !== "explicit" ? 1 : 0),
        context_losses: (base.context_losses ?? 0) + (input.context_loss_detected === true ? 1 : 0),
        persistence_issues:
          (base.persistence_issues ?? 0) + (input.persistence_issue_detected === true ? 1 : 0),
      },
      { onConflict: "company_id,window_day" },
    );
  };

  // --- volume guard: degrade to aggregates only ----------------------------
  if (usedToday >= (pilot.daily_cap ?? 2000)) {
    await bumpMetrics(0);
    return new Response(
      JSON.stringify({ status: "aggregates_only", reason: "daily_cap_reached", usedToday }),
      { status: 202, headers: JSON_HEADERS },
    );
  }

  // --- whitelist projection (everything else is discarded) -----------------
  const summary = input.document_state_summary;
  const row = {
    observation_id: input.observation_id,
    correlation_id: input.correlation_id,
    contract_version: intVal(input.contract_version) || 1,
    engine_version:
      typeof input.engine_version === "string" ? input.engine_version.slice(0, 40) : "unknown",
    rule_version:
      typeof input.rule_version === "string" ? input.rule_version.slice(0, 40) : "unknown",
    observed_at: typeof input.observed_at === "string" ? input.observed_at : new Date().toISOString(),
    evaluated_at:
      typeof input.evaluated_at === "string" ? input.evaluated_at : new Date().toISOString(),
    company_id: input.company_id,
    worker_ref: String(input.worker_ref).slice(0, 64),
    shift_ref: ref(input.shift_ref),
    actor_ref: ref(input.actor_ref),
    client_ref: ref(input.client_ref),
    location_ref: ref(input.location_ref),
    source_surface: pick(input.source_surface, SURFACES, "unknown"),
    trigger_type: pick(input.trigger_type, TRIGGERS, "assignment_attempt"),
    system_readiness_state: readiness,
    system_block_reasons: strArray(input.system_block_reasons),
    legacy_mixed_signal_present: input.legacy_mixed_signal_present === true,
    document_state_summary:
      summary && typeof summary === "object" && !Array.isArray(summary) ? summary : {},
    evidence_grade_summary: Array.isArray(input.evidence_grade_summary)
      ? input.evidence_grade_summary.slice(0, 50)
      : [],
    context_available: strArray(input.context_available),
    context_missing: strArray(input.context_missing),
    simulated_oai_outcome: String(input.simulated_oai_outcome),
    simulated_reason_codes: strArray(input.simulated_reason_codes),
    winning_requirement_source: pick(input.winning_requirement_source, SOURCES, "none"),
    unclassified_requirements: strArray(input.unclassified_requirements),
    cascade_conflicts: strArray(input.cascade_conflicts),
    human_action: pick(input.human_action, HUMAN_ACTIONS, "not_observed"),
    assignment_result: pick(input.assignment_result, ASSIGNMENT_RESULTS, "unknown"),
    contradiction_detected: contradiction,
    authority_status: pick(input.authority_status, AUTHORITY, "unresolved"),
    eventual_outcome: pick(input.eventual_outcome, EVENTUAL, "unknown"),
    navigation_count: intVal(input.navigation_count),
    context_loss_detected: input.context_loss_detected === true,
    persistence_issue_detected: input.persistence_issue_detected === true,
    latency_ms_from_block:
      input.latency_ms_from_block === null || input.latency_ms_from_block === undefined
        ? null
        : intVal(input.latency_ms_from_block),
    observation_only: true as const,
  };

  // Idempotent by observation_id. No retry on failure — ever.
  const { error: insertError } = await service
    .from("oai_observations")
    .upsert(row, { onConflict: "observation_id", ignoreDuplicates: true });

  if (insertError) {
    return fail(500, "persist_failed", { detail: insertError.message });
  }

  await bumpMetrics(1);

  return new Response(JSON.stringify({ status: "observed", observationOnly: true }), {
    status: 200,
    headers: JSON_HEADERS,
  });
});
