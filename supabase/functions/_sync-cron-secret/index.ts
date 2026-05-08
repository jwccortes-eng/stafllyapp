// One-shot helper: copies CRON_SECRET env var into the public._set_cron_secret() RPC,
// which stores it in vault.secrets under the name 'cron_secret'.
// Delete this function after invoking once.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async (_req) => {
  const value = Deno.env.get("CRON_SECRET");
  if (!value) {
    return new Response(JSON.stringify({ ok: false, error: "missing_env" }), { status: 500 });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { error } = await supabase.rpc("_set_cron_secret", { p_value: value });
  if (error) {
    console.error("[_sync-cron-secret] rpc error:", error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
