import { describe, it, expect } from "vitest";
import {
  resolveConnecteamJobAndSubItem,
  BETA_COMPAT_RULES,
} from "@/lib/integrations/connecteam-compat";
import { buildConnecteamRow, validateShiftForExport } from "@/lib/integrations/connecteam-export";
import type { Shift, SelectOption, Employee, Assignment } from "@/components/shifts/types";

const EMPLOYEES: Employee[] = [
  { id: "e1", first_name: "Ana", last_name: "Perez" },
];
const ASGN: Assignment[] = [
  { id: "a1", shift_id: "s1", employee_id: "e1", status: "accepted" },
];

const mk = (over: Partial<Shift> & Record<string, any> = {}): Shift => ({
  id: "s1",
  title: over.title ?? "Turno",
  date: over.date ?? "2026-05-27", // Wed
  start_time: "08:00:00",
  end_time: "16:00:00",
  status: "published",
  publication_status: "published",
  slots: 3,
  client_id: "c1",
  location_id: "l1",
  notes: over.notes ?? "",
  claimable: false,
  shift_code: null,
  ...over,
} as any);

function ctxFor(opts: {
  client?: string;
  location?: string;
  categoryName?: string;
}) {
  const clients: SelectOption[] = opts.client ? [{ id: "c1", name: opts.client }] : [];
  const locations: SelectOption[] = opts.location ? [{ id: "l1", name: opts.location }] : [];
  const categories: SelectOption[] | undefined = opts.categoryName
    ? [{ id: "cat-1", name: opts.categoryName }]
    : undefined;
  return { clients, locations, employees: EMPLOYEES, assignments: ASGN, categories };
}

describe("connecteam-compat: BETA_COMPAT_RULES integrity", () => {
  it("has the 6 approved rules in the required order", () => {
    expect(BETA_COMPAT_RULES.map(r => r.id)).toEqual([
      "eminence.headwaiter",
      "eminence.outside",
      "eminence.regular_waiter",
      "eminence.default_regular_waiter",
      "production.weekend",
      "production.regular",
    ]);
  });
});

describe("connecteam-compat: Eminence rules", () => {
  it("Waiter → Regular Waiters", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ category_id: "cat-1" }),
      ctxFor({ client: "Eminence", location: "Eminence Ballroom", categoryName: "Waiter" }),
    );
    expect(r.job).toBe("Eminence");
    expect(r.subItem).toBe("Regular Waiters");
    expect(r.confidence).toBe("inferred");
    expect(r.source.ruleId).toBe("eminence.regular_waiter");
  });

  it("Headwaiter → Headwaiters (more specific wins over Waiter regex)", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ category_id: "cat-1" }),
      ctxFor({ client: "Eminence", location: "Eminence Ballroom", categoryName: "Headwaiter" }),
    );
    expect(r.subItem).toBe("Headwaiters");
    expect(r.source.ruleId).toBe("eminence.headwaiter");
  });

  it("Captain → Headwaiters", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ category_id: "cat-1" }),
      ctxFor({ client: "Eminence", location: "Eminence Ballroom", categoryName: "Captain" }),
    );
    expect(r.subItem).toBe("Headwaiters");
  });

  it("Outside in title → Outside Job", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ category_id: "cat-1", title: "Outside catering" }),
      ctxFor({ client: "Eminence", location: "Eminence", categoryName: "Waiter" }),
    );
    expect(r.subItem).toBe("Outside Job");
    expect(r.source.ruleId).toBe("eminence.outside");
  });

  it("Outside in notes wins over regular_waiter", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ category_id: "cat-1", notes: "outside job please" }),
      ctxFor({ client: "Eminence", location: "Eminence", categoryName: "Waiter" }),
    );
    expect(r.subItem).toBe("Outside Job");
  });

  it("Captain + outside → Headwaiters wins (rule order: headwaiter first)", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ category_id: "cat-1", notes: "outside" }),
      ctxFor({ client: "Eminence", location: "Eminence", categoryName: "Captain" }),
    );
    expect(r.subItem).toBe("Headwaiters");
  });
});

