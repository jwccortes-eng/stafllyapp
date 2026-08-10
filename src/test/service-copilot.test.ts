/**
 * SERVICE COPILOT — contrato del "siguiente paso".
 *
 * Regla dura: SIEMPRE una sola recomendación, nunca contradictoria.
 */
import { describe, it, expect } from "vitest";
import { getServiceCopilot, type ServiceCopilotInput } from "@/lib/shifts/service-copilot";

const base: ServiceCopilotInput = {
  clientId: "client-1",
  date: "2026-09-10",
  startTime: "16:00",
  endTime: "21:00",
  hasVenue: true,
  meetingRequired: false,
  hasMeetingPoint: false,
  slots: 4,
  assignedCount: 4,
  claimable: false,
  publicationStatus: "published",
  infoComplete: true,
  daysUntil: 12,
};

describe("getServiceCopilot", () => {
  it("1. servicio recién creado → recomienda completar la información base", () => {
    const r = getServiceCopilot({
      ...base,
      clientId: null,
      hasVenue: false,
      endTime: "",
      slots: 0,
      assignedCount: 0,
      infoComplete: false,
      publicationStatus: "draft",
    });
    expect(r.nextStep.label).toBe("Confirmar cliente");
    expect(r.nextStep.stage).toBe("definicion");
    expect(r.readiness).toBeLessThan(50);
  });

  it("2. información completa sin publicar → recomienda publicar", () => {
    const r = getServiceCopilot({
      ...base,
      publicationStatus: "draft",
      assignedCount: 0,
    });
    expect(r.nextStep.label).toBe("Publicar Servicio");
    expect(r.nextStep.why).toMatch(/completa/i);
  });

  it("3. publicado con staffing incompleto → recomienda asignar personas", () => {
    const r = getServiceCopilot({ ...base, assignedCount: 2 });
    expect(r.nextStep.label).toBe("Asignar 2 personas");
    expect(r.nextStep.stage).toBe("staffing");
    expect(r.nextStep.why).toMatch(/Faltan 2/);
  });

  it("4. servicio pasado con clock out completo → recomienda revisar horas", () => {
    const r = getServiceCopilot({
      ...base,
      daysUntil: -1,
      attendance: { clockedIn: 4, clockedOut: 4, hoursReviewed: false },
    });
    expect(r.nextStep.label).toBe("Revisar horas");
    expect(r.nextStep.stage).toBe("tiempo");
  });

  it("5. horas aprobadas → recomienda preparar payroll", () => {
    const r = getServiceCopilot({
      ...base,
      daysUntil: -2,
      attendance: { clockedIn: 4, clockedOut: 4, hoursReviewed: true },
    });
    expect(r.nextStep.label).toBe("Preparar Payroll");
    expect(r.nextStep.stage).toBe("pago");
  });

  it("clock out pendiente se recomienda antes que revisar horas", () => {
    const r = getServiceCopilot({
      ...base,
      daysUntil: -1,
      attendance: { clockedIn: 4, clockedOut: 2, hoursReviewed: false },
    });
    expect(r.nextStep.label).toBe("Cerrar clock-out");
  });

  it("el checklist es de lectura y refleja el estado real", () => {
    const r = getServiceCopilot({ ...base, assignedCount: 1, meetingRequired: true, hasMeetingPoint: false });
    const byKey = Object.fromEntries(r.checklist.map((c) => [c.key, c.state]));
    expect(byKey.client).toBe("done");
    expect(byKey.staffing).toBe("attention");
    expect(byKey.meeting_point).toBe("pending");
    // Futuro: los ítems de tiempo no aplican todavía.
    expect(byKey.clock_in).toBe("na");
  });

  it("readiness es un único indicador entre 0 y 100 y llega a 100 sin ítems abiertos", () => {
    const r = getServiceCopilot(base);
    expect(r.readiness).toBe(100);
    expect(r.band).toBe("ready");
    expect(r.nextStep.label).toBe("Sin acciones pendientes");
  });

  it("un servicio cancelado no pide acciones", () => {
    const r = getServiceCopilot({ ...base, publicationStatus: "cancelled" });
    expect(r.nextStep.stage).toBe("cerrado");
    expect(r.band).toBe("closed");
  });

  it("nunca devuelve más de una recomendación", () => {
    const inputs: ServiceCopilotInput[] = [
      base,
      { ...base, assignedCount: 0, publicationStatus: "draft", infoComplete: false },
      { ...base, hasVenue: false },
      { ...base, daysUntil: -3, attendance: { clockedIn: 0, clockedOut: 0 } },
    ];
    for (const i of inputs) {
      const r = getServiceCopilot(i);
      expect(typeof r.nextStep.label).toBe("string");
      expect(r.nextStep.why.length).toBeGreaterThan(10);
    }
  });
});

/**
 * P0 — SERVICE COMMAND CENTER: cada recomendación resuelve y ninguna alerta
 * aparece cuando no aplica.
 */
describe("copiloto como centro de decisión", () => {
  const past = { ...base, shiftId: "shift-1", daysUntil: -1 };

  it("transporte OFF nunca exige Meeting Point", () => {
    const r = getServiceCopilot({ ...base, meetingRequired: false, hasMeetingPoint: false, publicationStatus: "draft", assignedCount: 0 });
    expect(r.nextStep.label).not.toMatch(/Meeting Point/);
    expect(r.checklist.find((c) => c.key === "meeting_point")?.state).toBe("na");
  });

  it("un borrador no pide fichaje aunque la fecha ya pasó", () => {
    const r = getServiceCopilot({ ...base, publicationStatus: "draft", daysUntil: -1 });
    const byKey = Object.fromEntries(r.checklist.map((c) => [c.key, c.state]));
    expect(byKey.clock_in).toBe("na");
    expect(byKey.clock_out).toBe("na");
  });

  it("sin clock in no se exige clock out", () => {
    const r = getServiceCopilot({ ...past, attendance: { clockedIn: 0, clockedOut: 0 } });
    expect(r.nextStep.label).toBe("Revisar asistencia");
    expect(r.checklist.find((c) => c.key === "clock_out")?.state).toBe("na");
  });

  it("toda recomendación accionable trae una acción que resuelve", () => {
    const cases: ServiceCopilotInput[] = [
      { ...base, clientId: null, anchors: { client: "a" } },
      { ...base, hasVenue: false, anchors: { venue: "a" } },
      { ...base, assignedCount: 1, anchors: { staffing: "a" } },
      { ...past, attendance: { clockedIn: 4, clockedOut: 2 } },
      { ...past, attendance: { clockedIn: 4, clockedOut: 4, hoursReviewed: true } },
    ];
    for (const c of cases) {
      const r = getServiceCopilot(c);
      expect(r.nextStep.action, r.nextStep.label).toBeTruthy();
    }
  });

  it("cada recomendación lleva el contexto del servicio", () => {
    const r = getServiceCopilot({ ...base, assignedCount: 2, clientName: "Millennium", serviceRef: "QK001592" });
    const ctx = Object.fromEntries(r.nextStep.context.map((c) => [c.label, c.value]));
    expect(ctx.Cliente).toBe("Millennium");
    expect(ctx.Servicio).toBe("QK001592");
    expect(ctx.Cobertura).toBe("2/4 · 50%");
    expect(ctx.Horario).toBe("16:00–21:00");
  });

  it("un servicio cancelado no pide cobertura", () => {
    const r = getServiceCopilot({ ...base, assignedCount: 0, publicationStatus: "cancelled" });
    expect(r.nextStep.label).toBe("Sin acciones pendientes");
    expect(r.nextStep.action).toBeUndefined();
  });
});
