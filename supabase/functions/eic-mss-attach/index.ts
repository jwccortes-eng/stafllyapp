// TEMPORARY EDGE FUNCTION — EIC MSS Attach (1 worker)
// Authorized scope: target_employee_id = 4df1c02f-5055-4686-850d-fcd3e1e3274e only.
// MUST be deleted (remote + local) immediately after a single successful or aborted run.
// Hard rules:
//   - Imports buildEicSafeResponse from shared sanitizer.
//   - Never logs / persists / truncates the match_token. In-memory use only.
//   - Single lookup + single attach. No loops, no bulk.
//   - Aborts on every stop condition.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildEicSafeResponse } from "../_shared/eic-redact.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TARGET_EMPLOYEE_ID = "4df1c02f-5055-4686-850d-fcd3e1e3274e";
const TARGET_COMPANY_ID = "37f92f75-7af4-4496-aa10-793e14b09ed9"; // MSS
const DEFAULT_OWNER_EMAIL = "emp_3476399595@employee.internal"; // Jorge Cortes

type SafeMatch = ReturnType<typeof buildEicSafeResponse> & {
  source_company_name?: unknown;
  match_strength?: unknown;
  reasons?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ stage: "method_not_allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return json({ stage: "missing_env" }, 500);
  }

  let body: { owner_email?: string; confirm?: string } = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }
  if (body.confirm !== "EXECUTE_EIC_ATTACH_4DF1C02F") {
    return json({ stage: "missing_confirm" }, 403);
  }
  const ownerEmail = body.owner_email ?? DEFAULT_OWNER_EMAIL;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Mint magiclink for owner (no email sent; just returns hashed_token).
  const { data: linkData, error: linkErr } = await admin.auth.admin
    .generateLink({ type: "magiclink", email: ownerEmail });
  if (linkErr) {
    return json({
      stage: "magiclink",
      error_code: (linkErr as { code?: string }).code,
      error_message: linkErr.message,
    }, 500);
  }
  const tokenHash = (linkData as {
    properties?: { hashed_token?: string };
  }).properties?.hashed_token;
  if (!tokenHash) return json({ stage: "magiclink_missing_hash" }, 500);

  // 2. Exchange for an owner-context session.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: otpErr } = await userClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (otpErr) {
    return json({
      stage: "verify_otp",
      error_code: (otpErr as { code?: string }).code,
      error_message: otpErr.message,
    }, 500);
  }

  // 3. Fresh lookup.
  const { data: lookupRaw, error: lookupErr } = await userClient.rpc(
    "ecosystem_identity_lookup_for_existing_employee",
    {
      p_target_employee_id: TARGET_EMPLOYEE_ID,
      p_target_company_id: TARGET_COMPANY_ID,
    },
  );
  if (lookupErr) {
    return json({
      stage: "lookup",
      error_code: lookupErr.code,
      error_message: lookupErr.message,
    }, 500);
  }
  const rawMatches: unknown[] = Array.isArray(
      (lookupRaw as { matches?: unknown }).matches,
    )
    ? (lookupRaw as { matches: unknown[] }).matches
    : [];

  // 4. Pick the single qualifying match (Quality Staff, HIGH, phone+email).
  let chosenMatchToken: string | null = null;
  let chosenIdx = -1;
  let chosenHasAuthUser = false;
  let chosenSourceCompanyName: string | null = null;
  for (let i = 0; i < rawMatches.length; i++) {
    const m = rawMatches[i] as Record<string, unknown>;
    const reasons = Array.isArray(m.match_reasons)
      ? (m.match_reasons as string[])
      : [];
    const isHigh = m.match_strength === "HIGH";
    const hasPhone = reasons.includes("phone");
    const hasEmail = reasons.includes("email");
    const srcName = typeof m.source_company_name === "string"
      ? (m.source_company_name as string)
      : "";
    const isQS = /Quality\s*Staff/i.test(srcName);
    if (isHigh && hasPhone && hasEmail && isQS) {
      const token = m.match_token;
      if (typeof token === "string" && token.length > 0) {
        chosenMatchToken = token;
        chosenIdx = i;
        chosenHasAuthUser = m.has_auth_user === true;
        chosenSourceCompanyName = srcName;
        break;
      }
    }
  }

  // Build safe view of all matches BEFORE doing anything else with the token.
  const safeMatches = rawMatches.map((m) => buildEicSafeResponse(m)) as SafeMatch[];
  const summary = {
    result_count: rawMatches.length,
    qualifying_match_found: chosenIdx >= 0,
    qualifying_match_index: chosenIdx,
    source_company_name: chosenSourceCompanyName,
  };

  if (chosenIdx < 0) {
    return json({
      stage: "abort_no_qualifying_match",
      ...summary,
      matches: safeMatches,
      match_token_returned: false,
      token_not_logged: true,
    }, 412);
  }
  if (!chosenHasAuthUser) {
    return json({
      stage: "abort_source_no_auth_user",
      ...summary,
      matches: safeMatches,
      match_token_returned: true,
      token_not_logged: true,
    }, 412);
  }

  // 5. Re-read target right before attach.
  const { data: tgt, error: tgtErr } = await admin
    .from("employees")
    .select("id, company_id, user_id, portal_access_enabled")
    .eq("id", TARGET_EMPLOYEE_ID)
    .maybeSingle();
  if (tgtErr || !tgt) {
    return json({
      stage: "target_reread_failed",
      error: tgtErr?.message ?? "not_found",
    }, 500);
  }
  if (tgt.company_id !== TARGET_COMPANY_ID) {
    return json({ stage: "abort_target_company_mismatch" }, 409);
  }
  if (tgt.user_id !== null) {
    return json({ stage: "abort_target_user_id_not_null" }, 409);
  }
  if (tgt.portal_access_enabled !== false) {
    return json({ stage: "abort_target_portal_already_enabled" }, 409);
  }

  // 6. Attach. Token used in-memory only. Never logged.
  const { data: attachRaw, error: attachErr } = await userClient.rpc(
    "ecosystem_identity_attach_existing_employee_to_auth_user",
    {
      p_target_employee_id: TARGET_EMPLOYEE_ID,
      p_target_company_id: TARGET_COMPANY_ID,
      p_match_token: chosenMatchToken,
    },
  );
  // Best-effort wipe of the local reference.
  chosenMatchToken = null;
  if (attachErr) {
    return json({
      stage: "attach_failed",
      error_code: attachErr.code,
      error_message: attachErr.message,
      ...summary,
      match_token_returned: true,
      token_not_logged: true,
    }, 500);
  }
  const safeAttach = buildEicSafeResponse(attachRaw);

  // 7. Re-read target post-attach.
  const { data: tgtAfter } = await admin
    .from("employees")
    .select("id, user_id, portal_access_enabled, updated_at")
    .eq("id", TARGET_EMPLOYEE_ID)
    .maybeSingle();

  return json({
    stage: "ok",
    ...summary,
    matches: safeMatches,
    attach_safe: safeAttach,
    target_after: {
      user_id_present: !!tgtAfter?.user_id,
      user_id_first8: typeof tgtAfter?.user_id === "string"
        ? tgtAfter.user_id.slice(0, 8)
        : null,
      portal_access_enabled: tgtAfter?.portal_access_enabled ?? null,
      updated_at: tgtAfter?.updated_at ?? null,
    },
    match_token_returned: true,
    token_not_logged: true,
  }, 200);
});
