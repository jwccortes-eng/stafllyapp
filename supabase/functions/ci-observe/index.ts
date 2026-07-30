/**
 * ci-observe — Change Intelligence F1.2 durable observation ingest.
 *
 * THIS IS NOT A DELIVERY FUNCTION.
 * It writes evidence rows only. It has no provider SDK, no queue, no retry,
 * no recipient, no send state. `observation_only` is forced to true and the
 * database rejects anything else.
 *
 * Closed contract: only the whitelisted fields below are persisted; every
 * other key in the payload is discarded.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };

const ENVIRONMENTS = new Set(["demo", "staging", "production"]);
const ACK = new Set(["none", "light", "probatory"]);
const DEADLINE = new Set(["none", "lt_2h", "lt_12h", "lt_24h", "gt_24h"]);
const GATE = new Set(["pass", "fail"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only these scheduling change types are authorised in F1.2 stage 1. */
const ALLOWED_CHANGE_TYPES = new Set([
  "shift.time_changed",
  "shift.date_changed",
  "shift.location_changed",
  "shift.worker_added",
  "shift.worker_removed",
  "shift.worker_replaced",
  "shift.cancelled",
]);

/** Any of these in the payload means the caller tried to persist PII. */
const PII_PATTERNS: Array<[string, RegExp]> = [
  ["email", /[\w.+-]+@[\w-]+\.[\w.]+/],
  ["phone", /\+?\d[\d\s().-]{8,}\d/],
  ["token", /\b(?:ey[A-Za-z0-9_-]{10,}|sk_[A-Za-z0-9]{10,}|bearer\s+\S+)/i],
];

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), { status, headers: JSON_HEADERS });
}

function strArray(value: unknown, max = 25): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string").slice(0, max).map((v) => String(v).slice(0, 120));
}

