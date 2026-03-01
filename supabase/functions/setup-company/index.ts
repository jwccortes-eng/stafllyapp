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
    const { data: company, error: companyErr } = await adminClient
      .from("companies")
      .insert({ name, slug, invite_code: inviteCode })
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

    // 3. Update user_roles to admin (handle_new_user_role trigger already created an 'employee' row)
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

    // 6. Log activity
    await adminClient.from("activity_log").insert({
      user_id: user.id,
      company_id: companyId,
      action: "self_service_setup",
      entity_type: "company",
      entity_id: companyId,
      details: { name, slug, source: "self_service" },
    });

    return new Response(JSON.stringify({ success: true, company_id: companyId, slug }), {
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
