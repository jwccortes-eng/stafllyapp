import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CheckinPayload {
  action:
    | "lookup"
    | "lookup_phone"
    | "select_employee"
    | "update_self"
    | "create_visit"
    | "update_visit"
    | "submit_rating"
    | "create_inquiry"
    | "list_payments";
  phone?: string;
  pin?: string;
  category?: string;
  message?: string;
  inquiry_kind?: "request" | "comment";
  employee_id?: string;
  visit_id?: string;
  visit_type?: string;
  visit_detail?: string;
  status?: string;
  pending_items?: any[];
  updates_made?: any[];
  rating?: "excellent" | "good" | "regular" | "bad";
  rating_score?: number;
  rating_comment?: string;
  language?: string;
  device_id?: string;
  attended_by?: string;
  attendant_name?: string;
  // Self-update payload
  updates?: {
    phone_number?: string;
    email?: string;
    address?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
  };
}

const RATING_TO_SCORE: Record<string, number> = {
  excellent: 5,
  good: 4,
  regular: 2,
  bad: 1,
};

// Whitelist of fields the employee can edit themselves from the kiosk.
const SELF_EDITABLE_FIELDS = [
  "phone_number",
  "email",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;

const EMPLOYEE_SELECT =
  "id, first_name, last_name, phone_number, is_active, user_id, company_id, avatar_url, email, address, employee_role, emergency_contact_name, emergency_contact_phone";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json()) as CheckinPayload;
    const { action } = body;

    // ============= LOOKUP BY PHONE (returns one or many matches) =============
    if (action === "lookup_phone" || action === "lookup") {
      const { phone } = body;
      if (!phone) return jsonResp({ error: "Ingresa tu número de teléfono" }, 400);
      const cleanPhone = phone.replace(/[^\d+]/g, "").slice(0, 20);

      // Soft rate limit (prevents enumeration spam)
      const { data: rateData } = await adminClient
        .from("auth_rate_limits")
        .select("*")
        .eq("phone_number", cleanPhone)
        .maybeSingle();

      if (rateData?.locked_until && new Date(rateData.locked_until) > new Date()) {
        const minutesLeft = Math.ceil(
          (new Date(rateData.locked_until).getTime() - Date.now()) / 60000
        );
        return jsonResp({ error: `Demasiados intentos. Intenta en ${minutesLeft} min.` }, 429);
      }

      // Find ALL active employees for this phone (multi-tenant safe).
      const { data: employees } = await adminClient
        .from("employees")
        .select(EMPLOYEE_SELECT)
        .eq("phone_number", cleanPhone)
        .eq("is_active", true);

      if (!employees || employees.length === 0) {
        await recordFailed(adminClient, cleanPhone);
        return jsonResp(
          { error: "No encontramos un perfil con ese número. Pide ayuda al equipo." },
          404,
        );
      }

      await adminClient.from("auth_rate_limits").delete().eq("phone_number", cleanPhone);

      // Enrich with company name for the picker.
      const companyIds = [...new Set(employees.map((e: any) => e.company_id).filter(Boolean))];
      const { data: companies } = await adminClient
        .from("companies")
        .select("id, name")
        .in("id", companyIds);
      const companyMap = new Map((companies ?? []).map((c: any) => [c.id, c.name]));
      const enriched = employees.map((e: any) => ({
        ...e,
        company_name: companyMap.get(e.company_id) ?? null,
      }));

      // Single match → return employee + summary directly.
      if (enriched.length === 1) {
        const summary = await buildEmployeeSummary(adminClient, enriched[0]);
        return jsonResp({ success: true, employee: enriched[0], summary, matches: enriched });
      }

      // Multiple matches → frontend shows a profile picker.
      return jsonResp({ success: true, multiple: true, matches: enriched });
    }

    // ============= SELECT EMPLOYEE (after picker on multi-match) =============
    if (action === "select_employee") {
      const { employee_id } = body;
      if (!employee_id) return jsonResp({ error: "employee_id requerido" }, 400);

      const { data: employee } = await adminClient
        .from("employees")
        .select(EMPLOYEE_SELECT)
        .eq("id", employee_id)
        .maybeSingle();

      if (!employee) return jsonResp({ error: "Empleado no encontrado" }, 404);
      if (!employee.is_active) {
        return jsonResp({ error: "Tu cuenta está inactiva. Contacta al administrador." }, 403);
      }

      const { data: company } = await adminClient
        .from("companies")
        .select("name")
        .eq("id", employee.company_id)
        .maybeSingle();

      const enriched = { ...employee, company_name: company?.name ?? null };
      const summary = await buildEmployeeSummary(adminClient, enriched);
      return jsonResp({ success: true, employee: enriched, summary });
    }

    // ============= UPDATE SELF (employee edits allowed fields directly) =============
    if (action === "update_self") {
      const { employee_id, updates, language, device_id } = body;
      if (!employee_id || !updates) {
        return jsonResp({ error: "employee_id y updates requeridos" }, 400);
      }

      // Validate + whitelist fields.
      const sanitized: Record<string, string | null> = {};
      const changed: Array<{ field: string; old: string | null; new: string | null }> = [];

      const { data: current } = await adminClient
        .from("employees")
        .select(EMPLOYEE_SELECT)
        .eq("id", employee_id)
        .maybeSingle();
      if (!current) return jsonResp({ error: "Empleado no encontrado" }, 404);

      for (const field of SELF_EDITABLE_FIELDS) {
        if (!(field in updates)) continue;
        const raw = (updates as any)[field];
        let value: string | null = raw == null || raw === "" ? null : String(raw).trim();

        // Per-field validation
        if (value !== null) {
          if (field === "phone_number") {
            value = value.replace(/[^\d+]/g, "").slice(0, 20);
            if (value.length < 7) {
              return jsonResp({ error: "Teléfono inválido" }, 400);
            }
          } else if (field === "email") {
            value = value.toLowerCase().slice(0, 255);
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              return jsonResp({ error: "Correo electrónico inválido" }, 400);
            }
          } else if (field === "emergency_contact_phone") {
            value = value.replace(/[^\d+]/g, "").slice(0, 20);
          } else {
            value = value.slice(0, 500);
          }
        }

        const old = (current as any)[field] ?? null;
        if ((old ?? null) !== (value ?? null)) {
          sanitized[field] = value;
          changed.push({ field, old, new: value });
        }
      }

      if (changed.length === 0) {
        return jsonResp({ success: true, changed: [], employee: current });
      }

      const { data: updated, error: updErr } = await adminClient
        .from("employees")
        .update(sanitized)
        .eq("id", employee_id)
        .select(EMPLOYEE_SELECT)
        .single();

      if (updErr) return jsonResp({ error: updErr.message }, 500);

      // Audit trail: log a closed visit summarising the self-update.
      // device_id column is UUID — only forward valid UUIDs, drop free-text labels.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const safeDeviceId =
        typeof device_id === "string" && UUID_RE.test(device_id) ? device_id : null;

      const { error: auditErr } = await adminClient.from("office_visits").insert({
        employee_id,
        company_id: current.company_id,
        visit_type: "update_data",
        visit_detail: `Self-update from kiosk: ${changed.map((c) => c.field).join(", ")}`,
        updates_made: changed,
        status: "resolved",
        channel: "front_desk_kiosk",
        language: language || "es",
        device_id: safeDeviceId,
        checked_out_at: new Date().toISOString(),
      });
      if (auditErr) console.error("update_self audit insert failed", auditErr);

      const { data: company } = await adminClient
        .from("companies")
        .select("name")
        .eq("id", updated.company_id)
        .maybeSingle();

      const enriched = { ...updated, company_name: company?.name ?? null };
      const summary = await buildEmployeeSummary(adminClient, enriched);
      return jsonResp({ success: true, changed, employee: enriched, summary });
    }

    // ============= CREATE INQUIRY (request or comment) =============
    if (action === "create_inquiry") {
      const { phone, category, message, inquiry_kind, language, employee_id } = body;
      if (!message) return jsonResp({ error: "Mensaje requerido" }, 400);

      let employee: any = null;

      // Prefer explicit employee_id (multi-tenant safe), fall back to phone lookup.
      if (employee_id) {
        const { data } = await adminClient
          .from("employees")
          .select("id, company_id")
          .eq("id", employee_id)
          .maybeSingle();
        employee = data;
      } else if (phone) {
        const cleanPhone = phone.replace(/[^\d+]/g, "").slice(0, 20);
        const { data } = await adminClient
          .from("employees")
          .select("id, company_id")
          .eq("phone_number", cleanPhone)
          .maybeSingle();
        employee = data;
      }

      if (!employee) return jsonResp({ error: "Empleado no encontrado" }, 404);

      const safeCategory = (category || "other").toString().slice(0, 50);
      const safeMessage = message.toString().slice(0, 2000);
      const kind = inquiry_kind === "comment" ? "comment" : "request";
      const visitType = kind === "comment" ? "general_inquiry" : "other";
      const detail = `[${kind.toUpperCase()} · ${safeCategory}]\n${safeMessage}`;

      const { data: visit, error: insertErr } = await adminClient
        .from("office_visits")
        .insert({
          employee_id: employee.id,
          company_id: employee.company_id,
          visit_type: visitType,
          visit_detail: detail,
          status: "pending_followup",
          channel: "front_desk_kiosk",
          language: language || "es",
        })
        .select("id")
        .single();

      if (insertErr) return jsonResp({ error: insertErr.message }, 500);
      return jsonResp({ success: true, visit_id: visit.id });
    }

    // ============= LIST PAYMENTS =============
    if (action === "list_payments") {
      const { phone, employee_id } = body;
      let empId: string | null = employee_id ?? null;

      if (!empId && phone) {
        const cleanPhone = phone.replace(/[^\d+]/g, "").slice(0, 20);
        const { data: emp } = await adminClient
          .from("employees")
          .select("id")
          .eq("phone_number", cleanPhone)
          .maybeSingle();
        empId = emp?.id ?? null;
      }
      if (!empId) return jsonResp({ payments: [] });

      const { data: rows } = await adminClient
        .from("normalized_payroll_rows")
        .select("work_date, total_pay, total_hours, pay_type")
        .eq("matched_employee_id", empId)
        .order("work_date", { ascending: false })
        .limit(10);

      return jsonResp({ payments: rows || [] });
    }

    // ============= CREATE VISIT (legacy) =============
    if (action === "create_visit") {
      const { employee_id, visit_type, visit_detail, pending_items, language, device_id, attended_by, attendant_name } = body;
      if (!employee_id || !visit_type) {
        return jsonResp({ error: "employee_id y visit_type son requeridos" }, 400);
      }

      const { data: emp } = await adminClient
        .from("employees")
        .select("company_id")
        .eq("id", employee_id)
        .maybeSingle();

      if (!emp) return jsonResp({ error: "Empleado no encontrado" }, 404);

      const { data: visit, error: insertErr } = await adminClient
        .from("office_visits")
        .insert({
          employee_id,
          company_id: emp.company_id,
          visit_type,
          visit_detail: visit_detail || null,
          pending_items: pending_items || [],
          pending_count: (pending_items || []).length,
          language: language || "es",
          device_id: device_id || null,
          attended_by: attended_by || null,
          attendant_name: attendant_name || null,
          status: "in_progress",
        })
        .select("id")
        .single();

      if (insertErr) return jsonResp({ error: insertErr.message }, 500);
      return jsonResp({ success: true, visit_id: visit.id });
    }

    // ============= UPDATE VISIT (legacy) =============
    if (action === "update_visit") {
      const { visit_id, status, updates_made, visit_detail } = body;
      if (!visit_id) return jsonResp({ error: "visit_id requerido" }, 400);

      const update: Record<string, any> = {};
      if (status) update.status = status;
      if (updates_made) update.updates_made = updates_made;
      if (visit_detail !== undefined) update.visit_detail = visit_detail;

      const { error: updErr } = await adminClient
        .from("office_visits")
        .update(update)
        .eq("id", visit_id);

      if (updErr) return jsonResp({ error: updErr.message }, 500);
      return jsonResp({ success: true });
    }

    // ============= SUBMIT RATING + CHECKOUT (legacy) =============
    if (action === "submit_rating") {
      const { visit_id, rating, rating_comment, status } = body;
      if (!visit_id) return jsonResp({ error: "visit_id requerido" }, 400);

      const now = new Date().toISOString();
      const { data: existing } = await adminClient
        .from("office_visits")
        .select("checked_in_at")
        .eq("id", visit_id)
        .maybeSingle();

      const duration = existing?.checked_in_at
        ? Math.round((Date.now() - new Date(existing.checked_in_at).getTime()) / 1000)
        : null;

      const update: Record<string, any> = {
        checked_out_at: now,
        duration_seconds: duration,
      };
      if (rating) {
        update.rating = rating;
        update.rating_score = RATING_TO_SCORE[rating] ?? null;
        update.rating_submitted_at = now;
      }
      if (rating_comment !== undefined) update.rating_comment = rating_comment;
      if (status) update.status = status;
      else update.status = "resolved";

      const { error: updErr } = await adminClient
        .from("office_visits")
        .update(update)
        .eq("id", visit_id);

      if (updErr) return jsonResp({ error: updErr.message }, 500);
      return jsonResp({ success: true, duration_seconds: duration });
    }

    return jsonResp({ error: "Acción inválida" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("front-desk-checkin error:", message);
    return jsonResp({ error: message }, 500);
  }
});

