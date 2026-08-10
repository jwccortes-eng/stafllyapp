import { describe, it, expect } from "vitest";
import { resolvePortalStatus, hasPortalAccess } from "@/lib/portal/portal-status";

describe("portal status — fuente única de verdad", () => {
  it("1. persona con portal activo", () => {
    const r = resolvePortalStatus({ user_id: "u1", is_active: true, phone_number: "+1555" });
    expect(r.status).toBe("active");
    expect(r.hasPortalAccess).toBe(true);
    expect(r.label).toBe("Portal activo");
  });

  it("2. invitada pero aún no activada", () => {
    const r = resolvePortalStatus(
      { user_id: null, is_active: true, phone_number: "+1555", has_access_pin: true },
      { status: "sent" },
    );
    expect(r.status).toBe("invited");
    expect(r.hasPortalAccess).toBe(false);
    expect(r.label).toBe("Invitado");
  });

  it("3. sin portal", () => {
    const ready = resolvePortalStatus({ user_id: null, is_active: true, phone_number: "+1555", has_access_pin: true });
    expect(ready.status).toBe("ready_to_invite");
    expect(ready.label).toBe("Sin portal");

    const incomplete = resolvePortalStatus({ user_id: null, is_active: true });
    expect(incomplete.status).toBe("incomplete");
    expect(incomplete.label).toBe("Sin portal");
    expect(incomplete.missing).toEqual(["teléfono", "PIN"]);
  });

  it("4/5. el estado del turno no altera el estado de portal", () => {
    const emp = { user_id: "u1", is_active: true };
    // pending y accepted del turno son datos ajenos: el resolver ni los recibe
    expect(resolvePortalStatus(emp).label).toBe("Portal activo");
    expect(hasPortalAccess(emp)).toBe(true);
  });

  it("caso Sophia: invitación aceptada sin cuenta vinculada nunca dice 'Cuenta activada'", () => {
    const r = resolvePortalStatus(
      { user_id: null, is_active: true, phone_number: "+1555" },
      { status: "accepted", accepted_at: "2026-04-27T23:57:11Z" },
    );
    expect(r.status).toBe("activation_unlinked");
    expect(r.hasPortalAccess).toBe(false);
    expect(r.label).not.toContain("activada");
  });

  it("invitación fallida se distingue de sin portal", () => {
    const r = resolvePortalStatus({ user_id: null, is_active: true }, { status: "bounced" });
    expect(r.status).toBe("invite_failed");
  });

  it("acceso real gana sobre desactivación operativa", () => {
    const r = resolvePortalStatus({ user_id: "u1", is_active: false });
    expect(r.hasPortalAccess).toBe(true);
  });

  it("inactivo sin cuenta = inactivo", () => {
    expect(resolvePortalStatus({ user_id: null, is_active: false }).status).toBe("inactive");
  });
});
