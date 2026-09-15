import { describe, it, expect } from "vitest";
import { detectFileRange, evaluatePayrollImportGuards } from "../import-period-guard";

const open = { start_date: "2026-08-26", end_date: "2026-09-01", status: "open" };

describe("detectFileRange", () => {
  it("lee el rango ISO del nombre del archivo", () => {
    expect(detectFileRange("146 UNTITLED_REPORT_2026-08-19_2026-08-25.xlsx")).toEqual({
      start: "2026-08-19",
      end: "2026-08-25",
    });
  });

  it("devuelve null cuando no hay fechas", () => {
    expect(detectFileRange("cierre.xlsx")).toBeNull();
  });
});

describe("evaluatePayrollImportGuards", () => {
  it("permite un archivo que coincide con un periodo abierto sin recibos", () => {
    const r = evaluatePayrollImportGuards({
      fileName: "cierre_2026-08-26_2026-09-01.xlsx",
      period: open,
      publishedStatements: 0,
    });
    expect(r.blockers).toEqual([]);
  });

  it("bloquea cuando el rango del archivo no coincide", () => {
    const r = evaluatePayrollImportGuards({
      fileName: "146 UNTITLED_REPORT_2026-08-19_2026-08-25.xlsx",
      period: open,
      publishedStatements: 0,
    });
    expect(r.blockers[0]).toContain("2026-08-19");
    expect(r.blockers[0]).toContain("2026-08-26");
  });

  it("bloquea periodos cerrados", () => {
    const r = evaluatePayrollImportGuards({
      fileName: "cierre_2026-08-19_2026-08-25.xlsx",
      period: { start_date: "2026-08-19", end_date: "2026-08-25", status: "closed" },
      publishedStatements: 0,
    });
    expect(r.blockers).toContain("Este período está cerrado y no acepta nuevas importaciones.");
  });

  it("bloquea periodos con recibos publicados", () => {
    const r = evaluatePayrollImportGuards({
      fileName: "cierre_2026-08-26_2026-09-01.xlsx",
      period: open,
      publishedStatements: 5,
    });
    expect(r.blockers.some((b) => b.includes("recibo(s) publicado(s)"))).toBe(true);
  });

  it("avisa sin bloquear cuando el archivo no declara fechas", () => {
    const r = evaluatePayrollImportGuards({
      fileName: "cierre.xlsx",
      period: open,
      publishedStatements: 0,
    });
    expect(r.blockers).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });
});
