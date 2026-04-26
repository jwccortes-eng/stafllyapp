import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENDER_DOMAIN = "notify.staflyapps.com";
const FROM_ADDRESS = "StaflyApps <noreply@notify.staflyapps.com>";

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
    const { to, subject, html, company_id, employee_id, invitation_id } = body;

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

    // Use service role client to enqueue email via pgmq
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get/create unsubscribe token (REQUIRED by Lovable Email API for transactional)
    let unsubscribeToken: string | null = null;
    {
      const { data: tokenData, error: tokenErr } = await adminClient.rpc(
        "get_or_create_unsubscribe_token",
        { p_email: to }
      );
      if (tokenErr) {
        console.error("Failed to get unsubscribe token", { to, error: tokenErr.message });
      } else {
        unsubscribeToken = tokenData as string;
      }
    }

    const payload: Record<string, unknown> = {
      queued_at: new Date().toISOString(),
      to,
      subject,
      html,
      text,
      from: FROM_ADDRESS,
      sender_domain: SENDER_DOMAIN,
      purpose: "transactional",
      label: "invite_email",
      message_id: messageId,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      // NO run_id — the Lovable API creates a transactional run inline
      // when idempotency_key + purpose:transactional are present
    };

    console.log("Enqueuing invite email", {
      to,
      subject,
      message_id: messageId,
      idempotency_key: idempotencyKey,
      company_id: company_id ?? "not_provided",
      employee_id: employee_id ?? "not_provided",
      invitation_id: invitation_id ?? "not_provided",
      sender: FROM_ADDRESS,
      sender_domain: SENDER_DOMAIN,
    });

    const { data: msgId, error: enqueueErr } = await adminClient.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload,
    });

    if (enqueueErr) {
      console.error("Enqueue error:", {
        error: enqueueErr.message,
        to,
        message_id: messageId,
        company_id,
        employee_id,
      });

      // Update invitation status to failed if invitation_id provided
      if (invitation_id) {
        await adminClient
          .from("employee_invitations")
          .update({
            status: "failed",
            last_error: `Enqueue failed: ${enqueueErr.message}`,
            last_attempt_at: new Date().toISOString(),
          } as any)
          .eq("id", invitation_id);
      }

      return new Response(
        JSON.stringify({
          error: "Failed to enqueue email",
          detail: enqueueErr.message,
          message_id: messageId,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log pending state
    await adminClient.from("email_send_log").insert({
      recipient_email: to,
      template_name: "invite_email",
      status: "pending",
      message_id: messageId,
      metadata: {
        subject,
        enqueued_by: user.id,
        company_id: company_id ?? null,
        employee_id: employee_id ?? null,
        invitation_id: invitation_id ?? null,
        idempotency_key: idempotencyKey,
      },
    });

    // Update invitation status to queued (not "sent" — honest status)
    if (invitation_id) {
      await adminClient
        .from("employee_invitations")
        .update({
          status: "queued",
          provider_message_id: messageId,
          last_attempt_at: new Date().toISOString(),
          attempts: 1, // Will be incremented by queue processor on retries
        } as any)
        .eq("id", invitation_id);
    }

    console.log("Email enqueued successfully", {
      msg_id: msgId,
      message_id: messageId,
      to,
      invitation_id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message_id: messageId,
        status: "queued",
        detail: "Email queued for delivery. Status will update when provider confirms.",
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
