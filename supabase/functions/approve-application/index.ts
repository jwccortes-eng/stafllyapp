import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ResultCode =
  | "ok"
  | "unauthorized"
  | "missing_input"
  | "application_not_found"
  | "already_approved"
  | "employee_create_failed"
  | "employee_update_failed"
  | "application_update_failed"
  | "rls_denied"
  | "missing_phone"
  | "missing_email"
  | "whatsapp_not_configured"
  | "invite_log_failed"
  | "unknown_error";

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Always return 200 so the supabase-js client surfaces our structured payload
// (any non-2xx becomes "Edge Function returned a non-2xx status code").
function structured(body: { success: boolean; code: ResultCode; message: string; [k: string]: unknown }) {
  return jsonResponse(200, body);
}

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
}

function isLikelyEmail(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw).trim());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  let step = "init";

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return structured({ success: false, code: "unauthorized", message: "Falta token de autenticación.", request_id: requestId });
    }

    step = "init_clients";
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    step = "auth_get_user";
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return structured({
        success: false,
        code: "unauthorized",
        message: "Sesión inválida o expirada.",
        details: userErr?.message,
        request_id: requestId,
      });
    }
    const caller = userData.user;

    step = "parse_body";
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return structured({ success: false, code: "missing_input", message: "Body inválido.", request_id: requestId });
    }

    const {
      application_id,
      role = "employee",
      portal_enabled = true,
      pin_enabled = true,
      send_invite = false,
      invite_channel = "whatsapp",
      initial_status = "active",
      link_existing_employee_id = null,
      admin_notes = null,
    } = body ?? {};

    if (!application_id) {
      return structured({ success: false, code: "missing_input", message: "Falta application_id.", request_id: requestId });
    }

    step = "fetch_application";
    const { data: app, error: appErr } = await supabaseAdmin
      .from("job_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      return structured({
        success: false,
        code: "application_not_found",
        message: "No se encontró la solicitud.",
        details: appErr?.message,
        request_id: requestId,
      });
    }

    if (app.status === "approved") {
      return structured({
        success: false,
        code: "already_approved",
        message: "Esta solicitud ya fue aprobada.",
        employee_id: app.approved_employee_id ?? null,
        request_id: requestId,
      });
    }

    const companyId = app.company_id;
    const phone = normalizePhone(app.phone);
    const email = app.email ? String(app.email).toLowerCase().trim() : null;
    const events: string[] = [];
    let employeeId: string | null = null;
    let linkedExisting = false;
    let createdNew = false;

    // Pre-flight invite validation — never block approval, just downgrade send_invite
    let effectiveSendInvite = !!send_invite;
    let inviteSkippedReason: ResultCode | null = null;
    if (effectiveSendInvite) {
      if (invite_channel === "whatsapp" || invite_channel === "sms") {
        if (!phone || phone.length < 10) {
          effectiveSendInvite = false;
          inviteSkippedReason = "missing_phone";
        }
      } else if (invite_channel === "email") {
        if (!isLikelyEmail(email)) {
          effectiveSendInvite = false;
          inviteSkippedReason = "missing_email";
        }
      }
    }

    step = "log_started";
    await supabaseAdmin.from("application_events").insert({
      application_id,
      event_type: "approval_started",
      event_data: { role, portal_enabled, pin_enabled, send_invite, effective_send_invite: effectiveSendInvite, invite_channel, initial_status, request_id: requestId },
      created_by: caller.id,
    });

    // --- Identity resolution ---
    step = "identity_resolution";
    if (link_existing_employee_id) {
      const { data: existingEmp } = await supabaseAdmin
        .from("employees")
        .select("id, user_id, is_active")
        .eq("id", link_existing_employee_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (existingEmp) {
        employeeId = existingEmp.id;
        linkedExisting = true;
        events.push("linked_existing_employee");
      }
    }

    if (!employeeId && phone) {
      const { data: phoneMatch } = await supabaseAdmin
        .from("employees")
        .select("id, user_id, is_active")
        .eq("company_id", companyId)
        .eq("phone_number", phone)
        .limit(1)
        .maybeSingle();
      if (phoneMatch) {
        employeeId = phoneMatch.id;
        linkedExisting = true;
        events.push("linked_by_phone");
      }
    }

    if (!employeeId && email) {
      const { data: emailMatch } = await supabaseAdmin
        .from("employees")
        .select("id, user_id, is_active")
        .eq("company_id", companyId)
        .eq("email", email)
        .limit(1)
        .maybeSingle();
      if (emailMatch) {
        employeeId = emailMatch.id;
        linkedExisting = true;
        events.push("linked_by_email");
      }
    }

    // --- Create or update employee ---
    if (!employeeId) {
      step = "create_employee";
      const accessPin = phone.length >= 4 ? phone.slice(-4) : null;

      const { data: newEmp, error: createErr } = await supabaseAdmin
        .from("employees")
        .insert({
          company_id: companyId,
          first_name: app.first_name,
          last_name: app.last_name,
          phone_number: phone || null,
          email: email,
          employee_role: role === "supervisor" ? "Supervisor" : app.worker_type || "employee",
          is_active: initial_status === "active",
          access_pin: pin_enabled ? accessPin : null,
          portal_access_enabled: portal_enabled,
          has_car: app.has_car ? "Sí" : "No",
          county: app.city || null,
          added_via: "application",
        })
        .select("id")
        .single();

      if (createErr || !newEmp) {
        await supabaseAdmin.from("application_events").insert({
          application_id,
          event_type: "approval_failed",
          event_data: { step, error: createErr?.message, request_id: requestId },
          created_by: caller.id,
        });
        const isRls = (createErr?.message || "").toLowerCase().includes("row-level security");
        return structured({
          success: false,
          code: isRls ? "rls_denied" : "employee_create_failed",
          message: isRls ? "No tienes permisos para crear empleados en esta empresa." : "No se pudo crear el empleado.",
          details: createErr?.message,
          step,
          request_id: requestId,
        });
      }

      employeeId = newEmp.id;
      createdNew = true;
      events.push("created_new_employee");
    } else {
      step = "update_employee";
      const updateFields: Record<string, any> = {
        is_active: initial_status === "active",
        portal_access_enabled: portal_enabled,
      };
      if (role === "supervisor") updateFields.employee_role = "Supervisor";

      // P0 AUTH PIN CANONICALIZATION: la aprobación no escribe PIN en la ficha.
      // El PIN se crea una sola vez sobre la credencial del Auth User durante
      // la activación del portal.

      const { error: updErr } = await supabaseAdmin
        .from("employees")
        .update(updateFields)
        .eq("id", employeeId);

      if (updErr) {
        await supabaseAdmin.from("application_events").insert({
          application_id,
          event_type: "approval_failed",
          event_data: { step, error: updErr.message, request_id: requestId },
          created_by: caller.id,
        });
        return structured({
          success: false,
          code: "employee_update_failed",
          message: "No se pudo actualizar el empleado existente.",
          details: updErr.message,
          step,
          request_id: requestId,
        });
      }
      events.push("updated_existing_employee");
    }

    // --- Role assignment if user_id exists ---
    step = "company_membership";
    const { data: empData } = await supabaseAdmin
      .from("employees")
      .select("user_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (empData?.user_id) {
      const companyRole = role === "supervisor" ? "supervisor" : "employee";
      const { data: existingCU } = await supabaseAdmin
        .from("company_users")
        .select("id")
        .eq("user_id", empData.user_id)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!existingCU) {
        await supabaseAdmin.from("company_users").insert({
          user_id: empData.user_id,
          company_id: companyId,
          role: companyRole,
        });
        events.push("created_company_membership");
      }
    }

    // --- Invitation: log only, do NOT call any external WhatsApp provider ---
    // We do not have an automatic WhatsApp provider here. The frontend will
    // open wa.me / mailto with the invite_token as a manual fallback.
    step = "invitation";
    let inviteLogged = false;
    let inviteToken: string | null = null;
    let inviteError: string | null = null;

    if (effectiveSendInvite && employeeId) {
      try {
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const { error: invErr } = await supabaseAdmin
          .from("employee_invitations")
          .insert({
            company_id: companyId,
            employee_id: employeeId,
            channel: invite_channel,
            status: "sent",
            sent_by: caller.id,
            sent_at: new Date().toISOString(),
            invite_token: token,
            expires_at: expiresAt,
            notes: `Auto-invite from application approval (${app.reference_code ?? application_id.slice(0, 8)})`,
          });

        if (invErr) {
          inviteError = invErr.message;
          events.push("invite_log_failed");
        } else {
          inviteLogged = true;
          inviteToken = token;
          events.push("invite_logged");
        }
      } catch (e) {
        inviteError = String(e);
        events.push("invite_log_failed");
      }
    }

    // --- Mark application approved ---
    step = "mark_approved";
    const approvalPayload = {
      role,
      portal_enabled,
      pin_enabled,
      send_invite,
      effective_send_invite: effectiveSendInvite,
      invite_skipped_reason: inviteSkippedReason,
      invite_channel,
      initial_status,
      linked_existing: linkedExisting,
      created_new: createdNew,
      invite_logged: inviteLogged,
      invite_error: inviteError,
      request_id: requestId,
    };

    const { error: appUpdErr } = await supabaseAdmin
      .from("job_applications")
      .update({
        status: "approved",
        reviewed_by: caller.id,
        reviewed_at: new Date().toISOString(),
        approved_employee_id: employeeId,
        linked_user_id: empData?.user_id || app.linked_user_id,
        approval_payload: approvalPayload,
        admin_notes: admin_notes || app.admin_notes,
      })
      .eq("id", application_id);

    if (appUpdErr) {
      // Employee created but application not flagged — still report partial success
      await supabaseAdmin.from("application_events").insert({
        application_id,
        event_type: "approval_partial",
        event_data: { step, error: appUpdErr.message, employee_id: employeeId, request_id: requestId },
        created_by: caller.id,
      });
      return structured({
        success: false,
        code: "application_update_failed",
        message: "Empleado creado, pero no se pudo marcar la solicitud como aprobada.",
        details: appUpdErr.message,
        employee_id: employeeId,
        step,
        request_id: requestId,
      });
    }

    // --- Audit trail ---
    step = "audit";
    const eventEntries = events.map((event_type) => ({
      application_id,
      event_type,
      event_data: { employee_id: employeeId, ...approvalPayload },
      created_by: caller.id,
    }));
    eventEntries.push({
      application_id,
      event_type: "approval_completed",
      event_data: { employee_id: employeeId, ...approvalPayload },
      created_by: caller.id,
    });
    await supabaseAdmin.from("application_events").insert(eventEntries);

    await supabaseAdmin.from("activity_log").insert({
      user_id: caller.id,
      company_id: companyId,
      action: "approve",
      entity_type: "job_application",
      entity_id: application_id,
      details: { employee_id: employeeId, ...approvalPayload },
    });

    return structured({
      success: true,
      code: "ok",
      message: createdNew ? "Empleado creado y solicitud aprobada." : "Solicitud aprobada y vinculada al empleado existente.",
      employee_id: employeeId,
      linked_existing: linkedExisting,
      created_new: createdNew,
      invite_requested: !!send_invite,
      invite_logged: inviteLogged,
      invite_skipped_reason: inviteSkippedReason,
      invite_error: inviteError,
      invite_token: inviteToken,
      portal_enabled,
      pin_enabled,
      request_id: requestId,
    });
  } catch (err) {
    return structured({
      success: false,
      code: "unknown_error",
      message: "Error inesperado al aprobar la solicitud.",
      details: String(err),
      step,
      request_id: requestId,
    });
  }
});
