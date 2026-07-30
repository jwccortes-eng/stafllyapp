/**
 * ci-observation-maintenance — retention & deletion for F1.2 evidence.
 *
 * Actions: purge (30d detail / 90d aggregates), delete_company, stats.
 * This is NOT a delivery cron: it never reads "pending" rows, never sends and
 * never retries anything. Restricted to allowlisted platform staff.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: JSON_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  const scoped = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimsError } = await scoped.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsError || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: canRead } = await service.rpc("ci_can_read_observations", {
    _user_id: claims.claims.sub,
  });
  if (canRead !== true) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: JSON_HEADERS });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty body = stats */
  }

  const action = typeof body.action === "string" ? body.action : "stats";

  if (action === "purge") {
    const { data, error } = await service.rpc("ci_purge_expired_observations");
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
    }
    return new Response(JSON.stringify({ action, result: data }), { status: 200, headers: JSON_HEADERS });
  }

  if (action === "delete_company") {
    const companyId = String(body.company_id ?? "");
    if (!UUID.test(companyId)) {
      return new Response(JSON.stringify({ error: "invalid_company_id" }), { status: 400, headers: JSON_HEADERS });
    }
    const { data, error } = await service.rpc("ci_delete_company_observations", {
      _company_id: companyId,
      _include_metrics: body.include_metrics !== false,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
    }
    return new Response(JSON.stringify({ action, result: data }), { status: 200, headers: JSON_HEADERS });
  }

  const [{ count: observations }, { count: metrics }] = await Promise.all([
    service.from("ci_observations").select("observation_id", { count: "exact", head: true }),
    service.from("ci_observation_daily_metrics").select("company_id", { count: "exact", head: true }),
  ]);

  return new Response(
    JSON.stringify({ action: "stats", observations: observations ?? 0, dailyMetrics: metrics ?? 0 }),
    { status: 200, headers: JSON_HEADERS },
  );
});
