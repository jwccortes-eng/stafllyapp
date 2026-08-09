/**
 * P0 — CONNECTEAM EXPORT · 3 SERVICIOS SELECCIONADOS ⇒ 3 FILAS
 *
 * Reproduce el caso real del video (Quality Staff, agosto 2026):
 *   QK-001578 · Luminance · 18/08 00:08 → 00:09
 *   QK-001579 · Imperial  · 18/08 00:08 → 00:08   ← duración cero
 *   QK-001580 · Imperial  · 28/08 00:08 → 00:08   ← duración cero
 *
 * El CSV siempre genera una fila por servicio exportado. Las filas de
 * duración cero son las que Connecteam descarta en silencio: ahora quedan
 * bloqueadas ANTES de salir de Stafly, con motivo explícito.
 */
import { describe, it, expect } from "vitest";
import {
  buildConnecteamRow,
  serializeConnecteamCsv,
  validateShiftForExport,
  countCsvDataRows,
  findDuplicateRowSignatures,
  type BuildContext,
} from "@/lib/integrations/connecteam-export";
import type { Shift } from "@/components/shifts/types";

const buildCtx: BuildContext = {
  clients: [{ id: "cli-1", name: "Luminance Hall" } as any],
  locations: [],
  employees: [],
  assignments: [],
  categories: [],
  defaultTimezone: "America/New_York",
  mapping: null,
};

const validateCtx = {
  isAdmin: true,
  selectedCompanyId: "co-1",
  shiftCompanyId: "co-1",
};

function mk(over: Partial<Shift>): Shift {
  return {
    id: "uuid-" + Math.random().toString(16).slice(2),
    company_id: "co-1",
    title: "Servicio",
    date: "2026-08-18",
    start_time: "00:08:00",
    end_time: "00:09:00",
    slots: 1,
    publication_status: "draft",
    client_id: "cli-1",
    location_id: null,
    notes: null,
    ...over,
  } as unknown as Shift;
}

const luminance = mk({ shift_ref: "QK-001578", shift_code: "345", title: "Luminance" });
const imperial18 = mk({ shift_ref: "QK-001579", shift_code: "346", title: "Imperial", end_time: "00:08:00" });
const imperial28 = mk({ shift_ref: "QK-001580", shift_code: "347", title: "Imperial", date: "2026-08-28", end_time: "00:08:00" });

describe("connecteam export multi-shift — una fila por servicio", () => {
  it("3 servicios seleccionados ⇒ 3 filas de datos en el CSV", () => {
    const rows = [luminance, imperial18, imperial28].map(s => buildConnecteamRow(s, buildCtx));
    const csv = serializeConnecteamCsv(rows);
    expect(rows).toHaveLength(3);
    expect(countCsvDataRows(csv)).toBe(3);
  });

  it("no colapsa servicios distintos con el mismo título y fecha", () => {
    const rows = [
      buildConnecteamRow(mk({ shift_ref: "QK-001579", title: "Imperial" }), buildCtx),
      buildConnecteamRow(mk({ shift_ref: "QK-001581", title: "Imperial" }), buildCtx),
    ];
    expect(findDuplicateRowSignatures(rows)).toEqual([]);
    expect(rows[0]["Shift title"]).not.toBe(rows[1]["Shift title"]);
  });

  it("detecta colisión real cuando dos filas son idénticas para Connecteam", () => {
    const same = buildConnecteamRow(mk({ shift_ref: null, title: "Imperial" }), buildCtx);
    expect(findDuplicateRowSignatures([same, same])).toHaveLength(1);
  });

  it("FASE E · Shift title lleva la referencia humana, nunca el UUID", () => {
    const row = buildConnecteamRow(luminance, buildCtx);
    expect(row["Shift title"]).toBe("QK-001578 · Luminance");
    expect(row["Shift title"]).not.toContain(luminance.id);
    expect(row.Note).toContain("Ref: QK-001578");
  });

  it("bloquea las filas de duración cero que Connecteam descartaría", () => {
    const ok = validateShiftForExport(luminance, buildCtx, validateCtx);
    const zero = validateShiftForExport(imperial18, buildCtx, validateCtx);
    expect(ok.warnings.some(w => w.code === "zero_duration")).toBe(false);
    expect(zero.status).toBe("blocked");
    expect(zero.warnings.some(w => w.code === "zero_duration")).toBe(true);
  });
});
