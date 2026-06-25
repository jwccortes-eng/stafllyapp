// Negative tests for the EIC token redaction sanitizer.
// Run via the test_edge_functions tool — these are pure Deno tests with
// no network / DB / env requirements.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildEicSafeResponse, deepRedactTokens } from "./eic-redact.ts";

const DENIED_EXACT_KEYS = [
  "match_token",
  "token",
  "p_match_token",
  "signed_token",
  "eic_token",
  "match_token_hash",
  "signature",
  "hmac",
];

function jsonKeys(obj: unknown): string[] {
  const keys: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      for (const k of Object.keys(v as Record<string, unknown>)) {
        keys.push(k);
        walk((v as Record<string, unknown>)[k]);
      }
    }
  };
  walk(obj);
  return keys;
}

function assertNoDeniedKeysExact(obj: unknown) {
  const keys = jsonKeys(obj);
  for (const denied of DENIED_EXACT_KEYS) {
    const hit = keys.find((k) => k.toLowerCase() === denied);
    assertEquals(hit, undefined, `unexpected denied key ${denied} -> ${hit}`);
  }
}

Deno.test("primary fixture: nested matches[].match_token is stripped", () => {
  const input = {
    matches: [{
      match_token: "abc.def.ghi",
      match_strength: "HIGH",
      reasons: ["phone"],
    }],
  };
  const out = deepRedactTokens(input) as {
    matches: Array<Record<string, unknown>>;
  };

  const serialized = JSON.stringify(out);
  assert(
    !serialized.includes("abc.def.ghi"),
    "secret token value leaked to output",
  );
  assertNoDeniedKeysExact(out);
  assertEquals(out.matches[0].match_strength, "HIGH");
  assertEquals(out.matches[0].match_token_returned, true);
  assertEquals(out.matches[0].token_not_logged, true);

  // Input must be untouched.
  assertEquals(
    (input.matches[0] as Record<string, unknown>).match_token,
    "abc.def.ghi",
  );
});

Deno.test("deeply nested signed_token is stripped", () => {
  const input = { a: { b: { signed_token: "x", keep: "yes" } } };
  const out = deepRedactTokens(input);
  const serialized = JSON.stringify(out);
  assert(!serialized.includes('"signed_token"'));
  assert(!serialized.includes('"x"'));
  assertStringIncludes(serialized, '"keep":"yes"');
});

Deno.test("array-in-array with eic_token is stripped", () => {
  const input = [[{ eic_token: "y", label: "leaf" }]];
  const out = deepRedactTokens(input) as Array<Array<Record<string, unknown>>>;
  const serialized = JSON.stringify(out);
  assert(!serialized.includes('"eic_token"'));
  assert(!serialized.includes('"y"'));
  assertEquals(out[0][0].label, "leaf");
  assertEquals(out[0][0].match_token_returned, true);
});

Deno.test("case-insensitive denylist: Match_Token is stripped", () => {
  const input = { Match_Token: "z", note: "n" };
  const out = deepRedactTokens(input) as Record<string, unknown>;
  const serialized = JSON.stringify(out);
  assert(!serialized.toLowerCase().includes("match_token\""));
  assert(!serialized.includes('"z"'));
  assertEquals(out.match_token_returned, true);
});

Deno.test("root-level token is stripped", () => {
  const input = { token: "RAW", payload: 1 };
  const out = deepRedactTokens(input) as Record<string, unknown>;
  assert(!JSON.stringify(out).includes('"RAW"'));
  assertEquals(out.token, undefined);
  assertEquals(out.payload, 1);
  assertEquals(out.match_token_returned, true);
});

Deno.test("object without any token is preserved unchanged (no indicators added)", () => {
  const input = {
    match_strength: "LOW",
    reasons: ["email"],
    nested: { ok: true },
  };
  const out = deepRedactTokens(input) as Record<string, unknown>;
  assertEquals(out, input);
  assertEquals(out.match_token_returned, undefined);
  assertEquals(out.token_not_logged, undefined);
});

Deno.test("safe key match_token_returned is NOT stripped by sanitizer", () => {
  const input = { match_token_returned: true, match_strength: "HIGH" };
  const out = deepRedactTokens(input) as Record<string, unknown>;
  assertEquals(out.match_token_returned, true);
  assertEquals(out.match_strength, "HIGH");
});

Deno.test("buildEicSafeResponse: allowlist-first, indicators set, future fields dropped", () => {
  const rpcRow = {
    match_strength: "HIGH",
    reasons: ["phone", "email"],
    source_company_name: "Quality Staff by Keury",
    masked_name: "S•••• V••••",
    masked_phone: "••• ••• 5060",
    masked_email: "s••••@gmail.com",
    match_token: "SECRET.JWT.VALUE",
    // hypothetical future column — must NOT leak through.
    internal_debug_blob: { ssn_last4: "1234" },
  };
  const safe = buildEicSafeResponse(rpcRow);
  const serialized = JSON.stringify(safe);

  assert(!serialized.includes("SECRET.JWT.VALUE"));
  assert(!serialized.includes("internal_debug_blob"));
  assert(!serialized.includes("ssn_last4"));
  assertNoDeniedKeysExact(safe);

  assertEquals(safe.match_strength, "HIGH");
  assertEquals(safe.source_company_name, "Quality Staff by Keury");
  assertEquals(safe.match_token_returned, true);
  assertEquals(safe.token_not_logged, true);
});

Deno.test("buildEicSafeResponse: no token present → match_token_returned=false", () => {
  const rpcRow = {
    match_strength: "NONE",
    reasons: [],
    source_company_name: null,
    masked_name: null,
    masked_phone: null,
    masked_email: null,
  };
  const safe = buildEicSafeResponse(rpcRow);
  assertEquals(safe.match_token_returned, false);
  assertEquals(safe.token_not_logged, true);
});
