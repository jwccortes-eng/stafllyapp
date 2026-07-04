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

// Phase 2C-C · Placeholder auto-tagging
// Mirror of src/lib/placeholder-name.ts (kept inline because Deno edge
// functions cannot import from the src/ tree). Keep both in sync.
const PLACEHOLDER_NAME_RE =
  /^\s*(system|user\s*pend(iente)?|unknown|temp(orary)?|placeholder|pending|pend)\b/i;

function isPlaceholderName(firstName: string, lastName: string): boolean {
  const full = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  if (!full) return false;
  return PLACEHOLDER_NAME_RE.test(full);
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

    // Fetch existing employees (extended for Phase 2C-C identity awareness).
    const { data: existingEmployees } = await supabase
      .from("employees")
      .select(
        "id, first_name, last_name, connecteam_employee_id, worker_type, identity_status, requires_identity_resolution, payroll_approval_blocked, original_placeholder_name",
      )
      .eq("company_id", companyId);

    const existingByConnecteamId = new Map<string, any>();
    const existingByName = new Map<string, any>();

    for (const emp of existingEmployees ?? []) {
      if (emp.connecteam_employee_id) {
        existingByConnecteamId.set(emp.connecteam_employee_id, emp);
      }
      existingByName.set(normalizeName(`${emp.first_name} ${emp.last_name}`), emp);
    }

    // Phase 2C-C · identity source label. Connecteam source is inferred from
    // the presence of any connecteam_employee_id in the incoming payload;
    // otherwise treated as a generic bulk import.
    const identitySource = rows.some(
      (r) => (r.connecteam_employee_id ?? "").trim().length > 0,
    )
      ? "connecteam"
      : "import";

    const toInsert: any[] = [];
    const toUpdatePending: {
      id: string;
      original_placeholder_name: string;
      identity_source: string;
    }[] = [];
    const verifiedPlaceholderWarnings: {
      employee_id: string;
      name: string;
      incoming_name: string;
    }[] = [];

    let skippedExisting = 0;
    let skippedNoName = 0;
    let taggedPlaceholder = 0;

    for (const row of rows) {
      const firstName = (row.first_name ?? "").trim();
      const lastName = (row.last_name ?? "").trim();

      if (!firstName && !lastName) {
        skippedNoName++;
        continue;
      }
      // Placeholder rows may legitimately arrive with only a first name
      // (e.g. "System 3"). Require at least first_name to persist safely.
      if (!firstName) {
        skippedNoName++;
        continue;
      }

      const incomingIsPlaceholder = isPlaceholderName(firstName, lastName);
      const connecteamId = (row.connecteam_employee_id ?? "").trim();
      const nameKey = normalizeName(`${firstName} ${lastName || ""}`);

      // Existing match (connecteam id first, then normalized name).
      const existing =
        (connecteamId && existingByConnecteamId.get(connecteamId)) ||
        existingByName.get(nameKey);

      if (existing) {
        skippedExisting++;
        if (incomingIsPlaceholder) {
          const existingIsVerified =
            existing.identity_status === "verified" ||
            (!existing.requires_identity_resolution &&
              (!existing.worker_type || existing.worker_type === "real_employee") &&
              !existing.payroll_approval_blocked);

          if (existingIsVerified) {
            // Never auto-downgrade a verified employee. Warn only.
            verifiedPlaceholderWarnings.push({
              employee_id: existing.id,
              name: `${existing.first_name ?? ""} ${existing.last_name ?? ""}`.trim(),
              incoming_name: `${firstName} ${lastName}`.trim(),
            });
          } else {
            // Existing pending/placeholder: refresh identity metadata only.
            toUpdatePending.push({
              id: existing.id,
              original_placeholder_name:
                existing.original_placeholder_name ||
                `${firstName} ${lastName}`.trim(),
              identity_source: identitySource,
            });
          }
        }
        continue;
      }

      // Prevent double-insert within same batch.
      if (connecteamId) existingByConnecteamId.set(connecteamId, { id: "__pending__" });
      existingByName.set(nameKey, { id: "__pending__" });

      const identityPatch = incomingIsPlaceholder
        ? {
            worker_type: "imported_placeholder",
            identity_status: "pending_identity",
            requires_identity_resolution: true,
            payroll_approval_blocked: true,
            portal_access_enabled: false,
            user_id: null,
            identity_source: identitySource,
            original_placeholder_name: `${firstName} ${lastName}`.trim(),
            added_via: row.added_via || identitySource,
          }
        : {};

      if (incomingIsPlaceholder) taggedPlaceholder++;

      toInsert.push({
        company_id: companyId,
        first_name: firstName,
        last_name: lastName || "",
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
        ...identityPatch,
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

    // Phase 2C-C · refresh existing pending/placeholder identity metadata.
    let refreshedPending = 0;
    for (const upd of toUpdatePending) {
      const { error: updErr } = await supabase
        .from("employees")
        .update({
          original_placeholder_name: upd.original_placeholder_name,
          identity_source: upd.identity_source,
          requires_identity_resolution: true,
        })
        .eq("id", upd.id)
        .eq("company_id", companyId);
      if (!updErr) refreshedPending++;
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
        taggedPlaceholder,
        refreshedPending,
        verifiedPlaceholderWarnings: verifiedPlaceholderWarnings.length,
        skippedExisting,
        skippedNoName,
        errors,
      },
    });

    return json({
      success: true,
      inserted,
      taggedPlaceholder,
      refreshedPending,
      verifiedPlaceholderWarnings,
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
