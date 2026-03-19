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
  return n.trim().toUpperCase().replace(/\s+/g, " ");
}

function normEmail(e: string | null): string {
  if (!e) return "";
  return e.toLowerCase().trim();
}

interface ImportRecord {
  first_name: string;
  last_name: string;
  email?: string;
  phone_number?: string;
  country_code?: string;
  connecteam_employee_id?: string;
  birthday?: string;
  gender?: string;
  address?: string;
  county?: string;
  start_date?: string;
  end_date?: string;
  english_level?: string;
  employee_role?: string;
  qualify?: string;
  recommended_by?: string;
  direct_manager?: string;
  has_car?: string;
  driver_licence?: string;
  kiosk_code?: string;
  date_added?: string;
  last_login?: string;
  groups?: string;
  tags?: string;
  added_via?: string;
  added_by?: string;
  archived_at?: string;
  archived_by?: string;
  // Admin fields
  access_level?: string;
  managed_groups?: string;
}

interface MatchResult {
  employee_id: string | null;
  company_id: string | null;
  method: string | null;
  confidence: number;
  action: string; // 'create_new' | 'attach_membership' | 'update_existing' | 'skip_duplicate' | 'flag_review'
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { records, company_id, file_type, dry_run } = await req.json() as {
      records: ImportRecord[];
      company_id: string;
      file_type: "active" | "archived" | "admin";
      dry_run?: boolean;
    };

