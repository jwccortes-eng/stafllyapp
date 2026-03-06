import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PayrollRow {
  firstName: string;
  lastName: string;
  employerIdentification: string;
  payperDay: number;
  ryde: number;
  tips: number;
  reimbursements: number;
  travelHours: number;
  otros: number;
  discount: number;
  notes: string;
}

// Concept mapping
const CONCEPT_MAP: Record<string, string> = {
  payperDay: "7b21cbef-0c1c-4e3a-baa9-836d433d5e87",     // Weekend Job
  ryde: "a3b46930-fe2e-4ce8-9f81-7b5ac3fc7197",           // Pago de Transporte Regular
  tips: "179c7ae9-3c8d-400e-b461-57ae0d16e59c",           // Propinas
  reimbursements: "ea95e7f5-d69c-4710-9e80-5560baf624cb", // Reintegros
  travelHours: "ce59e1ec-aae6-49c3-9866-601c25a19fc8",    // Horas de viaje
  otros: "560961d6-f845-4898-9a55-cbb0739bc1bc",          // Otros pagos
  discount: "0079755f-eff6-4ec1-af9d-a5658fcc997b",       // Descuentos
};

function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, "").trim();
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

    const { companyId, periodId, rows } = await req.json() as {
      companyId: string;
      periodId: string;
      rows: PayrollRow[];
    };

    if (!companyId || !periodId || !rows?.length) {
      return json({ error: "companyId, periodId y rows son requeridos" }, 400);
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

    // Fetch employees for matching
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, connecteam_employee_id")
      .eq("company_id", companyId);

    // Build matching maps
    const empByName = new Map<string, string>();
    for (const emp of employees ?? []) {
      const key = normalizeName(`${emp.first_name} ${emp.last_name}`);
      empByName.set(key, emp.id);
    }

    // Check existing movements for this period to avoid duplicates
    const { data: existingMovements } = await supabase
      .from("movements")
      .select("employee_id, concept_id")
      .eq("period_id", periodId)
      .eq("company_id", companyId);

    const existingSet = new Set(
      (existingMovements ?? []).map(m => `${m.employee_id}|${m.concept_id}`)
    );

    let inserted = 0;
    let skippedDuplicate = 0;
    let skippedNoEmployee = 0;
    const unmatchedEmployees = new Set<string>();
    const toInsert: any[] = [];

    for (const row of rows) {
      const nameKey = normalizeName(`${row.firstName} ${row.lastName}`);
      const empId = empByName.get(nameKey);

      if (!empId) {
        unmatchedEmployees.add(`${row.firstName} ${row.lastName}`);
        skippedNoEmployee++;
        continue;
      }

      // Process each extra type
      const extras: [string, number][] = [
        ["payperDay", row.payperDay],
        ["ryde", row.ryde],
        ["tips", row.tips],
        ["reimbursements", row.reimbursements],
        ["travelHours", row.travelHours],
        ["otros", row.otros],
        ["discount", row.discount],
      ];

      for (const [key, value] of extras) {
        if (!value || value === 0) continue;

        const conceptId = CONCEPT_MAP[key];
        if (!conceptId) continue;

        const dedupKey = `${empId}|${conceptId}`;
        if (existingSet.has(dedupKey)) {
          skippedDuplicate++;
          continue;
        }
        existingSet.add(dedupKey);

        const totalValue = key === "discount" ? -Math.abs(value) : Math.abs(value);

        toInsert.push({
          company_id: companyId,
          period_id: periodId,
          employee_id: empId,
          concept_id: conceptId,
          quantity: 1,
          rate: totalValue,
          total_value: totalValue,
          note: row.notes || `Importado desde Excel Connecteam`,
          approval_status: "approved",
          created_by: user.id,
        });
      }
    }

    // Insert in batches
    const BATCH_SIZE = 200;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("movements").insert(batch);
      if (error) {
        console.error("Batch insert error:", error);
        for (const item of batch) {
          const { error: singleError } = await supabase.from("movements").insert(item);
          if (singleError) {
            console.error("Single insert error:", singleError.message);
          } else {
            inserted++;
          }
        }
      } else {
        inserted += batch.length;
      }
    }

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      company_id: companyId,
      action: "import_payroll_extras",
      entity_type: "movements",
      entity_id: periodId,
      details: {
        totalRows: rows.length,
        inserted,
        skippedDuplicate,
        skippedNoEmployee,
        unmatchedEmployees: Array.from(unmatchedEmployees),
      },
    });

    return json({
      success: true,
      inserted,
      skippedDuplicate,
      skippedNoEmployee,
      unmatchedEmployees: Array.from(unmatchedEmployees),
    }, 200);
  } catch (e) {
    console.error("import-payroll-extras error:", e);
    return json({ error: "Error interno del servidor" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
