/**
 * parceros-sync
 *
 * Assembles the clean, authorized Parceros payload for a worker.
 *
 * Modes:
 *   GET  ?worker_profile_id=xxx  → returns the payload for one worker
 *   POST { worker_profile_ids: [...] } → returns payloads for multiple workers (max 50)
 *
 * Auth: Requires service-role key OR a valid PARCEROS_API_KEY header.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ParcerosSyncPayload, ParceroWorkerData } from "../_shared/parceros-payload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-parceros-api-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const parcerosKey = req.headers.get("x-parceros-api-key");
    const expectedKey = Deno.env.get("PARCEROS_API_KEY");
    const authHeader = req.headers.get("authorization") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const isServiceRole = authHeader.includes(serviceRoleKey) && serviceRoleKey.length > 10;
    const isParcerosAuth = expectedKey && parcerosKey === expectedKey;

    if (!isServiceRole && !isParcerosAuth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Supabase admin client ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Parse request ──
    let workerProfileIds: string[] = [];

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
    } else {
      const body = await req.json();
      workerProfileIds = body.worker_profile_ids ?? [];
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

    // ── Log access ──
    for (const wpId of workerProfileIds) {
      await supabase.from("profile_access_log").insert({
        worker_profile_id: wpId,
        access_type: "parceros_sync",
        ip_address: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null,
      });
    }

    const result =
      req.method === "GET"
        ? payloads[0] ?? { error: "Worker not found or not eligible" }
        : { workers: payloads, count: payloads.length };

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

// ── Payload builder ──────────────────────────────────────────

async function buildWorkerPayload(
  supabase: ReturnType<typeof createClient>,
  workerProfileId: string
): Promise<ParcerosSyncPayload | null> {
  // 1. Worker profile
  const { data: wp } = await supabase
    .from("worker_profiles")
    .select("*")
    .eq("id", workerProfileId)
    .is("deleted_at", null)
    .single();

  if (!wp) return null;

  // Must opt-in to marketplace OR have public profile
  if (!wp.is_available_for_marketplace && !wp.is_profile_public) return null;

  // 2. Fetch all related data in parallel
  const [visRes, skillsRes, repRes, badgesRes, passportRes, historyRes, employeeRes] =
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
      supabase
        .from("passport_work_history")
        .select("company_name, role_name, date_start, date_end, total_hours, is_verified")
        .eq("passport_id", workerProfileId), // Will refine below
      // Get employee for avatar
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

  // Fetch work history using passport_id if we have passport
  let workHistory: any[] = [];
  if (passport?.id) {
    const { data: wh } = await supabase
      .from("passport_work_history")
      .select("company_name, role_name, date_start, date_end, total_hours, is_verified")
      .eq("passport_id", passport.id);
    workHistory = wh ?? [];
  }

  // 3. Apply visibility filters
  const showFirstName = vis?.show_first_name !== false;
  const showLastName = vis?.show_last_name !== false;
  const showSkills = vis?.show_skills !== false;
  const showExperience = vis?.show_experience !== false;
  const showReputation = vis?.show_reputation !== false;
  const showWorkHistory = vis?.show_work_history !== false;
  const showCity = vis?.show_city !== false;
  const showPhoto = vis?.show_photo !== false;

  // Get employee avatar and certs
  const emp = employeeRes.data as any;
  const certCount = emp?.certifications?.length ?? 0;

  // 4. Assemble clean payload
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
          overall_score: null,
          punctuality: null,
          quality: null,
          service: null,
          professionalism: null,
          teamwork: null,
          presentation: null,
          total_reviews: null,
          no_show_count: null,
          cancellation_count: null,
          score_version: null,
          last_calculated_at: null,
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
    source: "stafly_apps",
    worker: workerData,
  };
}