    if (!company_id || !records?.length) {
      return new Response(JSON.stringify({ error: "Missing company_id or records" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // 1. Fetch ALL employees across ALL companies for global dedup
    const { data: allEmployees, error: empErr } = await supabase
      .from("employees")
      .select("id, first_name, last_name, email, phone_number, connecteam_employee_id, company_id, is_active, birthday, user_id");

    if (empErr) {
      return new Response(JSON.stringify({ error: empErr.message }), { status: 500, headers: corsHeaders });
    }

    // Build global indexes
    const emailIdx: Record<string, any[]> = {};
    const phoneIdx: Record<string, any[]> = {};
    const ctidIdx: Record<string, any[]> = {};
    const nameIdx: Record<string, any[]> = {};

    for (const e of allEmployees || []) {
      const em = normEmail(e.email);
      if (em && em.includes("@")) {
        if (!emailIdx[em]) emailIdx[em] = [];
        emailIdx[em].push(e);
      }
      const ph = normPhone(e.phone_number);
      if (ph) {
        if (!phoneIdx[ph]) phoneIdx[ph] = [];
        phoneIdx[ph].push(e);
      }
      if (e.connecteam_employee_id) {
        if (!ctidIdx[e.connecteam_employee_id]) ctidIdx[e.connecteam_employee_id] = [];
        ctidIdx[e.connecteam_employee_id].push(e);
      }
      const nk = `${normName(e.first_name)}|${normName(e.last_name)}`;
      if (nk !== "|") {
        if (!nameIdx[nk]) nameIdx[nk] = [];
        nameIdx[nk].push(e);
      }
    }

    // 2. Process each record
    const results: any[] = [];
    const stats = {
      total: records.length,
      created: 0,
      attached: 0,
      updated: 0,
      skipped: 0,
      flagged: 0,
      admin_roles: 0,
    };

    for (const r of records) {
      const rEmail = normEmail(r.email || "");
      const rPhone = normPhone(r.phone_number || "");
      const rCtId = r.connecteam_employee_id || "";
      const rNameKey = `${normName(r.first_name)}|${normName(r.last_name)}`;

      // Find matches across all companies
      let globalMatches: any[] = [];
      let method = "";
      let confidence = 0;

      // Priority 1: Connecteam ID
      if (rCtId && ctidIdx[rCtId]) {
        globalMatches = ctidIdx[rCtId];
        method = "connecteam_id";
        confidence = 1.0;
      }
      // Priority 2: Email
      if (!globalMatches.length && rEmail && rEmail.includes("@") && emailIdx[rEmail]) {
        globalMatches = emailIdx[rEmail];
        method = "email";
        confidence = 0.95;
      }
      // Priority 3: Phone
      if (!globalMatches.length && rPhone && phoneIdx[rPhone]) {
        globalMatches = phoneIdx[rPhone];
        method = "phone";
        confidence = 0.90;
      }
      // Priority 4: Name + Birthday
      if (!globalMatches.length && r.birthday) {
        const nk = rNameKey;
        const candidates = nameIdx[nk] || [];
        const bdMatch = candidates.filter(c => c.birthday && c.birthday === r.birthday);
        if (bdMatch.length > 0) {
          globalMatches = bdMatch;
          method = "name_birthday";
          confidence = 0.85;
        }
      }
      // Priority 5: Exact name match
      if (!globalMatches.length && nameIdx[rNameKey]) {
        globalMatches = nameIdx[rNameKey];
        method = "name_exact";
        confidence = 0.70;
      }

      // Determine action
      const sameCompanyMatch = globalMatches.find(m => m.company_id === company_id);
      const otherCompanyMatch = globalMatches.find(m => m.company_id !== company_id);

      let action = "create_new";
      let targetId: string | null = null;

      if (sameCompanyMatch) {
        // Already exists in this company — update
        action = "update_existing";
        targetId = sameCompanyMatch.id;
      } else if (otherCompanyMatch) {
        // Exists in another company — attach new membership
        action = "attach_membership";
        targetId = otherCompanyMatch.id;
      } else {
        action = "create_new";
      }

      // Flag for review if multiple name matches but no stronger match
      if (globalMatches.length > 1 && confidence < 0.85) {
        action = "flag_review";
      }

      const isActive = file_type === "active";
      const resultEntry: any = {
        import_name: `${r.first_name} ${r.last_name}`.trim(),
        import_email: rEmail,
        import_phone: rPhone,
        connecteam_id: rCtId,
        action,
        method,
        confidence,
        matched_employee_id: targetId,
        matched_company_id: sameCompanyMatch?.company_id || otherCompanyMatch?.company_id || null,
        file_type,
      };

      if (!dry_run) {
        try {
          if (action === "create_new") {
            const insertData: any = {
              company_id,
              first_name: r.first_name.trim(),
              last_name: r.last_name.trim(),
              email: rEmail || null,
              phone_number: r.phone_number || null,
              country_code: r.country_code || null,
              connecteam_employee_id: rCtId || null,
              birthday: r.birthday || null,
              gender: r.gender || null,
              address: r.address || null,
              county: r.county || null,
              start_date: r.start_date || null,
              end_date: r.end_date || null,
              english_level: r.english_level || null,
              employee_role: r.employee_role || null,
              qualify: r.qualify || null,
              recommended_by: r.recommended_by || null,
              direct_manager: r.direct_manager || null,
              has_car: r.has_car || null,
              driver_licence: r.driver_licence || null,
              date_added: r.date_added || null,
              last_login: r.last_login || null,
              groups: r.groups || null,
              tags: r.tags || null,
              added_via: r.added_via || "connecteam_import",
              added_by: r.added_by || null,
              is_active: isActive,
            };
            const { data: created, error: createErr } = await supabase
              .from("employees")
              .insert(insertData)
              .select("id")
              .single();
            if (createErr) {
              resultEntry.error = createErr.message;
            } else {
              resultEntry.created_id = created.id;
              stats.created++;
            }
          } else if (action === "attach_membership") {
            // Person exists in another company — create new employee record for this company
            const insertData: any = {
              company_id,
              first_name: r.first_name.trim(),
              last_name: r.last_name.trim(),
              email: rEmail || null,
              phone_number: r.phone_number || null,
              country_code: r.country_code || null,
              connecteam_employee_id: rCtId || null,
              birthday: r.birthday || null,
              gender: r.gender || null,
              address: r.address || null,
              county: r.county || null,
              start_date: r.start_date || null,
              end_date: r.end_date || null,
              english_level: r.english_level || null,
              employee_role: r.employee_role || null,
              groups: r.groups || null,
              tags: r.tags || null,
              added_via: "connecteam_import",
              is_active: isActive,
              // Link to the same user_id if the original has one
              user_id: otherCompanyMatch?.user_id || null,
            };
            const { data: attached, error: attachErr } = await supabase
              .from("employees")
              .insert(insertData)
              .select("id")
              .single();
            if (attachErr) {
              resultEntry.error = attachErr.message;
            } else {
              resultEntry.created_id = attached.id;
              resultEntry.shared_with_company = otherCompanyMatch?.company_id;
              stats.attached++;
            }
          } else if (action === "update_existing" && targetId) {
            const updateData: any = {};
            if (rEmail && !sameCompanyMatch.email) updateData.email = rEmail;
            if (r.phone_number && !sameCompanyMatch.phone_number) updateData.phone_number = r.phone_number;
            if (rCtId && !sameCompanyMatch.connecteam_employee_id) updateData.connecteam_employee_id = rCtId;
            if (r.birthday && !sameCompanyMatch.birthday) updateData.birthday = r.birthday;
            if (r.address && !sameCompanyMatch.address) updateData.address = r.address;
            if (r.groups) updateData.groups = r.groups;
            if (r.tags) updateData.tags = r.tags;
            // Update is_active based on file type
            if (file_type === "active") updateData.is_active = true;
            else if (file_type === "archived") updateData.is_active = false;

            if (Object.keys(updateData).length > 0) {
              await supabase.from("employees").update(updateData).eq("id", targetId);
            }
            stats.updated++;
          } else if (action === "flag_review") {
            stats.flagged++;
          } else {
            stats.skipped++;
          }

          // Handle admin role assignment
          if (file_type === "admin" && r.access_level) {
            const empId = resultEntry.created_id || targetId;
            if (empId) {
              // Find the user_id for this employee
              const { data: empData } = await supabase
                .from("employees")
                .select("user_id")
                .eq("id", empId)
                .single();

              if (empData?.user_id) {
                const roleMap: Record<string, string> = {
                  "owner": "company_owner",
                  "admin": "admin",
                  "manager": "manager",
                  "user": "employee",
                };
                const companyRole = roleMap[r.access_level.toLowerCase()] || "admin";

                // Upsert company_users
                await supabase
                  .from("company_users")
                  .upsert({
                    user_id: empData.user_id,
                    company_id,
                    role: companyRole,
                  }, { onConflict: "user_id,company_id" });

                resultEntry.admin_role_assigned = companyRole;
                stats.admin_roles++;
              }
            }
          }
        } catch (e: any) {
          resultEntry.error = e.message;
        }
      } else {
        // Dry run — just count
        stats[action === "create_new" ? "created" : action === "attach_membership" ? "attached" : action === "update_existing" ? "updated" : action === "flag_review" ? "flagged" : "skipped"]++;
      }

      results.push(resultEntry);
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: !!dry_run,
      stats,
      details: results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: corsHeaders,
    });
  }
});
