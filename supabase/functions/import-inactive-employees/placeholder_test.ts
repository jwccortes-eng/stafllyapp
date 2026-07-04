// Phase 2C-C · unit tests for placeholder detection used by the
// import-inactive-employees edge function.
//
// These mirror the regex embedded in index.ts (which cannot import from src/).
// If the production regex changes, update it here too.

import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

const PLACEHOLDER_NAME_RE =
  /^\s*(system|user\s*pend(iente)?|unknown|temp(orary)?|placeholder|pending|pend)\b/i;

function isPlaceholderName(firstName: string, lastName: string): boolean {
  const full = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  if (!full) return false;
  return PLACEHOLDER_NAME_RE.test(full);
}

Deno.test("real worker name is not a placeholder", () => {
  assertEquals(isPlaceholderName("Ana", "Lopez"), false);
  assertEquals(isPlaceholderName("Keury", "Rodriguez"), false);
  assertEquals(isPlaceholderName("Systematic", "Solutions"), false); // \b guard
  assertEquals(isPlaceholderName("Pendleton", "Smith"), false); // \b guard
});

Deno.test("placeholder names are detected", () => {
  for (const [f, l] of [
    ["System", "5"],
    ["SYSTEM", "12"],
    ["User Pend", "3"],
    ["User Pendiente", "1"],
    ["Unknown", "Worker"],
    ["Temp", "1"],
    ["Temporary", ""],
    ["Placeholder", "Row"],
    ["Pending", "Identity"],
    ["Pend", "4"],
  ]) {
    assert(isPlaceholderName(f, l), `expected placeholder for "${f} ${l}"`);
  }
});

Deno.test("empty name is not a placeholder", () => {
  assertEquals(isPlaceholderName("", ""), false);
  assertEquals(isPlaceholderName("   ", ""), false);
});
