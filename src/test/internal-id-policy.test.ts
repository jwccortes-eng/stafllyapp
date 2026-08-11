import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { INTERNAL_ID_LABEL } from "@/lib/identity/internal-id";

/**
 * P0 — Internal ID: guardián de escritor único.
 *
 * El Internal ID (`employees.employer_identification`) sólo puede asignarse
 * mediante las RPC canónicas `assign_internal_id` / `correct_internal_id`.
 * Ninguna superficie del cliente puede escribirlo con un UPDATE directo.
 * La base de datos ya lo rechaza; este test evita que el código lo intente.
 */

const ROOT = join(process.cwd(), "src");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "test") continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

const FILES = walk(ROOT);

describe("Internal ID — escritor único", () => {
  it("ninguna superficie escribe employer_identification en un .update()", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("employer_identification")) continue;

      // .update({ ... employer_identification ... })
      if (/\.update\(\s*\{[^}]*employer_identification/s.test(src)) {
        offenders.push(file);
        continue;
      }
      // updates.employer_identification = ... / payload.employer_identification =
      if (/\w+\.employer_identification\s*=/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders, `Escrituras directas del Internal ID: ${offenders.join(", ")}`).toEqual([]);
  });

  it("la etiqueta visible del campo es Internal ID", () => {
    expect(INTERNAL_ID_LABEL).toBe("Internal ID");
  });

  it("no queda la etiqueta legacy 'ID Stafly' en la UI", () => {
    const offenders = FILES.filter((f) => readFileSync(f, "utf8").includes("ID Stafly"));
    expect(offenders, `Etiqueta legacy encontrada en: ${offenders.join(", ")}`).toEqual([]);
  });
});
