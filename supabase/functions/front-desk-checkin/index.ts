import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CheckinPayload {
  action: "lookup" | "lookup_phone" | "create_visit" | "update_visit" | "submit_rating" | "create_inquiry" | "list_payments";
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
}

const RATING_TO_SCORE: Record<string, number> = {
  excellent: 5,
  good: 4,
  regular: 2,
  bad: 1,
};

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

    // ============= LOOKUP =============
    if (action === "lookup") {
      const { phone, pin } = body;
      if (!phone || !pin) {
        return jsonResp({ error: "Teléfono y PIN son requeridos" }, 400);
      }
      const cleanPhone = phone.replace(/[^\d+]/g, "").slice(0, 20);

      // Rate limit reuse
      const { data: rateData } = await adminClient
        .from("auth_rate_limits")
        .select("*")
        .eq("phone_number", cleanPhone)
        .maybeSingle();

      if (rateData?.locked_until && new Date(rateData.locked_until) > new Date()) {
        const minutesLeft = Math.ceil(
          (new Date(rateData.locked_until).getTime() - Date.now()) / 60000
        );
        return jsonResp({ error: `Cuenta bloqueada. Intenta en ${minutesLeft} min.` }, 429);
      }

      const { data: employee } = await adminClient
        .from("employees")
        .select(
          "id, first_name, last_name, phone_number, access_pin, is_active, user_id, company_id, avatar_url, email, address, employee_role, emergency_contact_name, emergency_contact_phone"
        )
        .eq("phone_number", cleanPhone)
        .maybeSingle();

      if (!employee || employee.access_pin !== pin) {
        await recordFailed(adminClient, cleanPhone);
        return jsonResp({ error: "Credenciales inválidas" }, 401);
      }
      if (!employee.is_active) {
        return jsonResp({ error: "Tu cuenta está inactiva. Contacta al administrador." }, 403);
      }

      // Reset
      await adminClient.from("auth_rate_limits").delete().eq("phone_number", cleanPhone);

      // Build readiness summary
      const summary = await buildEmployeeSummary(adminClient, employee);

      return jsonResp({ success: true, employee, summary });
    }

    // ============= CREATE VISIT =============
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

    // ============= UPDATE VISIT =============
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

    // ============= SUBMIT RATING + CHECKOUT =============
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

  // Photo
  if (!employee.avatar_url) {
    pending.push({ key: "missing_photo", label: "Falta foto de perfil", severity: "medium" });
  }
  // Email
  if (!employee.email) {
    pending.push({ key: "missing_email", label: "Falta correo electrónico", severity: "medium" });
  }
  // Address
  if (!employee.address) {
    pending.push({ key: "missing_address", label: "Falta dirección", severity: "low" });
  }
  // Emergency contact
  if (!employee.emergency_contact_name || !employee.emergency_contact_phone) {
    pending.push({ key: "missing_emergency", label: "Falta contacto de emergencia", severity: "high" });
  }

  // Portal status
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

  // Documents (employee_documents)
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
    // Table may not exist for older companies
  }

  // Last office visit
  const { data: lastVisit } = await adminClient
    .from("office_visits")
    .select("checked_in_at, visit_type")
    .eq("employee_id", employee.id)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Profile completeness score
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
