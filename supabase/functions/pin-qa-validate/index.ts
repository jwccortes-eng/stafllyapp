/**
 * Sprint S7-N — pin-qa-validate
 *
 * Side-effect-free PIN validation harness. Demo-only, service-role-only.
 *
 * Reuses the exact validation path used by employee-auth / kiosk-clock /
 * front-desk-checkin:
 *   - _shared/security-flags.ts (resolveDemoDualMode)
 *   - _shared/pin-validation.ts (validatePinDual → internal_verify_pin_hash RPC)
 *
 * HARD RULES (do NOT relax without an explicit new sprint):
 *   - Never performs INSERT / UPDATE / UPSERT / DELETE. No table writes.
 *   - Never mints a session. No auth.signInWithPassword / admin.createUser.
 *   - Rejects any caller whose JWT role is not "service_role" → 401.
 *   - Rejects any employee whose company is not is_demo=true → 403.
 *   - Returns ONLY the structured telemetry shape below. No PIN, hash,
 *     access_pin, password, token, email, phone, profile or company fields
 *     are echoed back to the caller.
 *   - Logs follow the same redaction rules as production: no PIN / hash /
 *     password / token / email / phone.
 *
 * Rollback: delete this file (`supabase/functions/pin-qa-validate`). No DB
 * rollback required.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { validatePinDual } from "../_shared/pin-validation.ts";
import { resolveDemoDualMode } from "../_shared/security-flags.ts";

type Ctx = "kiosk" | "front_desk" | "portal";

interface QaResponseShape {
  ok: boolean;
  ctx: Ctx;
  mode: "legacy" | "dual" | "hash_only_ready";
  validation_source: "hash" | "plaintext_fallback" | null;
  hash_mismatch: boolean;
  hash_error: boolean;
  fallback_suppressed: boolean;
  suppressed_reason: "missing_hash" | "hash_mismatch" | "hash_error" | null;
  result: "ok" | "fail";
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeJwtRole(jwt: string): string | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "Method not allowed" }, 405);
  }

  // ---------- Service-role JWT gate ----------
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResp({ error: "Unauthorized" }, 401);
  }
  const jwt = authHeader.slice("Bearer ".length).trim();
  const role = decodeJwtRole(jwt);
  if (role !== "service_role") {
    return jsonResp({ error: "Unauthorized" }, 401);
  }

  // ---------- Body validation ----------
  let body: { employee_id?: unknown; pin?: unknown; ctx?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResp({ error: "Invalid JSON" }, 400);
  }
  const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  const ctxRaw = typeof body.ctx === "string" ? body.ctx : "";
  if (!/^[0-9a-f-]{36}$/i.test(employeeId)) {
    return jsonResp({ error: "Invalid employee_id" }, 400);
  }
  if (!pin) {
    return jsonResp({ error: "Invalid pin" }, 400);
  }
  if (ctxRaw !== "kiosk" && ctxRaw !== "front_desk" && ctxRaw !== "portal") {
    return jsonResp({ error: "Invalid ctx" }, 400);
  }
  const ctx = ctxRaw as Ctx;
  void ctx;

  // P0 AUTH PIN CANONICALIZATION: este validador de QA leía el PIN de la ficha
  // de empleado. Retirado: existe un único validador (credencial del Auth User).
  return jsonResp(
    {
      error: "Validador retirado. El PIN se valida solo contra la credencial única de la persona.",
      code: "retired",
    },
    410,
  );

  // ---------- Admin client (used ONLY for SELECTs + the verify RPC) ----------
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ---------- Employee lookup ----------
  const { data: employee, error: empErr } = await adminClient
    .from("employees")
    .select("id, company_id, access_pin, access_pin_hash, pin_hash_version, is_active")
    .eq("id", employeeId)
    .maybeSingle();
  if (empErr || !employee) {
    return jsonResp({ error: "Not found" }, 404);
  }

  // ---------- Company demo-only guard ----------
  const { data: company, error: coErr } = await adminClient
    .from("companies")
    .select("id, is_demo")
    .eq("id", employee.company_id)
    .maybeSingle();
  if (coErr || !company) {
    return jsonResp({ error: "Forbidden" }, 403);
  }
  if (company.is_demo !== true) {
    try {
      console.warn("[pin-qa-validate] BLOCKED non-demo tenant", {
        ctx,
        company_id: employee.company_id,
        employee_id: employee.id,
      });
    } catch { /* logging must never throw */ }
    return jsonResp({ error: "Forbidden" }, 403);
  }

  // ---------- Resolve mode (same path as production fns) ----------
  const effectiveMode = await resolveDemoDualMode(
    adminClient,
    employee.company_id,
    `qa:${ctx}`,
  );

  // QA scope: only legacy / dual / hash_only_ready surface to the response.
  // (resolveDemoDualMode never returns hash_reader / hash_only today.)
  const responseMode: QaResponseShape["mode"] =
    effectiveMode === "dual" || effectiveMode === "hash_only_ready"
      ? effectiveMode
      : "legacy";

  // ---------- Run the shared validator ----------
  // Under "legacy" we still run validatePinDual in "dual" mode so the harness
  // can echo telemetry, but legacy is not currently honored on Demo anyway.
  const validatorMode = responseMode === "hash_only_ready"
    ? "hash_only_ready"
    : "dual";

  const r = await validatePinDual({
    inputPin: pin,
    storedPlaintext: (employee as any).access_pin ?? null,
    storedHash: (employee as any).access_pin_hash ?? null,
    hashVersion: (employee as any).pin_hash_version ?? null,
    employeeId: employee.id,
    client: adminClient as any,
    mode: validatorMode,
  });

  // ---------- Telemetry (same shape as production callers) ----------
  try {
    console.info("[pin-auth-validate]", {
      ctx: `qa:${ctx}`,
      mode: responseMode,
      company_id: employee.company_id,
      employee_id: employee.id,
      has_hash: !!(employee as any).access_pin_hash,
      hash_version: (employee as any).pin_hash_version ?? null,
      validation_source: r.source,
      hash_mismatch: r.hashMismatch,
      hash_error: r.hashError,
      fallback_suppressed: r.fallbackSuppressed,
      suppressed_reason: r.suppressedReason,
      result: r.ok ? "ok" : "fail",
      harness: "pin-qa-validate",
    });
  } catch { /* logging must never throw */ }

  const response: QaResponseShape = {
    ok: r.ok,
    ctx,
    mode: responseMode,
    validation_source: r.source === "plaintext_only"
      ? "plaintext_fallback"
      : (r.source as QaResponseShape["validation_source"]),
    hash_mismatch: r.hashMismatch,
    hash_error: r.hashError,
    fallback_suppressed: r.fallbackSuppressed,
    suppressed_reason: r.suppressedReason,
    result: r.ok ? "ok" : "fail",
  };

  return jsonResp(response, 200);
});
