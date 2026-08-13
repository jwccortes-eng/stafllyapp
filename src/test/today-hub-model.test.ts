/**
 * OX-4.3 — Tests del modelo puro del Today Hub.
 */
import { describe, it, expect } from "vitest";
import {
  buildTodayHubModel,
  type HubShiftLike,
  FULL_HUB_PERMISSIONS,
  NO_HUB_PERMISSIONS,
} from "@/lib/command-center/today-hub-model";

const NOW = new Date("2026-08-01T10:00:00");

function shift(over: Partial<HubShiftLike> & { id: string }): HubShiftLike {
  return {
    title: "Turno demo",
    date: "2026-08-01",
    start_time: "12:00:00",
    end_time: "20:00:00",
    slots: 4,
    client_name: "Cliente A",
    job_site_name: "Sede Norte",
    pending_claims: 0,
    transport: { required: false, missing_driver: false, capacity_short: false },
    ...over,
    ops: {
      bucket: "staffed_not_started",
      required: 4,
      assigned_active: 4,
      confirmed: 4,
      clocked_in: 0,
      open_clocks: 0,
      missing_clock_outs: 0,
      not_started: 0,
      ...(over.ops ?? {}),
    },
  } as HubShiftLike;
}

describe("buildTodayHubModel", () => {
  it("marca cobertura incompleta próxima a iniciar como critical y primero", () => {
    const m = buildTodayHubModel({ permissions: FULL_HUB_PERMISSIONS,
      now: NOW,
      shifts: [
        shift({ id: "ok" }),
        shift({
          id: "gap",
          start_time: "10:30:00",
          ops: { bucket: "needs_staff", required: 4, assigned_active: 1, confirmed: 1, clocked_in: 0, open_clocks: 0, missing_clock_outs: 0, not_started: 0 },
        }),
      ],
    });
    expect(m.attentionItems[0].priority).toBe("critical");
    expect(m.attentionItems[0].shiftId).toBe("gap");
    expect(m.attentionItems[0].action?.label).toBe("Completar equipo");
  });

  it("clasifica ausencias en turno en curso como critical", () => {
    const m = buildTodayHubModel({ permissions: FULL_HUB_PERMISSIONS,
      now: NOW,
      shifts: [
        shift({
          id: "live",
          start_time: "08:00:00",
          ops: { bucket: "in_progress", required: 4, assigned_active: 4, confirmed: 4, clocked_in: 2, open_clocks: 2, missing_clock_outs: 0, not_started: 2 },
        }),
      ],
    });
    const item = m.attentionItems.find((i) => i.id === "live:attendance");
    expect(item?.priority).toBe("high");
    expect(item?.status).toBe("late");
    expect(item?.headline).not.toMatch(/no-?show/i);

  });

  it("CTA de turno en curso cubierto es Operar turno", () => {
    const m = buildTodayHubModel({ permissions: FULL_HUB_PERMISSIONS,
      now: NOW,
      shifts: [
        shift({
          id: "live",
          start_time: "08:00:00",
          ops: { bucket: "in_progress", required: 4, assigned_active: 4, confirmed: 4, clocked_in: 4, open_clocks: 4, missing_clock_outs: 0, not_started: 0 },
        }),
      ],
    });
    expect(m.activeOperations[0].action.label).toBe("Operar turno");
  });

  it("genera item de cierre con consecuencia y CTA Revisar cierre", () => {
    const m = buildTodayHubModel({ permissions: FULL_HUB_PERMISSIONS,
      now: NOW,
      shifts: [
        shift({
          id: "close",
          start_time: "02:00:00",
          end_time: "08:00:00",
          ops: { bucket: "needs_closeout", required: 4, assigned_active: 4, confirmed: 4, clocked_in: 4, open_clocks: 1, missing_clock_outs: 1, not_started: 0 },
        }),
      ],
    });
    expect(m.closeoutItems).toHaveLength(1);
    expect(m.closeoutItems[0].decision.label).toBe("Revisar cierre");
    expect(m.closeoutItems[0].consequence).toMatch(/no modifica payroll/i);
  });

  it("no produce ceros silenciosos en horas pendientes", () => {
    const m = buildTodayHubModel({ permissions: FULL_HUB_PERMISSIONS,
      now: NOW,
      shifts: [shift({ id: "a" })],
      counts: { pendingHours: 0 },
    });
    const kpi = m.attentionItems.find((i) => i.id === "counts:hours");
    expect(kpi?.because).toBe("No hay horas pendientes de revisión.");
    expect(kpi?.action).toBeUndefined();
    expect(kpi?.priority).toBe("low");
  });

  it("horas pendientes >0 son accionables y de alta prioridad", () => {
    const m = buildTodayHubModel({ permissions: FULL_HUB_PERMISSIONS,
      now: NOW,
      shifts: [shift({ id: "a" })],
      counts: { pendingHours: 7 },
    });
    const kpi = m.attentionItems.find((i) => i.id === "counts:hours")!;
    expect(kpi.priority).toBe("high");
    expect(kpi.value).toBe("7 fichajes");
    expect(kpi.action?.href).toBe("/app/payroll-review-queue");
  });

  it("estado calmado con próximo turno cuando no hay riesgos", () => {
    const m = buildTodayHubModel({ permissions: FULL_HUB_PERMISSIONS, now: NOW, shifts: [shift({ id: "a" })] });
    expect(m.emptyState.calm).toBe(true);
    expect(m.emptyState.headline).toBe("Todo bajo control");
    expect(m.emptyState.nextShift?.shiftId).toBe("a");
    expect(m.emptyState.nextShift?.startsInLabel).toBe("comienza en 2 h");
  });

  it("sin turnos devuelve estado explícito, no ceros", () => {
    const m = buildTodayHubModel({ permissions: FULL_HUB_PERMISSIONS, now: NOW, shifts: [] });
    expect(m.emptyState.headline).toBe("Sin turnos hoy");
    expect(m.activeOperations).toHaveLength(0);
    expect(m.primaryAction).toBeNull();
  });

  it("respeta permisos: sin canAssign no ofrece completar equipo", () => {
    const m = buildTodayHubModel({
      now: NOW,
      permissions: { ...FULL_HUB_PERMISSIONS, canAssign: false },
      shifts: [
        shift({
          id: "gap",
          ops: { bucket: "needs_staff", required: 4, assigned_active: 1, confirmed: 1, clocked_in: 0, open_clocks: 0, missing_clock_outs: 0, not_started: 0 },
        }),
      ],
    });
    expect(m.attentionItems[0].action).toBeUndefined();
    expect(m.activeOperations[0].action?.label).toBe("Ver detalles");
  });


  it("fichajes sin salida generan deep link al reloj", () => {
    const m = buildTodayHubModel({ permissions: FULL_HUB_PERMISSIONS,
      now: NOW,
      shifts: [
        shift({
          id: "s1",
          start_time: "01:00:00",
          end_time: "07:00:00",
          ops: { bucket: "needs_closeout", required: 2, assigned_active: 2, confirmed: 2, clocked_in: 2, open_clocks: 2, missing_clock_outs: 2, not_started: 0 },
        }),
      ],
    });
    const item = m.attentionItems.find((i) => i.id === "s1:open-clock")!;
    expect(item.action?.href).toBe(
      "/app/timeclock?shiftId=s1&from=command-center",
    );
  });

  it("solicitudes pendientes se modelan como validación", () => {
    const m = buildTodayHubModel({ permissions: FULL_HUB_PERMISSIONS,
      now: NOW,
      shifts: [shift({ id: "s2", pending_claims: 3 })],
    });
    expect(m.validationItems[0].title).toBe("3 solicitudes por revisar");
  });

  it("primaryAction refleja el riesgo más urgente", () => {
    const m = buildTodayHubModel({ permissions: FULL_HUB_PERMISSIONS,
      now: NOW,
      shifts: [
        shift({
          id: "gap",
          start_time: "10:20:00",
          ops: { bucket: "needs_staff", required: 3, assigned_active: 0, confirmed: 0, clocked_in: 0, open_clocks: 0, missing_clock_outs: 0, not_started: 0 },
        }),
      ],
    });
    expect(m.primaryAction?.href).toBe(
      "/app/shift-ops?id=gap&stage=team&from=command-center",
    );
    expect(m.primaryAction?.label).toBe("Completar equipo");
  });
});

