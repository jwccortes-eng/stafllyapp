import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ENGINE_DIR = "src/lib/change-intelligence/engine";

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? collectFiles(full) : [full];
  });
}

/**
 * P16 — the engine knows nothing about business domains.
 * Any import outside the engine folder (except type-only local modules)
 * is a violation.
 */
describe("P16 — engine domain isolation", () => {
  const files = collectFiles(ENGINE_DIR);

  it("has engine files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s imports nothing outside the engine", (file) => {
    const source = readFileSync(file, "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const forbidden = imports.filter(
      (spec) => !spec.startsWith("./") && !spec.startsWith("../engine/"),
    );
    expect(forbidden).toEqual([]);
  });

  it.each(files)("%s contains no business-domain vocabulary", (file) => {
    const source = readFileSync(file, "utf8").toLowerCase();
    const codeOnly = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");
    for (const word of ["supabase", "scheduled_shifts", "payroll", "shift_assignments", "employees"]) {
      expect(codeOnly.includes(word)).toBe(false);
    }
  });
});
