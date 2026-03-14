/**
 * parceros-webhook
 *
 * Event dispatcher that forwards StaflyApps events to Parceros.
 * Called internally (service-role) when relevant events occur.
 *
 * POST { event_type, stafly_worker_id, data? }
 *
 * In Phase 1 this stores events in a queue table.
 * In Phase 2 it will forward to Parceros' webhook endpoint.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ParcerosEventType } from "../_shared/parceros-payload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    // Auth: service-role only (internal calls)
    const authHeader = req.headers.get("authorization") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!authHeader.includes(serviceRoleKey) || serviceRoleKey.length < 10) {
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

    // Phase 2: Forward to Parceros endpoint
    const parcerosWebhookUrl = Deno.env.get("PARCEROS_WEBHOOK_URL");
    let forwarded = false;

    if (parcerosWebhookUrl) {
      try {
        const parceroPayload = {
          event_type,
          occurred_at: new Date().toISOString(),
          source: "stafly_apps",
          stafly_worker_id,
          data: data ?? {},
        };

        const resp = await fetch(parcerosWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Source": "stafly_apps",
            "X-Parceros-Api-Key": Deno.env.get("PARCEROS_API_KEY") ?? "",
          },
          body: JSON.stringify(parceroPayload),
        });

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
          console.error(`Parceros webhook failed [${resp.status}]:`, await resp.text());
        }
      } catch (fwdErr) {
        console.error("Forward error:", fwdErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        queued: true,
        forwarded,
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
