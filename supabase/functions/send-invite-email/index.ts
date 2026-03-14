import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendLovableEmail } from "npm:@lovable.dev/email-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lovable-run-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = parts[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");

    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

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
    const sendUrl = Deno.env.get("LOVABLE_SEND_URL");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await callerClient.auth.getUser(token);

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
    const claims = parseJwtClaims(token);

    const runCandidates = [
      req.headers.get("x-lovable-run-id"),
      Deno.env.get("LOVABLE_RUN_ID"),
      typeof claims?.run_id === "string" ? claims.run_id : null,
      typeof claims?.session_id === "string" ? claims.session_id : null,
      user.id,
    ].filter((value, index, arr): value is string => !!value && arr.indexOf(value) === index);

    let lastRunError: Error | null = null;

    for (const runId of runCandidates) {
      try {
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
          { apiKey, sendUrl }
        );

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isRunIdProblem =
          message.includes("run_not_found") ||
          message.includes("missing_parameter") ||
          message.includes("\"parameter\":\"run_id\"");

        if (isRunIdProblem) {
          lastRunError = error instanceof Error ? error : new Error(message);
          continue;
        }

        throw error;
      }
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "StaflyApps <onboarding@resend.dev>",
          to: [to],
          subject,
          html,
          text,
        }),
      });

      if (resendResponse.ok) {
        return new Response(JSON.stringify({ success: true, provider: "resend_fallback" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resendErrorText = await resendResponse.text();
      throw new Error(`Email fallback error: ${resendResponse.status} ${resendErrorText}`);
    }

    throw lastRunError ?? new Error("No valid run_id available for email API");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("send-invite-email error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});