import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEST_USERS = [
  { email: "owner@staflyapps.com", full_name: "Owner Test", role: "owner" },
  { email: "admin@staflyapps.com", full_name: "Admin Test", role: "admin" },
  { email: "supervisor@staflyapps.com", full_name: "Supervisor Test", role: "manager" },
  { email: "empleado@staflyapps.com", full_name: "Empleado Test", role: "employee" },
];

const PASSWORD = "123456";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is owner
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isOwner } = await anonClient.rpc("is_global_owner", { _user_id: caller.id });
    if (!isOwner) {
      return new Response(JSON.stringify({ error: "Solo el Owner puede ejecutar esto" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all companies
    const { data: companies } = await adminClient.from("companies").select("id, name");
    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ error: "No hay empresas" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const testUser of TEST_USERS) {
      // Check if user already exists
      const { data: existingUsers } = await adminClient.auth.admin.listUsers();
      const existing = existingUsers?.users?.find((u: any) => u.email === testUser.email);

      let userId: string;

      if (existing) {
        userId = existing.id;
        // Update password
        await adminClient.auth.admin.updateUser(userId, { password: PASSWORD });
        results.push({ email: testUser.email, status: "updated", user_id: userId });
      } else {
        const { data: newUser, error } = await adminClient.auth.admin.createUser({
          email: testUser.email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: testUser.full_name },
        });
        if (error) {
          results.push({ email: testUser.email, status: "error", error: error.message });
          continue;
        }
        userId = newUser.user.id;
        results.push({ email: testUser.email, status: "created", user_id: userId });
      }

      // Set role in user_roles (upsert)
      await adminClient.from("user_roles").upsert(
        { user_id: userId, role: testUser.role },
        { onConflict: "user_id,role" }
      );

      // If not owner role, also delete any other roles and set the correct one
      if (testUser.role !== "owner") {
        await adminClient.from("user_roles").delete().eq("user_id", userId).neq("role", testUser.role);
        await adminClient.from("user_roles").upsert(
          { user_id: userId, role: testUser.role },
          { onConflict: "user_id,role" }
        );
      }

      // Link to all companies via company_users
      for (const company of companies) {
        const companyRole = testUser.role === "owner" ? "admin" : testUser.role === "manager" ? "manager" : testUser.role;
        await adminClient.from("company_users").upsert(
          { user_id: userId, company_id: company.id, role: companyRole },
          { onConflict: "user_id,company_id" }
        ).select();
      }

      // For employee role, create employee records
      if (testUser.role === "employee") {
        for (const company of companies) {
          const { data: existingEmp } = await adminClient
            .from("employees")
            .select("id")
            .eq("user_id", userId)
            .eq("company_id", company.id)
            .maybeSingle();

          if (!existingEmp) {
            await adminClient.from("employees").insert({
              user_id: userId,
              company_id: company.id,
              first_name: "Empleado",
              last_name: "Test",
              email: testUser.email,
              is_active: true,
              access_pin: "123456",
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results, companies: companies.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seed-test-users error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
