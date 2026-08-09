import { describe, it, expect } from "vitest";
import {
  CONNECTEAM_HEADERS,
  buildConnecteamRow,
  serializeConnecteamCsv,
  validateShiftForExport,
  effectiveAssignmentsForExport,
  resolveAddress,
  resolveJob,
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
const LOCATIONS: SelectOption[] = [{ id: "loc-1", name: "Acme Hall" }];
const CATEGORIES: SelectOption[] = [{ id: "cat-1", name: "Waiter" }];

const EMPLOYEES: Employee[] = [
  { id: "e1", first_name: "Ana", last_name: "Perez" },
  { id: "e2", first_name: "Luis", last_name: "Gomez" },
  { id: "e3", first_name: "Maria", last_name: "Santos" },
];

const ASGN_OK: Assignment[] = [
  { id: "a1", shift_id: "shift-abc12345", employee_id: "e1", status: "accepted" },
  { id: "a2", shift_id: "shift-abc12345", employee_id: "e2", status: "confirmed" },
  { id: "a3", shift_id: "shift-abc12345", employee_id: "e3", status: "pending" },
  { id: "a4", shift_id: "other", employee_id: "e1", status: "accepted" },
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

  it("Job = location.name when no Connecteam-job hint configured (venue-first)", () => {
    const row = buildConnecteamRow(mkShift({ category_id: "cat-1" } as any), buildCtx);
    expect(row.Job).toBe("Acme Hall");
    expect(row["Sub item"]).toBe("Waiter");
  });

  it("Job = client.name when there's no location", () => {
    const row = buildConnecteamRow(
      mkShift({ location_id: null, category_id: "cat-1" } as any),
      buildCtx,
    );
    expect(row.Job).toBe("Acme Catering");
    expect(row["Sub item"]).toBe("Waiter");
  });



  it("falls back to category as Job when no client", () => {
    const row = buildConnecteamRow(
      mkShift({ client_id: null, category_id: "cat-1" } as any),
      buildCtx,
    );
    // v1.1: with a location, location.name is preferred over category as a Job hint.
    expect(row.Job).toBe("Acme Hall");
  });

  it("v1.1: Users is EMPTY by default (capacity-only mode)", () => {
    const row = buildConnecteamRow(mkShift(), buildCtx);
    expect(row.Users).toBe("");
    expect(row["Number of users"]).toBe("3");
  });

  it("v1.1: Users populated only when includeUsers=true is opted in", () => {
    const row = buildConnecteamRow(mkShift(), buildCtx, { includeUsers: true });
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
    // Hardening: internal Stafly UUID must never appear in the export.
    expect(row.Note).not.toMatch(/Stafly shift id/i);
    expect(row.Note).not.toContain("shift-abc12345");
  });

  it("omits Ref: when shift has no legacy code and never leaks Stafly UUID", () => {
    const row = buildConnecteamRow(mkShift({ shift_code: null }), buildCtx);
    expect(row.Note).not.toMatch(/Ref:/);
    expect(row.Note).not.toMatch(/Stafly shift id/i);
  });
});

