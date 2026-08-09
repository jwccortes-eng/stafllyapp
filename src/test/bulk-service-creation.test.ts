/**
 * P0 — BULK SERVICE CREATION
 *
 * La creación masiva es una vista operativa, no un importador: mismas reglas
 * de identidad, pendientes e idempotencia que el motor canónico de Servicios.
 */
import { describe, it, expect } from "vitest";

import {
  buildBulkPlan,
  buildBulkPreview,
  bulkRowSourceRef,
  bulkRowToSnapshot,
  duplicateBulkRow,
  newBulkRow,
  parseBulkRowRef,
  parsePastedDates,
  summarizeBulkOutcomes,
  validateBulkRow,
} from "@/lib/shifts/bulk-service-creation";
import { buildCanonicalServiceInsert } from "@/lib/shifts/recurrence";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const BATCH = "batch-1";

describe("Pegar fechas", () => {
  it("convierte el caso Imperial en 9 filas", () => {
    const text = ["Aug 30", "Aug 31", "Sep 1", "Sep 2", "Sep 3", "Sep 4", "Sep 5", "Sep 6", "Sep 7"].join("\n");
    const { dates, unparsed } = parsePastedDates(text, "2026-08-01");
    expect(dates).toHaveLength(9);
    expect(dates[0]).toBe("2026-08-30");
    expect(dates[8]).toBe("2026-09-07");
    expect(unparsed).toEqual([]);
  });

  it("acepta ISO, deduplica y reporta lo ilegible", () => {
    const { dates, unparsed } = parsePastedDates("2026-08-30\n2026-08-30\nno es fecha", "2026-08-01");
    expect(dates).toEqual(["2026-08-30"]);
    expect(unparsed).toEqual(["no es fecha"]);
  });
});

describe("Validación de filas", () => {
  it("permite borrador con solo fecha + nombre", () => {
    const row = newBulkRow({ date: "2026-08-30", clientRaw: "Imperial" });
    const v = validateBulkRow(row);
    expect(v.status).toBe("incomplete");
    expect(v.blockers).toEqual([]);
    expect(v.pending).toContain("Personal");
  });

  it("bloquea sólo cuando falta fecha o identidad", () => {
    expect(validateBulkRow(newBulkRow({ clientRaw: "Imperial" })).blockers).toContain("Fecha");
    expect(validateBulkRow(newBulkRow({ date: "2026-08-30" })).blockers).toContain("Cliente, lugar o título");
  });

  it("PENDIENTE no es 0: el personal ausente viaja como NULL", () => {
    const plan = buildBulkPlan({
      rows: [newBulkRow({ date: "2026-08-30", clientRaw: "Imperial" })],
      batchId: BATCH,
      companyId: COMPANY,
    });
    expect(plan.rows[0].headcount).toBeNull();
  });
});

