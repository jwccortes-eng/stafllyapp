import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ScheduleRow {
  date: string;       // MM/DD/YYYY
  start: string;      // e.g. "09:00am"
  end: string;
  shift_title: string;
  job: string;
  sub_item: string;
  address: string;
  user: string;       // employee name
  tags: string;
  note: string;
  draft: string;
  last_status: string;
  source_file: string;
}

function parseTime12(t: string): string | null {
  if (!t || t === "All Day") return null;
  const m = t.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2];
  const ampm = m[3].toLowerCase();
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}:00`;
}

function parseDate(d: string): string | null {
  // MM/DD/YYYY → YYYY-MM-DD
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
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
    if (authError || !user) return json({ error: "Token inválido" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { companyId, rows, action } = await req.json() as {
      companyId: string;
      rows?: ScheduleRow[];
      action: "import_raw" | "process_shifts" | "stats";
    };

    if (!companyId) return json({ error: "companyId requerido" }, 400);

    // Verify membership
    const { data: membership } = await supabase
      .from("company_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!membership) return json({ error: "Sin acceso" }, 403);

    if (action === "import_raw") {
      return await importRaw(supabase, companyId, rows ?? [], user.id);
    } else if (action === "process_shifts") {
      return await processShifts(supabase, companyId, user.id);
    } else if (action === "stats") {
      return await getStats(supabase, companyId);
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (e) {
    console.error("migration-schedule-sync error:", e);
    return json({ error: "Error interno" }, 500);
  }
});

async function importRaw(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  rows: ScheduleRow[],
  userId: string,
) {
  if (!rows.length) return json({ error: "No rows" }, 400);

  const toInsert = rows.map((r, idx) => ({
    company_id: companyId,
    source_system: "connecteam",
    record_type: "schedule",
    file_name: r.source_file || "schedule_import",
    raw_payload: r,
    row_index: idx,
    imported_by: userId,
  }));

  // Insert in batches
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await supabase.from("migration_raw_imports").insert(batch);
    if (error) {
      console.error("Raw insert error:", error.message);
      return json({ error: error.message, inserted }, 500);
    }
    inserted += batch.length;
  }

  return json({ success: true, inserted });
}

async function processShifts(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
) {
  // 1. Fetch all raw schedule records
  const { data: rawRecords, error: rawErr } = await supabase
    .from("migration_raw_imports")
    .select("id, raw_payload")
    .eq("company_id", companyId)
    .eq("record_type", "schedule")
    .eq("source_system", "connecteam")
    .order("row_index")
    .limit(5000);

  if (rawErr) return json({ error: rawErr.message }, 500);
  if (!rawRecords?.length) return json({ error: "No raw schedule records found" }, 400);

  // 2. Fetch employee mapping for name matching
  const { data: empMapping } = await supabase
    .from("migration_employee_mapping")
    .select("connecteam_name, stafly_employee_id, match_status")
    .eq("company_id", companyId)
    .in("match_status", ["exact_match", "probable_match", "manually_resolved"]);

  const empByName = new Map<string, string>();
  for (const m of empMapping ?? []) {
    if (m.stafly_employee_id) {
      empByName.set(m.connecteam_name.toUpperCase().trim(), m.stafly_employee_id);
    }
  }

  // Also fetch employees directly for fallback matching
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("company_id", companyId);

  for (const emp of employees ?? []) {
    const name = `${emp.first_name} ${emp.last_name}`.toUpperCase().trim();
    if (!empByName.has(name)) {
      empByName.set(name, emp.id);
    }
  }

  // 3. Fetch existing clients
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("company_id", companyId);

  const clientByName = new Map<string, string>();
  for (const c of clients ?? []) {
    clientByName.set(c.name.toUpperCase().trim(), c.id);
  }

  // 4. Group raw records into shifts
  type ShiftGroup = {
    date: string;
    startTime: string;
    endTime: string;
    title: string;
    job: string;
    subItem: string;
    address: string;
    tags: string;
    note: string;
    assignments: { userName: string; empId: string | null; status: string }[];
  };

  const shiftMap = new Map<string, ShiftGroup>();
  let skippedPayRide = 0;
  let skippedNoDate = 0;

  for (const raw of rawRecords) {
    const r = raw.raw_payload as unknown as ScheduleRow;
    const isoDate = parseDate(r.date);
    if (!isoDate) { skippedNoDate++; continue; }

    // Separate PAY RIDE for later processing
    if (r.job?.includes("PAY RIDE")) {
      skippedPayRide++;
      continue;
    }

    const startTime = parseTime12(r.start) || "00:00:00";
    const endTime = parseTime12(r.end) || "23:59:00";

    const key = `${isoDate}|${r.shift_title}|${r.job}|${startTime}|${endTime}`;

    if (!shiftMap.has(key)) {
      shiftMap.set(key, {
        date: isoDate,
        startTime,
        endTime,
        title: r.shift_title,
        job: r.job,
        subItem: r.sub_item,
        address: r.address,
        tags: r.tags,
        note: r.note,
        assignments: [],
      });
    }

    const userName = r.user.toUpperCase().trim();
    const empId = empByName.get(userName) || null;

    shiftMap.get(key)!.assignments.push({
      userName: r.user,
      empId,
      status: r.last_status || "pending",
    });
  }

  // 5. Check existing shifts to avoid duplicates
  const { data: existingShifts } = await supabase
    .from("scheduled_shifts")
    .select("id, reconciliation_hash")
    .eq("company_id", companyId)
    .not("reconciliation_hash", "is", null);

  const existingHashes = new Set((existingShifts ?? []).map(s => s.reconciliation_hash));

  // 6. Insert scheduled_shifts and shift_assignments
  let shiftsCreated = 0;
  let assignmentsCreated = 0;
  let shiftsSkippedDup = 0;
  let unmatchedEmployees = new Set<string>();
  let mappingRecords: any[] = [];

  for (const [key, group] of shiftMap) {
    const hash = `ctm_sched_${key}`;
    if (existingHashes.has(hash)) {
      shiftsSkippedDup++;
      continue;
    }

    // Determine client from job name
    const jobClean = group.job.replace(/^\d+\s*-\s*/, "").trim();
    const clientId = clientByName.get(jobClean.toUpperCase()) || null;

    // Determine tags
    const isWeekend = group.tags?.toLowerCase().includes("weekend");
    const isDraft = group.draft === "Yes";

    const shiftInsert = {
      company_id: companyId,
      title: `${group.title} - ${group.subItem || jobClean}`.substring(0, 200),
      date: group.date,
      start_time: group.startTime,
      end_time: group.endTime,
      slots: group.assignments.length,
      client_id: clientId,
      notes: group.note || null,
      shift_code: group.title,
      status: isDraft ? "draft" : "confirmed",
      claimable: false,
      meeting_point: group.address || null,
      pay_type: "hourly",
      day_type: isWeekend ? "weekend" : "weekday",
      reconciliation_hash: hash,
      clock_method: "standard",
      qr_attendance_mode: "none",
      transportation_required: false,
      car_capacity: 0,
    };

    const { data: newShift, error: shiftErr } = await supabase
      .from("scheduled_shifts")
      .insert(shiftInsert)
      .select("id")
      .single();

    if (shiftErr) {
      console.error("Shift insert error:", shiftErr.message, key);
      continue;
    }

    shiftsCreated++;
    existingHashes.add(hash);

    // Create assignments
    for (const a of group.assignments) {
      if (a.empId) {
        const { error: assErr } = await supabase
          .from("shift_assignments")
          .insert({
            shift_id: newShift.id,
            employee_id: a.empId,
            company_id: companyId,
            status: a.status === "accept" ? "confirmed" : "pending",
          });
        if (!assErr) assignmentsCreated++;
      } else {
        unmatchedEmployees.add(a.userName);
      }
    }

    // Create migration_shift_mapping record
    mappingRecords.push({
      company_id: companyId,
      connecteam_ref: hash,
      connecteam_data: {
        shift_title: group.title,
        job: group.job,
        sub_item: group.subItem,
        date: group.date,
        start_time: group.startTime,
        end_time: group.endTime,
        employee_count: group.assignments.length,
        matched_count: group.assignments.filter(a => a.empId).length,
        unmatched: group.assignments.filter(a => !a.empId).map(a => a.userName),
      },
      stafly_shift_id: newShift.id,
      match_status: group.assignments.every(a => a.empId) ? "exact_match" : "partial_match",
    });
  }

  // Insert mapping records in batch
  if (mappingRecords.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < mappingRecords.length; i += BATCH) {
      await supabase.from("migration_shift_mapping").insert(mappingRecords.slice(i, i + BATCH));
    }
  }

  // Log activity
  const summary = {
    raw_records: rawRecords.length,
    unique_shifts: shiftMap.size,
    shifts_created: shiftsCreated,
    shifts_skipped_duplicate: shiftsSkippedDup,
    assignments_created: assignmentsCreated,
    skipped_pay_ride: skippedPayRide,
    unmatched_employees: Array.from(unmatchedEmployees),
  };

  await supabase.from("activity_log").insert({
    user_id: userId,
    company_id: companyId,
    action: "migration_schedule_sync",
    entity_type: "scheduled_shifts",
    details: summary,
  });

  return json({ success: true, ...summary });
}

async function getStats(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
) {
  const [rawRes, mappingRes, shiftsRes] = await Promise.all([
    supabase.from("migration_raw_imports").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).eq("record_type", "schedule"),
    supabase.from("migration_shift_mapping").select("match_status", { count: "exact" })
      .eq("company_id", companyId),
    supabase.from("scheduled_shifts").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).not("reconciliation_hash", "is", null),
  ]);

  return json({
    raw_records: rawRes.count || 0,
    mapping_records: mappingRes.data?.length || 0,
    scheduled_shifts: shiftsRes.count || 0,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
