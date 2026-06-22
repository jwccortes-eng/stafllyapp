// Sprint S7-K — unit tests for validatePinDual (dual + hash_only_ready).
// No network, no DB, no secrets. Pure helper logic.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validatePinDual, type PinHashRpcClient } from "./pin-validation.ts";

// Mock RPC client. `behavior` controls what internal_verify_pin_hash returns.
function mockClient(behavior: {
  match?: boolean;          // true → RPC returns data:true
  rpcError?: boolean;       // true → RPC returns { error }
  throwInRpc?: boolean;     // true → rpc() throws
}): PinHashRpcClient {
  return {
    rpc: async (_fn: string, _args: Record<string, unknown>) => {
      if (behavior.throwInRpc) throw new Error("network");
      if (behavior.rpcError) return { data: null, error: { message: "boom" } };
      return { data: behavior.match === true, error: null };
    },
  };
}

const EMP = "00000000-0000-0000-0000-000000000001";

// ---------- DUAL — existing behavior must remain unchanged ----------

Deno.test("dual: valid hash + correct PIN → ok, source=hash", async () => {
  const r = await validatePinDual({
    inputPin: "1234",
    storedPlaintext: "1234",
    storedHash: "$2a$10$validhashbytes",
    hashVersion: "bcrypt",
    employeeId: EMP,
    client: mockClient({ match: true }),
    mode: "dual",
  });
  assertEquals(r.ok, true);
  assertEquals(r.source, "hash");
  assertEquals(r.fallbackSuppressed, false);
  assertEquals(r.suppressedReason, null);
  assertEquals(r.hashMismatch, false);
  assertEquals(r.hashError, false);
});

Deno.test("dual: missing hash + correct PIN → ok, plaintext_fallback", async () => {
  const r = await validatePinDual({
    inputPin: "1234",
    storedPlaintext: "1234",
    storedHash: null,
    hashVersion: null,
    employeeId: EMP,
    client: mockClient({}),
    mode: "dual",
  });
  assertEquals(r.ok, true);
  assertEquals(r.source, "plaintext_fallback");
  assertEquals(r.fallbackSuppressed, false);
  assertEquals(r.suppressedReason, null);
});

Deno.test("dual: corrupt hash (RPC false) + correct PIN → ok, plaintext_fallback + hashMismatch", async () => {
  const r = await validatePinDual({
    inputPin: "1234",
    storedPlaintext: "1234",
    storedHash: "$2a$10$corrupt",
    hashVersion: "bcrypt",
    employeeId: EMP,
    client: mockClient({ match: false }),
    mode: "dual",
  });
  assertEquals(r.ok, true);
  assertEquals(r.source, "plaintext_fallback");
  assertEquals(r.hashMismatch, true);
  assertEquals(r.hashError, false);
  assertEquals(r.fallbackSuppressed, false);
});

Deno.test("dual: RPC throws + correct PIN → ok, plaintext_fallback + hashError", async () => {
  const r = await validatePinDual({
    inputPin: "1234",
    storedPlaintext: "1234",
    storedHash: "$2a$10$x",
    hashVersion: "bcrypt",
    employeeId: EMP,
    client: mockClient({ throwInRpc: true }),
    mode: "dual",
  });
  assertEquals(r.ok, true);
  assertEquals(r.source, "plaintext_fallback");
  assertEquals(r.hashError, true);
  assertEquals(r.fallbackSuppressed, false);
});

Deno.test("dual: wrong PIN → fail (no fallbackSuppressed)", async () => {
  const r = await validatePinDual({
    inputPin: "9999",
    storedPlaintext: "1234",
    storedHash: "$2a$10$x",
    hashVersion: "bcrypt",
    employeeId: EMP,
    client: mockClient({ match: false }),
    mode: "dual",
  });
  assertEquals(r.ok, false);
  assertEquals(r.fallbackSuppressed, false);
  assertEquals(r.suppressedReason, null);
});

// ---------- HASH_ONLY_READY — new capability, must not allow plaintext ----------

