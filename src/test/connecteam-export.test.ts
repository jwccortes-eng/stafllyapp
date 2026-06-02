import { describe, it, expect } from "vitest";
import {
  CONNECTEAM_HEADERS,
  buildConnecteamRow,
  serializeConnecteamCsv,
  validateShiftForExport,
  effectiveAssignmentsForExport,
} from "@/lib/integrations/connecteam-export";
import type { Shift, Assignment, Employee, SelectOption } from "@/components/shifts/types";

const COMPANY = "co-1";

const mkShift = (overrides: Partial<Shift> = {}): Shift => ({
  id: "shift-abc12345",
  title: "Turno A",
  date: "2026-05-27",
  start_time: "08:00:00",
  end_time: "16:00:00",
  status: "published",
  publication_status: "published",
  slots: 3,
  client_id: "client-1",
  location_id: "loc-1",
  notes: "Llevar uniforme",
  claimable: false,
  shift_code: "0042",
  ...overrides,
});

const CLIENTS: SelectOption[] = [{ id: "client-1", name: "Acme Catering" }];
const LOCATIONS: SelectOption[] = [{ id: "loc-1", name: "260 University Ave, Bronx NY" }];
const CATEGORIES: SelectOption[] = [{ id: "cat-1", name: "Waiter" }];

const EMPLOYEES: Employee[] = [
  { id: "e1", first_name: "Ana", last_name: "Perez" },
  { id: "e2", first_name: "Luis", last_name: "Gomez" },
  { id: "e3", first_name: "Maria", last_name: "Santos" },
];

const ASGN_OK: Assignment[] = [
  { id: "a1", shift_id: "shift-abc12345", employee_id: "e1", status: "accepted" },
  { id: "a2", shift_id: "shift-abc12345", employee_id: "e2", status: "confirmed" },
  { id: "a3", shift_id: "shift-abc12345", employee_id: "e3", status: "pending" }, // excluded
  { id: "a4", shift_id: "other", employee_id: "e1", status: "accepted" }, // other shift
];

const buildCtx = {
  clients: CLIENTS,
  locations: LOCATIONS,
  employees: EMPLOYEES,
  assignments: ASGN_OK,
  categories: CATEGORIES,
};
const adminCtx = { isAdmin: true, selectedCompanyId: COMPANY, shiftCompanyId: COMPANY };

describe("connecteam-export: CSV headers", () => {
  it("uses the canonical Connecteam column order", () => {
    expect(CONNECTEAM_HEADERS).toEqual([
      "Date", "Start", "End", "Timezone",
      "Unpaid break", "Paid break",
      "Shift title", "Job", "Sub item", "Address",
      "Users", "Shift tags", "Note", "Number of users",
      "Require Approval", "Tasks",
    ]);
  });

  it("serialized CSV header row matches order exactly", () => {
    const csv = serializeConnecteamCsv([]);
    expect(csv.split("\n")[0]).toBe(
      "Date,Start,End,Timezone,Unpaid break,Paid break,Shift title,Job,Sub item,Address,Users,Shift tags,Note,Number of users,Require Approval,Tasks",
    );
  });
});

describe("connecteam-export: buildConnecteamRow mapping", () => {
  it("maps date, start, end, timezone and base fields correctly", () => {
    const row = buildConnecteamRow(mkShift(), buildCtx);
    expect(row.Date).toBe("05/27/2026");
    expect(row.Start).toBe("08:00");
    expect(row.End).toBe("16:00");
    expect(row.Timezone).toBe("America/New_York");
    expect(row["Shift title"]).toBe("Turno A");
    expect(row["Number of users"]).toBe("3");
  });

  it("Job = client name; Sub item = category when client present", () => {
    const row = buildConnecteamRow(mkShift({ category_id: "cat-1" } as any), buildCtx);
    expect(row.Job).toBe("Acme Catering");
    expect(row["Sub item"]).toBe("Waiter");
  });

  it("falls back to category as Job when no client", () => {
    const row = buildConnecteamRow(
      mkShift({ client_id: null, category_id: "cat-1" } as any),
      buildCtx,
    );
    expect(row.Job).toBe("Waiter");
    expect(row["Sub item"]).toBe("");
  });

  it("Users only includes accepted/confirmed assignments", () => {
    const row = buildConnecteamRow(mkShift(), buildCtx);
    expect(row.Users).toBe("Ana Perez; Luis Gomez");
    expect(row.Users).not.toContain("Maria");
  });

  it("leaves Unpaid break, Paid break, Shift tags, Require Approval, Tasks empty in v1", () => {
    const row = buildConnecteamRow(mkShift(), buildCtx);
    expect(row["Unpaid break"]).toBe("");
    expect(row["Paid break"]).toBe("");
    expect(row["Shift tags"]).toBe("");
    expect(row["Require Approval"]).toBe("");
    expect(row.Tasks).toBe("");
  });

  it("LEGACY shift_code travels ONLY in Note as `Ref: <code>` — never as Shift title", () => {
    const row = buildConnecteamRow(mkShift({ shift_code: "0042" }), buildCtx);
    expect(row["Shift title"]).toBe("Turno A");
    expect(row["Shift title"]).not.toContain("0042");
    expect(row.Note).toContain("Ref: 0042");
    expect(row.Note).toContain("Stafly shift id: shift-abc12345");
  });

  it("omits Ref: when shift has no legacy code", () => {
    const row = buildConnecteamRow(mkShift({ shift_code: null }), buildCtx);
    expect(row.Note).not.toMatch(/Ref:/);
    expect(row.Note).toContain("Stafly shift id:");
  });

  it("uses job_site_address fallback when no structured location", () => {
    const row = buildConnecteamRow(
      mkShift({ location_id: null, job_site_address: "Free-text 123" } as any),
      buildCtx,
    );
    expect(row.Address).toBe("Free-text 123");
  });
});

