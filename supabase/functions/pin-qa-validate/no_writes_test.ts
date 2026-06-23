/**
 * S7-N CI guard — pin-qa-validate must remain side-effect-free.
 *
 * Fails the build if `index.ts` contains any forbidden write call or any
 * reference to operational tables that would indicate a side effect was
 * (re)introduced. Rollback is "delete the file"; this guard ensures we never
 * silently grow capability beyond the demo-only QA contract.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const INDEX_PATH = new URL("./index.ts", import.meta.url);
const source = await Deno.readTextFile(INDEX_PATH);

// Strip comments so the forbidden-table check can't be tripped by docs.
const stripped = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const FORBIDDEN_CALLS = [
  ".insert(",
  ".update(",
  ".upsert(",
  ".delete(",
];

const FORBIDDEN_TABLES = [
  "time_entries",
  "clock_events",
  "office_visits",
  "security_alerts",
  "auth_rate_limits",
  "pay_periods",
  "period_base_pay",
  "reconciliation",
  "historical_payroll_entries",
];

Deno.test("pin-qa-validate contains no write calls", () => {
  for (const needle of FORBIDDEN_CALLS) {
    const hit = stripped.includes(needle);
    assertEquals(
      hit,
      false,
      `pin-qa-validate/index.ts must not contain ${needle}`,
    );
  }
});

Deno.test("pin-qa-validate does not reference operational tables", () => {
  for (const tbl of FORBIDDEN_TABLES) {
    const hit = stripped.includes(tbl);
    assertEquals(
      hit,
      false,
      `pin-qa-validate/index.ts must not reference table ${tbl}`,
    );
  }
});

Deno.test("pin-qa-validate does not mint sessions", () => {
  assertEquals(stripped.includes("signInWithPassword"), false);
  assertEquals(stripped.includes("admin.createUser"), false);
});
