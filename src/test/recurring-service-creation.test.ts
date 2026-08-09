import { describe, it, expect } from "vitest";
import {
  newRecurrenceIntentId,
  freezeRecurrenceSubmit,
  parseRecurrenceRef,
  planRecurrenceOccurrences,
  recurrenceOccurrenceRef,
  seriesResultMessage,
  summarizeSeries,
  type OccurrenceOutcome,
} from "@/lib/shifts/recurrence";
import { computeRepeatDates, DEFAULT_REPEAT } from "@/components/shifts/ShiftRepeatSection";

const outcome = (over: Partial<OccurrenceOutcome> = {}): OccurrenceOutcome => ({
  date: "2026-08-10",
  isBase: false,
  status: "created",
  shiftId: "s1",
  ref: "QK-001590",
  workersRequested: 0,
  workersCopied: 0,
  error: null,
  ...over,
});

describe("recurrence — modelo de serie", () => {
  it("genera intents únicos", () => {
    expect(newRecurrenceIntentId()).not.toBe(newRecurrenceIntentId());
  });

  it("la referencia por ocurrencia es estable y reversible", () => {
    const ref = recurrenceOccurrenceRef("i1", "2026-08-11");
    expect(ref).toBe(recurrenceOccurrenceRef("i1", "2026-08-11"));
    expect(parseRecurrenceRef(ref)).toEqual({ intentId: "i1", date: "2026-08-11" });
    expect(parseRecurrenceRef("otro-hash")).toBeNull();
  });

  it("QK-001590: lunes a jueves produce 4 ocurrencias independientes", () => {
    // Fecha origen lunes 10 de agosto de 2026.
    const dates = computeRepeatDates("2026-08-10", {
      ...DEFAULT_REPEAT,
      enabled: true,
      mode: "weekdays",
      selectedDays: [1, 2, 3, 4],
      rangeStart: "2026-08-10",
      rangeEnd: "2026-08-13",
    });
    const plan = planRecurrenceOccurrences("2026-08-10", dates, "i1");
    expect(plan.map((p) => p.date)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
    expect(plan[0].isBase).toBe(true);
    expect(new Set(plan.map((p) => p.sourceRef)).size).toBe(4);
  });

  it("QK-001592: congela el payload real antes de las confirmaciones", () => {
    const config = {
      ...DEFAULT_REPEAT,
      enabled: true,
      mode: "next_n" as const,
      nextNDays: 3,
      copyAssignments: true,
    };
    const repeatDates = computeRepeatDates("2026-08-10", config);
    const submit = freezeRecurrenceSubmit({
      intentId: "qk-001592-submit",
      baseDate: "2026-08-10",
      repeatDates,
      config,
    });

    // Payload operacional observado en QK-001592: publicado, 16:00–21:00,
    // 6 plazas y 6 workers. La recurrencia debe sobrevivir como parte del submit.
    const payload = {
      company_id: "00000000-0000-0000-0000-000000000001",
      title: "Evento",
      date: submit.baseDate,
      start_time: "16:00",
      end_time: "21:00",
      slots: 6,
      publication_status: "published",
      employee_ids: Array.from({ length: 6 }, (_, i) => `worker-${i + 1}`),
      recurrence: submit,
    };

    expect(payload.recurrence.occurrences.map((o) => o.date)).toEqual([
      "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13",
    ]);
    expect(new Set(payload.recurrence.occurrences.map((o) => o.sourceRef)).size).toBe(4);
    expect(payload.employee_ids).toHaveLength(6);
  });

  it("nunca duplica la fecha origen ni fechas repetidas", () => {
    const plan = planRecurrenceOccurrences("2026-08-10", ["2026-08-10", "2026-08-11", "2026-08-11"], "i1");
    expect(plan.map((p) => p.date)).toEqual(["2026-08-10", "2026-08-11"]);
  });

  it("sin recurrencia el plan es una sola ocurrencia", () => {
    expect(planRecurrenceOccurrences("2026-08-10", [], "i1")).toHaveLength(1);
  });

  it("soporta series que cruzan de mes", () => {
    const dates = computeRepeatDates("2026-08-31", {
      ...DEFAULT_REPEAT,
      enabled: true,
      mode: "next_n",
      nextNDays: 3,
    });
    const plan = planRecurrenceOccurrences("2026-08-31", dates, "i1");
    expect(plan.map((p) => p.date)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("resume la serie distinguiendo creados, reutilizados y fallidos", () => {
    const s = summarizeSeries([
      outcome({ isBase: true, status: "created" }),
      outcome({ status: "reused" }),
      outcome({ status: "failed", shiftId: null, error: "boom" }),
    ]);
    expect(s).toMatchObject({ total: 3, created: 1, reused: 1, failed: 1 });
    expect(seriesResultMessage(s)).toContain("2 de 3");
  });

  it("detecta Servicios creados cuyo equipo no se pudo copiar", () => {
    const s = summarizeSeries([
      outcome({ workersRequested: 3, workersCopied: 3 }),
      outcome({ workersRequested: 3, workersCopied: 0, error: "assign failed" }),
    ]);
    expect(s.workerFailures).toBe(1);
    expect(s.created).toBe(2); // el fallo de equipo NO borra el Servicio
  });

  it("una serie completa sin fallos se reporta en positivo", () => {
    const s = summarizeSeries([outcome({ isBase: true }), outcome(), outcome(), outcome()]);
    expect(seriesResultMessage(s)).toBe("4 Servicios de la serie creados");
  });
});
