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
