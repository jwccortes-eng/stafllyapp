// Security Self-Check (Phase 1)
// Validates A1 (cron auth gate) and A3 (no raw error detail) weekly.
// Inserts into public.security_alerts when a regression is detected.
// Read-only against payroll/shifts/attendance/time_entries.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CRON_FUNCTIONS = [
  "auto-close-periods",
  "trial-downgrade",
  "shift-reminders",
  "invite-reminders",
  "generate-reviews",
];

const A3_FUNCTIONS = [
  "employee-auth",
  "invite-reminders",
  "shift-reminders",
  "generate-reviews",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Same cron gate pattern as A1 functions
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const expected = `Bearer ${cronSecret}`;
    if (authHeader !== expected) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const projectRef = (Deno.env.get("SUPABASE_URL") ?? "")
    .replace("https://", "")
    .replace(".supabase.co", "");
  const base = `https://${projectRef}.supabase.co/functions/v1`;

  const alerts: Array<Record<string, unknown>> = [];
  const results: Array<Record<string, unknown>> = [];

  // ---- A1: cron functions must reject calls without Authorization ----
  for (const fn of CRON_FUNCTIONS) {
    try {
      const r = await fetch(`${base}/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const status = r.status;
      const ok = status === 401;
      results.push({ check: "A1", target: fn, status, ok });
      if (!ok) {
        alerts.push({
          check_name: "A1_cron_gate",
          severity: "error",
          target: fn,
          expected: "401",
          actual: String(status),
          details: { note: "Cron function accepted request without Authorization" },
        });
      }
    } catch (e) {
      results.push({ check: "A1", target: fn, error: "fetch_failed" });
    }
  }

  // ---- A3: error responses must not leak `detail` or raw exception messages ----
  for (const fn of A3_FUNCTIONS) {
    try {
      // Send malformed body to trigger an error path
      const r = await fetch(`${base}/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not_json",
      });
      const text = await r.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* non-json is fine */ }

      const leaks: string[] = [];
      if (parsed && typeof parsed === "object") {
        if ("detail" in parsed && parsed.detail) leaks.push("detail");
        if ("stack" in parsed && parsed.stack) leaks.push("stack");
        if ("message" in parsed && typeof parsed.message === "string" &&
            /at\s+\S+\s+\(.+:\d+:\d+\)/.test(parsed.message)) {
          leaks.push("stack_in_message");
        }
      }
      const ok = leaks.length === 0;
      results.push({ check: "A3", target: fn, status: r.status, ok, leaks });
      if (!ok) {
        alerts.push({
          check_name: "A3_error_sanitization",
          severity: "warn",
          target: fn,
          expected: "no detail/stack/raw error",
          actual: leaks.join(","),
          details: { sample: parsed },
        });
      }
    } catch (_e) {
      results.push({ check: "A3", target: fn, error: "fetch_failed" });
    }
  }

  if (alerts.length > 0) {
    const { error } = await supabase.from("security_alerts").insert(alerts);
    if (error) console.error("Failed to insert security_alerts", error);
  }

  return new Response(
    JSON.stringify({
      ran_at: new Date().toISOString(),
      alerts_inserted: alerts.length,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
