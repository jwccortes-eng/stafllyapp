import { describe, it, expect } from "vitest";
import type { BulkPreviewRow } from "@/lib/payroll/bulk-publish";
import type { PersonRecord } from "@/lib/identity/canonical-person";
import {
  assertUniqueReceiptCandidates,
  resolveReceiptCandidacy,
} from "@/lib/payroll/receipt-candidates";
import {
  deriveDistributionRow,
  summarizeDistribution,
} from "@/lib/payroll/receipt-distribution";

const C = "00000000-0000-0000-0000-000000000001";

const preview = (p: Partial<BulkPreviewRow> & { employee_id: string }): BulkPreviewRow => ({
  employer_identification: null,
  worker_name: "X",
  company_id: C,
  base: 0,
  extras: 0,
  deductions: 0,
  computed_total: 0,
  approved_total_override: null,
  approved_total_source: null,
  frozen_total_preview: 0,
  has_override: false,
  pending_count: 0,
  line_count: 0,
  statement_id: null,
  statement_status: null,
  published_frozen_total: null,
  published_at: null,
  portal_access: true,
  readiness: "ready",
  blocking_reason: null,
  ...p,
});

const person = (p: Partial<PersonRecord> & { id: string }): PersonRecord => ({
  company_id: C,
  first_name: null,
  last_name: null,
  phone_number: null,
  email: null,
  user_id: null,
  is_active: true,
  merged_into_employee_id: null,
  ...p,
});

describe("canonical receipt candidacy", () => {
  it("Angel Colon: confirmed duplicate → canonical eligible, auxiliary excluded", () => {
    const rows = [
      preview({
        employee_id: "angel-canon",
        worker_name: "Angel Colon",
        base: 82.5,
        approved_total_override: 607.5,
        frozen_total_preview: 607.5,
      }),
      preview({
        employee_id: "angel-aux",
        worker_name: "Angel Colon",
        extras: 525,
        computed_total: 525,
        frozen_total_preview: 525,
        portal_access: false,
      }),
    ];
    const people = {
      "angel-canon": person({
        id: "angel-canon",
        first_name: "Angel",
        last_name: "Colon",
        phone_number: "3473132118",
        email: "angel@example.com",
        user_id: "u-angel",
      }),
      "angel-aux": person({
        id: "angel-aux",
        first_name: "Angel",
        last_name: "Colon",
        phone_number: "+1 347 313 2118",
        email: "angel@example.com",
        is_active: false,
      }),
    };
    const c = resolveReceiptCandidacy(rows, people);
    expect(c["angel-canon"].role).toBe("canonical_candidate");
    expect(c["angel-aux"].role).toBe("auxiliary_duplicate");

    const derived = rows.map((r) =>
      deriveDistributionRow(r, { employee: people[r.employee_id], candidacy: c[r.employee_id] }),
    );
    expect(derived[0].eligible).toBe(true);
    expect(derived[1].eligible).toBe(false);
    expect(derived[1].status).toBe("AUXILIARY_DUPLICATE");

    const s = summarizeDistribution(derived);
    expect(s.approved).toBe(1);
    expect(s.auxiliary).toBe(1);
    expect(s.noAccount).toBe(0);
  });

  it("Edinson / Francisco: unresolved identity → nobody is publishable", () => {
    const rows = [
      preview({
        employee_id: "canon",
        worker_name: "Edinson Leon",
        base: 97.5,
        approved_total_override: 497.5,
        frozen_total_preview: 497.5,
        portal_access: false,
      }),
      preview({
        employee_id: "aux",
        worker_name: "Edinson Leon",
        extras: 400,
        computed_total: 400,
        frozen_total_preview: 400,
      }),
    ];
    const people = {
      canon: person({ id: "canon", first_name: "Edinson", last_name: "Leon" }),
      aux: person({
        id: "aux",
        first_name: "Edinson",
        last_name: "Leon",
        phone_number: "3478325243",
      }),
    };
    const c = resolveReceiptCandidacy(rows, people);
    expect(c["canon"].role).toBe("identity_review");
    expect(c["aux"].role).toBe("auxiliary_duplicate");

    const derived = rows.map((r) =>
      deriveDistributionRow(r, { employee: people[r.employee_id], candidacy: c[r.employee_id] }),
    );
    expect(derived.every((d) => !d.eligible)).toBe(true);
    expect(derived[0].status).toBe("IDENTITY_REVIEW");
  });

  it("movement-only row without payroll is never a receipt candidate", () => {
    const rows = [preview({ employee_id: "solo", extras: 400, frozen_total_preview: 400 })];
    const c = resolveReceiptCandidacy(rows, {});
    expect(c["solo"].role).toBe("auxiliary_no_approved_payroll");
    expect(deriveDistributionRow(rows[0], { candidacy: c["solo"] }).eligible).toBe(false);
  });

  it("a normal worker with approved payroll stays eligible", () => {
    const rows = [
      preview({
        employee_id: "ok",
        base: 500,
        approved_total_override: 500,
        frozen_total_preview: 500,
      }),
    ];
    const c = resolveReceiptCandidacy(rows, {
      ok: person({ id: "ok", first_name: "Ana", last_name: "Diaz", user_id: "u1" }),
    });
    expect(c["ok"].role).toBe("canonical_candidate");
    expect(deriveDistributionRow(rows[0], { candidacy: c["ok"] }).eligible).toBe(true);
  });

  it("a published receipt is preserved as canonical authority", () => {
    const rows = [
      preview({
        employee_id: "pub",
        readiness: "published",
        approved_total_override: 567,
        published_frozen_total: 567,
        frozen_total_preview: 567,
      }),
    ];
    const c = resolveReceiptCandidacy(rows, {});
    expect(c["pub"].role).toBe("canonical_candidate");
    const d = deriveDistributionRow(rows[0], { candidacy: c["pub"] });
    expect(d.status).toBe("PUBLISHED_VISIBLE");
    expect(d.amount).toBe(567);
  });

  it("uniqueness assertion detects two candidates of the same person", () => {
    const conflicts = assertUniqueReceiptCandidates([
      { employeeId: "a", candidacy: { groupKey: "a|b" } as never },
      { employeeId: "b", candidacy: { groupKey: "a|b" } as never },
      { employeeId: "c", candidacy: { groupKey: "c" } as never },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].employeeIds.sort()).toEqual(["a", "b"]);
  });
});
