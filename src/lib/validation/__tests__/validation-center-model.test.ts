import { describe, it, expect } from "vitest";
import {
  buildValidationCenterModel,
  realHours,
  type CloseoutInput,
  type HoursEntryInput,
} from "../validation-center-model";
import { FULL_HUB_PERMISSIONS } from "@/lib/command-center/today-hub-model";

const NOW = new Date("2026-03-10T18:00:00.000Z");

function hours(over: Partial<HoursEntryInput> = {}): HoursEntryInput {
  return {
    id: "te-1",
    employee_id: "emp-1",
    worker_name: "Ana Pérez",
    shift_id: "shift-1",
    shift_label: "Turno mañana — Bodega",
    clock_in: "2026-03-10T08:00:00.000Z",
    clock_out: "2026-03-10T16:00:00.000Z",
    break_minutes: 30,
    status: "pending",
    ...over,
  };
}

function closeout(over: Partial<CloseoutInput> = {}): CloseoutInput {
  return {
    id: "co-1",
    shift_id: "shift-1",
    shift_label: "Turno mañana — Bodega",
    status: "submitted",
    review_status: null,
    final_approval_status: null,
    incident_count: 0,
    no_show_count: 0,
    late_count: 0,
    staff_count_reported: 5,
    notes: null,
    submitted_at: "2026-03-10T17:00:00.000Z",
    ...over,
  };
}

const FULL = { permissions: FULL_HUB_PERMISSIONS, permissionsResolved: true, now: NOW };

describe("realHours", () => {
  it("descuenta el descanso de las horas reales", () => {
    expect(realHours(hours())).toBe(7.5);
  });
  it("devuelve null sin salida registrada", () => {
    expect(realHours(hours({ clock_out: null }))).toBeNull();
  });
});

describe("buildValidationCenterModel — permisos fail-closed", () => {
  it("sin permisos resueltos todo es lectura", () => {
    const m = buildValidationCenterModel({ hours: [hours()], closeouts: [], now: NOW });
    expect(m.readOnly).toBe(true);
    const item = m.pendingItems[0];
    expect(item.permissions.canApprove).toBe(false);
    expect(item.primaryAction?.readOnly).toBe(true);
    expect(m.risks.some((r) => r.id === "permissions")).toBe(true);
  });

  it("permisos parciales no habilitan decisiones ajenas", () => {
    const m = buildValidationCenterModel({
      hours: [hours()],
      closeouts: [closeout()],
      permissions: { canAccessValidations: true, canApproveHours: true },
      permissionsResolved: true,
      now: NOW,
    });
    const hoursItem = m.pendingItems.find((i) => i.source === "time_entries")!;
    const closeoutItem = m.pendingItems.find((i) => i.source === "shift_closeout_reports")!;
    expect(hoursItem.permissions.canApprove).toBe(true);
    expect(closeoutItem.permissions.canApprove).toBe(false);
    expect(closeoutItem.primaryAction?.readOnly).toBe(true);
  });
});

