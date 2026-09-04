import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendRawEmail } from "../_shared/send-raw-email.ts";
import { brandFrom } from "../_shared/email-brand.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENDER_DOMAIN = "notify.staflyapps.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await anonClient.auth.getUser();

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { to, subject, html, company_id, employee_id, invitation_id, company_name } = body;
    // Marca por tenant: la compañía manda cuando el llamador la conoce.
    const fromAddress = brandFrom(typeof company_name === "string" ? company_name : null);

    // ─── VALIDATION ───
    if (!to || typeof to !== "string") {
      return new Response(
        JSON.stringify({ error: "Valid 'to' email address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format", recipient: to }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subject || !html) {
      return new Response(
        JSON.stringify({ error: "subject and html are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const messageId = crypto.randomUUID();
    const idempotencyKey = invitation_id
      ? `invite-email-${invitation_id}`
      : `invite-email-${to}-${Date.now()}`;

    // Service role client for logging and invitation bookkeeping
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    console.log("Sending invite email", {
      to,
      subject,
      message_id: messageId,
      idempotency_key: idempotencyKey,
      company_id: company_id ?? "not_provided",
      employee_id: employee_id ?? "not_provided",
      invitation_id: invitation_id ?? "not_provided",
      sender: fromAddress,
      sender_domain: SENDER_DOMAIN,
    });

    const logMetadata = {
      subject,
      enqueued_by: user.id,
      company_id: company_id ?? null,
      employee_id: employee_id ?? null,
      invitation_id: invitation_id ?? null,
      idempotency_key: idempotencyKey,
    };

    let result: { accepted: boolean; reason?: string };
    try {
      result = await sendRawEmail({
        to,
        from: fromAddress,
        subject,
        html,
        text,
        label: "invite_email",
        idempotencyKey,
        category: "transactional_access",
        adminClient,
      });
    } catch (sendErr) {
      const detail = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error("Invite email send failed:", { detail, message_id: messageId });

      const { error: logErr } = await adminClient.from("email_send_log").insert({
        recipient_email: to,
        template_name: "invite_email",
        status: "failed",
        message_id: messageId,
        error_message: detail.slice(0, 1000),
        metadata: logMetadata,
      });
      if (logErr) console.error("email_send_log insert failed:", logErr.message);

      if (invitation_id) {
        await adminClient
          .from("employee_invitations")
          .update({
            status: "failed",
            last_error: `Send failed: ${detail}`,
            last_attempt_at: new Date().toISOString(),
          } as any)
          .eq("id", invitation_id);
      }

      return new Response(
        JSON.stringify({
          error: "Failed to send email",
          detail,
          message_id: messageId,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: logErr } = await adminClient.from("email_send_log").insert({
      recipient_email: to,
      template_name: "invite_email",
      // P0.3: "accepted" = el API aceptó la solicitud. "sent" solo lo fija la
      // reconciliación con los eventos reales del proveedor.
      status: result.accepted ? "accepted" : "suppressed",
      message_id: messageId,
      error_message: result.accepted ? null : "Recipient suppressed",
      metadata: logMetadata,
    });
    if (logErr) console.error("email_send_log insert failed:", logErr.message);

    if (invitation_id) {
      await adminClient
        .from("employee_invitations")
        .update({
          status: result.accepted ? "queued" : "failed",
          last_error: result.accepted ? null : "Recipient suppressed",
          provider_message_id: messageId,
          last_attempt_at: new Date().toISOString(),
          attempts: 1,
        } as any)
        .eq("id", invitation_id);
    }

    console.log("Invite email processed", {
      message_id: messageId,
      accepted: result.accepted,
      invitation_id,
    });

    return new Response(
      JSON.stringify({
        success: result.accepted,
        message_id: messageId,
        // Verdad de entrega: el API aceptó la solicitud; el despacho efectivo se
        // confirma después con los eventos del proveedor.
        status: result.accepted ? "accepted" : "suppressed",
        delivery: result.accepted ? "ACCEPTED" : "SUPPRESSED",
        invitation_created: Boolean(invitation_id),
        detail: result.accepted
          ? "Solicitud aceptada. La entrega se confirma con el evento del proveedor."
          : "Recipient is suppressed (previous bounce, complaint or unsubscribe).",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("send-invite-email error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
