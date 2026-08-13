import { describe, it, expect } from "vitest";
import {
  OPERATING_CHAIN,
  RESPONSIBILITIES,
  companyOperatingFlow,
  getResponsibility,
  operatingChainFor,
  uncoveredStages,
  visibleAliases,
  type OperatingPerson,
} from "@/lib/auth/operating-model";
import { CANONICAL_ROLES } from "@/lib/auth/role-model";

const people: OperatingPerson[] = [
  { userId: "1", name: "Jorge", role: "company_owner" },
  { userId: "2", name: "Keury", role: "company_owner" },
  { userId: "3", name: "Sebastián", role: "shift_admin" },
  { userId: "4", name: "Duván", role: "time_closeout_admin" },
  { userId: "5", name: "María", role: "payroll_admin" },
];

describe("Stafly Operating Model", () => {
  it("cubre todos los roles canónicos sin inventar ninguno", () => {
    const keys = CANONICAL_ROLES.map((r) => r.key).sort();
    expect(Object.keys(RESPONSIBILITIES).sort()).toEqual(keys);
  });

  it("la cadena operativa tiene las 8 etapas del negocio", () => {
    expect(OPERATING_CHAIN.map((s) => s.key)).toEqual([
      "clients",
      "services",
      "scheduling",
      "operation",
      "time_control",
      "payroll_prep",
      "approval",
      "payment",
    ]);
  });

  it("Shift Administrator entrega a Time & Closeout", () => {
    const { downstream } = operatingChainFor("shift_admin", people);
    expect(downstream.map((d) => d.role)).toContain("time_closeout_admin");
    expect(downstream[0].people.map((p) => p.name)).toEqual(["Duván"]);
  });

  it("Time & Closeout recibe de operación y entrega a Payroll", () => {
    const { upstream, downstream } = operatingChainFor("time_closeout_admin", people);
    expect(upstream.map((u) => u.role)).toEqual(["shift_admin", "service_supervisor"]);
    expect(downstream.map((d) => d.role)).toEqual(["payroll_admin"]);
  });

  it("Payroll Administrator no aprueba: entrega al aprobador", () => {
    const spec = getResponsibility("payroll_admin")!;
    expect(spec.deliversTo).toEqual(["payroll_approver"]);
    expect(spec.notResponsible.join(" ")).toMatch(/Aprobar/);
  });

  it("Service Supervisor conserva alias visibles sin ser un rol nuevo", () => {
    expect(visibleAliases("service_supervisor")).toEqual(["Supervisor", "Captain", "Headwaiter"]);
  });

  it("el flujo de la empresa nombra responsables reales", () => {
    const flow = companyOperatingFlow(people);
    const time = flow.find((r) => r.stage.key === "time_control")!;
    expect(time.people.map((p) => p.name)).toEqual(["Duván"]);
  });

  it("detecta etapas sin responsable", () => {
    const missing = uncoveredStages(people).map((r) => r.stage.key);
    expect(missing).toContain("operation");
    expect(missing).toContain("approval");
    expect(uncoveredStages([...people, { userId: "6", name: "Ana", role: "payroll_approver" }]).map((r) => r.stage.key)).not.toContain("approval");
  });

  it("el worker solo responde por su propio trabajo", () => {
    const spec = getResponsibility("worker")!;
    expect(spec.controls.join(" ")).toMatch(/Sus turnos/);
    expect(spec.notResponsible.join(" ")).toMatch(/terceros/);
  });
});