describe("Plan y motor canónico", () => {
  it("cada fila deriva del mismo insert canónico y conserva su fecha", () => {
    const rows = [
      newBulkRow({ id: "r1", date: "2026-08-30", clientId: "cli-imperial", title: "Imperial — Meseros", startTime: "17:00", endTime: "23:00", headcount: 4 }),
      newBulkRow({ id: "r2", date: "2026-09-01", clientId: "cli-imperial", title: "Imperial — Meseros", startTime: "17:00", endTime: "23:00", headcount: 4 }),
    ];
    const plan = buildBulkPlan({ rows, batchId: BATCH, companyId: COMPANY });
    expect(plan.rows).toHaveLength(2);

    const insert = buildCanonicalServiceInsert({
      snapshot: plan.rows[0].snapshot,
      date: plan.rows[0].date,
      sourceRef: plan.rows[0].sourceRef,
      createdBy: "user-1",
      draft: true,
    }) as Record<string, unknown>;

    expect(insert.company_id).toBe(COMPANY);
    expect(insert.date).toBe("2026-08-30");
    expect(insert.client_id).toBe("cli-imperial");
    expect(insert.publication_status).toBe("draft");
    expect(insert.published_at).toBeNull();
    expect(insert.reconciliation_hash).toBe(bulkRowSourceRef(BATCH, "r1"));
  });

  it("mismo día con dos clientes son dos filas independientes", () => {
    const rows = [
      newBulkRow({ id: "a", date: "2026-08-30", clientRaw: "Millennium" }),
      newBulkRow({ id: "b", date: "2026-08-30", clientRaw: "Zemer" }),
    ];
    const plan = buildBulkPlan({ rows, batchId: BATCH, companyId: COMPANY });
    expect(plan.rows).toHaveLength(2);
    expect(new Set(plan.rows.map((r) => r.sourceRef)).size).toBe(2);
  });

  it("duplicar una fila estrena identidad (no colisiona la idempotencia)", () => {
    const row = newBulkRow({ id: "r1", date: "2026-08-30", clientRaw: "Imperial" });
    const copy = duplicateBulkRow(row);
    expect(copy.id).not.toBe(row.id);
    expect(copy.date).toBe(row.date);
  });

  it("la referencia por fila es estable y reversible", () => {
    const ref = bulkRowSourceRef(BATCH, "r1");
    expect(bulkRowSourceRef(BATCH, "r1")).toBe(ref);
    expect(parseBulkRowRef(ref)).toEqual({ batchId: BATCH, rowId: "r1" });
    expect(parseBulkRowRef("series:x:2026-08-30")).toBeNull();
  });

  it("50 filas cruzando mes producen 50 ocurrencias únicas", () => {
    const rows = Array.from({ length: 50 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 7, 15));
      d.setUTCDate(d.getUTCDate() + i);
      return newBulkRow({ date: d.toISOString().slice(0, 10), clientRaw: "Eminence" });
    });
    const plan = buildBulkPlan({ rows, batchId: BATCH, companyId: COMPANY });
    expect(plan.rows).toHaveLength(50);
    expect(new Set(plan.rows.map((r) => r.sourceRef)).size).toBe(50);
    expect(plan.rows.some((r) => r.date.startsWith("2026-09"))).toBe(true);
  });
});

describe("Pendientes preservados y vista previa", () => {
  it("lo escrito y no vinculado se conserva en notas", () => {
    const snap = bulkRowToSnapshot(
      newBulkRow({ date: "2026-08-30", clientRaw: "Imperial", locationRaw: "Salón A" }),
      COMPANY,
    );
    expect(snap.notes).toContain("Imperial");
    expect(snap.notes).toContain("Salón A");
    expect(snap.clientId).toBeNull();
    expect(snap.publicationIntent).toBe("draft");
  });

  it("la vista previa muestra exactamente lo que se creará, todo en borrador", () => {
    const rows = ["2026-08-30", "2026-08-31"].map((date) =>
      newBulkRow({ date, clientRaw: "Imperial", startTime: "17:00" }),
    );
    const preview = buildBulkPreview(buildBulkPlan({ rows, batchId: BATCH, companyId: COMPANY }));
    expect(preview.total).toBe(2);
    expect(preview.rows.every((r) => r.publication === "draft")).toBe(true);
    expect(preview.rows[0].schedule).toContain("fin pendiente");
    expect(preview.pending).toContain("Personal");
  });

  it("resume los resultados sin ocultar fallos", () => {
    const s = summarizeBulkOutcomes([
      { rowId: "a", date: "d", status: "created", shiftId: "1", ref: "QK-1", error: null },
      { rowId: "b", date: "d", status: "reused", shiftId: "2", ref: "QK-2", error: null },
      { rowId: "c", date: "d", status: "failed", shiftId: null, ref: null, error: "x" },
    ]);
    expect(s).toEqual({ total: 3, created: 1, reused: 1, failed: 1 });
  });
});
