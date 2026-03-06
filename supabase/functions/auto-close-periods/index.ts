import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cron-triggered function: auto-closes pay periods whose end_date has passed.
 * Also triggers consolidation before closing if period has no base pay yet.
 * Runs daily via pg_cron.
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
    const today = new Date().toISOString().split("T")[0];

    // Find all open periods whose end_date is before today
    const { data: openPeriods, error: fetchErr } = await supabase
      .from("pay_periods")
      .select("id, company_id, start_date, end_date, status")
      .eq("status", "open")
      .lt("end_date", today);

    if (fetchErr) {
      console.error("[auto-close-periods] Fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!openPeriods || openPeriods.length === 0) {
      console.log("[auto-close-periods] No open periods to close");
      return new Response(JSON.stringify({ closed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let closed = 0;
    let consolidated = 0;

    for (const period of openPeriods) {
      // Check if period has base pay already
      const { count } = await supabase
        .from("period_base_pay")
        .select("id", { count: "exact", head: true })
        .eq("period_id", period.id)
        .eq("company_id", period.company_id);

      // Auto-consolidate if no base pay exists
      if ((count ?? 0) === 0) {
        const { data: consolResult, error: consolErr } = await supabase
          .rpc("consolidate_period_base_pay", {
            _company_id: period.company_id,
            _period_id: period.id,
          });

        if (consolErr) {
          console.error(`[auto-close-periods] Consolidation failed for period=${period.id}:`, consolErr);
        } else {
          console.log(`[auto-close-periods] Consolidated period=${period.id}:`, consolResult);
          consolidated++;
        }
      }

      // Close the period
      const { error: closeErr } = await supabase
        .from("pay_periods")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
        })
        .eq("id", period.id);

      if (closeErr) {
        console.error(`[auto-close-periods] Failed to close period=${period.id}:`, closeErr);
        continue;
      }

      // Log the auto-close
      await supabase.from("activity_log").insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        company_id: period.company_id,
        action: "auto_close_period",
        entity_type: "pay_period",
        entity_id: period.id,
        details: {
          start_date: period.start_date,
          end_date: period.end_date,
          auto_consolidated: (count ?? 0) === 0,
        },
      });

      closed++;
      console.log(`[auto-close-periods] Closed period=${period.id} (${period.start_date} → ${period.end_date})`);
    }

    return new Response(
      JSON.stringify({ closed, consolidated, total_found: openPeriods.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[auto-close-periods] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
