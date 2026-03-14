/**
 * parceros-webhook
 *
 * Event dispatcher that forwards StaflyApps events to Parceros /webhook-receiver.
 * Called internally via service-role when events occur (triggers, cron, manual).
 *
 * POST { event_type, stafly_worker_id, data? }
 *
 * Outbound format to Parceros:
 * {
 *   event_type, source: "staflyapps", external_worker_id,
 *   payload: {...}, timestamp: ISO-8601
 * }
 *
 * Auth inbound: service-role bearer token.
 * Auth outbound: x-api-key header with PARCEROS_API_KEY.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ParcerosEventType, ParcerosWebhookBody } from "../_shared/parceros-payload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PARCEROS_WEBHOOK_PATH = "/webhook-receiver";

const VALID_EVENTS: ParcerosEventType[] = [
  "worker.updated",
  "review.created",
  "reputation.updated",
  "shift.completed",
  "badge.earned",
  "passport.consolidated",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Auth: service-role bearer only (internal) ──
    const authHeader = req.headers.get("authorization") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (authHeader !== `Bearer ${serviceRoleKey}` || serviceRoleKey.length < 10) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { event_type, stafly_worker_id, data } = body;

    // Validate
    if (!event_type || !VALID_EVENTS.includes(event_type)) {
      return new Response(
        JSON.stringify({ error: `Invalid event_type. Valid: ${VALID_EVENTS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!stafly_worker_id) {
      return new Response(
        JSON.stringify({ error: "stafly_worker_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Store event in queue
    const { error: insertError } = await supabase.from("parceros_event_queue").insert({
      event_type,
      worker_profile_id: stafly_worker_id,
      payload: data ?? {},
      status: "pending",
    });

    if (insertError) {
      console.error("Failed to queue event:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to queue event" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Forward to Parceros /webhook-receiver ──
    const parcerosBaseUrl = Deno.env.get("PARCEROS_BASE_URL");
    const parcerosApiKey = Deno.env.get("PARCEROS_API_KEY");
    let forwarded = false;
    let forwardStatus: number | undefined;
    let forwardError: string | undefined;

    if (parcerosBaseUrl && parcerosApiKey) {
      const webhookUrl = `${parcerosBaseUrl.replace(/\/$/, "")}${PARCEROS_WEBHOOK_PATH}`;

      const webhookBody: ParcerosWebhookBody = {
        event_type: event_type as ParcerosEventType,
        source: "staflyapps",
        external_worker_id: stafly_worker_id,
        payload: data ?? {},
        timestamp: new Date().toISOString(),
      };

      try {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": parcerosApiKey,
          },
          body: JSON.stringify(webhookBody),
        });

        forwardStatus = resp.status;

        if (resp.ok) {
          forwarded = true;
          await supabase
            .from("parceros_event_queue")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("worker_profile_id", stafly_worker_id)
            .eq("event_type", event_type)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1);
        } else {
          const errorText = await resp.text();
          forwardError = `HTTP ${resp.status}: ${errorText.slice(0, 200)}`;
          console.error(`Parceros webhook failed [${resp.status}]:`, errorText);

          // Mark as failed for retry
          await supabase
            .from("parceros_event_queue")
            .update({
              status: "failed",
              error_message: forwardError,
              retry_count: 1,
            })
            .eq("worker_profile_id", stafly_worker_id)
            .eq("event_type", event_type)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1);
        }
      } catch (fwdErr: unknown) {
        const msg = fwdErr instanceof Error ? fwdErr.message : "Network error";
        forwardError = msg;
        console.error("Forward error:", msg);

        await supabase
          .from("parceros_event_queue")
          .update({
            status: "failed",
            error_message: msg.slice(0, 200),
            retry_count: 1,
          })
          .eq("worker_profile_id", stafly_worker_id)
          .eq("event_type", event_type)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        queued: true,
        forwarded,
        forward_status: forwardStatus,
        forward_error: forwardError,
        event_type,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("parceros-webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
