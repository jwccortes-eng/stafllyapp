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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  const results = { reminders_24h: 0, reminders_1h: 0, errors: [] as string[] };

  try {
    // Get all active companies
    const { data: companies } = await supabase
      .from("companies")
      .select("id")
      .eq("is_active", true);

    for (const company of companies ?? []) {
      // Check automation rule
      const { data: rule } = await supabase
        .from("automation_rules")
        .select("enabled, config")
        .eq("company_id", company.id)
        .eq("rule_key", "shift_reminder")
        .maybeSingle();

      if (rule && !rule.enabled) continue;

      const hoursBeforeList = [24, 1];

      for (const hoursBefore of hoursBeforeList) {
        const targetTime = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
        const windowStart = new Date(targetTime.getTime() - 30 * 60 * 1000); // 30 min window
        const windowEnd = new Date(targetTime.getTime() + 30 * 60 * 1000);

        const targetDate = targetTime.toISOString().split("T")[0];

        // Find shifts starting in the window
        const { data: shifts } = await supabase
          .from("scheduled_shifts")
          .select("id, title, date, start_time, shift_code, locations(name)")
          .eq("company_id", company.id)
          .eq("date", targetDate)
          .is("deleted_at", null)
          .in("status", ["published", "open"]);

        for (const shift of shifts ?? []) {
          // Check if shift start_time falls within our window
          const [h, m] = (shift.start_time as string).split(":").map(Number);
          const shiftStart = new Date(targetDate + "T00:00:00Z");
          shiftStart.setUTCHours(h, m, 0, 0);

          if (shiftStart < windowStart || shiftStart > windowEnd) continue;

          // Get assigned employees
          const { data: assignments } = await supabase
            .from("shift_assignments")
            .select("employee_id")
            .eq("shift_id", shift.id)
            .in("status", ["confirmed", "pending", "accepted"]);

          for (const assignment of assignments ?? []) {
            const notifType = hoursBefore === 24 ? "shift_reminder_24h" : "shift_reminder_1h";

            // Check if already notified
            const { data: existing } = await supabase
              .from("notifications")
              .select("id")
              .eq("recipient_id", assignment.employee_id)
              .eq("type", notifType)
              .eq("company_id", company.id)
              .contains("metadata", { shift_id: shift.id })
              .limit(1);

            if (existing && existing.length > 0) continue;

            const locationName = (shift as any).locations?.name;
            const timeLabel = hoursBefore === 24 ? "mañana" : "en 1 hora";
            const body = `Tu turno "${shift.title}" comienza ${timeLabel} a las ${(shift.start_time as string).slice(0, 5)}${locationName ? ` en ${locationName}` : ""}.`;

            const { error } = await supabase.from("notifications").insert({
              company_id: company.id,
              recipient_id: assignment.employee_id,
              recipient_type: "employee",
              type: notifType,
              title: hoursBefore === 24 ? "📅 Recordatorio de turno" : "⏰ Tu turno comienza pronto",
              body,
              metadata: { shift_id: shift.id, shift_code: shift.shift_code },
              created_by: null,
            });

            if (error) {
              results.errors.push(error.message);
            } else {
              if (hoursBefore === 24) results.reminders_24h++;
              else results.reminders_1h++;
            }
          }
        }
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