describe("connecteam-export: Address priority (v1.1)", () => {
  it("prefers location.full_address over location.name", () => {
    const locs = [{ id: "loc-1", name: "Acme Hall", full_address: "260 University Ave, Bronx NY 10468" } as any];
    const r = resolveAddress(mkShift(), { ...buildCtx, locations: locs });
    expect(r.value).toBe("260 University Ave, Bronx NY 10468");
    expect(r.source).toBe("location.full_address");
  });

  it("falls through full_address → formatted_address → address", () => {
    const locs = [{ id: "loc-1", name: "Venue", formatted_address: "FA 1" } as any];
    expect(resolveAddress(mkShift(), { ...buildCtx, locations: locs }).source).toBe("location.formatted_address");
    const locs2 = [{ id: "loc-1", name: "Venue", address: "A 1" } as any];
    expect(resolveAddress(mkShift(), { ...buildCtx, locations: locs2 }).source).toBe("location.address");
  });

  it("uses shift.job_site_address when location has no physical address", () => {
    const r = resolveAddress(
      mkShift({ job_site_address: "Free-text 123" } as any),
      buildCtx,
    );
    expect(r.value).toBe("Free-text 123");
    expect(r.source).toBe("shift.job_site_address");
  });

  it("uses location.name ONLY as last fallback", () => {
    const r = resolveAddress(mkShift(), buildCtx);
    expect(r.value).toBe("Acme Hall");
    expect(r.source).toBe("location.name");
  });

  it("returns 'none' when nothing is available", () => {
    const r = resolveAddress(
      mkShift({ location_id: null } as any),
      { ...buildCtx, locations: [] },
    );
    expect(r.source).toBe("none");
    expect(r.value).toBe("");
  });

  it("buildConnecteamRow surfaces physical address in Address column, not venue name", () => {
    const locs = [{ id: "loc-1", name: "Acme Hall", full_address: "260 University Ave, Bronx NY" } as any];
    const row = buildConnecteamRow(mkShift(), { ...buildCtx, locations: locs });
    expect(row.Address).toBe("260 University Ave, Bronx NY");
    expect(row.Address).not.toBe("Acme Hall");
  });
});

describe("connecteam-export: Job priority (v1.1)", () => {
  it("prefers shift.connecteam_job_name when present", () => {
    const r = resolveJob(mkShift({ connecteam_job_name: "Catering East" } as any), buildCtx);
    expect(r.value).toBe("Catering East");
    expect(r.source).toBe("shift.connecteam_job_name");
    expect(r.isFallback).toBe(false);
  });

  it("falls back to location.name then client.name with isFallback=true", () => {
    const r = resolveJob(mkShift(), buildCtx);
    expect(r.source).toBe("location.name");
    expect(r.isFallback).toBe(true);
  });
});