function jsonResp(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function recordFailed(adminClient: any, phone: string) {
  const { data: existing } = await adminClient
    .from("auth_rate_limits")
    .select("id, failed_attempts")
    .eq("phone_number", phone)
    .maybeSingle();

  const newAttempts = (existing?.failed_attempts ?? 0) + 1;
  let lockedUntil: string | null = null;
  if (newAttempts >= 10) lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  else if (newAttempts >= 5) lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  if (existing) {
    await adminClient
      .from("auth_rate_limits")
      .update({ failed_attempts: newAttempts, locked_until: lockedUntil, last_attempt_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await adminClient
      .from("auth_rate_limits")
      .insert({ phone_number: phone, failed_attempts: newAttempts, locked_until: lockedUntil, last_attempt_at: new Date().toISOString() });
  }
}

async function buildEmployeeSummary(adminClient: any, employee: any) {
  const pending: Array<{ key: string; label: string; severity: "high" | "medium" | "low" }> = [];

  if (!employee.avatar_url) {
    pending.push({ key: "missing_photo", label: "Falta foto de perfil", severity: "medium" });
  }
  if (!employee.email) {
    pending.push({ key: "missing_email", label: "Falta correo electrónico", severity: "medium" });
  }
  if (!employee.address) {
    pending.push({ key: "missing_address", label: "Falta dirección", severity: "low" });
  }
  if (!employee.emergency_contact_name || !employee.emergency_contact_phone) {
    pending.push({ key: "missing_emergency", label: "Falta contacto de emergencia", severity: "high" });
  }

  let portalStatus: "active" | "pending" | "none" = "none";
  if (employee.user_id) {
    portalStatus = "active";
  } else {
    const { data: invite } = await adminClient
      .from("employee_invitations")
      .select("status")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invite) {
      portalStatus = "pending";
      if (["failed", "bounced", "expired"].includes(invite.status)) {
        pending.push({ key: "invitation_failed", label: "Invitación al portal falló", severity: "high" });
      }
    } else {
      pending.push({ key: "no_portal", label: "Portal no activado", severity: "high" });
    }
  }

  let docsStatus: "complete" | "incomplete" | "rejected" | "pending_review" = "complete";
  let docsCount = { approved: 0, pending: 0, rejected: 0, missing: 0 };
  try {
    const { data: docs } = await adminClient
      .from("employee_documents")
      .select("review_status, status")
      .eq("employee_id", employee.id);
    if (docs) {
      docs.forEach((d: any) => {
        const st = d.review_status || d.status || "pending";
        if (st === "approved") docsCount.approved++;
        else if (st === "rejected") {
          docsCount.rejected++;
          docsStatus = "rejected";
        } else {
          docsCount.pending++;
          if (docsStatus === "complete") docsStatus = "pending_review";
        }
      });
    }
    if (docsCount.rejected > 0) {
      pending.push({ key: "rejected_docs", label: `${docsCount.rejected} documento(s) rechazado(s)`, severity: "high" });
    }
    if (docsCount.pending > 0 && docsCount.rejected === 0) {
      pending.push({ key: "pending_docs", label: `${docsCount.pending} documento(s) en revisión`, severity: "low" });
    }
  } catch {
    // Optional table
  }

  const { data: lastVisit } = await adminClient
    .from("office_visits")
    .select("checked_in_at, visit_type")
    .eq("employee_id", employee.id)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const profileFields = [
    employee.first_name,
    employee.last_name,
    employee.phone_number,
    employee.email,
    employee.address,
    employee.avatar_url,
    employee.emergency_contact_name,
  ];
  const filled = profileFields.filter(Boolean).length;
  const profileCompleteness = Math.round((filled / profileFields.length) * 100);

  return {
    portal_status: portalStatus,
    profile_completeness: profileCompleteness,
    profile_status: profileCompleteness === 100 ? "complete" : "incomplete",
    documents_status: docsStatus,
    documents_count: docsCount,
    pending_items: pending,
    pending_total: pending.length,
    last_visit_at: lastVisit?.checked_in_at ?? null,
    last_visit_type: lastVisit?.visit_type ?? null,
  };
}