/* ── OX-4.3.1 — Permisos fail-closed y semántica de asistencia ───────── */

describe("OX-4.3.1 — permisos fail-closed", () => {
  it("sin permisos no expone ninguna acción", () => {
    const m = buildTodayHubModel({
      permissions: NO_HUB_PERMISSIONS,
      now: NOW,
      shifts: [shift({ id: "a" })],
      counts: { pendingHours: 5, docsPending: 3 },
    });
    expect(m.primaryAction).toBeNull();
    expect(m.activeOperations.every((o) => !o.action)).toBe(true);
    expect(m.teamSummaries.every((t) => !t.action)).toBe(true);
    expect(m.closeoutItems.every((c) => !c.decision)).toBe(true);
    expect(m.validationItems.every((v) => !v.decision)).toBe(true);
    expect(m.attentionItems.every((i) => !i.action)).toBe(true);
    expect(m.emptyState.nextShift).toBeUndefined();
  });

  it("permisos omitidos equivalen a sin permisos", () => {
    const m = buildTodayHubModel({ now: NOW, shifts: [shift({ id: "a" })] });
    expect(m.primaryAction).toBeNull();
  });
});

describe("OX-4.3.1 — asistencia sin no-show implícito", () => {
  it("no llama no-show a un turno que aún no empieza", () => {
    const m = buildTodayHubModel({
      permissions: FULL_HUB_PERMISSIONS,
      now: NOW,
      shifts: [shift({ id: "a" })],
    });
    const text = JSON.stringify(m).toLowerCase();
    expect(text).not.toContain("no-show");
    expect(text).not.toContain("no show");
  });
});

