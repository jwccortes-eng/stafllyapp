import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_MODULES = [
  "periods", "import", "movements", "summary", "reports",
  "employees", "concepts", "shifts", "timeclock",
  "clients", "locations", "announcements", "chat",
];

const DEFAULT_SETTINGS = [
  { key: "payroll_config", value: { cycle: "weekly", day_start: "wednesday" } },
  { key: "pay_week", value: { start_day: 3 } },
  { key: "overtime", value: { enabled: true, threshold: 40, multiplier: 1.5 } },
  { key: "time_tolerance", value: { early_minutes: 15, late_minutes: 15 } },
  { key: "pay_types", value: { hourly: true, daily: true, salary: false } },
];

const TRIAL_DAYS = 14;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // [SECURITY 2026-05-01] Self-service tenant creation is DISABLED.
    // Only developers can provision new companies. This is the server-side
    // backstop in case anyone bypasses the frontend (e.g. direct HTTP POST).
    // See activity_log action='unauthorized_self_signup_suspended' for the
    // incident that triggered this lockdown (Llc tenant, 2026-04-30).
    const adminCheckClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: roleRow } = await adminCheckClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "developer")
      .maybeSingle();

    if (!roleRow) {
      console.warn(`[setup-company] BLOCKED self-service signup attempt by user=${user.id} email=${user.email}`);
      // Audit the blocked attempt
      await adminCheckClient.from("activity_log").insert({
        user_id: user.id,
        action: "setup_company_blocked_invite_only",
        entity_type: "auth",
        details: {
          email: user.email,
          reason: "self_service_signup_disabled_invite_only",
          source: "setup-company_edge_function",
          timestamp: new Date().toISOString(),
        },
      });
      return new Response(
        JSON.stringify({
          error: "Stafly is currently invite-only. Please contact your administrator to get access.",
          code: "INVITE_ONLY",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { company_name } = await req.json();
    if (!company_name?.trim()) {
      return new Response(JSON.stringify({ error: "company_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check user doesn't already have a company
    const { data: existing } = await adminClient
      .from("company_users")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ error: "User already has a company", already_setup: true }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = company_name.trim();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const inviteCode = `${slug}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

    // 1. Create company
    // FASE 1 — el signup público NO activa una empresa: entra a revisión humana.
    // approval_state = needs_review, acceso restringido, is_active = false.
    const { data: company, error: companyErr } = await adminClient
      .from("companies")
      .insert({
        name,
        slug,
        invite_code: inviteCode,
        is_active: false,
        status: "pending",
        approval_state: "needs_review",
        access_state: "restricted",
        commercial_state: "manual",
        submitted_at: new Date().toISOString(),
        source: "public_signup",
        created_by: user.id,
        owner_user_id: user.id,
      })
      .select("id")
      .single();


    if (companyErr || !company) {
      console.error("Create company error:", companyErr);
      return new Response(JSON.stringify({ error: "Failed to create company" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyId = company.id;

    // 2. Add user as admin in company_users
    await adminClient.from("company_users").insert({
      user_id: user.id,
      company_id: companyId,
      role: "admin",
    });

    // 3. Update user_roles to admin
    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (existingRole && existingRole.length > 0) {
      await adminClient
        .from("user_roles")
        .update({ role: "admin" })
        .eq("user_id", user.id);
    } else {
      await adminClient.from("user_roles").insert({
        user_id: user.id,
        role: "admin",
      });
    }

    // 4. Activate default modules
    const modules = DEFAULT_MODULES.map((m) => ({
      company_id: companyId,
      module: m,
      is_active: true,
      activated_at: new Date().toISOString(),
    }));
    await adminClient.from("company_modules").insert(modules);

    // 5. Create default settings
    const settings = DEFAULT_SETTINGS.map((s) => ({
      company_id: companyId,
      key: s.key,
      value: s.value,
      updated_by: user.id,
    }));
    await adminClient.from("company_settings").insert(settings);

    // 6. Create 14-day Pro trial subscription
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    await adminClient.from("subscriptions").upsert({
      company_id: companyId,
      plan: "pro",
      status: "trialing",
      current_period_end: trialEnd.toISOString(),
      cancel_at_period_end: false,
    }, { onConflict: "company_id" });

    // 7. Log activity
    await adminClient.from("activity_log").insert({
      user_id: user.id,
      company_id: companyId,
      action: "self_service_setup",
      entity_type: "company",
      entity_id: companyId,
      details: { name, slug, source: "self_service", trial_days: TRIAL_DAYS },
    });

    console.log(`[setup-company] Created company=${companyId}, slug=${slug}, trial=${TRIAL_DAYS}d`);

    return new Response(JSON.stringify({ success: true, company_id: companyId, slug, trial_days: TRIAL_DAYS }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("setup-company error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