function intVal(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function scanPii(value: unknown, findings: Set<string>): void {
  if (typeof value === "string") {
    for (const [name, re] of PII_PATTERNS) if (re.test(value)) findings.add(name);
    return;
  }
  if (Array.isArray(value)) return value.forEach((v) => scanPii(v, findings));
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

  // --- closed-contract validation -----------------------------------------
  if (typeof input.event_id !== "string" || input.event_id.length === 0) {
    return fail(400, "invalid_event_id");
  }
  if (typeof input.company_id !== "string" || !UUID.test(input.company_id)) {
    return fail(400, "invalid_company_id");
  }
  if (typeof input.change_type !== "string" || !ALLOWED_CHANGE_TYPES.has(input.change_type)) {
    return fail(400, "change_type_not_authorised");
  }
  if (typeof input.environment !== "string" || !ENVIRONMENTS.has(input.environment)) {
    return fail(400, "invalid_environment");
  }
  const impact = Number(input.impact_level);
  if (!Number.isInteger(impact) || impact < 0 || impact > 3) return fail(400, "invalid_impact_level");
  if (input.observation_only === false) return fail(400, "observation_only_must_be_true");

  // --- explicit anti-delivery guard ---------------------------------------
  const deliveryKeys = ["sent_at", "retry_count", "delivery_status", "recipient", "recipients",
    "recipient_id", "channel_provider", "push_token", "device_token", "delivered_at", "queue"];
  for (const key of deliveryKeys) {
    if (key in input) return fail(400, "delivery_semantics_forbidden", { field: key });
  }

  // --- privacy gate --------------------------------------------------------
  const findings = new Set<string>();
  scanPii(input, findings);
  if (findings.size > 0) return fail(422, "pii_rejected", { findings: [...findings] });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- pilot allowlist (no live row => nothing is observed) ----------------
  const { data: pilot } = await service
    .from("ci_pilot_allowlist")
    .select("company_id, pilot_stage, environment, enabled, expires_at, daily_limit")
    .eq("company_id", input.company_id)
    .maybeSingle();

  if (!pilot || !pilot.enabled) return fail(403, "company_not_in_pilot");
  if (pilot.expires_at && new Date(pilot.expires_at).getTime() < Date.now()) {
    return fail(403, "pilot_window_expired");
  }
  if (pilot.environment !== input.environment) return fail(403, "environment_mismatch");

  const day = new Date().toISOString().slice(0, 10);
  const observedToday = await service
    .from("ci_observations")
    .select("observation_id", { count: "exact", head: true })
    .eq("company_id", input.company_id)
    .gte("observed_at", `${day}T00:00:00Z`);

  const usedToday = observedToday.count ?? 0;
  const overLimit = usedToday >= (pilot.daily_limit ?? 5000);

  const metricsPatch = {
    company_id: input.company_id as string,
    day,
    environment: input.environment as string,
    change_type: input.change_type as string,
  };

  const bumpMetrics = async (persisted: number, dropped: number, row?: Record<string, unknown>) => {
    const { data: current } = await service
      .from("ci_observation_daily_metrics")
      .select("*")
      .match(metricsPatch)
      .maybeSingle();
    const base = current ?? {};
    await service.from("ci_observation_daily_metrics").upsert({
      ...metricsPatch,
      evaluations: (base.evaluations ?? 0) + 1,
      persisted: (base.persisted ?? 0) + persisted,
      dropped_by_limit: (base.dropped_by_limit ?? 0) + dropped,
      dropped_by_sampling: base.dropped_by_sampling ?? 0,
      level0: (base.level0 ?? 0) + (impact === 0 ? 1 : 0),
      level1: (base.level1 ?? 0) + (impact === 1 ? 1 : 0),
      level2: (base.level2 ?? 0) + (impact === 2 ? 1 : 0),
      level3: (base.level3 ?? 0) + (impact === 3 ? 1 : 0),
      unresolved_count: (base.unresolved_count ?? 0) + intVal(row?.unresolved_count),
      unreachable_count: (base.unreachable_count ?? 0) + intVal(row?.unreachable_count),
      deduplication_count: (base.deduplication_count ?? 0) + intVal(row?.deduplication_count),
      legacy_recipient_count: (base.legacy_recipient_count ?? 0) + intVal(row?.legacy_recipient_count),
      ci_recipient_count: (base.ci_recipient_count ?? 0) + intVal(row?.ci_recipient_count),
      message_quality_fail:
        (base.message_quality_fail ?? 0) + (row?.message_quality_gate === "fail" ? 1 : 0),
      privacy_gate_fail: (base.privacy_gate_fail ?? 0) + (row?.privacy_gate === "fail" ? 1 : 0),
      updated_at: new Date().toISOString(),
    });
  };

  // --- volume guard: degrade to aggregates only ----------------------------
  if (overLimit) {
    await bumpMetrics(0, 1);
    return new Response(
      JSON.stringify({ status: "aggregates_only", reason: "daily_limit_reached", usedToday }),
      { status: 202, headers: JSON_HEADERS },
    );
  }

  // --- whitelist projection (anything else is discarded) -------------------
  const row = {
    event_id: String(input.event_id).slice(0, 200),
    correlation_id: typeof input.correlation_id === "string" ? input.correlation_id.slice(0, 200) : null,
    company_id: input.company_id,
    environment: input.environment,
    pilot_stage: pilot.pilot_stage,
    domain: typeof input.domain === "string" ? input.domain.slice(0, 60) : "scheduling",
    aggregate_type: typeof input.aggregate_type === "string" ? input.aggregate_type.slice(0, 60) : null,
    aggregate_id: typeof input.aggregate_id === "string" && UUID.test(input.aggregate_id)
      ? input.aggregate_id
      : null,
    change_type: input.change_type,
    occurred_at: typeof input.occurred_at === "string" ? input.occurred_at : new Date().toISOString(),
    engine_version: typeof input.engine_version === "string" ? input.engine_version.slice(0, 40) : "unknown",
    adapter_version: typeof input.adapter_version === "string" ? input.adapter_version.slice(0, 40) : "unknown",
    impact_level: impact,
    delta_semantics: strArray(input.delta_semantics),
    audience_counts:
      input.audience_counts && typeof input.audience_counts === "object" && !Array.isArray(input.audience_counts)
        ? input.audience_counts
        : {},
    resolved_role_types: strArray(input.resolved_role_types),
    unresolved_count: intVal(input.unresolved_count),
    unreachable_count: intVal(input.unreachable_count),
    deduplication_count: intVal(input.deduplication_count),
    suppression_reasons: strArray(input.suppression_reasons),
    simulated_channel: "none",
    acknowledgement_required: ACK.has(String(input.acknowledgement_required))
      ? String(input.acknowledgement_required)
      : "none",
    deadline_category: DEADLINE.has(String(input.deadline_category))
      ? String(input.deadline_category)
      : "none",
    message_quality_gate: GATE.has(String(input.message_quality_gate))
      ? String(input.message_quality_gate)
      : "pass",
    message_quality_issues: strArray(input.message_quality_issues),
    privacy_gate: GATE.has(String(input.privacy_gate)) ? String(input.privacy_gate) : "pass",
    privacy_gate_findings: strArray(input.privacy_gate_findings),
    legacy_recipient_count: intVal(input.legacy_recipient_count),
    ci_recipient_count: intVal(input.ci_recipient_count),
    unresolved_causes: strArray(input.unresolved_causes),
    location_ref: typeof input.location_ref === "string" ? input.location_ref.slice(0, 40) : null,
    client_ref: typeof input.client_ref === "string" ? input.client_ref.slice(0, 40) : null,
    observation_only: true as const,
  };

  // Idempotent by (event_id, engine_version). No retry on failure — ever.
  const { error: insertError } = await service
    .from("ci_observations")
    .upsert(row, { onConflict: "event_id,engine_version", ignoreDuplicates: true });

  if (insertError) {
    await bumpMetrics(0, 0, row);
    return fail(500, "persist_failed", { detail: insertError.message });
  }

  await bumpMetrics(1, 0, row);

  return new Response(JSON.stringify({ status: "observed", observationOnly: true }), {
    status: 200,
    headers: JSON_HEADERS,
  });
});
