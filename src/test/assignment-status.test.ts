/**
 * Assignment status presentation contract.
 *
 * Compliance NEVER blocks by itself — only the company policy resolved by the
 * backend can block. These tests pin that contract on the UI side.
 */
import { describe, it, expect } from "vitest";
import {
  parseAssignmentStatus,
  describeAssignmentStatus,
  optimisticStatus,
} from "@/lib/shifts/assignment-status";

const raw = (over: Record<string, unknown>) => ({
  operational_status: "available",
  compliance_status: "clear",
  policy: "allow_with_warning",
  can_assign: true,
  requires_override: false,
  readiness: "ready",
  ...over,
});

describe("assignment-status", () => {
  it("incomplete profile with allow_with_warning stays assignable", () => {
    const s = parseAssignmentStatus("e1", raw({
      compliance_status: "profile_incomplete",
      readiness: "compliance_warning",
    }));
    const p = describeAssignmentStatus(s);
    expect(p.canAssign).toBe(true);
    expect(p.requiresOverride).toBe(false);
    expect(p.tone).toBe("warn");
  });

  it("require_override policy asks for authorization instead of hiding the worker", () => {
    const s = parseAssignmentStatus("e2", raw({
      compliance_status: "documents_pending",
      policy: "require_override",
      can_assign: false,
      requires_override: true,
      readiness: "override_required",
    }));
    const p = describeAssignmentStatus(s);
    expect(p.requiresOverride).toBe(true);
    expect(p.canAssign).toBe(false);
    expect(p.action).toMatch(/override/i);
  });

  it("only an explicit block policy blocks on compliance", () => {
    const s = parseAssignmentStatus("e3", raw({
      compliance_status: "documents_pending",
      policy: "block",
      can_assign: false,
      readiness: "compliance_blocked",
    }));
    expect(describeAssignmentStatus(s).canAssign).toBe(false);
  });

  it("inactive is operational, not compliance", () => {
    const s = parseAssignmentStatus("e4", raw({
      operational_status: "inactive",
      can_assign: false,
      readiness: "inactive",
    }));
    const p = describeAssignmentStatus(s);
    expect(p.canAssign).toBe(false);
    expect(p.reason).toMatch(/operativo/i);
  });

  it("optimistic default never blocks while loading", () => {
    expect(describeAssignmentStatus(optimisticStatus("e5")).canAssign).toBe(true);
  });
});
