/**
 * parceros-sync
 *
 * Two modes:
 *   1. READ: Assembles ParcerosSyncPayload for inspection/debug (GET or POST with worker_profile_ids)
 *   2. PUSH: Pushes worker passport to Parceros /sync-worker-passport (POST with push: true)
 *
 * Auth: getClaims() for authenticated admin users (internal), or service-role header.
 * Outbound to Parceros: x-api-key header with PARCEROS_API_KEY.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  ParcerosSyncPayload,
  ParceroWorkerData,
  ParcerosSyncWorkerPassportBody,
} from "../_shared/parceros-payload.ts";
import { toParcerosSyncBody } from "../_shared/parceros-payload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PARCEROS_SYNC_PATH = "/sync-worker-passport";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth: service-role OR authenticated user via getClaims ──
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const authHeader = req.headers.get("authorization") ?? "";

    let isAuthorized = false;

    // Option A: service-role bearer
    if (authHeader === `Bearer ${serviceRoleKey}` && serviceRoleKey.length > 10) {
      isAuthorized = true;
    }

    // Option B: authenticated user (admin)
    if (!isAuthorized && authHeader.startsWith("Bearer ")) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
      if (!claimsErr && claimsData?.claims?.sub) {
        // Verify admin/owner role
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        const { data: roleData } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", claimsData.claims.sub)
          .in("role", ["owner", "admin", "developer"])
          .maybeSingle();
        if (roleData) isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Supabase admin client ──
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Parse request ──
    let workerProfileIds: string[] = [];
    let pushToParceros = false;

    if (req.method === "GET") {
      const url = new URL(req.url);
      const id = url.searchParams.get("worker_profile_id");
      if (!id) {
        return new Response(
          JSON.stringify({ error: "worker_profile_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      workerProfileIds = [id];
      pushToParceros = url.searchParams.get("push") === "true";
    } else {
      const body = await req.json();
      workerProfileIds = body.worker_profile_ids ?? [];
      pushToParceros = body.push === true;
      if (!Array.isArray(workerProfileIds) || workerProfileIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "worker_profile_ids array required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (workerProfileIds.length > 50) {
        return new Response(
          JSON.stringify({ error: "Max 50 workers per request" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Build payloads ──
    const payloads: ParcerosSyncPayload[] = [];
    for (const wpId of workerProfileIds) {
      const payload = await buildWorkerPayload(supabase, wpId);
      if (payload) payloads.push(payload);
    }

    // ── Consent evaluation (log_only by default; never blocks in this phase) ──
    // Mode: env PARCEROS_CONSENT_MODE = "log_only" (default) | "enforce" | "off"
    // Phase 1 contract: log_only ONLY. enforce branch reserved for Phase 3 after UI adoption.
    const consentMode = (Deno.env.get("PARCEROS_CONSENT_MODE") ?? "log_only").toLowerCase();
    if (consentMode !== "off") {
      for (const wpId of workerProfileIds) {
        await evaluateConsentLogOnly(supabase, wpId, consentMode, pushToParceros);
      }
    }

    // ── Log access ──
    for (const wpId of workerProfileIds) {
      await supabase.from("profile_access_log").insert({
        worker_profile_id: wpId,
        access_type: pushToParceros ? "parceros_push" : "parceros_sync",
        ip_address: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null,
      });
    }


    // ── PUSH to Parceros if requested ──
    const pushResults: Array<{
      worker_profile_id: string;
      pushed: boolean;
      status?: number;
      error?: string;
    }> = [];

    if (pushToParceros && payloads.length > 0) {
      const parcerosBaseUrl = Deno.env.get("PARCEROS_BASE_URL");
      const parcerosApiKey = Deno.env.get("PARCEROS_API_KEY");

      if (!parcerosBaseUrl || !parcerosApiKey) {
        return new Response(
          JSON.stringify({
            error: "PARCEROS_BASE_URL and PARCEROS_API_KEY secrets required for push",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      for (const payload of payloads) {
        const syncBody = toParcerosSyncBody(payload);
        const result = await pushWorkerPassportToParceros(
          supabase,
          parcerosBaseUrl,
          parcerosApiKey,
          payload.worker.stafly_worker_id,
          syncBody
        );
        pushResults.push(result);
      }
    }

    // ── Response ──
    const result =
      req.method === "GET"
        ? {
            payload: payloads[0] ?? null,
            parceros_body: payloads[0] ? toParcerosSyncBody(payloads[0]) : null,
            push: pushResults[0] ?? null,
          }
        : {
            workers: payloads.map((p) => ({
              payload: p,
              parceros_body: toParcerosSyncBody(p),
            })),
            count: payloads.length,
            push_results: pushToParceros ? pushResults : undefined,
          };

    return new Response(JSON.stringify(result), {
      status: payloads.length > 0 || req.method === "POST" ? 200 : 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("parceros-sync error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Push to Parceros /sync-worker-passport ──────────────────────

async function pushWorkerPassportToParceros(
  supabase: any,
  parcerosBaseUrl: string,
  parcerosApiKey: string,
  workerProfileId: string,
  syncBody: ParcerosSyncWorkerPassportBody
): Promise<{ worker_profile_id: string; pushed: boolean; status?: number; error?: string }> {
  const url = `${parcerosBaseUrl.replace(/\/$/, "")}${PARCEROS_SYNC_PATH}`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": parcerosApiKey,
      },
      body: JSON.stringify(syncBody),
    });

    if (resp.ok) {
      // Queue success event
      await supabase.from("parceros_event_queue").insert({
        event_type: "worker.updated",
        worker_profile_id: workerProfileId,
        payload: { action: "sync_push", status: resp.status },
        status: "sent",
        sent_at: new Date().toISOString(),
      });

      return { worker_profile_id: workerProfileId, pushed: true, status: resp.status };
    }

    const errorText = await resp.text();
    console.error(`Parceros sync failed [${resp.status}]:`, errorText);

    // Queue failure for retry
    await supabase.from("parceros_event_queue").insert({
      event_type: "worker.updated",
      worker_profile_id: workerProfileId,
      payload: { action: "sync_push", error: errorText.slice(0, 500) },
      status: "failed",
      error_message: `HTTP ${resp.status}: ${errorText.slice(0, 200)}`,
    });

    return {
      worker_profile_id: workerProfileId,
      pushed: false,
      status: resp.status,
      error: errorText.slice(0, 200),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Push error:", msg);

    await supabase.from("parceros_event_queue").insert({
      event_type: "worker.updated",
      worker_profile_id: workerProfileId,
      payload: { action: "sync_push", error: msg },
      status: "failed",
      error_message: msg.slice(0, 200),
    });

    return { worker_profile_id: workerProfileId, pushed: false, error: msg };
  }
}

// ── Consent evaluator (log-only, no PII) ─────────────────────────
//
// Reads worker_consent_records for consent_type='data_sharing'.
// Emits a structured console log per worker. NEVER blocks in Phase 1.
// Status taxonomy:
//   - granted:  most recent row has granted=true AND revoked_at IS NULL
//   - revoked:  most recent row has revoked_at IS NOT NULL
//   - denied:   most recent row has granted=false (and not revoked)
//   - missing:  no row exists for this worker_profile_id + data_sharing
//   - error:    query failed (treated as would_block in enforce-future)
// Log payload is intentionally free of PII (no name/phone/email/address/IP).

async function evaluateConsentLogOnly(
  supabase: any,
  workerProfileId: string,
  mode: string,
  pushRequested: boolean
): Promise<void> {
  let status: "granted" | "revoked" | "denied" | "missing" | "error" = "missing";
  let grantedAtIso: string | null = null;
  let revokedAtIso: string | null = null;

  try {
    const { data, error } = await supabase
      .from("worker_consent_records")
      .select("granted, granted_at, revoked_at")
      .eq("worker_profile_id", workerProfileId)
      .eq("consent_type", "data_sharing")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      status = "error";
    } else if (!data) {
      status = "missing";
    } else {
      grantedAtIso = data.granted_at ?? null;
      revokedAtIso = data.revoked_at ?? null;
      if (data.revoked_at) status = "revoked";
      else if (data.granted === true) status = "granted";
      else status = "denied";
    }
  } catch {
    status = "error";
  }

  const wouldBlock = status !== "granted";
  // Phase 1 contract: log_only NEVER blocks. enforce branch reserved for Phase 3.
  // No PII. worker_profile_id is an internal UUID, not personal data on its own.
  console.log(
    JSON.stringify({
      event: "parceros_consent_check",
      mode,                 // "log_only" | "enforce" | "off"
      enforced: false,      // Phase 1: always false
      worker_profile_id: workerProfileId,
      consent_status: status,
      would_block_in_enforce: wouldBlock,
      push_requested: pushRequested,
      granted_at: grantedAtIso,
      revoked_at: revokedAtIso,
      ts: new Date().toISOString(),
    })
  );
}

// ── Payload builder (unchanged logic, builds internal rich payload) ──



async function buildWorkerPayload(
  supabase: any,
  workerProfileId: string
): Promise<ParcerosSyncPayload | null> {
  const { data: wp } = await supabase
    .from("worker_profiles")
    .select("*")
    .eq("id", workerProfileId)
    .is("deleted_at", null)
    .single();

  if (!wp) return null;
  if (!wp.is_available_for_marketplace && !wp.is_profile_public) return null;

  const [visRes, skillsRes, repRes, badgesRes, passportRes, employeeRes] =
    await Promise.all([
      supabase
        .from("worker_visibility_settings")
        .select("*")
        .eq("worker_profile_id", workerProfileId)
        .maybeSingle(),
      supabase
        .from("worker_profile_skills")
        .select("*, worker_skills(name, category)")
        .eq("worker_profile_id", workerProfileId),
      supabase
        .from("rep_scores")
        .select("*")
        .eq("worker_profile_id", workerProfileId)
        .maybeSingle(),
      supabase
        .from("rep_worker_badges")
        .select("*, rep_badges(badge_code, badge_name, emoji)")
        .eq("worker_profile_id", workerProfileId),
      supabase
        .from("passport_profiles")
        .select("*")
        .eq("worker_profile_id", workerProfileId)
        .maybeSingle(),
      wp.employee_id
        ? supabase
            .from("employees")
            .select("avatar_url, certifications")
            .eq("id", wp.employee_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const vis = visRes.data;
  const rep = repRes.data;
  const passport = passportRes.data;

  let workHistory: any[] = [];
  if (passport?.id) {
    const { data: wh } = await supabase
      .from("passport_work_history")
      .select("company_name, role_name, date_start, date_end, total_hours, is_verified")
      .eq("passport_id", passport.id);
    workHistory = wh ?? [];
  }

  const showFirstName = vis?.show_first_name !== false;
  const showLastName = vis?.show_last_name !== false;
  const showSkills = vis?.show_skills !== false;
  const showExperience = vis?.show_experience !== false;
  const showReputation = vis?.show_reputation !== false;
  const showWorkHistory = vis?.show_work_history !== false;
  const showCity = vis?.show_city !== false;
  const showPhoto = vis?.show_photo !== false;

  const emp = employeeRes.data as any;
  const certCount = emp?.certifications?.length ?? 0;

  const workerData: ParceroWorkerData = {
    stafly_worker_id: workerProfileId,
    public_slug: wp.public_slug,

    profile: {
      first_name: showFirstName ? (wp as any).first_name ?? null : null,
      last_name: showLastName ? (wp as any).last_name ?? null : null,
      headline: wp.headline,
      bio: wp.bio,
      city: showCity ? wp.city : null,
      state: showCity ? wp.state : null,
      country: wp.country,
      english_level: wp.english_level,
      years_of_experience: showExperience ? wp.years_of_experience : null,
      verification_status: wp.verification_status,
      is_available_for_marketplace: wp.is_available_for_marketplace ?? false,
      avatar_url: showPhoto ? emp?.avatar_url ?? null : null,
    },

    skills: showSkills
      ? (skillsRes.data ?? []).map((s: any) => ({
          name: s.worker_skills?.name ?? "",
          category: s.worker_skills?.category ?? null,
          proficiency_level: s.proficiency_level,
          years_experience: s.years_experience,
        }))
      : [],

    verified_metrics: {
      total_verified_hours: passport?.total_verified_hours ?? 0,
      total_verified_jobs: passport?.total_verified_jobs ?? 0,
      total_companies_worked: passport?.total_companies_worked ?? 0,
      certifications_count: certCount,
    },

    reputation: showReputation
      ? {
          overall_score: rep?.overall_score ?? null,
          punctuality: rep?.punctuality_score ?? null,
          quality: rep?.quality_score ?? null,
          service: rep?.service_score ?? null,
          professionalism: rep?.communication_score ?? null,
          teamwork: rep?.reliability_score ?? null,
          presentation: rep?.presentation_score ?? null,
          total_reviews: rep?.total_reviews_count ?? null,
          no_show_count: rep?.no_show_count ?? null,
          cancellation_count: rep?.cancellation_count ?? null,
          score_version: rep?.score_version ?? null,
          last_calculated_at: rep?.last_calculated_at ?? null,
        }
      : {
          overall_score: null, punctuality: null, quality: null,
          service: null, professionalism: null, teamwork: null,
          presentation: null, total_reviews: null, no_show_count: null,
          cancellation_count: null, score_version: null, last_calculated_at: null,
        },

    badges: (badgesRes.data ?? []).map((b: any) => ({
      badge_code: b.rep_badges?.badge_code ?? "",
      badge_name: b.rep_badges?.badge_name ?? "",
      emoji: b.rep_badges?.emoji ?? null,
      earned_at: b.granted_at ?? b.created_at ?? null,
    })),

    work_history: showWorkHistory
      ? workHistory.map((wh: any) => ({
          company_name: wh.company_name,
          role_name: wh.role_name,
          date_start: wh.date_start,
          date_end: wh.date_end,
          total_hours: wh.total_hours,
          is_verified: wh.is_verified ?? false,
        }))
      : [],

    visibility: {
      show_first_name: showFirstName,
      show_last_name: showLastName,
      show_photo: showPhoto,
      show_skills: showSkills,
      show_experience: showExperience,
      show_reputation: showReputation,
      show_work_history: showWorkHistory,
      show_city: showCity,
      show_approximate_location: vis?.show_approximate_location ?? false,
      profile_visibility: vis?.profile_visibility ?? "private",
    },

    profile_updated_at: wp.updated_at,
    passport_updated_at: passport?.updated_at ?? null,
    reputation_updated_at: rep?.updated_at ?? null,
  };

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    source: "staflyapps",
    worker: workerData,
  };
}
