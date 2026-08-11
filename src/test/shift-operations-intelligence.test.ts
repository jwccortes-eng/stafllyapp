import { describe, it, expect } from "vitest";
import {
  getShiftOperationalStatus,
  getShiftMissingItems,
  getShiftRisks,
  getRecommendedNextActions,
  normalizeArea,
  groupByNormalizedArea,
  type ShiftLike,
  type AssignmentLike,
} from "@/lib/shifts/shift-operations-intelligence";

const draft: ShiftLike = {
  id: "s1",
  title: "Turno",
  status: "draft",
  publication_status: "draft",
  date: "2026-06-10",
  start_time: "08:00:00",
  end_time: "16:00:00",
  slots: 3,
  client_id: "c1",
  location_id: "l1",
  meeting_point: "Lobby",
  special_instructions: "Uniforme negro",
  transportation_required: false,
  car_capacity: 5,
  shift_admin_id: "e9",
  driver_employee_id: null,
};

const mkA = (status: string, role = "staff"): AssignmentLike => ({
  id: Math.random().toString(),
  employee_id: Math.random().toString(),
  status,
  assignment_role: role,
});

const ctxFull = { hasLocation: true, hasMeetingPoint: true, hasLocationAddress: true };

describe("getShiftOperationalStatus", () => {
  it("draft ready to publish when covered + info complete", () => {
    const r = getShiftOperationalStatus(
      draft,
      [mkA("confirmed"), mkA("confirmed"), mkA("confirmed")],
      ctxFull,
    );
    expect(r.code).toBe("draft_ready_to_publish");
    expect(r.tone).toBe("success");
  });

  it("draft needs staffing when missing workers", () => {
    const r = getShiftOperationalStatus(draft, [mkA("confirmed")], ctxFull);
    expect(r.code).toBe("draft_needs_staffing");
    expect(r.message).toMatch(/2 workers confirmados/);
  });

  // P0 Service Location SSOT: la ubicación se deriva del turno, no de ctx.
  it("draft missing info when no location", () => {
    const r = getShiftOperationalStatus(
      { ...draft, location_id: null, job_site_location_id: null, job_site_address: null },
      [],
    );
    expect(r.code).toBe("draft_missing_info");
  });

  it("no reclama punto de encuentro cuando no hay transporte (Turno 427)", () => {
    const r = getShiftOperationalStatus(
      {
        ...draft,
        status: "published",
        publication_status: "published",
        location_id: null,
        job_site_location_id: null,
        job_site_address: "3514 West 89th Street",
        meeting_point: null,
        meeting_point_location_id: null,
        transportation_required: false,
      },
      [mkA("confirmed"), mkA("confirmed"), mkA("confirmed")],
    );
    expect(r.code).toBe("published_ready");
  });

  it("published at risk when missing 2+", () => {
    const r = getShiftOperationalStatus(
      { ...draft, status: "published", publication_status: "published" },
      [mkA("confirmed")],
      ctxFull,
    );
    expect(r.code).toBe("published_at_risk");
    expect(r.tone).toBe("danger");
  });

  it("published ready when fully covered + info", () => {
    const r = getShiftOperationalStatus(
      { ...draft, status: "published", publication_status: "published" },
      [mkA("confirmed"), mkA("confirmed"), mkA("confirmed")],
      ctxFull,
    );
    expect(r.code).toBe("published_ready");
  });

  it("locked overrides everything", () => {
    const r = getShiftOperationalStatus({ ...draft, status: "locked" }, [], ctxFull);
    expect(r.code).toBe("locked");
  });
});