describe("connecteam-compat: Production rules", () => {
  it("pay_type=daily → Weekend Job", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ pay_type: "daily", date: "2026-05-27" }),
      ctxFor({ client: "Production", location: "Production Site" }),
    );
    expect(r.job).toBe("Production");
    expect(r.subItem).toBe("Weekend Job");
    expect(r.source.ruleId).toBe("production.weekend");
  });

  it("Saturday date → Weekend Job (hourly)", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ pay_type: "hourly", date: "2026-05-30" }), // Sat
      ctxFor({ client: "Production" }),
    );
    expect(r.subItem).toBe("Weekend Job");
  });

  it("Friday date → Weekend Job", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ pay_type: "hourly", date: "2026-05-29" }), // Fri
      ctxFor({ client: "Production" }),
    );
    expect(r.subItem).toBe("Weekend Job");
  });

  it("notes 'fin de semana' → Weekend Job (weekday date)", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ pay_type: "hourly", date: "2026-05-27", notes: "fin de semana" }),
      ctxFor({ client: "Production" }),
    );
    expect(r.subItem).toBe("Weekend Job");
  });

  it("weekday + hourly + no weekend text → Regular Job", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ pay_type: "hourly", date: "2026-05-27" }), // Wed
      ctxFor({ client: "Production", location: "Production Site" }),
    );
    expect(r.subItem).toBe("Regular Job");
    expect(r.source.ruleId).toBe("production.regular");
  });

  it("Weekend rule scoped to Production — does NOT fire for other venues", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ pay_type: "daily", date: "2026-05-30" }),
      ctxFor({ client: "Acme Catering", location: "Acme Hall" }),
    );
    expect(r.confidence).toBe("fallback");
    expect(r.subItem).not.toBe("Weekend Job");
  });
});

describe("connecteam-compat: confidence levels", () => {
  it("Explicit hint (shift.connecteam_job_name) → exact, no rule", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ connecteam_job_name: "Custom Job" }),
      ctxFor({ client: "Eminence", location: "Eminence", categoryName: "Waiter" }),
    );
    expect(r.confidence).toBe("exact");
    expect(r.source.ruleId).toBeUndefined();
    expect(r.job).toBe("Custom Job");
  });

  it("Unknown client/category → fallback with warning", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ category_id: "cat-1" }),
      ctxFor({ client: "Foo Bar", location: "Foo Hall", categoryName: "Waiter" }),
    );
    expect(r.confidence).toBe("fallback");
    expect(r.warnings.some(w => w.code === "job_fallback")).toBe(true);
  });

  it("Sin client/location/category → missing + block warning", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ client_id: null, location_id: null } as any),
      { clients: [], locations: [], employees: EMPLOYEES, assignments: ASGN },
    );
    expect(r.confidence).toBe("missing");
    expect(r.warnings.some(w => w.code === "missing_job_context" && w.severity === "block")).toBe(true);
  });

  it("enableBetaCompatMapping=false skips rules and falls through", () => {
    const r = resolveConnecteamJobAndSubItem(
      mk({ category_id: "cat-1" }),
      ctxFor({ client: "Eminence", location: "Eminence", categoryName: "Waiter" }),
      { enableBetaCompatMapping: false },
    );
    expect(r.confidence).toBe("fallback");
    expect(r.source.ruleId).toBeUndefined();
  });
});

describe("connecteam-compat: integration in buildConnecteamRow", () => {
  it("Eminence + Waiter → CSV row Job=Eminence, Sub item=Regular Waiters", () => {
    const row = buildConnecteamRow(
      mk({ category_id: "cat-1" }),
      ctxFor({ client: "Eminence", location: "Eminence Ballroom", categoryName: "Waiter" }),
    );
    expect(row.Job).toBe("Eminence");
    expect(row["Sub item"]).toBe("Regular Waiters");
  });

  it("Production Sat → CSV row Job=Production, Sub item=Weekend Job", () => {
    const row = buildConnecteamRow(
      mk({ date: "2026-05-30" }),
      ctxFor({ client: "Production" }),
    );
    expect(row.Job).toBe("Production");
    expect(row["Sub item"]).toBe("Weekend Job");
  });
});

describe("connecteam-compat: validation merges warnings", () => {
  it("inferred rule emits compat_rule_applied info, status=needs_review (users not exported)", () => {
    const r = validateShiftForExport(
      mk({ category_id: "cat-1" }),
      ctxFor({ client: "Eminence", location: "Eminence", categoryName: "Waiter" }),
      { isAdmin: true, selectedCompanyId: "co", shiftCompanyId: "co" },
    );
    expect(r.meta.jobConfidence).toBe("inferred");
    expect(r.meta.jobRuleId).toBe("eminence.regular_waiter");
    expect(r.warnings.some(w => w.code === "compat_rule_applied")).toBe(true);
    expect(r.status).toBe("needs_review");
  });

  it("missing job context blocks export", () => {
    const r = validateShiftForExport(
      mk({ client_id: null, location_id: null } as any),
      { clients: [], locations: [], employees: EMPLOYEES, assignments: ASGN },
      { isAdmin: true, selectedCompanyId: "co", shiftCompanyId: "co" },
    );
    expect(r.status).toBe("blocked");
    expect(r.warnings.some(w => w.code === "missing_job_context")).toBe(true);
  });
});

describe("connecteam-compat: safety boundary", () => {
  it("module exports remain pure (no supabase/fetch/edge)", async () => {
    const mod = await import("@/lib/integrations/connecteam-compat");
    const exported = Object.keys(mod).sort();
    expect(exported).toEqual([
      "BETA_COMPAT_RULES",
      "resolveConnecteamJobAndSubItem",
    ]);
  });
});