Deno.test("hash_only_ready: valid hash + correct PIN → ok, source=hash", async () => {
  const r = await validatePinDual({
    inputPin: "1234",
    storedPlaintext: "1234",
    storedHash: "$2a$10$valid",
    hashVersion: "bcrypt",
    employeeId: EMP,
    client: mockClient({ match: true }),
    mode: "hash_only_ready",
  });
  assertEquals(r.ok, true);
  assertEquals(r.source, "hash");
  assertEquals(r.fallbackSuppressed, false);
  assertEquals(r.suppressedReason, null);
});

Deno.test("hash_only_ready: missing hash + correct PIN → fail, suppressed=missing_hash", async () => {
  const r = await validatePinDual({
    inputPin: "1234",
    storedPlaintext: "1234",
    storedHash: null,
    hashVersion: null,
    employeeId: EMP,
    client: mockClient({}),
    mode: "hash_only_ready",
  });
  assertEquals(r.ok, false);
  assertEquals(r.source, null);
  assertEquals(r.fallbackSuppressed, true);
  assertEquals(r.suppressedReason, "missing_hash");
});

Deno.test("hash_only_ready: corrupt hash (RPC false) + correct PIN → fail, suppressed=hash_mismatch", async () => {
  const r = await validatePinDual({
    inputPin: "1234",
    storedPlaintext: "1234",
    storedHash: "$2a$10$corrupt",
    hashVersion: "bcrypt",
    employeeId: EMP,
    client: mockClient({ match: false }),
    mode: "hash_only_ready",
  });
  assertEquals(r.ok, false);
  assertEquals(r.fallbackSuppressed, true);
  assertEquals(r.suppressedReason, "hash_mismatch");
  assertEquals(r.hashMismatch, true);
  assertEquals(r.hashError, false);
});

Deno.test("hash_only_ready: RPC throws + correct PIN → fail, suppressed=hash_error", async () => {
  const r = await validatePinDual({
    inputPin: "1234",
    storedPlaintext: "1234",
    storedHash: "$2a$10$x",
    hashVersion: "bcrypt",
    employeeId: EMP,
    client: mockClient({ throwInRpc: true }),
    mode: "hash_only_ready",
  });
  assertEquals(r.ok, false);
  assertEquals(r.fallbackSuppressed, true);
  assertEquals(r.suppressedReason, "hash_error");
  assertEquals(r.hashError, true);
});

Deno.test("hash_only_ready: wrong PIN → fail, fallbackSuppressed=false (plaintext would not match)", async () => {
  const r = await validatePinDual({
    inputPin: "9999",
    storedPlaintext: "1234",
    storedHash: "$2a$10$x",
    hashVersion: "bcrypt",
    employeeId: EMP,
    client: mockClient({ match: false }),
    mode: "hash_only_ready",
  });
  assertEquals(r.ok, false);
  // Plaintext would have failed anyway under dual → no suppression credit.
  assertEquals(r.fallbackSuppressed, false);
  assertEquals(r.suppressedReason, "hash_mismatch");
});

Deno.test("hash_only_ready: missing client/employeeId → fail-closed as hash_error", async () => {
  const r = await validatePinDual({
    inputPin: "1234",
    storedPlaintext: "1234",
    storedHash: "$2a$10$x",
    hashVersion: "bcrypt",
    employeeId: null,
    client: null,
    mode: "hash_only_ready",
  });
  assertEquals(r.ok, false);
  assertEquals(r.hashError, true);
  assertEquals(r.suppressedReason, "hash_error");
});

// ---------- Defaults / contract ----------

Deno.test("default mode is dual when omitted", async () => {
  const r = await validatePinDual({
    inputPin: "1234",
    storedPlaintext: "1234",
    storedHash: null,
    hashVersion: null,
    employeeId: EMP,
    client: mockClient({}),
  });
  assertEquals(r.ok, true);
  assertEquals(r.source, "plaintext_fallback");
});

Deno.test("empty pin → fail in both modes, no fields leak", async () => {
  for (const mode of ["dual", "hash_only_ready"] as const) {
    const r = await validatePinDual({
      inputPin: "",
      storedPlaintext: "1234",
      storedHash: "$2a$10$x",
      hashVersion: "bcrypt",
      employeeId: EMP,
      client: mockClient({ match: true }),
      mode,
    });
    assertEquals(r.ok, false);
    assertEquals(r.source, null);
    assertEquals(r.fallbackSuppressed, false);
    assertEquals(r.suppressedReason, null);
  }
});
