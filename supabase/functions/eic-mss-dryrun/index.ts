// TEMPORARY EIC dry-run lookup. Delete after run.
import { createClient } from "npm:@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

Deno.serve(async (_req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const OWNER_UID = "2bf0401f-7c8a-4017-b3bd-033935e34860";

    const keyData = new TextEncoder().encode(JWT_SECRET);
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign","verify"]
    );
    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      {
        sub: OWNER_UID,
        role: "authenticated",
        aud: "authenticated",
        iss: `${SUPABASE_URL}/auth/v1`,
        iat: getNumericDate(0),
        exp: getNumericDate(60 * 5),
      },
      cryptoKey,
    );

    const client = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await client.rpc(
      "ecosystem_identity_lookup_for_existing_employee",
      {
        p_target_employee_id: "4df1c02f-5055-4686-850d-fcd3e1e3274e",
        p_target_company_id:  "37f92f75-7af4-4496-aa10-793e14b09ed9",
      },
    );

    if (error) {
      return new Response(JSON.stringify({ ok: false, error }), { status: 200 });
    }

    // Redact match_token before returning
    const redacted: any = Array.isArray(data) ? data.map(redact) : redact(data);
    return new Response(JSON.stringify({ ok: true, redacted }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, exception: String(e) }), { status: 200 });
  }
});

function redact(row: any) {
  if (!row || typeof row !== "object") return row;
  const { match_token, ...rest } = row;
  return { ...rest, match_token_returned: typeof match_token === "string" && match_token.length > 0 };
}
