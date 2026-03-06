import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmployeeRow {
  first_name: string;
  last_name: string;
  email?: string;
  country_code?: string;
  phone_number?: string;
  gender?: string;
  employer_identification?: string;
  start_date?: string;
  english_level?: string;
  employee_role?: string;
  qualify?: string;
  recommended_by?: string;
  direct_manager?: string;
  has_car?: string;
  driver_licence?: string;
  end_date?: string;
  connecteam_employee_id?: string;
  added_via?: string;
  added_by?: string;
  groups?: string;
  tags?: string;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Token inválido" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { companyId, rows } = await req.json() as {
      companyId: string;
      rows: EmployeeRow[];
    };

    if (!companyId || !rows?.length) {
      return json({ error: "companyId y rows son requeridos" }, 400);
    }

    // Verify user belongs to company
    const { data: membership } = await supabase
      .from("company_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!membership) {
      return json({ error: "No tienes acceso a esta compañía" }, 403);
    }

    // Fetch existing employees
    const { data: existingEmployees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, connecteam_employee_id")
      .eq("company_id", companyId);

    const existingByConnecteamId = new Set<string>();
    const existingByName = new Set<string>();

    for (const emp of existingEmployees ?? []) {
      if (emp.connecteam_employee_id) {
        existingByConnecteamId.add(emp.connecteam_employee_id);
      }
      existingByName.add(normalizeName(`${emp.first_name} ${emp.last_name}`));
    }

    // Filter: skip SYSTEM rows, existing employees
    const toInsert: any[] = [];
    let skippedSystem = 0;
    let skippedExisting = 0;
    let skippedNoName = 0;

    for (const row of rows) {
      const firstName = (row.first_name ?? "").trim();
      const lastName = (row.last_name ?? "").trim();

      if (!firstName || !lastName) {
        skippedNoName++;
        continue;
      }

      if (firstName.toUpperCase() === "SYSTEM" || firstName.toUpperCase() === "CONECTEAM") {
        skippedSystem++;
        continue;
      }

      const connecteamId = (row.connecteam_employee_id ?? "").trim();
      if (connecteamId && existingByConnecteamId.has(connecteamId)) {
        skippedExisting++;
        continue;
      }

      const nameKey = normalizeName(`${firstName} ${lastName}`);
      if (existingByName.has(nameKey)) {
        skippedExisting++;
        continue;
      }

      // Prevent double-insert within same batch
      if (connecteamId) existingByConnecteamId.add(connecteamId);
      existingByName.add(nameKey);

      toInsert.push({
        company_id: companyId,
        first_name: firstName,
        last_name: lastName,
        email: row.email || null,
        country_code: row.country_code || null,
        phone_number: row.phone_number || null,
        gender: row.gender || null,
        start_date: row.start_date || null,
        end_date: row.end_date || null,
        english_level: row.english_level || null,
        employee_role: row.employee_role || null,
        qualify: row.qualify || null,
        recommended_by: row.recommended_by || null,
        direct_manager: row.direct_manager || null,
        has_car: row.has_car || null,
        driver_licence: row.driver_licence || null,
        connecteam_employee_id: connecteamId || null,
        added_via: row.added_via || null,
        added_by: row.added_by || null,
        groups: row.groups || null,
        tags: row.tags || null,
        is_active: false,
      });
    }

    // Insert in batches
    let inserted = 0;
    let errors = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("employees").insert(batch);
      if (error) {
        console.error("Batch error:", error.message);
        // Fallback: insert one by one
        for (const item of batch) {
          const { error: singleErr } = await supabase.from("employees").insert(item);
          if (singleErr) {
            console.error("Single error:", singleErr.message, item.first_name, item.last_name);
            errors++;
          } else {
            inserted++;
          }
        }
      } else {
        inserted += batch.length;
      }
    }

    // Log
    await supabase.from("activity_log").insert({
      user_id: user.id,
      company_id: companyId,
      action: "import_inactive_employees",
      entity_type: "employees",
      details: {
        totalRows: rows.length,
        inserted,
        skippedSystem,
        skippedExisting,
        skippedNoName,
        errors,
      },
    });

    return json({
      success: true,
      inserted,
      skippedSystem,
      skippedExisting,
      skippedNoName,
      errors,
      total: rows.length,
    }, 200);
  } catch (e) {
    console.error("import-inactive-employees error:", e);
    return json({ error: "Error interno del servidor" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
