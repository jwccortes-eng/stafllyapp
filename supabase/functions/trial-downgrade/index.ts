import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cron-triggered function: downgrades expired trials to free plan.
 * Should be called every hour via pg_cron.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Find all trialing subscriptions whose trial has expired
    const { data: expired, error: fetchErr } = await supabase
      .from("subscriptions")
      .select("id, company_id, current_period_end")
      .eq("status", "trialing")
      .lt("current_period_end", new Date().toISOString());

    if (fetchErr) {
      console.error("[trial-downgrade] Fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!expired || expired.length === 0) {
      console.log("[trial-downgrade] No expired trials found");
      return new Response(JSON.stringify({ downgraded: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let downgraded = 0;

    for (const sub of expired) {
      const { error: updateErr } = await supabase
        .from("subscriptions")
        .update({
          plan: "free",
          status: "canceled",
          cancel_at_period_end: false,
        })
        .eq("id", sub.id);

      if (updateErr) {
        console.error(`[trial-downgrade] Failed to downgrade company=${sub.company_id}:`, updateErr);
        continue;
      }

      // Log the downgrade
      await supabase.from("billing_events").insert({
        company_id: sub.company_id,
        type: "trial_expired",
        payload_json: {
          previous_status: "trialing",
          downgraded_at: new Date().toISOString(),
          trial_end: sub.current_period_end,
        },
      });

      await supabase.from("activity_log").insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        company_id: sub.company_id,
        action: "trial_expired",
        entity_type: "subscription",
        entity_id: sub.id,
        details: { previous_plan: "pro", new_plan: "free" },
      });

      downgraded++;
      console.log(`[trial-downgrade] Downgraded company=${sub.company_id}`);
    }

    return new Response(JSON.stringify({ downgraded, total_expired: expired.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[trial-downgrade] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
