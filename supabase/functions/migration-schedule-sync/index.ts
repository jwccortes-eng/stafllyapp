import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseTime12(t: string): string | null {
  if (!t || t === "All Day") return null;
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2];
  const ampm = m[3].toLowerCase();
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}:00`;
}

function parseDate(d: string): string | null {
  if (!d) return null;
  // MM/DD/YYYY → YYYY-MM-DD
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
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
    const token = authHeader.replace("Bearer ", "");

    // Allow service role key for server-to-server calls
    const isServiceRole = token === serviceKey;
    let userId: string;

    if (isServiceRole) {
      userId = "00000000-0000-0000-0000-000000000000"; // system user
    } else {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await anonClient.auth.getUser();
      if (authError || !user) return json({ error: "Token inválido" }, 401);
      userId = user.id;
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json();

    // Support both naming conventions from frontend
    const companyId = body.companyId || body.company_id;
    const rows = body.rows || [];
    const action = body.action;
    const dataType = body.data_type || "scheduling";
    const fileName = body.file_name || "import";

    if (!companyId) return json({ error: "companyId requerido" }, 400);

    // Verify membership (skip for service role)
    if (!isServiceRole) {
      const { data: membership } = await supabase
        .from("company_users")
        .select("id")
        .eq("user_id", userId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!membership) return json({ error: "Sin acceso" }, 403);
    }

    // Legacy action-based API
    if (action === "process_shifts") {
      return await processShifts(supabase, companyId, userId);
    }
    if (action === "stats") {
      return await getStats(supabase, companyId);
    }
    if (action === "resync_all") {
      return await resyncAllPeriods(supabase, companyId, userId);
    }

    // Smart Sync API: auto-import raw + process
    if (!rows.length) return json({ error: "No rows" }, 400);

    // Step 1: Import raw records
    const importResult = await importRaw(supabase, companyId, rows, userId, dataType, fileName);
    
    return importResult;
  } catch (e) {
    console.error("migration-schedule-sync error:", e);
    return json({ error: "Error interno", details: e.message }, 500);
  }
});

async function importRaw(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  rows: Record<string, unknown>[],
  userId: string,
  recordType: string,
  fileName: string,
) {
  const toInsert = rows.map((r, idx) => ({
    company_id: companyId,
    source_system: "connecteam",
    record_type: recordType,
    file_name: fileName,
    raw_payload: r,
    row_index: idx,
    imported_by: userId,
  }));

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

  // After importing, run type-specific processing
  let processing: Record<string, unknown> = {};

  if (recordType === "scheduling") {
    processing = await processScheduleRaw(supabase, companyId, userId, rows);
  } else if (recordType === "timeclock") {
    processing = await processTimeclockRaw(supabase, companyId, userId, rows);
  } else if (recordType === "payroll") {
    processing = await processPayrollRaw(supabase, companyId, userId, rows);
  }

  await supabase.from("activity_log").insert({
    user_id: userId,
    company_id: companyId,
    action: `migration_${recordType}_import`,
    entity_type: "migration_raw_imports",
    details: { inserted, record_type: recordType, file_name: fileName, ...processing },
  });

  return json({ success: true, inserted, record_type: recordType, ...processing });
}

// ─── Schedule Processing ─────────────────────────────────────────
async function processScheduleRaw(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
  rows: Record<string, unknown>[],
) {
  // Build employee lookup
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

  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("company_id", companyId);

  for (const emp of employees ?? []) {
    const name = `${emp.first_name} ${emp.last_name}`.toUpperCase().trim();
    if (!empByName.has(name)) empByName.set(name, emp.id);
  }

  // Build client lookup
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("company_id", companyId);
  const clientByName = new Map<string, string>();
  for (const c of clients ?? []) {
    clientByName.set(c.name.toUpperCase().trim(), c.id);
  }

  // Existing hashes
  const { data: existingShifts } = await supabase
    .from("scheduled_shifts")
    .select("id, reconciliation_hash")
    .eq("company_id", companyId)
    .not("reconciliation_hash", "is", null);
  const existingHashes = new Set((existingShifts ?? []).map(s => s.reconciliation_hash));

  // Group rows into shifts (skip availability rows without Shift title)
  type ShiftGroup = {
    date: string; startTime: string; endTime: string; title: string;
    job: string; subItem: string; address: string; tags: string; note: string;
    assignments: { userName: string; empId: string | null; status: string }[];
  };

  const shiftMap = new Map<string, ShiftGroup>();
  let skippedPayRide = 0, skippedNoTitle = 0;

  for (const r of rows) {
    const shiftTitle = r["Shift title"] as string;
    if (!shiftTitle) { skippedNoTitle++; continue; }

    const dateStr = r["Date"] as string;
    const isoDate = parseDate(dateStr);
    if (!isoDate) continue;

    const job = (r["Job"] as string) || "";
    if (job.includes("PAY RIDE")) { skippedPayRide++; continue; }

    const startTime = parseTime12(r["Start"] as string) || "00:00:00";
    const endTime = parseTime12(r["End"] as string) || "23:59:00";
    const key = `${isoDate}|${shiftTitle}|${job}|${startTime}|${endTime}`;

    if (!shiftMap.has(key)) {
      shiftMap.set(key, {
        date: isoDate, startTime, endTime, title: shiftTitle, job,
        subItem: (r["Sub item"] as string) || "",
        address: (r["Address"] as string) || "",
        tags: (r["Shift tags"] as string) || "",
        note: (r["Note"] as string) || "",
        assignments: [],
      });
    }

    const userName = ((r["Users"] as string) || "").toUpperCase().trim();
    const empId = empByName.get(userName) || null;
    shiftMap.get(key)!.assignments.push({
      userName: (r["Users"] as string) || "",
      empId,
      status: (r["Last Status"] as string) || "pending",
    });
  }

  let shiftsCreated = 0, assignmentsCreated = 0, shiftsSkippedDup = 0;
  const unmatchedEmployees = new Set<string>();
  const mappingRecords: Record<string, unknown>[] = [];

  for (const [key, group] of shiftMap) {
    const hash = `ctm_sched_${key}`;
    if (existingHashes.has(hash)) { shiftsSkippedDup++; continue; }

    const jobClean = group.job.replace(/^\d+\s*-\s*/, "").trim();
    const clientId = clientByName.get(jobClean.toUpperCase()) || null;
    const isWeekend = group.tags?.toLowerCase().includes("weekend");

    const shiftInsert = {
      company_id: companyId,
      title: `${group.title} - ${group.subItem || jobClean}`.substring(0, 200),
      date: group.date, start_time: group.startTime, end_time: group.endTime,
      slots: group.assignments.length, client_id: clientId,
      notes: group.note || null, shift_code: group.title,
      status: "confirmed", claimable: false,
      meeting_point: group.address || null, pay_type: "hourly",
      day_type: isWeekend ? "weekend" : "weekday",
      reconciliation_hash: hash, clock_method: "standard",
      qr_attendance_mode: "none", transportation_required: false, car_capacity: 0,
    };

    const { data: newShift, error: shiftErr } = await supabase
      .from("scheduled_shifts").insert(shiftInsert).select("id").single();
    if (shiftErr) { console.error("Shift insert:", shiftErr.message); continue; }

    shiftsCreated++;
    existingHashes.add(hash);

    for (const a of group.assignments) {
      if (a.empId) {
        const { error: assErr } = await supabase.from("shift_assignments").insert({
          shift_id: newShift.id, employee_id: a.empId, company_id: companyId,
          status: a.status === "accept" ? "confirmed" : "pending",
        });
        if (!assErr) assignmentsCreated++;
      } else {
        unmatchedEmployees.add(a.userName);
      }
    }

    mappingRecords.push({
      company_id: companyId, connecteam_ref: hash,
      connecteam_data: {
        shift_title: group.title, job: group.job, sub_item: group.subItem,
        date: group.date, start_time: group.startTime, end_time: group.endTime,
        employee_count: group.assignments.length,
        matched_count: group.assignments.filter(a => a.empId).length,
        unmatched: group.assignments.filter(a => !a.empId).map(a => a.userName),
      },
      stafly_shift_id: newShift.id,
      match_status: group.assignments.every(a => a.empId) ? "exact_match" : "partial_match",
    });
  }

  if (mappingRecords.length) {
    for (let i = 0; i < mappingRecords.length; i += 100) {
      await supabase.from("migration_shift_mapping").insert(mappingRecords.slice(i, i + 100));
    }
  }

  return {
    unique_shifts: shiftMap.size, shifts_created: shiftsCreated,
    shifts_skipped_duplicate: shiftsSkippedDup,
    assignments_created: assignmentsCreated,
    skipped_pay_ride: skippedPayRide, skipped_no_title: skippedNoTitle,
    unmatched_employees: Array.from(unmatchedEmployees),
  };
}

// ─── Timeclock Processing ────────────────────────────────────────
async function processTimeclockRaw(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
  rows: Record<string, unknown>[],
) {
  // Build employee lookup
  const { data: empMapping } = await supabase
    .from("migration_employee_mapping")
    .select("connecteam_name, stafly_employee_id, match_status")
    .eq("company_id", companyId)
    .in("match_status", ["exact_match", "probable_match", "manually_resolved"]);

  const empByName = new Map<string, string>();
  for (const m of empMapping ?? []) {
    if (m.stafly_employee_id) empByName.set(m.connecteam_name.toUpperCase().trim(), m.stafly_employee_id);
  }

  const { data: employees } = await supabase
    .from("employees").select("id, first_name, last_name").eq("company_id", companyId);
  for (const emp of employees ?? []) {
    const name = `${emp.first_name} ${emp.last_name}`.toUpperCase().trim();
    if (!empByName.has(name)) empByName.set(name, emp.id);
  }

  let matched = 0, unmatched = 0, skipped = 0;
  const clockMappings: Record<string, unknown>[] = [];

  for (const r of rows) {
    const startDate = r["Start Date"] as string;
    if (!startDate) { skipped++; continue; }

    const firstName = String(r["First name"] || "").trim();
    const lastName = String(r["Last name"] || "").trim();
    const fullName = `${firstName} ${lastName}`.toUpperCase().trim();
    const empId = empByName.get(fullName) || null;

    const shiftHours = parseFloat(String(r["Shift hours"] || "0")) || 0;
    const hourlyRate = parseFloat(String(r["Hourly rate (USD)"] || "0")) || 0;

    const isoDate = parseDate(startDate);
    const hash = `ctm_clock_${fullName}_${isoDate}_${r["Start time"]}`;

    if (empId) matched++;
    else unmatched++;

    clockMappings.push({
      company_id: companyId,
      connecteam_ref: hash,
      connecteam_data: {
        employee_name: `${firstName} ${lastName}`,
        stafly_employee_id: empId,
        start_date: startDate, start_time: r["Start time"],
        end_date: r["End Date"], end_time: r["End time"],
        shift_hours: shiftHours, hourly_rate: hourlyRate,
        job: r["Job"], sub_item: r["Job sub item"],
        start_location: r["Start - location"], end_location: r["End - location"],
        start_device: r["Start - device"], end_device: r["End - device"],
        daily_total_hours: r["Daily total hours"],
        daily_total_pay: r["Daily total pay (USD)"],
        manager_notes: r["Manager notes"],
      },
      match_status: empId ? "exact_match" : "unresolved",
    });
  }

  if (clockMappings.length) {
    for (let i = 0; i < clockMappings.length; i += 100) {
      await supabase.from("migration_clock_mapping").insert(clockMappings.slice(i, i + 100));
    }
  }

  return { clock_records: clockMappings.length, matched, unmatched, skipped };
}

// ─── Payroll Processing ──────────────────────────────────────────
async function processPayrollRaw(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
  rows: Record<string, unknown>[],
) {
  const { data: empMapping } = await supabase
    .from("migration_employee_mapping")
    .select("connecteam_name, stafly_employee_id, match_status")
    .eq("company_id", companyId)
    .in("match_status", ["exact_match", "probable_match", "manually_resolved"]);

  const empByName = new Map<string, string>();
  for (const m of empMapping ?? []) {
    if (m.stafly_employee_id) empByName.set(m.connecteam_name.toUpperCase().trim(), m.stafly_employee_id);
  }

  const { data: employees } = await supabase
    .from("employees").select("id, first_name, last_name").eq("company_id", companyId);
  for (const emp of employees ?? []) {
    const name = `${emp.first_name} ${emp.last_name}`.toUpperCase().trim();
    if (!empByName.has(name)) empByName.set(name, emp.id);
  }

  let matched = 0, unmatched = 0;
  const summaries: Record<string, unknown>[] = [];

  for (const r of rows) {
    const firstName = String(r["First name"] || "").trim();
    const lastName = String(r["Last name"] || "").trim();
    const fullName = `${firstName} ${lastName}`.toUpperCase().trim();
    const empId = empByName.get(fullName) || null;

    if (empId) matched++;
    else unmatched++;

    summaries.push({
      employee_name: `${firstName} ${lastName}`,
      employee_id: empId,
      total_hours: parseFloat(String(r["Total work hours"] || r["Total paid hours"] || "0")) || 0,
      total_regular: parseFloat(String(r["Total Regular"] || "0")) || 0,
      total_overtime: parseFloat(String(r["Total overtime hours"] || "0")) || 0,
      total_pay: parseFloat(String(r["Total pay"] || "0")) || 0,
      payper_day: r["Payper Day"],
      ryde: parseFloat(String(r["Ryde"] || "0")) || 0,
      tips: parseFloat(String(r["TIPS"] || "0")) || 0,
      reimbursements: parseFloat(String(r["Reimbursements"] || "0")) || 0,
      travel_hours: parseFloat(String(r["Travel Hours"] || "0")) || 0,
      otros: parseFloat(String(r["Otros"] || "0")) || 0,
      discount: parseFloat(String(r["Discount "] || r["Discount"] || "0")) || 0,
      total_final: parseFloat(String(r["TOTAL"] || "0")) || 0,
      corte: r["Corte"],
      matched: !!empId,
    });
  }

  // Store payroll summary in activity log for now (period reconciliation uses it)
  await supabase.from("activity_log").insert({
    user_id: userId,
    company_id: companyId,
    action: "migration_payroll_summary",
    entity_type: "payroll",
    details: {
      employees_matched: matched,
      employees_unmatched: unmatched,
      total_employees: summaries.length,
      grand_total: summaries.reduce((s, e) => s + ((e.total_final as number) || 0), 0),
      summaries,
    },
  });

  return { payroll_employees: summaries.length, matched, unmatched };
}

// ─── Legacy: Process Shifts from raw imports ─────────────────────
async function processShifts(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
) {
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

  const rows = rawRecords.map(r => r.raw_payload as Record<string, unknown>);
  const result = await processScheduleRaw(supabase, companyId, userId, rows);
  return json({ success: true, raw_records: rawRecords.length, ...result });
}

// ─── Stats ───────────────────────────────────────────────────────
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

// ─── Resync All Periods ──────────────────────────────────────────
async function resyncAllPeriods(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
) {
  // ── Employee lookup ──
  const { data: empMapping } = await supabase
    .from("migration_employee_mapping")
    .select("connecteam_name, stafly_employee_id, match_status")
    .eq("company_id", companyId)
    .in("match_status", ["exact_match", "probable_match", "manually_resolved"])
    .limit(5000);

  const empByName = new Map<string, string>();
  for (const m of empMapping ?? []) {
    if (m.stafly_employee_id) empByName.set(m.connecteam_name.toUpperCase().trim(), m.stafly_employee_id);
  }

  const { data: employees } = await supabase
    .from("employees").select("id, first_name, last_name").eq("company_id", companyId).limit(5000);
  for (const emp of employees ?? []) {
    const name = `${emp.first_name} ${emp.last_name}`.toUpperCase().trim();
    if (!empByName.has(name)) empByName.set(name, emp.id);
  }

  // ── Get all migration periods ──
  const { data: periods } = await supabase
    .from("migration_period_reconciliation")
    .select("*")
    .eq("company_id", companyId)
    .order("week_start");

  if (!periods?.length) return json({ error: "No periods found" }, 400);

  // ── Get ALL payroll raw imports ──
  const { data: payrollRaw } = await supabase
    .from("migration_raw_imports")
    .select("raw_payload")
    .eq("company_id", companyId)
    .eq("record_type", "payroll")
    .order("row_index")
    .limit(10000);

  const payrollRows = (payrollRaw ?? []).map(r => r.raw_payload as Record<string, unknown>);

  // ── Get Stafly pay_periods + period_base_pay + movements ──
  const { data: payPeriods } = await supabase
    .from("pay_periods")
    .select("id, start_date, end_date")
    .eq("company_id", companyId)
    .order("start_date");

  // NOTE: project row cap can truncate broad queries at 1000 rows,
  // so per-period queries are executed inside the loop for accuracy.

  // Helper: parse CT date in multiple formats → "YYYY-MM-DD"
  // Supports: "MM/DD/YYYY", "Fri Feb 06 2026 19:00:00 GMT-0500 (...)"
  function ctDateToISO(d: string | unknown): string | null {
    if (!d || typeof d !== "string") return null;
    // Format 1: MM/DD/YYYY
    const m1 = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[1].padStart(2, "0")}-${m1[2].padStart(2, "0")}`;
    // Format 2: JS Date string like "Fri Feb 06 2026 19:00:00 GMT-0500 (...)"
    const m2 = d.match(/\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{4})/);
    if (m2) {
      const months: Record<string, string> = {
        Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
        Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
      };
      const mon = months[m2[1]];
      if (mon) return `${m2[3]}-${mon}-${m2[2].padStart(2, "0")}`;
    }
    // Format 3: try native Date parse as fallback
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return null;
  }

  const results: Record<string, unknown>[] = [];

  for (const period of periods) {
    const weekStart = period.week_start;
    const weekEnd = period.week_end;

    // ── CT TOTALS: match payroll rows by date range ──
    // Each row is a shift entry. Total pay/hours are weekly aggregates that repeat per employee.
    // Strategy: group by employee, use MAX(Total pay) as their weekly total, SUM(Shift hours) for hours.
    const empCTData = new Map<string, { totalPay: number; shiftHours: number; totalHours: number }>();

    for (const r of payrollRows) {
      // Match by Start Date or End Date falling within period range
      const startDateStr = ctDateToISO(r["Start Date"] || r["Date"]);
      const endDateStr = ctDateToISO(r["End Date"]);
      const rowDate = startDateStr || endDateStr;
      if (!rowDate) continue;
      if (rowDate < weekStart || rowDate > weekEnd) continue;

      const firstName = String(r["First name"] || "").trim();
      const lastName = String(r["Last name"] || "").trim();
      const empKey = `${firstName} ${lastName}`.toUpperCase().trim();

      const totalPay = parseFloat(String(r["Total pay"] || "0")) || 0;
      const totalHours = parseFloat(String(r["Total work hours"] || r["Total paid hours"] || "0")) || 0;
      const shiftHours = parseFloat(String(r["Shift hours"] || "0")) || 0;

      const existing = empCTData.get(empKey) || { totalPay: 0, shiftHours: 0, totalHours: 0 };
      // Total pay is a weekly aggregate repeated on each row → take the MAX
      if (totalPay > existing.totalPay) existing.totalPay = totalPay;
      if (totalHours > existing.totalHours) existing.totalHours = totalHours;
      // Shift hours are per-entry → sum them
      existing.shiftHours += shiftHours;
      empCTData.set(empKey, existing);
    }

    let ctEmployees = empCTData.size;
    let ctGross = 0;
    let ctHours = 0;
    let ctEntries = 0;

    for (const [, data] of empCTData) {
      ctGross += data.totalPay;
      ctHours += data.totalHours > 0 ? data.totalHours : data.shiftHours;
      ctEntries++;
    }

    // ── STAFLY TOTALS: from period_base_pay + movements ──
    // Find matching pay_period by date range overlap
    const matchingPayPeriod = (payPeriods ?? []).find(pp =>
      pp.start_date <= weekEnd && pp.end_date >= weekStart
    );

    let sfEmployees = 0, sfGross = 0, sfHours = 0;

    if (matchingPayPeriod) {
      const periodBase = baseByPeriod.get(matchingPayPeriod.id) || [];
      const periodMov = movByPeriod.get(matchingPayPeriod.id) || new Map();

      // Simple direct sums — avoids any double-counting risk
      const baseSum = periodBase.reduce((s, bp) => s + bp.pay, 0);
      const hoursSum = periodBase.reduce((s, bp) => s + bp.hours, 0);
      const movSum = [...periodMov.values()].reduce((s, v) => s + v, 0);

      sfGross = baseSum + movSum;
      sfHours = hoursSum;

      // Count unique employees across both sources
      const sfEmps = new Set<string>();
      for (const bp of periodBase) sfEmps.add(bp.employee_id);
      for (const [empId] of periodMov) sfEmps.add(empId);
      sfEmployees = sfEmps.size;
    }

    const variance = Math.round((ctGross - sfGross) * 100) / 100;

    // Update period
    const { error } = await supabase.from("migration_period_reconciliation").update({
      connecteam_totals: {
        employees: ctEmployees,
        entries: ctEntries,
        gross: Math.round(ctGross * 100) / 100,
        hours: Math.round(ctHours * 100) / 100,
      },
      stafly_totals: {
        employees: sfEmployees,
        gross: Math.round(sfGross * 100) / 100,
        hours: Math.round(sfHours * 100) / 100,
      },
      total_variance: variance,
      status: period.status === "locked" ? "locked" : (ctGross > 0 ? "under_review" : period.status),
      updated_at: new Date().toISOString(),
    }).eq("id", period.id);

    results.push({
      period_code: period.period_code,
      week: `${weekStart} → ${weekEnd}`,
      ct_gross: Math.round(ctGross * 100) / 100,
      sf_gross: Math.round(sfGross * 100) / 100,
      variance,
      ct_employees: ctEmployees,
      sf_employees: sfEmployees,
      matched_pay_period: matchingPayPeriod?.id || null,
      error: error?.message || null,
    });
  }

  // ── Auto-update pilot_status ──
  const totalReconciled = results.filter(r => Math.abs((r.variance as number) || 0) < 1).length;
  const { data: openExceptions } = await supabase
    .from("migration_exceptions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .in("status", ["open", "in_progress"]);

  await supabase.from("migration_pilot_status").upsert({
    company_id: companyId,
    total_weeks_imported: periods.length,
    total_weeks_reconciled: totalReconciled,
    total_unresolved_issues: openExceptions?.length || 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id" });

  return json({ success: true, periods_updated: results.length, results });
}
