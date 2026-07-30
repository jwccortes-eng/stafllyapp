import { describe, it, expect } from "vitest";
import { evaluatePanelAccess } from "../access";

const base = { isAuthenticated: true, isProduction: false };

describe("F1.1 — observation panel access control", () => {
  it("denies anonymous users", () => {
    expect(evaluatePanelAccess({ ...base, isAuthenticated: false, roles: ["developer"] })).toEqual({
      allowed: false,
      reason: "anonymous",
    });
  });

  it.each([["employee"], ["supervisor"], ["manager"], ["company_owner"], ["admin"]])(
    "denies %s",
    (role) => {
      const d = evaluatePanelAccess({ ...base, roles: [role] });
      expect(d.allowed).toBe(false);
      expect(d.allowed === false && d.reason).toBe("not_platform_staff");
    },
  );

  it.each([["developer"], ["owner"], ["founder"]])("allows platform role %s in non-prod", (role) => {
    expect(evaluatePanelAccess({ ...base, roles: [role] }).allowed).toBe(true);
  });

  it("denies platform staff in production without explicit override", () => {
    const d = evaluatePanelAccess({ isAuthenticated: true, isProduction: true, roles: ["developer"] });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toBe("production_without_override");
  });

  it("allows production only with explicit override", () => {
    expect(
      evaluatePanelAccess({
        isAuthenticated: true,
        isProduction: true,
        productionOverride: true,
        roles: ["owner"],
      }).allowed,
    ).toBe(true);
  });
});
