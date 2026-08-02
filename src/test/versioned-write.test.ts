/**
 * P0 — VWC Fase 6: carril único de escritura.
 *
 * Ninguna superficie nueva puede escribir `scheduled_shifts` con un
 * `.update(...)` directo. El carril autorizado es `versionedWrite` o una RPC
 * transaccional. El array `TEMPORARY_EXCEPTIONS` es el inventario explícito
 * de consumidores heredados aún no migrados: sólo puede reducirse.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildPatch, rowVersion } from "@/lib/data/versioned-write";
import { sameShiftUpdateValue } from "@/lib/shifts/update-shift";

const TEMPORARY_EXCEPTIONS = [
  // Helper heredado: se mantiene mientras existan consumidores no migrados.
  "src/lib/shifts/update-shift.ts",
  // Soft-delete y publicación: transiciones de estado (Clase C), migran en Fase 2.
  "src/pages/admin/Shifts.tsx",
  "src/components/shifts/ShiftDetailDialog.tsx",
  // Roles de conductor y campo legado.
  "src/lib/shifts/driver-sync.ts",
  // Importaciones masivas auditadas.
  "src/pages/admin/ImportSchedule.tsx",
  "src/pages/admin/ImportWizard.tsx",
  // Tokens QR / enlace: no son atributos operativos editables por el operador.
  "src/components/shifts/ShiftQRSection.tsx",
  "src/components/shifts/ShiftShareMenu.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("VWC — diff canónico", () => {
  it("sólo envía campos modificados", () => {
    const patch = buildPatch(
      { title: "A", meeting_point: "Puerta 1", start_time: "08:00:00" },
      { title: "A", meeting_point: "Puerta 2", start_time: "08:00" },
    );
    expect(patch).toEqual({ meeting_point: "Puerta 2" });
  });

  it("no considera cambio una hora con distinto formato", () => {
    expect(sameShiftUpdateValue("17:00", "17:00:00")).toBe(true);
    expect(buildPatch({ start_time: "17:00:00" }, { start_time: "17:00" })).toEqual({});
  });

  it("lee la versión observable de la fila", () => {
    expect(rowVersion({ version: 4 })).toBe(4);
    expect(rowVersion({})).toBeNull();
    expect(rowVersion(null)).toBeNull();
  });
});

describe("VWC — carril único de escritura de servicios", () => {
  it("no hay .update() directos nuevos sobre scheduled_shifts", () => {
    const offenders = walk("src")
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /from\("scheduled_shifts"\)[\s\S]{0,80}?\.update\(/.test(source);
      })
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => !TEMPORARY_EXCEPTIONS.includes(f));

    expect(offenders).toEqual([]);
  });
});
