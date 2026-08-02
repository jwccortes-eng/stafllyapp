import { describe, it, expect } from "vitest";
import {
  serviceStateKey,
  isNewerServiceRow,
  mergeServiceRow,
} from "@/lib/shifts/service-state";

describe("single service state", () => {
  it("namespaces the key by company and shift", () => {
    expect(serviceStateKey("c1", "s1")).toEqual(["service-state", "c1", "s1"]);
    expect(serviceStateKey(null, "s1")).toEqual(["service-state", "no-company", "s1"]);
  });

  it("does not reuse the same shift id across tenants", () => {
    expect(serviceStateKey("c1", "s1")).not.toEqual(serviceStateKey("c2", "s1"));
  });

  it("accepts a newer row", () => {
    expect(
      isNewerServiceRow(
        { id: "s1", updated_at: "2026-08-01T10:00:00Z" },
        { id: "s1", updated_at: "2026-08-01T10:05:00Z" },
      ),
    ).toBe(true);
  });

  it("rejects an out-of-order (older) realtime payload", () => {
    expect(
      isNewerServiceRow(
        { id: "s1", updated_at: "2026-08-01T10:05:00Z" },
        { id: "s1", updated_at: "2026-08-01T10:00:00Z" },
      ),
    ).toBe(false);
  });

  it("keeps the recent version when an older payload arrives", () => {
    const current = { id: "s1", title: "Nuevo", updated_at: "2026-08-01T10:05:00Z" };
    const stale = { id: "s1", title: "Viejo", updated_at: "2026-08-01T09:00:00Z" };
    expect(mergeServiceRow(current, stale)).toEqual(current);
  });

  it("merges partial rows on top of the canonical one", () => {
    const current = { id: "s1", title: "A", meeting_point: "Lobby", updated_at: "2026-08-01T10:00:00Z" };
    const next = { id: "s1", title: "B", updated_at: "2026-08-01T10:01:00Z" };
    expect(mergeServiceRow(current, next)).toEqual({
      id: "s1",
      title: "B",
      meeting_point: "Lobby",
      updated_at: "2026-08-01T10:01:00Z",
    });
  });

  it("replaces wholesale when the id changes", () => {
    const current = { id: "s1", title: "A" };
    const next = { id: "s2", title: "B" };
    expect(mergeServiceRow(current, next)).toEqual(next);
  });

  it("keeps current when candidate is null", () => {
    const current = { id: "s1", title: "A" };
    expect(mergeServiceRow(current, null)).toEqual(current);
  });
});
