// ONE-SHOT QA HELPER — DELETE AFTER USE.
// Sets a known password on the existing Stafly Demo Company worker (Demo Mesero Uno)
// so the dev/owner can run end-to-end Time Clock QA in the demo tenant.
// Guarded by a shared secret header. No payroll, RLS, or schema changes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GUARD = "stafly-qa-time-clock-2026-06-01";
const DEMO_WORKER_USER_ID = "461680f3-3f43-4dd5-940c-826e20dbc6e7"; // Demo Mesero Uno
const DEMO_PASSWORD = "DemoQA-Clock-2026!";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.headers.get("x-qa-token") !== GUARD) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: userData, error: getErr } = await admin.auth.admin.getUserById(DEMO_WORKER_USER_ID);
  if (getErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "user_not_found", detail: getErr?.message }), {
      status: 404, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const { error: updErr } = await admin.auth.admin.updateUserById(DEMO_WORKER_USER_ID, {
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (updErr) {
    return new Response(JSON.stringify({ error: "update_failed", detail: updErr.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      ok: true,
      user_id: DEMO_WORKER_USER_ID,
      email: userData.user.email,
      password: DEMO_PASSWORD,
      note: "DELETE THIS FUNCTION AFTER QA",
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