/**
 * P1 — Bandeja accionable: cada alerta responde QUÉ / DÓNDE / A QUIÉN / AHORA
 * en una sola lectura y ofrece UNA sola acción principal.
 */
describe("bandeja operativa accionable", () => {
  const noShow = () =>
    buildTodayHubModel({
      permissions: FULL_HUB_PERMISSIONS,
      now: NOW,
      shifts: [
        shift({
          id: "s1",
          shift_ref: "QK-001592",
          start_time: "09:00:00",
          workers: [
            { employee_id: "e1", name: "Sophia Contreras", assignment_status: "confirmed", clock_state: "not_started" },
            { employee_id: "e2", name: "William Rodríguez", assignment_status: "confirmed", clock_state: "clocked_in" },
          ],
          ops: {
            bucket: "in_progress",
            required: 2,
            assigned_active: 2,
            confirmed: 2,
            clocked_in: 1,
            open_clocks: 1,
            missing_clock_outs: 0,
            not_started: 1,
          },
        }),
      ],
    });

  it("nombra a la persona afectada y da contexto completo", () => {
    const m = noShow();
    const alert = m.alerts.find((a) => a.severity === "critical");
    expect(alert).toBeTruthy();
    expect(alert!.context.people).toContain("Sophia Contreras");
    expect(alert!.context.serviceRef).toBe("QK-001592");
    expect(alert!.context.clientName).toBe("Cliente A");
    expect(alert!.context.whenLabel).toBeTruthy();
    expect(alert!.context.ageLabel).toBeTruthy();
  });

  it("ofrece una sola acción principal con deep link a la etapa exacta", () => {
    const m = noShow();
    const alert = m.alerts.find((a) => a.severity === "critical")!;
    expect(alert.cta).toBeTruthy();
    expect(alert.cta!.href).toContain("/app/shift-ops?id=s1");
    expect(alert.cta!.href).toContain("from=command-center");
  });

  it("agrupa las alertas por servicio para no repetir el contexto", () => {
    const m = noShow();
    expect(m.alertGroups).toHaveLength(1);
    expect(m.alertGroups[0].shiftId).toBe("s1");
    expect(m.alertGroups[0].alerts.length).toBeGreaterThan(0);
  });

  it("sin permisos no expone acción resolutiva", () => {
    const m = buildTodayHubModel({
      permissions: NO_HUB_PERMISSIONS,
      now: NOW,
      shifts: [
        shift({
          id: "s2",
          ops: { bucket: "needs_staff", required: 4, assigned_active: 1, confirmed: 1, clocked_in: 0, open_clocks: 0, missing_clock_outs: 0, not_started: 0 },
        }),
      ],
    });
    expect(m.alerts.every((a) => a.cta === null || a.cta === undefined)).toBe(true);
  });
});
