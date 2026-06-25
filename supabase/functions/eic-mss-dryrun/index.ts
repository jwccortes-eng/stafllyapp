// TEMPORARY EIC dry-run lookup. Delete after run.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OWNER_EMAIL = "jwc.cortes@gmail.com";

    const admin = createClient(SUPABASE_URL, SRK, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Generate magiclink and get hashed_token
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: OWNER_EMAIL,
    });
    if (linkErr) return j({ ok:false, stage:"generateLink", error: linkErr.message });
    const tokenHash = (linkData as any)?.properties?.hashed_token;
    if (!tokenHash) return j({ ok:false, stage:"generateLink", error:"no_hashed_token" });

    // 2. Verify OTP to get a real session JWT
    const anonClient = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: vData, error: vErr } = await anonClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (vErr) return j({ ok:false, stage:"verifyOtp", error: vErr.message });
    const accessToken = vData.session?.access_token;
    if (!accessToken) return j({ ok:false, stage:"verifyOtp", error:"no_access_token" });

    // 3. Call lookup as owner
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await userClient.rpc(
      "ecosystem_identity_lookup_for_existing_employee",
      {
        p_target_employee_id: "4df1c02f-5055-4686-850d-fcd3e1e3274e",
        p_target_company_id:  "37f92f75-7af4-4496-aa10-793e14b09ed9",
      },
    );

    // 4. Sign out to invalidate session
    try { await userClient.auth.signOut(); } catch (_) {}

    if (error) return j({ ok:false, stage:"rpc", error });

    const rows = Array.isArray(data) ? data : [data];
    const redacted = rows.map(redact);
    return j({ ok:true, redacted, row_count: rows.length });
  } catch (e) {
    return j({ ok:false, exception: String(e) });
  }
});

function j(o: unknown) {
  return new Response(JSON.stringify(o, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function redact(row: any) {
  if (!row || typeof row !== "object") return row;
  const { match_token, ...rest } = row;
  return { ...rest, match_token_returned: typeof match_token === "string" && match_token.length > 0 };
}
