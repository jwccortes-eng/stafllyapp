import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normPhone(p: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/[^\d]/g, "");
  const d = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  return d.length >= 7 ? d.slice(-10) : null;
}

function normName(n: string | null): string {
  if (!n) return "";
  return n.trim().toUpperCase().replace(/\*/g, "").replace(/\s+/g, " ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { connecteam_records, company_id } = await req.json();

  // 1. Get all Stafly employees
  const { data: staflyEmps, error: empErr } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, phone_number, connecteam_employee_id")
    .eq("company_id", company_id);

  if (empErr) return new Response(JSON.stringify({ error: empErr.message }), { status: 500, headers: corsHeaders });

  // Build indexes
  const phoneIdx: Record<string, any> = {};
  const emailIdx: Record<string, any> = {};
  const nameIdx: Record<string, any> = {};
  const ctidIdx: Record<string, any> = {};

  for (const s of staflyEmps || []) {
    const ph = normPhone(s.phone_number);
    if (ph) phoneIdx[ph] = s;
    const em = (s.email || "").toLowerCase().trim();
    if (em && em.includes("@")) emailIdx[em] = s;
    const nk = `${normName(s.first_name)}|${normName(s.last_name)}`;
    if (nk !== "|") nameIdx[nk] = s;
    if (s.connecteam_employee_id) ctidIdx[s.connecteam_employee_id] = s;
  }

  // 2. Match each connecteam record
  const mappings: any[] = [];
  const stats = { exact_match: 0, probable_match: 0, unresolved: 0, total: 0 };

  for (const r of connecteam_records) {
    const ctPhone = normPhone(r.phone);
    const ctEmail = (r.email || "").toLowerCase().trim();
    const ctId = r.connecteam_id;
    const ctName = `${normName(r.fn)} ${normName(r.ln)}`.trim();

    let match: any = null;
    let method: string | null = null;
    let confidence = 0;

    // Priority 1: Connecteam ID
    if (ctId && ctidIdx[ctId]) {
      match = ctidIdx[ctId]; method = "connecteam_id"; confidence = 1.0;
    }
    // Priority 2: Phone
    if (!match && ctPhone && phoneIdx[ctPhone]) {
      match = phoneIdx[ctPhone]; method = "phone"; confidence = 0.95;
    }
    // Priority 3: Email
    if (!match && ctEmail && ctEmail.includes("@") && emailIdx[ctEmail]) {
      match = emailIdx[ctEmail]; method = "email"; confidence = 0.90;
    }
    // Priority 4: Exact name
    if (!match) {
      const nk = `${normName(r.fn)}|${normName(r.ln)}`;
      if (nameIdx[nk]) {
        match = nameIdx[nk]; method = "name_exact"; confidence = 0.75;
      }
    }
    // Priority 5: Fuzzy name
    if (!match) {
      const fn = normName(r.fn);
      const ln = normName(r.ln);
      for (const s of staflyEmps || []) {
        const sfn = normName(s.first_name);
        const sln = normName(s.last_name);
        if (sfn === fn && sln.length >= 3 && ln.length >= 3 && sln.slice(0, 3) === ln.slice(0, 3)) {
          match = s; method = "name_fuzzy"; confidence = 0.60; break;
        }
      }
    }

    const status = match
      ? confidence >= 0.90 ? "exact_match" : "probable_match"
      : "unresolved";
    stats[status as keyof typeof stats]++;
    stats.total++;

    mappings.push({
      company_id,
      connecteam_ref: ctId || null,
      connecteam_name: ctName,
      connecteam_phone: r.phone || null,
      connecteam_email: ctEmail && ctEmail.includes("@") ? ctEmail : null,
      stafly_employee_id: match?.id || null,
      match_status: status,
      match_confidence: confidence,
      match_method: method,
      notes: r.source ? `source:${r.source}` : null,
    });
  }

  // 3. Clear existing mappings for this company
  await supabase
    .from("migration_employee_mapping")
    .delete()
    .eq("company_id", company_id);

  // 4. Insert in batches
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < mappings.length; i += batchSize) {
    const batch = mappings.slice(i, i + batchSize);
    const { error: insErr } = await supabase
      .from("migration_employee_mapping")
      .insert(batch);
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message, batch: i }), {
        status: 500, headers: corsHeaders,
      });
    }
    inserted += batch.length;
  }

  // 5. Update pilot status
  await supabase
    .from("migration_pilot_status")
    .update({
      employee_sync_at: new Date().toISOString(),
      employee_sync_stats: stats,
    })
    .eq("company_id", company_id);

  return new Response(JSON.stringify({ success: true, stats, inserted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
