import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin client for transactional operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create user client to verify caller
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user: caller },
    } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      application_id,
      role = "employee",
      portal_enabled = true,
      pin_enabled = true,
      send_invite = false,
      invite_channel = "whatsapp",
      initial_status = "active",
      link_existing_employee_id = null,
    } = body;

    if (!application_id) {
      return new Response(JSON.stringify({ error: "application_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch application
    const { data: app, error: appErr } = await supabaseAdmin
      .from("job_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (app.status === "approved") {
      return new Response(
        JSON.stringify({ error: "Application already approved", employee_id: app.approved_employee_id }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = app.company_id;
    const phone = app.phone?.replace(/\D/g, "") || "";
    const email = app.email?.toLowerCase().trim() || null;
    const events: string[] = [];
    let employeeId: string | null = null;
    let linkedExisting = false;
    let createdNew = false;
    let inviteSent = false;

    // Log start event
    await supabaseAdmin.from("application_events").insert({
      application_id,
      event_type: "approval_started",
      event_data: { role, portal_enabled, pin_enabled, send_invite, initial_status },
      created_by: caller.id,
    });
    events.push("approval_started");

    // 2. Identity resolution — find existing employee in this company
    if (link_existing_employee_id) {
      // Admin explicitly chose to link
      const { data: existingEmp } = await supabaseAdmin
        .from("employees")
        .select("id, user_id, is_active")
        .eq("id", link_existing_employee_id)
        .eq("company_id", companyId)
        .single();

      if (existingEmp) {
        employeeId = existingEmp.id;
        linkedExisting = true;
        events.push("linked_existing_employee");
      }
    }

    if (!employeeId && phone) {
      // Try match by phone in same company
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
      // Try match by email in same company
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

    // 3. If no existing employee, create one
    if (!employeeId) {
      // Generate PIN from last 4 digits of phone
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

      if (createErr) {
        // Rollback: log failure
        await supabaseAdmin.from("application_events").insert({
          application_id,
          event_type: "approval_failed",
          event_data: { error: createErr.message },
          created_by: caller.id,
        });
        return new Response(
          JSON.stringify({ error: "Failed to create employee", detail: createErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      employeeId = newEmp.id;
      createdNew = true;
      events.push("created_new_employee");
    } else {
      // Update existing employee with approval data
      const updateFields: Record<string, any> = {
        is_active: initial_status === "active",
        portal_access_enabled: portal_enabled,
        employee_role: role === "supervisor" ? "Supervisor" : undefined,
      };

      if (pin_enabled) {
        // Only set PIN if not already set
        const { data: empCheck } = await supabaseAdmin
          .from("employees")
          .select("access_pin")
          .eq("id", employeeId)
          .single();

        if (!empCheck?.access_pin && phone.length >= 4) {
          updateFields.access_pin = phone.slice(-4);
        }
      }

      // Remove undefined fields
      Object.keys(updateFields).forEach((k) => {
        if (updateFields[k] === undefined) delete updateFields[k];
      });

      if (Object.keys(updateFields).length > 0) {
        await supabaseAdmin.from("employees").update(updateFields).eq("id", employeeId);
      }
      events.push("updated_existing_employee");
    }

    // 4. Role assignment — ensure company_users entry exists if there's a user_id
    const { data: empData } = await supabaseAdmin
      .from("employees")
      .select("user_id")
      .eq("id", employeeId)
      .single();

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

    // 5. Invitation flow
    if (send_invite && employeeId) {
      await supabaseAdmin.from("employee_invitations").insert({
        company_id: companyId,
        employee_id: employeeId,
        channel: invite_channel,
        status: "sent",
        sent_by: caller.id,
        sent_at: new Date().toISOString(),
        notes: `Auto-invite from application approval (${app.reference_code})`,
      });
      inviteSent = true;
      events.push("invite_sent");
    }

    // 6. Update application record
    const approvalPayload = {
      role,
      portal_enabled,
      pin_enabled,
      send_invite,
      invite_channel,
      initial_status,
      linked_existing: linkedExisting,
      created_new: createdNew,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("job_applications")
      .update({
        status: "approved",
        reviewed_by: caller.id,
        reviewed_at: new Date().toISOString(),
        approved_employee_id: employeeId,
        linked_user_id: empData?.user_id || app.linked_user_id,
        approval_payload: approvalPayload,
        admin_notes: body.admin_notes || app.admin_notes,
      })
      .eq("id", application_id);

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: "Failed to update application", detail: updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Audit trail
    const eventEntries = events
      .filter((e) => e !== "approval_started")
      .map((event_type) => ({
        application_id,
        event_type,
        event_data: { employee_id: employeeId, ...approvalPayload },
        created_by: caller.id,
      }));

    eventEntries.push({
      application_id,
      event_type: "approval_completed",
      event_data: {
        employee_id: employeeId,
        linked_existing: linkedExisting,
        created_new: createdNew,
        invite_sent: inviteSent,
        portal_enabled,
        pin_enabled,
        final_access_state: portal_enabled
          ? inviteSent
            ? "invited_pending"
            : "no_portal"
          : pin_enabled
          ? "pin_only"
          : "no_portal",
      },
      created_by: caller.id,
    });

    await supabaseAdmin.from("application_events").insert(eventEntries);

    // Activity log
    await supabaseAdmin.from("activity_log").insert({
      user_id: caller.id,
      company_id: companyId,
      action: "approve",
      entity_type: "job_application",
      entity_id: application_id,
      details: { employee_id: employeeId, ...approvalPayload },
    });

    return new Response(
      JSON.stringify({
        success: true,
        employee_id: employeeId,
        linked_existing: linkedExisting,
        created_new: createdNew,
        invite_sent: inviteSent,
        portal_enabled,
        pin_enabled,
        final_access_state: portal_enabled
          ? inviteSent
            ? "invited_pending"
            : "pending_setup"
          : pin_enabled
          ? "pin_only"
          : "no_portal",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
