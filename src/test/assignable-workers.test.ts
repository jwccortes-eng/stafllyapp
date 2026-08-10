import { describe, it, expect } from "vitest";
import {
  classifyWorkerAssignability,
  getAssignableWorkers,
  isAssignableWorker,
  partitionWorkersByAssignability,
} from "@/lib/shifts/assignable-workers";

const operativo = { id: "op", is_active: true, employee_role: "Mesero_Waiter", added_via: "Manual" };
const systemN = {
  id: "sys",
  is_active: true,
  worker_type: "legacy_placeholder",
  identity_status: "pending_identity",
};
const historical = { id: "hist", is_active: true, employee_role: "historical" };
const pending = { id: "pend", is_active: true, added_via: "Pending approval" };
const inactivo = { id: "off", is_active: false };

describe("contrato canónico de trabajador asignable", () => {
  it("acepta al operativo activo", () => {
    expect(isAssignableWorker(operativo)).toBe(true);
    expect(classifyWorkerAssignability(operativo).bucket).toBe("assignable");
  });

  it("excluye placeholders System N", () => {
    expect(classifyWorkerAssignability(systemN).bucket).toBe("placeholder");
  });

  it("excluye historical activos", () => {
    expect(classifyWorkerAssignability(historical).bucket).toBe("historical");
  });

  it("excluye pending approval", () => {
    expect(classifyWorkerAssignability(pending).bucket).toBe("pending_approval");
  });

  it("excluye inactivos", () => {
    expect(classifyWorkerAssignability(inactivo).bucket).toBe("inactive");
  });

  it("getAssignableWorkers devuelve solo la población operativa", () => {
    const all = [operativo, systemN, historical, pending, inactivo];
    expect(getAssignableWorkers(all).map((e) => e.id)).toEqual(["op"]);
  });

  it("particiona sin perder registros", () => {
    const all = [operativo, systemN, historical, pending, inactivo];
    const p = partitionWorkersByAssignability(all);
    expect(p.assignable).toHaveLength(1);
    expect(p.placeholder).toHaveLength(1);
    expect(p.historical).toHaveLength(1);
    expect(p.pending_approval).toHaveLength(1);
    expect(p.inactive).toHaveLength(1);
  });

  it("no asignable no depende de perfil incompleto ni de portal", () => {
    expect(
      isAssignableWorker({ ...operativo, profile_status: "incomplete" } as never),
    ).toBe(true);
  });
});