describe("getShiftMissingItems", () => {
  it("flags missing job site + meeting point + workers", () => {
    const r = getShiftMissingItems(
      {
        ...draft,
        special_instructions: "x",
        location_id: null,
        job_site_location_id: null,
        job_site_address: null,
        meeting_point: null,
        meeting_point_location_id: null,
        transportation_required: true,
      },
      [],
    );
    const keys = r.map(x => x.key);
    expect(keys).toContain("job_site");
    expect(keys).toContain("meeting_point");
    expect(keys).toContain("workers");
  });

  it("flags missing driver when transport required + no driver", () => {
    const r = getShiftMissingItems(
      { ...draft, transportation_required: true, driver_employee_id: null },
      [mkA("confirmed", "staff")],
      ctxFull,
    );
    expect(r.some(x => x.key === "driver")).toBe(true);
  });

  it("no driver flag when transport disabled", () => {
    const r = getShiftMissingItems(
      { ...draft, transportation_required: false },
      [],
      ctxFull,
    );
    expect(r.some(x => x.key === "driver")).toBe(false);
  });
});

describe("getRecommendedNextActions", () => {
  it("returns at most 3 actions", () => {
    const r = getRecommendedNextActions(
      { ...draft, transportation_required: true, shift_admin_id: null },
      [],
      getShiftMissingItems(
        { ...draft, transportation_required: true, shift_admin_id: null, special_instructions: null },
        [],
        { hasLocation: false, hasMeetingPoint: false, hasLocationAddress: false },
      ),
      [],
    );
    expect(r.length).toBeLessThanOrEqual(3);
  });

  it("suggests publish when draft is ready", () => {
    const r = getRecommendedNextActions(
      draft,
      [mkA("confirmed"), mkA("confirmed"), mkA("confirmed")],
      [],
      [],
    );
    expect(r[0]?.kind).toBe("publish_shift");
  });
});

describe("getShiftRisks", () => {
  it("flags coverage gap on published shift", () => {
    const r = getShiftRisks(
      { ...draft, status: "published", publication_status: "published" },
      [mkA("confirmed")],
    );
    expect(r.some(x => x.key === "coverage_gap")).toBe(true);
  });

  it("no coverage risk on draft", () => {
    const r = getShiftRisks(draft, []);
    expect(r.some(x => x.key === "coverage_gap")).toBe(false);
  });
});

describe("normalizeArea", () => {
  it("collapses Queens variants", () => {
    expect(normalizeArea("Queens")).toBe("Queens");
    expect(normalizeArea("QUEENS")).toBe("Queens");
    expect(normalizeArea("queens")).toBe("Queens");
    expect(normalizeArea("Queens, NY")).toBe("Queens");
    expect(normalizeArea("queens ny")).toBe("Queens");
    expect(normalizeArea("Queens,NY")).toBe("Queens");
  });

  it("collapses Brooklyn variants", () => {
    expect(normalizeArea("Brooklyn")).toBe("Brooklyn");
    expect(normalizeArea("Brooklyn, NY")).toBe("Brooklyn");
    expect(normalizeArea("BROOKLYN")).toBe("Brooklyn");
  });

  it("blank input returns empty string", () => {
    expect(normalizeArea(null)).toBe("");
    expect(normalizeArea(undefined)).toBe("");
    expect(normalizeArea("   ")).toBe("");
  });

  it("preserves multi-word areas", () => {
    expect(normalizeArea("Long Island")).toBe("Long Island");
    expect(normalizeArea("long island, ny")).toBe("Long Island");
  });
});

describe("groupByNormalizedArea", () => {
  it("merges Queens / QUEENS / Queens, NY into one bucket", () => {
    const groups = groupByNormalizedArea([
      { county: "Queens" },
      { county: "QUEENS" },
      { county: "Queens, NY" },
      { county: "Brooklyn" },
      { county: null },
    ]);
    const queens = groups.find(g => g.area === "Queens");
    expect(queens?.rows.length).toBe(3);
    expect(groups.find(g => g.area === "Brooklyn")?.rows.length).toBe(1);
    expect(groups.find(g => g.area === "Sin zona")?.rows.length).toBe(1);
  });

  it("places 'Sin zona' at the end", () => {
    const groups = groupByNormalizedArea([
      { county: null },
      { county: "Bronx" },
      { county: "Queens" },
    ]);
    expect(groups[groups.length - 1].area).toBe("Sin zona");
  });
});
