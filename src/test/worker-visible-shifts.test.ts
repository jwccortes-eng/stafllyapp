import { describe, it, expect } from "vitest";
import { buildEmployeeIdentitySet } from "@/lib/identity/identity-set";
import { filterWorkerVisibleShifts } from "@/lib/shifts/worker-visible-shifts";

const CO = "co-1";
const OTHER_CO = "co-2";
const CANON = "emp-canonical";
const SHADOW = "emp-shadow";

const canonRow = { id: CANON, company_id: CO, merged_into_employee_id: null };
const shadowRow = { id: SHADOW, company_id: CO, merged_into_employee_id: CANON };

const publishedShift = (id: string) => ({
  id,
  company_id: CO,
  status: "published",
  publication_status: "published",
  deleted_at: null,
  slots: 2,
});

const activeAssignment = (employee_id: string, shift: any) => ({
  id: `a-${employee_id}-${shift.id}`,
  employee_id,
  company_id: CO,
  status: "confirmed",
  response_status: "pending",
  is_draft_reservation: false,
  scheduled_shifts: shift,
});

describe("identity set", () => {
  it("expande canónico + sombra del mismo tenant", () => {
    const set = buildEmployeeIdentitySet(canonRow, [canonRow, shadowRow]);
    expect(set.canonical_employee_id).toBe(CANON);
    expect(set.related_employee_ids.sort()).toEqual([CANON, SHADOW].sort());
  });

  it("normaliza al canónico cuando la semilla es una sombra", () => {
    const set = buildEmployeeIdentitySet(shadowRow, [canonRow, shadowRow]);
    expect(set.canonical_employee_id).toBe(CANON);
  });

  it("nunca cruza tenants", () => {
    const foreign = { id: "emp-x", company_id: OTHER_CO, merged_into_employee_id: CANON };
    const set = buildEmployeeIdentitySet(canonRow, [canonRow, foreign]);
    expect(set.related_employee_ids).toEqual([CANON]);
    expect(set.had_discarded_candidates).toBe(true);
  });

  it("no expande por parecido sin vínculo canónico", () => {
    const lookalike = { id: "emp-y", company_id: CO, merged_into_employee_id: null };
    const set = buildEmployeeIdentitySet(canonRow, [canonRow, lookalike]);
    expect(set.related_employee_ids).toEqual([CANON]);
  });
});

describe("worker visible shifts", () => {
  const ids = [CANON, SHADOW];

  it("A · canónico con asignación directa → visible", () => {
    const rows = [activeAssignment(CANON, publishedShift("s1"))];
    const out = filterWorkerVisibleShifts({ rows, companyId: CO, identityEmployeeIds: ids });
    expect(out).toHaveLength(1);
    expect(out[0].from_shadow_identity).toBe(false);
  });

  it("B/G · asignación histórica en ficha fusionada → visible", () => {
    const rows = [activeAssignment(SHADOW, publishedShift("s2"))];
    const out = filterWorkerVisibleShifts({ rows, companyId: CO, identityEmployeeIds: ids });
    expect(out).toHaveLength(1);
    expect(out[0].from_shadow_identity).toBe(true);
  });

  it("C · sombra de otra persona → NO visible", () => {
    const rows = [activeAssignment("emp-someone-else", publishedShift("s3"))];
    const out = filterWorkerVisibleShifts({ rows, companyId: CO, identityEmployeeIds: ids });
    expect(out).toHaveLength(0);
  });

  it("D · otra empresa → NO visible", () => {
    const shift = { ...publishedShift("s4"), company_id: OTHER_CO };
    const rows = [{ ...activeAssignment(CANON, shift), company_id: OTHER_CO }];
    const out = filterWorkerVisibleShifts({ rows, companyId: CO, identityEmployeeIds: ids });
    expect(out).toHaveLength(0);
  });

  it("E · borrador / reserva de borrador → NO visible", () => {
    const draft = { ...publishedShift("s5"), publication_status: "draft", status: "draft" };
    const rows = [
      activeAssignment(CANON, draft),
      { ...activeAssignment(SHADOW, publishedShift("s6")), is_draft_reservation: true },
    ];
    const out = filterWorkerVisibleShifts({ rows, companyId: CO, identityEmployeeIds: ids });
    expect(out).toHaveLength(0);
  });

  it("H · removida / rechazada / cancelada → NO visible", () => {
    const rows = [
      { ...activeAssignment(CANON, publishedShift("s7")), status: "removed" },
      { ...activeAssignment(SHADOW, publishedShift("s8")), status: "rejected" },
      activeAssignment(CANON, { ...publishedShift("s9"), status: "cancelled" }),
    ];
    const out = filterWorkerVisibleShifts({ rows, companyId: CO, identityEmployeeIds: ids });
    expect(out).toHaveLength(0);
  });
});
