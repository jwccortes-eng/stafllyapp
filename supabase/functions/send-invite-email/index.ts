import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendLovableEmail } from "npm:@lovable.dev/email-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !user) {
      console.error("Auth error:", userErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let runId = user.id;
    try {
      const payload = token.split(".")[1]
        ?.replaceAll("-", "+")
        .replaceAll("_", "/")
        .padEnd(Math.ceil(token.split(".")[1].length / 4) * 4, "=");
      const claims = payload ? JSON.parse(atob(payload)) : null;
      if (typeof claims?.session_id === "string" && claims.session_id.length > 0) {
        runId = claims.session_id;
      }
    } catch {
      // fallback to user.id
    }

    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "to, subject, and html are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strip HTML tags for plain text fallback
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    await sendLovableEmail(
      {
        run_id: runId,
        to,
        subject,
        html,
        text,
        from: "StaflyApps <noreply@notify.staflyapps.com>",
        sender_domain: "notify.staflyapps.com",
        purpose: "transactional",
        label: "invite_email",
        message_id: crypto.randomUUID(),
      },
      { apiKey }
    );

    return new Response(JSON.stringify({ success: true }), {
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
