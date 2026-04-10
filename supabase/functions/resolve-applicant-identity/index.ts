import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ResolveRequest {
  company_id: string;
  phone: string;
  email?: string;
}

type Resolution =
  | { scenario: "new"; message: string }
  | { scenario: "existing_active"; message: string; employee_name: string; has_portal: boolean; employee_id: string }
  | { scenario: "existing_inactive"; message: string; employee_name: string; employee_id: string; no_rehire: boolean }
  | { scenario: "existing_no_portal"; message: string; employee_name: string; employee_id: string }
  | { scenario: "pending_application"; message: string; reference_code: string }
  | { scenario: "no_rehire"; message: string; employee_name: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: ResolveRequest = await req.json();
    const { company_id, phone, email } = body;

    if (!company_id || !phone) {
      return new Response(
        JSON.stringify({ error: "company_id and phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone: digits only, strip leading 1 if 11 digits
    let normPhone = phone.replace(/\D/g, "");
    if (normPhone.length === 11 && normPhone.startsWith("1")) {
      normPhone = normPhone.slice(1);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Check for existing employee records in this company by phone
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, is_active, phone_number, email, user_id, access_pin, employee_role")
      .eq("company_id", company_id)
      .or(`phone_number.eq.${normPhone}${email ? `,email.ilike.${email.trim().toLowerCase()}` : ""}`);

    // 2. Check for pending/active applications
    const { data: applications } = await supabase
      .from("job_applications")
      .select("id, status, reference_code, phone, email")
      .eq("company_id", company_id)
      .eq("phone", normPhone)
      .in("status", ["pending", "under_review", "needs_info"]);

    // Scenario: Pending application already exists
    if (applications && applications.length > 0) {
      const app = applications[0];
      const result: Resolution = {
        scenario: "pending_application",
        message: "Ya tienes una solicitud en proceso. Puedes contactar a la empresa para seguimiento.",
        reference_code: app.reference_code || app.id.slice(0, 8).toUpperCase(),
      };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!employees || employees.length === 0) {
      // No existing employee → new worker
      const result: Resolution = {
        scenario: "new",
        message: "proceed_with_application",
      };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the most relevant employee record
    const activeEmp = employees.find((e) => e.is_active);
    const inactiveEmp = employees.find((e) => !e.is_active);

    if (activeEmp) {
      const hasPortal = !!activeEmp.user_id || !!activeEmp.access_pin;
      const empName = `${activeEmp.first_name} ${activeEmp.last_name}`.trim();

      if (hasPortal) {
        // Scenario C: Existing and active with portal
        const result: Resolution = {
          scenario: "existing_active",
          message: "Ya tienes una cuenta activa. Puedes iniciar sesión directamente en el portal.",
          employee_name: empName,
          has_portal: true,
          employee_id: activeEmp.id,
        };
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Scenario D: Active but no portal access
        const result: Resolution = {
          scenario: "existing_no_portal",
          message: "Encontramos tu perfil. Vamos a activar tu acceso al portal.",
          employee_name: empName,
          employee_id: activeEmp.id,
        };
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (inactiveEmp) {
      const empName = `${inactiveEmp.first_name} ${inactiveEmp.last_name}`.trim();

      // Check company reactivation settings
      const { data: settings } = await supabase
        .from("company_settings")
        .select("value")
        .eq("company_id", company_id)
        .eq("key", "reactivation_config")
        .maybeSingle();

      const reactivationConfig = settings?.value as { require_approval?: boolean } | null;

      // Scenario B: Inactive/archived
      const result: Resolution = {
        scenario: "existing_inactive",
        message: "Encontramos tu perfil anterior. Vamos a actualizar tu información para reactivarte.",
        employee_name: empName,
        employee_id: inactiveEmp.id,
        no_rehire: false, // We don't have no_rehire column yet, default false
      };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: new
    return new Response(
      JSON.stringify({ scenario: "new", message: "proceed_with_application" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
