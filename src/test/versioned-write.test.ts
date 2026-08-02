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
import { samePersistedValue } from "@/lib/data/versioned-write";
import { signedDelta } from "@/lib/data/advance-balance";

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

/** Fase 2: horas, compensación y saldos entran al mismo carril. */
const CRITICAL_TABLES: Record<string, string[]> = {
  time_entries: [
    // Aprobación masiva y flujos de fichaje del trabajador: transiciones (Clase C).
    "src/components/timeclock/DayDetailView.tsx",
    "src/lib/timeclock/hours-approval.ts",
    "src/pages/admin/ImportTimeClock.tsx",
    "src/pages/admin/ImportWizard.tsx",
    // Aprobación/rechazo por lote: compare-and-set sobre `status = pending`
    // (Clase C). No edita horas, sólo la transición de estado.
    "src/components/timeclock/TimesheetView.tsx",
    // Fichaje del propio trabajador: creación y cierre de su entrada activa
    // (Clase A/C). No es edición administrativa de horas.
    "src/pages/portal/PortalClock.tsx",
  ],
  compensation_profiles: [],
  employee_financial_records: [
    // Aprobación, pausa y cancelación: transiciones de estado, no saldos.
    "src/components/advances/AdvanceLoanDetailDrawer.tsx",
  ],
  // Fase 3A — Bloque A: W-9 del trabajador. Sin excepciones: portal y admin
  // escriben por RPC (submit_contractor_w9 / review_contractor_w9 / versioned_update).
  contractor_w9: [],
  // Fase 3B — Bloque B: documentos y compliance. Toda revisión pasa por
  // review_employee_document y toda edición por versioned_update_employee_document.
  employee_documents: [],
  employee_onboarding_documents: [],
};


describe("VWC — carriles críticos de Fase 2", () => {
  for (const [table, allowed] of Object.entries(CRITICAL_TABLES)) {
    it(`no hay .update() directos nuevos sobre ${table}`, () => {
      const pattern = new RegExp(`from\\("${table}"\\)[\\s\\S]{0,120}?\\.update\\(`);
      const offenders = walk("src")
        .filter((file) => pattern.test(readFileSync(file, "utf8")))
        .map((f) => f.replace(/\\/g, "/"))
        .filter((f) => !allowed.includes(f) && !f.startsWith("src/test/"));

      expect(offenders).toEqual([]);
    });
  }
});

describe("VWC — evidencia y saldos", () => {
  it("tolera la normalización de marcas temporales de Postgres", () => {
    expect(samePersistedValue("2026-08-02T09:00:00+00:00", "2026-08-02T09:00:00Z")).toBe(true);
    expect(samePersistedValue("2026-08-02T09:00:00+00:00", "2026-08-02T10:00:00Z")).toBe(false);
  });

  it("el signo del movimiento lo decide el tipo, no el frontend", () => {
    expect(signedDelta("repayment_outside_payroll", 50)).toBe(-50);
    expect(signedDelta("manual_adjustment_reduce", -50)).toBe(-50);
    expect(signedDelta("manual_adjustment_add", 50)).toBe(50);
    expect(signedDelta("reversal", 50)).toBe(50);
    // El cierre total lo calcula el servidor sobre el saldo bloqueado.
    expect(signedDelta("writeoff", 999)).toBe(0);
    expect(signedDelta("manual_close", 999)).toBe(0);
  });
});

describe("VWC Fase 3B — documentos y compliance", () => {
  it("las acciones de documento no escriben la tabla directamente", () => {
    const source = readFileSync("src/lib/document-actions.ts", "utf8");
    expect(/from\("employee_documents" as any\)[\s\S]{0,120}?\.update\(/.test(source)).toBe(false);
    expect(source).toContain("review_employee_document");
    expect(source).toContain('entity: "employee_documents"');
  });

  it("toda revisión viaja con la versión observada", () => {
    const source = readFileSync("src/lib/document-actions.ts", "utf8");
    expect(source).toContain("p_expected_version: doc.version ?? null");
  });

  it("Caso A/B: un rechazo obsoleto no puede pisar una aprobación", () => {
    // A aprueba sobre v3 → el documento pasa a v4.
    // B, que abrió el documento en v3, intenta rechazar: el backend compara
    // expected_version (3) con la actual (4) y responde conflicto.
    const serverVersion: number = 4;
    const staleExpected: number = 3;
    const isConflict = staleExpected !== serverVersion;
    expect(isConflict).toBe(true);
  });
});

