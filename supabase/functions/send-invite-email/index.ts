import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Verify caller with anon client
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "to, subject, and html are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    // Use service role client to enqueue email via pgmq
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const runIdHeader = req.headers.get("x-lovable-run-id");

    const payload: Record<string, unknown> = {
      queued_at: new Date().toISOString(),
      to,
      subject,
      html,
      text,
      from: "StaflyApps <noreply@notify.staflyapps.com>",
      sender_domain: "notify.staflyapps.com",
      purpose: "transactional",
      label: "invite_email",
      message_id: crypto.randomUUID(),
    };

    if (runIdHeader) {
      payload.run_id = runIdHeader;
    }

    const { data: msgId, error: enqueueErr } = await adminClient.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload,
    });

    if (enqueueErr) {
      console.error("Enqueue error:", enqueueErr.message);
      throw new Error(enqueueErr.message);
    }

    await adminClient.from("email_send_log").insert({
      recipient_email: to,
      template_name: "invite_email",
      status: "pending",
      message_id: payload.message_id as string,
      metadata: {
        subject,
        enqueued_by: user.id,
        has_run_id: Boolean(runIdHeader),
      },
    });

    console.log("Email enqueued successfully, msg_id:", msgId);

    return new Response(JSON.stringify({ success: true, message_id: payload.message_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("send-invite-email error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
