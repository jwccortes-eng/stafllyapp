import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ShiftRow {
  firstName: string;
  lastName: string;
  employerId: string; // Connecteam employer identification
  shiftNumber: string;
  type: string;
  subItem: string;
  startDate: string; // ISO date
  clockIn: string;
  clockInLocation: string;
  clockInDevice: string;
  endDate: string;
  clockOut: string;
  clockOutLocation: string;
  clockOutDevice: string;
  shiftHours: number;
  hourlyRate: number;
  customer: string;
  equipment: string;
  equipmentShortCode: string;
  ride: string;
  payRide: string;
  scheduledShiftTitle: string;
  employeeNotes: string;
  managerNotes: string;
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

    // Use service role for bulk operations but verify caller is authenticated
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Token inválido" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { companyId, rows } = await req.json() as { companyId: string; rows: ShiftRow[] };

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

    // Fetch periods for this company
    const { data: periods } = await supabase
      .from("pay_periods")
      .select("id, start_date, end_date")
      .eq("company_id", companyId)
      .order("start_date");

    if (!periods?.length) {
      return json({ error: "No hay periodos de pago creados" }, 400);
    }

    // Fetch employees for matching
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, connecteam_employee_id")
      .eq("company_id", companyId);

    // Build matching maps
    const empByConnecteamId = new Map<string, string>();
    const empByName = new Map<string, string>();
    for (const emp of employees ?? []) {
      if (emp.connecteam_employee_id) {
        empByConnecteamId.set(emp.connecteam_employee_id, emp.id);
      }
      empByName.set(`${emp.first_name} ${emp.last_name}`.toLowerCase().trim(), emp.id);
    }

    // Helper: find period for a date
    function findPeriod(dateStr: string) {
      for (const p of periods!) {
        if (dateStr >= p.start_date && dateStr <= p.end_date) {
          return p.id;
        }
      }
      return null;
    }

    // Build hash for dedup
    function shiftHash(empId: string, startDate: string, clockIn: string): string {
      return `${empId}|${startDate}|${clockIn}`;
    }

    // Check existing shifts to avoid duplicates
    const { data: existingShifts } = await supabase
      .from("shifts")
      .select("shift_hash")
      .eq("company_id", companyId)
      .not("shift_hash", "is", null);

    const existingHashes = new Set((existingShifts ?? []).map(s => s.shift_hash));

    let inserted = 0;
    let skippedDuplicate = 0;
    let skippedNoPeriod = 0;
    let skippedNoEmployee = 0;
    const unmatchedEmployees = new Set<string>();
    const periodCounts: Record<string, number> = {};

    // Process in batches of 100
    const toInsert: any[] = [];

    for (const row of rows) {
      // Match employee: try connecteam ID first, then name
      let empId = row.employerId ? empByConnecteamId.get(row.employerId) : undefined;
      if (!empId) {
        empId = empByName.get(`${row.firstName} ${row.lastName}`.toLowerCase().trim());
      }
      if (!empId) {
        unmatchedEmployees.add(`${row.firstName} ${row.lastName}`);
        skippedNoEmployee++;
        continue;
      }

      // Determine period from start date
      const periodId = findPeriod(row.startDate);
      if (!periodId) {
        skippedNoPeriod++;
        continue;
      }

      // Dedup
      const hash = shiftHash(empId, row.startDate, row.clockIn);
      if (existingHashes.has(hash)) {
        skippedDuplicate++;
        continue;
      }
      existingHashes.add(hash);

      toInsert.push({
        company_id: companyId,
        employee_id: empId,
        period_id: periodId,
        shift_number: row.shiftNumber || null,
        type: row.type || null,
        sub_job: row.subItem || null,
        shift_start_date: row.startDate || null,
        clock_in_time: row.clockIn || null,
        clock_in_location: row.clockInLocation || null,
        clock_in_device: row.clockInDevice || null,
        shift_end_date: row.endDate || null,
        clock_out_time: row.clockOut || null,
        clock_out_location: row.clockOutLocation || null,
        clock_out_device: row.clockOutDevice || null,
        shift_hours: row.shiftHours || 0,
        hourly_rate_usd: row.hourlyRate || 0,
        customer: row.customer || null,
        ride: row.ride || null,
        scheduled_shift_title: row.scheduledShiftTitle || null,
        employee_notes: row.employeeNotes || null,
        manager_notes: row.managerNotes || null,
        shift_hash: hash,
      });

      periodCounts[periodId] = (periodCounts[periodId] || 0) + 1;
    }

    // Insert in batches
    const BATCH_SIZE = 200;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("shifts").insert(batch);
      if (error) {
        console.error("Batch insert error:", error);
        // Try one by one for this batch
        for (const item of batch) {
          const { error: singleError } = await supabase.from("shifts").insert(item);
          if (singleError) {
            if (singleError.code === "23505") {
              skippedDuplicate++;
            } else {
              console.error("Single insert error:", singleError.message);
            }
          } else {
            inserted++;
          }
        }
      } else {
        inserted += batch.length;
      }
    }

    // Build period summary
    const periodSummary = [];
    for (const p of periods!) {
      const count = periodCounts[p.id] || 0;
      if (count > 0) {
        periodSummary.push({
          periodId: p.id,
          startDate: p.start_date,
          endDate: p.end_date,
          shiftsInserted: count,
        });
      }
    }

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      company_id: companyId,
      action: "bulk_import_shifts",
      entity_type: "shifts",
      details: {
        totalRows: rows.length,
        inserted,
        skippedDuplicate,
        skippedNoPeriod,
        skippedNoEmployee,
        unmatchedEmployees: Array.from(unmatchedEmployees),
        periodSummary,
      },
    });

    return json({
      success: true,
      inserted,
      skippedDuplicate,
      skippedNoPeriod,
      skippedNoEmployee,
      unmatchedEmployees: Array.from(unmatchedEmployees),
      periodSummary,
    }, 200);
  } catch (e) {
    console.error("bulk-import-shifts error:", e);
    return json({ error: "Error interno del servidor" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