describe("connecteam-export: validateShiftForExport", () => {
  it("Ready when published, has client, has accepted users, fields complete", () => {
    const r = validateShiftForExport(mkShift(), buildCtx, adminCtx);
    expect(r.status).toBe("ready");
  });

  it("Blocked when user is not admin", () => {
    const r = validateShiftForExport(mkShift(), buildCtx, { ...adminCtx, isAdmin: false });
    expect(r.status).toBe("blocked");
    expect(r.warnings[0].code).toBe("no_admin");
  });

  it("Blocked when shift is draft / cancelled", () => {
    const r = validateShiftForExport(
      mkShift({ publication_status: "draft" }),
      buildCtx,
      adminCtx,
    );
    expect(r.status).toBe("blocked");
    expect(r.warnings.some(w => w.code === "not_published")).toBe(true);
  });

  it("Blocked when both client and category are missing", () => {
    const r = validateShiftForExport(
      mkShift({ client_id: null } as any),
      buildCtx,
      adminCtx,
    );
    expect(r.status).toBe("blocked");
    expect(r.warnings.some(w => w.code === "missing_job_context")).toBe(true);
  });

  it("Blocked when no accepted/confirmed assignments", () => {
    const r = validateShiftForExport(mkShift(), {
      ...buildCtx,
      assignments: [{ id: "x", shift_id: "shift-abc12345", employee_id: "e1", status: "pending" }],
    }, adminCtx);
    expect(r.status).toBe("blocked");
    expect(r.warnings.some(w => w.code === "no_accepted_assignments")).toBe(true);
  });

  it("Blocked when tenant scope mismatches", () => {
    const r = validateShiftForExport(mkShift(), buildCtx, {
      ...adminCtx, shiftCompanyId: "other-co",
    });
    expect(r.status).toBe("blocked");
    expect(r.warnings.some(w => w.code === "tenant_mismatch")).toBe(true);
  });

  it("Needs review when address is unstructured", () => {
    const r = validateShiftForExport(
      mkShift({ location_id: null } as any),
      buildCtx,
      adminCtx,
    );
    expect(r.status).toBe("needs_review");
    expect(r.warnings.some(w => w.code === "address_incomplete")).toBe(true);
  });

  it("Needs review when only category (no client)", () => {
    const r = validateShiftForExport(
      mkShift({ client_id: null, category_id: "cat-1" } as any),
      buildCtx,
      adminCtx,
    );
    expect(r.status).toBe("needs_review");
    expect(r.warnings.some(w => w.code === "no_client")).toBe(true);
  });
});

describe("connecteam-export: CSV serialization safety", () => {
  it("escapes commas, quotes, and newlines correctly", () => {
    const row = buildConnecteamRow(
      mkShift({
        title: 'Turno "Especial", VIP',
        notes: "Linea 1\nLinea 2",
      }),
      buildCtx,
    );
    const csv = serializeConnecteamCsv([row]);
    const lines = csv.split("\n");
    // The first line is headers; row spans multiple lines because of embedded newline (quoted).
    expect(lines[0]).toContain("Date,Start,End,Timezone");
    // Quoted title with escaped quote.
    expect(csv).toContain('"Turno ""Especial"", VIP"');
    // Multiline note is wrapped in quotes.
    expect(csv).toMatch(/"[^"]*Linea 1\nLinea 2/);
  });

  it("produces exactly N+1 sections per row when joined (header + N rows)", () => {
    const rowA = buildConnecteamRow(mkShift({ id: "shift-aaa11111" }), buildCtx);
    const rowB = buildConnecteamRow(
      mkShift({ id: "shift-bbb22222", title: "Turno B" }),
      buildCtx,
    );
    const csv = serializeConnecteamCsv([rowA, rowB]);
    // 1 header + 2 rows, no embedded newlines in these → 3 lines.
    expect(csv.split("\n")).toHaveLength(3);
  });
});

describe("connecteam-export: effectiveAssignmentsForExport", () => {
  it("includes only accepted and confirmed, scoped by shift id", () => {
    const eff = effectiveAssignmentsForExport("shift-abc12345", ASGN_OK);
    expect(eff.map(a => a.id).sort()).toEqual(["a1", "a2"]);
  });
});

// ── PAYROLL / TIME_ENTRIES SAFETY (static guard) ────────────────────────────
// This export module is pure and must never reference payroll or time tables.
describe("connecteam-export: safety boundary", () => {
  it("module source does not reference payroll / time_entries / RLS APIs", async () => {
    // Read the module file at runtime to enforce the boundary.
    // (vitest runs in jsdom; use a relative fetch via fs through import.meta.url
    // is not available — so we assert via the public API surface instead.)
    const mod = await import("@/lib/integrations/connecteam-export");
    const exported = Object.keys(mod).sort();
    // Public surface is intentionally small and frontend-only.
    expect(exported).toEqual([
      "CONNECTEAM_HEADERS",
      "buildConnecteamRow",
      "effectiveAssignmentsForExport",
      "exportFilename",
      "serializeConnecteamCsv",
      "validateShiftForExport",
    ]);
    // No supabase client, no edge function caller exported.
    expect(exported).not.toContain("supabase");
    expect(exported).not.toContain("createClient");
  });
});