describe("buildValidationCenterModel — clasificación", () => {
  it("clasifica horas pendientes como hours_approval con consecuencia visible", () => {
    const m = buildValidationCenterModel({ hours: [hours()], closeouts: [], ...FULL });
    const item = m.pendingItems[0];
    expect(item.validationType).toBe("hours_approval");
    expect(item.status).toBe("pending");
    expect(item.primaryAction?.kind).toBe("approve");
    expect(item.primaryAction?.consequence).toBeTruthy();
    expect(item.evidence[0]).toEqual({ label: "Horas reales", value: "7.5 h" });
  });

  it("un fichaje sin salida es evidencia faltante, nunca cero silencioso", () => {
    const m = buildValidationCenterModel({
      hours: [hours({ clock_out: null, clock_in: "2026-03-10T00:00:00.000Z" })],
      closeouts: [],
      ...FULL,
    });
    const item = m.urgentItems[0];
    expect(item.validationType).toBe("evidence_review");
    expect(item.priority).toBe("urgent");
    expect(item.primaryAction?.kind).toBe("request_correction");
    expect(item.primaryAction?.requiresReason).toBe(true);
    expect(m.summary.missingEvidence).toBe(1);
    expect(m.summary.hoursPendingApproval).toBe(0);
  });

  it("horas rechazadas son correcciones devueltas, fuera de payroll", () => {
    const m = buildValidationCenterModel({
      hours: [hours({ status: "rejected" })],
      closeouts: [],
      ...FULL,
    });
    expect(m.returnedItems).toHaveLength(1);
    expect(m.returnedItems[0].validationType).toBe("correction_requested");
    expect(m.pendingItems).toHaveLength(0);
  });

  it("horas aprobadas quedan como listas para payroll y no piden decisión", () => {
    const m = buildValidationCenterModel({
      hours: [hours({ status: "approved" })],
      closeouts: [],
      ...FULL,
    });
    expect(m.resolvedItems[0].status).toBe("ready_for_payroll");
    expect(m.summary.readyForPayroll).toBe(1);
    expect(m.primaryAction).toBeNull();
  });

  it("ignora cierres en borrador", () => {
    const m = buildValidationCenterModel({
      hours: [],
      closeouts: [closeout({ status: "draft" })],
      ...FULL,
    });
    expect(m.summary.total).toBe(0);
  });

  it("un no-show reportado eleva la incidencia a urgente", () => {
    const m = buildValidationCenterModel({
      hours: [],
      closeouts: [closeout({ incident_count: 1, no_show_count: 1 })],
      ...FULL,
    });
    expect(m.urgentItems[0].validationType).toBe("incident_review");
  });

  it("cierre escalado es excepción urgente", () => {
    const m = buildValidationCenterModel({
      hours: [],
      closeouts: [closeout({ status: "reviewed", review_status: "escalated" })],
      ...FULL,
    });
    expect(m.urgentItems[0].validationType).toBe("exception_review");
  });

  it("cierre revisado sin firma final pide aprobación final sin tocar payroll", () => {
    const m = buildValidationCenterModel({
      hours: [],
      closeouts: [closeout({ status: "reviewed", review_status: "approved" })],
      ...FULL,
    });
    const item = m.pendingItems[0];
    expect(item.validationType).toBe("shift_closeout");
    expect(item.primaryAction?.consequence).toContain("No paga ni recalcula payroll");
  });

  it("no mezcla fuentes en un mismo item", () => {
    const m = buildValidationCenterModel({
      hours: [hours()],
      closeouts: [closeout()],
      ...FULL,
    });
    expect(m.summary.total).toBe(2);
    expect(new Set(m.pendingItems.map((i) => i.source)).size).toBe(2);
  });
});

describe("buildValidationCenterModel — foco y prioridad", () => {
  it("filtra por turno cuando llega deep-link", () => {
    const m = buildValidationCenterModel({
      hours: [hours(), hours({ id: "te-2", shift_id: "shift-2" })],
      closeouts: [closeout({ id: "co-2", shift_id: "shift-2" })],
      focusShiftId: "shift-2",
      ...FULL,
    });
    expect(m.summary.total).toBe(2);
    expect(m.pendingItems.every((i) => i.relatedShiftId === "shift-2")).toBe(true);
  });

  it("ordena urgentes primero y propone una única acción principal", () => {
    const m = buildValidationCenterModel({
      hours: [hours(), hours({ id: "te-2", clock_out: null, clock_in: "2026-03-09T00:00:00.000Z" })],
      closeouts: [],
      ...FULL,
    });
    expect(m.urgentItems).toHaveLength(1);
    expect(m.primaryAction?.itemId).toBe("time_entries:te-2");
    expect(m.summary.pending).toBe(2);
  });

  it("suma sólo horas reales cerradas y pendientes", () => {
    const m = buildValidationCenterModel({
      hours: [hours(), hours({ id: "te-2", status: "approved" }), hours({ id: "te-3", clock_out: null })],
      closeouts: [],
      ...FULL,
    });
    expect(m.summary.hoursPendingApproval).toBe(7.5);
  });
});

/* ── OX-4.4.1 — Capa humana ──────────────────────────────────────────── */

