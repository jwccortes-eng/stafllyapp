import { describe, it, expect } from "vitest";
import type { BulkPreviewRow } from "@/lib/payroll/bulk-publish";
import {
  buildDistributionSignal,
  deriveDistributionRow,
  matchesDistributionFilter,
  summarizeDistribution,
} from "@/lib/payroll/receipt-distribution";

const base: BulkPreviewRow = {
  employee_id: "e1",
  employer_identification: "100",
  worker_name: "Jorge Cortes",
  company_id: "c1",
  base: 649,
  extras: 900,
  deductions: 530,
  computed_total: 1019,
  approved_total_override: 1239,
  approved_total_source: "external_approved",
  frozen_total_preview: 1239,
  has_override: true,
  pending_count: 0,
  line_count: 3,
  statement_id: null,
  statement_status: null,
  published_frozen_total: null,
  published_at: null,
  portal_access: true,
  readiness: "ready",
  blocking_reason: null,
};

const row = (p: Partial<BulkPreviewRow>): BulkPreviewRow => ({ ...base, ...p });

describe("derived receipt distribution status", () => {
  it("ready + portal access = READY_TO_PUBLISH", () => {
    expect(deriveDistributionRow(row({}), { employee: { user_id: "u1" } }).status).toBe(
      "READY_TO_PUBLISH",
    );
  });

  it("ready without account = NEEDS_ACCOUNT, still eligible", () => {
    const r = deriveDistributionRow(row({ portal_access: false }), {
      employee: { user_id: null, is_active: true },
    });
    expect(r.status).toBe("NEEDS_ACCOUNT");
    expect(r.eligible).toBe(true);
  });

  it("pending adjustment blocks publication (Jorge Cortes, periodo 146)", () => {
    const r = deriveDistributionRow(
      row({ readiness: "blocked", pending_count: 1, blocking_reason: "1 movimiento pendiente" }),
      { employee: { user_id: "u1" } },
    );
    expect(r.status).toBe("BLOCKED_PENDING_ADJUSTMENT");
    expect(r.eligible).toBe(false);
  });

  it("published + access = PUBLISHED_VISIBLE and uses the frozen total", () => {
    const r = deriveDistributionRow(
      row({ readiness: "published", published_frozen_total: 1239, statement_status: "published" }),
      { employee: { user_id: "u1" } },
    );
    expect(r.status).toBe("PUBLISHED_VISIBLE");
    expect(r.amount).toBe(1239);
  });

  it("published without access = PUBLISHED_NO_ACCESS", () => {
    const r = deriveDistributionRow(
      row({ readiness: "published", portal_access: false, published_frozen_total: 500 }),
      { employee: { user_id: null, is_active: true } },
    );
    expect(r.status).toBe("PUBLISHED_NO_ACCESS");
  });

  it("missing contact is never identity review", () => {
    const r = deriveDistributionRow(row({ portal_access: false }), {
      employee: { user_id: null, is_active: true, phone_number: null },
    });
    expect(r.status).toBe("NEEDS_ACCOUNT");
  });

  it("accepted invitation without linked account = IDENTITY_REVIEW", () => {
    const r = deriveDistributionRow(row({ portal_access: false }), {
      employee: { user_id: null, is_active: true },
      invitation: { status: "accepted" },
    });
    expect(r.status).toBe("IDENTITY_REVIEW");
  });
});

describe("summary and filters", () => {
  const rows = [
    deriveDistributionRow(row({ employee_id: "a" }), { employee: { user_id: "u" } }),
    deriveDistributionRow(row({ employee_id: "b", portal_access: false }), {
      employee: { user_id: null, is_active: true },
    }),
    deriveDistributionRow(
      row({ employee_id: "c", readiness: "blocked", blocking_reason: "2 movimientos pendientes" }),
      { employee: { user_id: "u" } },
    ),
    deriveDistributionRow(
      row({ employee_id: "d", readiness: "published", published_frozen_total: 100 }),
      { employee: { user_id: "u" } },
    ),
  ];

  it("keeps states separate", () => {
    const s = summarizeDistribution(rows);
    expect(s).toMatchObject({
      approved: 4,
      ready: 1,
      noAccount: 1,
      blocked: 1,
      published: 1,
      visible: 1,
      publishedNoAccess: 0,
    });
  });

  it("each KPI filter matches its rows", () => {
    expect(rows.filter((r) => matchesDistributionFilter(r, "ready")).length).toBe(1);
    expect(rows.filter((r) => matchesDistributionFilter(r, "no_account")).length).toBe(1);
    expect(rows.filter((r) => matchesDistributionFilter(r, "blocked")).length).toBe(1);
    expect(rows.filter((r) => matchesDistributionFilter(r, "published")).length).toBe(1);
    expect(rows.filter((r) => matchesDistributionFilter(r, "all")).length).toBe(4);
  });

  it("emits an operational signal pointing to the same queue", () => {
    const signal = buildDistributionSignal("p1", summarizeDistribution(rows));
    expect(signal?.key).toBe("PAYROLL_RECEIPTS_PENDING_DISTRIBUTION");
    expect(signal?.href).toContain("periodId=p1");
  });
});