describe("connecteam-export: validateShiftForExport", () => {
  it("Ready when all fields complete and warnings only include v1.1 informational", () => {
    const locs = [{ id: "loc-1", name: "Acme", full_address: "260 University Ave" } as any];
    const r = validateShiftForExport(
      mkShift({ connecteam_job_name: "Catering East" } as any),
      { ...buildCtx, locations: locs },
      adminCtx,
      { includeUsers: true },
    );
    expect(r.status).toBe("ready");
  });

  it("Blocked when user is not admin", () => {
    const r = validateShiftForExport(mkShift(), buildCtx, { ...adminCtx, isAdmin: false });
    expect(r.status).toBe("blocked");
    expect(r.warnings[0].code).toBe("no_admin");
  });

  it("Draft completo es exportable — publication_status es contexto, no blocker", () => {
    const r = validateShiftForExport(
      mkShift({ publication_status: "draft" }),
      buildCtx,
      adminCtx,
    );
    expect(r.status).not.toBe("blocked");
    expect(r.warnings.some(w => w.code === "not_published")).toBe(false);
    expect(r.warnings.some(w => w.code === "draft_export_context")).toBe(true);
  });

  it("Blocked cuando el turno está cancelado", () => {
    const r = validateShiftForExport(
      mkShift({ publication_status: "cancelled" }),
      buildCtx,
      adminCtx,
    );
    expect(r.status).toBe("blocked");
    expect(r.warnings.some(w => w.code === "terminal_status")).toBe(true);
  });


  it("Blocked when no Job context (no client, no location, no category)", () => {
    const r = validateShiftForExport(
      mkShift({ client_id: null, location_id: null } as any),
      { ...buildCtx, categories: [] },
      adminCtx,
    );
    expect(r.status).toBe("blocked");
    // Fase 2: sin mapping explícito por compañía el bloqueo es de mapping,
    // no un fallback silencioso a "Select".
    expect(
      r.warnings.some(
        w => w.code === "missing_job_context" || w.code === "missing_job_mapping",
      ),
    ).toBe(true);
  });


  it("v1.1: 0 accepted assignments does NOT block when capacity-only mode has slots", () => {
    const r = validateShiftForExport(mkShift({ slots: 3 }), {
      ...buildCtx,
      assignments: [{ id: "x", shift_id: "shift-abc12345", employee_id: "e1", status: "pending" }],
    }, adminCtx);
    expect(r.status).toBe("needs_review");
    expect(r.warnings.some(w => w.code === "no_capacity_no_users")).toBe(false);
  });

  it("v1.1: 0 accepted blocks only when capacity is also 0", () => {
    const r = validateShiftForExport(mkShift({ slots: 0 }), {
      ...buildCtx,
      assignments: [],
    }, adminCtx);
    expect(r.status).toBe("blocked");
    expect(r.warnings.some(w => w.code === "no_capacity_no_users")).toBe(true);
  });

  it("v1.1: includeUsers=true blocks when no accepted assignments", () => {
    const r = validateShiftForExport(mkShift({ slots: 3 }), {
      ...buildCtx,
      assignments: [],
    }, adminCtx, { includeUsers: true });
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

  it("Needs review when Address falls back to location.name (venue label)", () => {
    const r = validateShiftForExport(mkShift(), buildCtx, adminCtx);
    expect(r.status).toBe("needs_review");
    expect(r.warnings.some(w => w.code === "address_from_venue_name")).toBe(true);
    expect(r.meta.addressSource).toBe("location.name");
  });

  it("Needs review when Job is a fallback (no Connecteam hint configured)", () => {
    const r = validateShiftForExport(mkShift(), buildCtx, adminCtx);
    expect(r.warnings.some(w => w.code === "job_fallback")).toBe(true);
    expect(r.meta.jobIsFallback).toBe(true);
  });

  it("Needs review with users_not_exported_v1_2 in default capacity-only mode", () => {
    const r = validateShiftForExport(mkShift(), buildCtx, adminCtx);
    expect(r.warnings.some(w => w.code === "users_not_exported_v1_2")).toBe(true);
    expect(r.meta.usersExported).toBe(false);
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
    expect(lines[0]).toContain("Date,Start,End,Timezone");
    expect(csv).toContain('"Turno ""Especial"", VIP"');
    expect(csv).toMatch(/"[^"]*Linea 1\nLinea 2/);
  });

  it("produces exactly N+1 sections per row when joined (header + N rows)", () => {
    const rowA = buildConnecteamRow(mkShift({ id: "shift-aaa11111" }), buildCtx);
    const rowB = buildConnecteamRow(
      mkShift({ id: "shift-bbb22222", title: "Turno B" }),
      buildCtx,
    );
    const csv = serializeConnecteamCsv([rowA, rowB]);
    expect(csv.split("\n")).toHaveLength(3);
  });
});

describe("connecteam-export: effectiveAssignmentsForExport", () => {
  it("includes only accepted and confirmed, scoped by shift id", () => {
    const eff = effectiveAssignmentsForExport("shift-abc12345", ASGN_OK);
    expect(eff.map(a => a.id).sort()).toEqual(["a1", "a2"]);
  });
});

describe("connecteam-export: safety boundary", () => {
  it("module public surface remains pure frontend (no supabase/edge exports)", async () => {
    const mod = await import("@/lib/integrations/connecteam-export");
    const exported = Object.keys(mod).sort();
    expect(exported).toEqual([
      "CONNECTEAM_HEADERS",
      "CSV_UTF8_BOM",
      "buildConnecteamRow",
      "bulkExportFilename",
      "connecteamRowSignature",
      "countCsvDataRows",
      "effectiveAssignmentsForExport",
      "exportFilename",
      "findDuplicateRowSignatures",

      "resolveAddress",
      "resolveJob",
      "serializeConnecteamCsv",
      "validateShiftForExport",
    ]);
    expect(exported).not.toContain("supabase");
    expect(exported).not.toContain("createClient");
  });
});
