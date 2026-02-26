import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "No autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create client scoped to the caller's JWT — RLS enforced
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return json({ error: "Token inválido" }, 401);
    }

    const url = new URL(req.url);
    const resource = url.searchParams.get("resource");
    const companyId = url.searchParams.get("company_id");
    const periodId = url.searchParams.get("period_id");
    const employeeId = url.searchParams.get("employee_id");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    if (!resource) {
      return json({
        resources: ["employees", "pay_periods", "period_base_pay", "movements", "shifts", "concepts"],
        usage: "?resource=employees&company_id=uuid&limit=100&offset=0",
      }, 200);
    }

    let data: any = null;
    let error: any = null;

    switch (resource) {
      case "employees": {
        const q = supabase
          .from("employees_safe")
          .select("*")
          .range(offset, offset + limit - 1)
          .order("last_name");
        if (companyId) q.eq("company_id", companyId);
        if (employeeId) q.eq("id", employeeId);
        const res = await q;
        data = res.data;
        error = res.error;
        break;
      }

      case "pay_periods": {
        const q = supabase
          .from("pay_periods")
          .select("id, start_date, end_date, status, company_id, created_at, published_at, closed_at")
          .range(offset, offset + limit - 1)
          .order("start_date", { ascending: false });
        if (companyId) q.eq("company_id", companyId);
        if (periodId) q.eq("id", periodId);
        const res = await q;
        data = res.data;
        error = res.error;
        break;
      }

      case "period_base_pay": {
        const q = supabase
          .from("period_base_pay")
          .select("id, employee_id, period_id, company_id, base_total_pay, total_work_hours, total_regular, total_overtime, total_paid_hours")
          .range(offset, offset + limit - 1);
        if (companyId) q.eq("company_id", companyId);
        if (periodId) q.eq("period_id", periodId);
        if (employeeId) q.eq("employee_id", employeeId);
        const res = await q;
        data = res.data;
        error = res.error;
        break;
      }

      case "movements": {
        const q = supabase
          .from("movements")
          .select("id, employee_id, period_id, concept_id, company_id, quantity, rate, total_value, note, concepts(name, category)")
          .range(offset, offset + limit - 1)
          .order("created_at", { ascending: false });
        if (companyId) q.eq("company_id", companyId);
        if (periodId) q.eq("period_id", periodId);
        if (employeeId) q.eq("employee_id", employeeId);
        const res = await q;
        data = res.data;
        error = res.error;
        break;
      }

      case "shifts": {
        const q = supabase
          .from("shifts_safe")
          .select("*")
          .range(offset, offset + limit - 1)
          .order("shift_start_date", { ascending: false });
        if (periodId) q.eq("period_id", periodId);
        if (employeeId) q.eq("employee_id", employeeId);
        const res = await q;
        data = res.data;
        error = res.error;
        break;
      }

      case "concepts": {
        const q = supabase
          .from("concepts")
          .select("id, name, category, calc_mode, default_rate, unit_label, is_active, company_id")
          .range(offset, offset + limit - 1)
          .order("name");
        if (companyId) q.eq("company_id", companyId);
        const res = await q;
        data = res.data;
        error = res.error;
        break;
      }

      default:
        return json({ error: `Recurso desconocido: ${resource}` }, 400);
    }

    if (error) {
      console.error("Query error:", error);
      return json({ error: error.message }, 400);
    }

    return json({ data, count: data?.length ?? 0, resource, limit, offset }, 200);
  } catch (e) {
    console.error("external-api error:", e);
    return json({ error: "Error interno del servidor" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
