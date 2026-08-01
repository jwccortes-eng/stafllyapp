/**
 * OX-4.5 — Tests del Context Switcher, KPIs con estado y estados terminales.
 */
import { describe, it, expect } from "vitest";
import {
  buildContextSwitcherModel,
  type ContextSwitcherInput,
} from "@/lib/context/context-switcher-model";
import { presentMetric, countMetric, errorMetric, loadingMetric, needsConfigMetric } from "@/lib/ox/metric-state";
import {
  shiftClosedTerminal,
  hoursApprovedTerminal,
  realHoursFact,
} from "@/lib/ox/terminal-state";

const base: ContextSwitcherInput = {
  companies: [
    { id: "a", name: "Acme", status: "active" },
    { id: "b", name: "Beta", status: "active" },
  ],
  selectedCompanyId: "a",
  isGlobalMode: false,
  canUseGlobalMode: false,
  isDeveloper: false,
  companyRoles: { a: "admin", b: "manager" },
  activeMode: "admin",
  canAccessAdmin: true,
  canAccessPortal: true,
  permissionsResolved: true,
};

describe("context switcher model", () => {
  it("expone identidad y modo activos", () => {
    const m = buildContextSwitcherModel(base);
    expect(m.companyLabel).toBe("Acme");
    expect(m.modeLabel).toBe("Administrador");
    expect(m.ariaLabel).toContain("Acme");
  });

  it("es fail-closed mientras los permisos no están resueltos", () => {
    const m = buildContextSwitcherModel({ ...base, permissionsResolved: false });
    expect(m.permissionsPending).toBe(true);
    expect(m.modes.every((x) => !x.available)).toBe(true);
    expect(m.canSwitchMode).toBe(false);
  });

  it("explica por qué un modo no está disponible en vez de ocultarlo", () => {
    const m = buildContextSwitcherModel({ ...base, canAccessPortal: false });
    const portal = m.modes.find((x) => x.mode === "employee")!;
    expect(portal.available).toBe(false);
    expect(portal.unavailableReason).toMatch(/worker/i);
  });

  it("usa el rol real de cada compañía", () => {
    const m = buildContextSwitcherModel(base);
    const all = m.groups.flatMap((g) => g.companies);
    expect(all.find((c) => c.id === "b")!.roleLabel).toBe("Manager");
  });

  it("filtra por búsqueda", () => {
    const m = buildContextSwitcherModel({ ...base, search: "bet" });
    expect(m.groups.flatMap((g) => g.companies)).toHaveLength(1);
  });

  it("describe la transición en curso", () => {
    const m = buildContextSwitcherModel({ ...base, switchState: "switching" });
    expect(m.transition.kind).toBe("switching_company");
    expect(m.transition.message).toBeTruthy();
  });

  it("al fallar garantiza que no se mezclaron datos", () => {
    const m = buildContextSwitcherModel({
      ...base,
      switchState: "error",
      switchError: "Fallo de red",
    });
    expect(m.transition.kind).toBe("error");
    expect(m.transition.retryable).toBe(true);
    expect(m.transition.detail).toMatch(/anterior/);
  });

  it("bloquea sin acceso y no ofrece reintento", () => {
    const m = buildContextSwitcherModel({
      ...base,
      switchState: "error",
      switchError: "Sin acceso a esa compañía",
    });
    expect(m.transition.kind).toBe("no_access");
    expect(m.transition.retryable).toBe(false);
  });

  it("confirma el contexto final tras completar el cambio", () => {
    const m = buildContextSwitcherModel({
      ...base,
      lastCompleted: { kind: "company", label: "Beta" },
    });
    expect(m.transition.kind).toBe("success");
    expect(m.transition.detail).toContain("Beta");
  });

  it("avisa cuando no hay conexión y mantiene el contexto", () => {
    const m = buildContextSwitcherModel({ ...base, online: false });
    expect(m.transition.kind).toBe("offline");
    expect(m.transition.detail).toMatch(/actual/);
  });
});

describe("presentMetric", () => {
  it("no produce ceros silenciosos", () => {
    const p = presentMetric(
      countMetric(0, "turnos", { zero: "Sin turnos hoy.", some: (n) => `${n} turnos hoy.` }),
    );
    expect(p.displayValue).toBe("0 turnos");
    expect(p.statusLabel).toBe("Sin pendientes");
    expect(p.actionable).toBe(false);
    expect(p.consequence).toBeNull();
  });

  it("muestra consecuencia sólo cuando hay algo que atender", () => {
    const p = presentMetric(
      countMetric(3, "horas", { zero: "z", some: (n) => `${n} horas por revisar.` }),
      { consequence: "Bloquean el cierre del periodo." },
    );
    expect(p.actionable).toBe(true);
    expect(p.consequence).toBe("Bloquean el cierre del periodo.");
  });

  it("marca error como no confiable", () => {
    const p = presentMetric(errorMetric("turnos"));
    expect(p.error).toBeTruthy();
    expect(p.displayValue).toBeNull();
    expect(p.consequence).toMatch(/confiable/);
  });

  it("distingue carga de vacío", () => {
    expect(presentMetric(loadingMetric("turnos")).loading).toBe(true);
    expect(presentMetric(needsConfigMetric("turnos", "Falta configurar")).isEmpty).toBe(true);
  });
});

describe("terminal states", () => {
  it("el cierre de turno declara consecuencia y siguiente paso", () => {
    const t = shiftClosedTerminal({ workers: 4, realHours: 32, openIncidents: 0 });
    expect(t.facts).toContain("32 horas reales");
    expect(t.consequence).toMatch(/sin incidencias/);
    expect(t.next).toMatch(/Centro de Validación/);
  });

  it("refleja incidencias abiertas sin ocultarlas", () => {
    const t = shiftClosedTerminal({ workers: 4, realHours: 8.25, openIncidents: 2 });
    expect(t.facts).toContain("2 incidencias abiertas");
    expect(t.consequence).toMatch(/con incidencias/);
  });

  it("la aprobación de horas nunca inventa horas", () => {
    const t = hoursApprovedTerminal({ records: 1 });
    expect(t.facts).toEqual(["1 registro validado"]);
    expect(t.next).toMatch(/payroll/);
  });

  it("redondea horas reales a un decimal", () => {
    expect(realHoursFact(8.246)).toBe("8.2 horas reales");
    expect(realHoursFact(1)).toBe("1 hora real");
  });
});
