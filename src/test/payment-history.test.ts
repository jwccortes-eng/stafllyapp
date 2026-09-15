import { describe, it, expect } from "vitest";
import {
  mergePaymentHistory,
  summarizePaymentHistory,
  type HistoricalPayReport,
} from "@/lib/payroll/payment-history";
import type { WorkerPayStatementSummary } from "@/lib/payroll/pay-statement";

function statement(over: Partial<WorkerPayStatementSummary>): WorkerPayStatementSummary {
  return {
    statement_id: "s1",
    company_id: "c1",
    company_name: "Quality Staff",
    period_id: "p148",
    start_date: "2026-09-02",
    end_date: "2026-09-08",
    sequence_number: 148,
    source: "external_approved",
    frozen_total: 567,
    frozen_base_total: 1219,
    frozen_extras_total: 0,
    frozen_deductions_total: -652,
    line_count: 3,
    published_at: "2026-09-15T17:33:35Z",
    paid_at: null,
    ...over,
  };
}

const hist = (over: Partial<HistoricalPayReport>): HistoricalPayReport => ({
  period_id: "p129",
  start_date: "2026-04-22",
  end_date: "2026-04-28",
  sequence_number: 129,
  amount: 93.5,
  company_id: "c1",
  ...over,
});

describe("mergePaymentHistory", () => {
  it("muestra el recibo nativo y los históricos, más reciente primero", () => {
    const items = mergePaymentHistory(
      [statement({})],
      [
        hist({}),
        hist({ period_id: "p128", start_date: "2026-04-15", end_date: "2026-04-21", amount: 204.5 }),
        hist({ period_id: "p124", start_date: "2026-03-18", end_date: "2026-03-24", amount: 575 }),
      ],
    );
    expect(items.map((i) => i.amount)).toEqual([567, 93.5, 204.5, 575]);
    expect(items[0].kind).toBe("native");
    expect(items.slice(1).every((i) => i.kind === "historical")).toBe(true);
  });

  it("no duplica un periodo con recibo nativo e histórico", () => {
    const items = mergePaymentHistory(
      [statement({})],
      [hist({ period_id: "p148", start_date: "2026-09-02", end_date: "2026-09-08", amount: 1219 })],
    );
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("native");
    expect(items[0].amount).toBe(567);
  });

  it("no colapsa el mismo periodo de empresas distintas", () => {
    const items = mergePaymentHistory(
      [statement({})],
      [hist({ period_id: "p148", company_id: "c2", start_date: "2026-09-02", end_date: "2026-09-08", amount: 100 })],
    );
    expect(items).toHaveLength(2);
  });

  it("resume conteo, último y acumulado del año", () => {
    const items = mergePaymentHistory(
      [statement({})],
      [hist({}), hist({ period_id: "p124", start_date: "2025-12-30", end_date: "2026-01-05", amount: 575 })],
    );
    const s = summarizePaymentHistory(items, new Date("2026-09-15T00:00:00Z"));
    expect(s.count).toBe(3);
    expect(s.latest).toBe(567);
    expect(s.ytd).toBe(567 + 93.5 + 575);
    expect(s.nativeCount).toBe(1);
    expect(s.historicalCount).toBe(2);
  });
});