describe("OX-4.4.1 — identidad y contexto humano", () => {
  it("la card empieza por la persona, no por un código técnico", () => {
    const m = buildValidationCenterModel({
      hours: [
        hours({
          worker_name: "Carlos Ortiz",
          worker_avatar_url: "https://example.test/a.jpg",
          worker_role: "Bartender",
          client_name: "Marriott",
          shift_date: "2026-07-31",
          shift_start_time: "08:00:00",
          shift_end_time: "16:00:00",
          shift_title: "Banquete",
        }),
      ],
      closeouts: [],
      ...FULL,
    });
    const item = m.pendingItems[0];
    expect(item.title).toBe("Carlos Ortiz");
    expect(item.subtitle).toBe("Marriott · 31 de julio · 08:00–16:00");
    expect(item.person).toEqual({
      name: "Carlos Ortiz",
      avatarUrl: "https://example.test/a.jpg",
      role: "Bartender",
    });
    expect(item.context.clientName).toBe("Marriott");
  });

  it("la decisión pendiente se resume en una frase con las horas reales", () => {
    const m = buildValidationCenterModel({ hours: [hours()], closeouts: [], ...FULL });
    expect(m.pendingItems[0].headline).toBe("7.5 horas pendientes de aprobación");
  });

  it("sin salida registrada el headline no asume no-show", () => {
    const m = buildValidationCenterModel({
      hours: [hours({ clock_out: null })],
      closeouts: [],
      ...FULL,
    });
    const item = [...m.urgentItems, ...m.pendingItems][0];
    expect(item.headline).toContain("Sin salida registrada");
    expect(item.headline.toLowerCase()).not.toContain("no-show");
  });

  it("no inventa contexto humano cuando el dato no existe", () => {
    const m = buildValidationCenterModel({ hours: [hours()], closeouts: [], ...FULL });
    const item = m.pendingItems[0];
    expect(item.humanContext.some((n) => n.kind === "supervised_by")).toBe(false);
    expect(item.conversation).toHaveLength(0);
    expect(item.person?.avatarUrl).toBeNull();
  });

  it("expone el comentario real del fichaje como conversación, no como chat nuevo", () => {
    const m = buildValidationCenterModel({
      hours: [hours({ notes: "Salí 20 min tarde por el montaje." })],
      closeouts: [],
      ...FULL,
    });
    const [msg] = m.pendingItems[0].conversation;
    expect(msg.body).toBe("Salí 20 min tarde por el montaje.");
    expect(msg.tone).toBe("worker");
    expect(msg.author).toBe("Ana Pérez");
  });

  it("el cierre muestra quién lo envió, quién revisó y ambos comentarios", () => {
    const m = buildValidationCenterModel({
      hours: [],
      closeouts: [
        closeout({
          shift_title: "Banquete",
          client_name: "Marriott",
          shift_date: "2026-07-31",
          submitted_by_name: "Luis Gómez",
          submitted_role: "Capitán",
          notes: "Faltó una persona en cocina.",
          reviewer_name: "Marta Ruiz",
          review_notes: "Confirmado con el cliente.",
          reviewed_at: "2026-03-10T17:30:00.000Z",
        }),
      ],
      ...FULL,
    });
    const item = m.pendingItems[0];
    expect(item.title).toBe("Banquete");
    expect(item.subtitle).toBe("Marriott · 31 de julio");
    expect(item.person?.name).toBe("Luis Gómez");
    expect(item.humanContext.map((n) => n.kind)).toContain("created_by");
    expect(item.conversation.map((m2) => m2.tone)).toEqual(["worker", "supervisor"]);
  });

  it("la evidencia secundaria existe y queda separada de la principal", () => {
    const m = buildValidationCenterModel({
      hours: [hours({ entry_source: "qr" })],
      closeouts: [],
      ...FULL,
    });
    const item = m.pendingItems[0];
    expect(item.evidence.length).toBeGreaterThan(0);
    expect(item.secondaryEvidence.some((e) => e.label === "Origen del fichaje")).toBe(true);
    expect(item.evidence.some((e) => e.label === "Origen del fichaje")).toBe(false);
  });

  it("cada acción principal declara su consecuencia", () => {
    const m = buildValidationCenterModel({ hours: [hours()], closeouts: [], ...FULL });
    const action = m.pendingItems[0].primaryAction!;
    expect(action.label).toBe("Aprobar horas");
    expect(action.consequence).toBeTruthy();
  });
});
