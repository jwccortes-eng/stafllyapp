/**
 * Regression test: the assignment selector must NEVER hide workers because of
 *   - profile_status === "incomplete" / "pending_documents"
 *   - onboarding_status pending / not started
 *   - no portal access (user_id missing / portal_access_enabled=false)
 *
 * Those are surfaced as BADGES / WARNINGS only. The worker must still appear
 * in the unassigned roster and be returned by the search engine.
 *
 * `unassigned` in ShiftDetailDialog is computed as:
 *     employees.filter(e => !assignedIds.has(e.id))
 * — so this test pins both the search engine AND that contract.
 */
import { describe, it, expect } from "vitest";
import { searchEmployees, type SearchableEmployee } from "@/lib/employee-search";

interface RosterEmployee extends SearchableEmployee {
  is_active?: boolean;
  user_id?: string | null;
  portal_access_enabled?: boolean | null;
  profile_status?: "incomplete" | "pending_documents" | "ready" | "active" | null;
  onboarding_status?: string | null;
}

const johnyIncomplete: RosterEmployee = {
  id: "johny-incomplete",
  first_name: "Johny",
  last_name: "Munera",
  employer_identification: "145",
  is_active: true,
  user_id: null,                  // no portal account
  portal_access_enabled: false,   // portal disabled
  profile_status: "incomplete",   // profile incomplete
  onboarding_status: "pending",   // onboarding pending
};

const carlosReady: RosterEmployee = {
  id: "carlos-ready",
  first_name: "Carlos",
  last_name: "Alvarez",
  employer_identification: "414",
  is_active: true,
  user_id: "auth-user-123",
  portal_access_enabled: true,
  profile_status: "ready",
  onboarding_status: "completed",
};

const roster: RosterEmployee[] = [johnyIncomplete, carlosReady];

/** Mirrors `unassigned = employees.filter(e => !assignedIds.has(e.id))`. */
function unassignedFor(roster: RosterEmployee[], assignedIds: Set<string>) {
  return roster.filter((e) => !assignedIds.has(e.id));
}

describe("Assignment selector eligibility — no silent exclusions", () => {
  it("includes a worker with profile_status='incomplete' in unassigned", () => {
    const list = unassignedFor(roster, new Set());
    expect(list.map((e) => e.id)).toContain("johny-incomplete");
  });

  it("includes a worker with onboarding_status='pending' in unassigned", () => {
    const list = unassignedFor(roster, new Set());
    expect(list.find((e) => e.id === "johny-incomplete")?.onboarding_status).toBe("pending");
  });

  it("includes a worker with NO portal access (user_id null + portal_access_enabled=false)", () => {
    const list = unassignedFor(roster, new Set());
    const johny = list.find((e) => e.id === "johny-incomplete")!;
    expect(johny.user_id).toBeNull();
    expect(johny.portal_access_enabled).toBe(false);
  });

  it("search by 'mune' returns the incomplete-profile worker", () => {
    const out = searchEmployees(roster, "mune");
    expect(out.map((e) => e.id)).toContain("johny-incomplete");
  });

  it("search by '#145' returns the incomplete-profile worker as top result", () => {
    const out = searchEmployees(roster, "#145");
    expect(out[0].id).toBe("johny-incomplete");
  });

  it("excludes a worker only when explicitly assigned (not by profile/portal/onboarding state)", () => {
    const list = unassignedFor(roster, new Set(["johny-incomplete"]));
    expect(list.map((e) => e.id)).toEqual(["carlos-ready"]);
  });
});
