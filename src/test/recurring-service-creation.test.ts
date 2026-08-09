import { describe, it, expect } from "vitest";
import {
  newRecurrenceIntentId,
  buildCanonicalServiceInsert,
  buildSeriesIntent,
  freezeRecurrenceSubmit,
  parseRecurrenceRef,
  planRecurrenceOccurrences,
  recurrenceOccurrenceRef,
  seriesResultMessage,
  summarizeSeries,
  type OccurrenceOutcome,
} from "@/lib/shifts/recurrence";
import { computeRepeatDates, DEFAULT_REPEAT } from "@/components/shifts/ShiftRepeatSection";
import {
  QK_001592_ROW,
  QK_001592_REPEAT_INTENT,
  QK_001592_EXPECTED_DATES,
  QK_001592_EMPLOYEE_IDS,
} from "@/test/fixtures/qk-001592";

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

// ---------------------------------------------------------------------------
// P0 FINAL — CASO MAESTRO QK-001592 (fixture real, regresión permanente)
// ---------------------------------------------------------------------------
describe("QK-001592 — caso maestro de recurrencia real", () => {
  const buildSubmit = (intentId = "qk-001592-master") =>
    freezeRecurrenceSubmit({
      intentId,
      baseDate: QK_001592_ROW.date,
      repeatDates: computeRepeatDates(QK_001592_ROW.date, {
        ...DEFAULT_REPEAT,
        ...QK_001592_REPEAT_INTENT,
      }),
      config: { ...DEFAULT_REPEAT, ...QK_001592_REPEAT_INTENT },
    });

  it("la fila histórica documenta el fallo: sin referencia de serie", () => {
    expect(QK_001592_ROW.reconciliation_hash).toBeNull();
  });

  it("la intención L-M-X-J produce exactamente 4 ocurrencias", () => {
    const submit = buildSubmit();
    expect(submit.occurrences.map((o) => o.date)).toEqual([...QK_001592_EXPECTED_DATES]);
  });

  it("cada ocurrencia tiene identidad propia y todas comparten la misma serie", () => {
    const submit = buildSubmit();
    const refs = submit.occurrences.map((o) => o.sourceRef);
    expect(new Set(refs).size).toBe(4);
    const intents = refs.map((r) => parseRecurrenceRef(r)!.intentId);
    expect(new Set(intents).size).toBe(1);
    expect(intents[0]).toBe("qk-001592-master");
  });

  it("doble tap: el mismo submit reproduce las mismas 4 claves (nunca 8)", () => {
    const a = buildSubmit();
    const b = freezeRecurrenceSubmit({
      intentId: a.intentId,
      baseDate: a.baseDate,
      repeatDates: computeRepeatDates(a.baseDate, { ...DEFAULT_REPEAT, ...QK_001592_REPEAT_INTENT }),
      config: { ...DEFAULT_REPEAT, ...QK_001592_REPEAT_INTENT },
    });
    expect(b.occurrences.map((o) => o.sourceRef)).toEqual(a.occurrences.map((o) => o.sourceRef));
    const union = new Set([...a.occurrences, ...b.occurrences].map((o) => o.sourceRef));
    expect(union.size).toBe(4);
  });

  it("la serie no depende del staffing: un fallo de equipo conserva los 4 Servicios", () => {
    const submit = buildSubmit();
    const outcomes: OccurrenceOutcome[] = submit.occurrences.map((o, i) => ({
      date: o.date,
      isBase: o.isBase,
      status: "created",
      shiftId: `shift-${i}`,
      ref: `QK-00159${2 + i}`,
      workersRequested: QK_001592_EMPLOYEE_IDS.length,
      workersCopied: i === 2 ? 0 : QK_001592_EMPLOYEE_IDS.length,
      error: i === 2 ? "assign failed" : null,
      sourceRef: o.sourceRef,
    }));
    const s = summarizeSeries(outcomes);
    expect(s.created).toBe(4);
    expect(s.failed).toBe(0);
    expect(s.workerFailures).toBe(1);
  });

  it("la recurrencia sobrevive congelada aunque el formulario cambie después", () => {
    const submit = buildSubmit();
    const frozen = submit.occurrences.map((o) => o.date);
    // Simula la degradación observada: el estado del formulario vuelve a 1 fecha.
    const degradedConfig = { ...DEFAULT_REPEAT, enabled: false };
    expect(computeRepeatDates(QK_001592_ROW.date, degradedConfig)).toHaveLength(0);
    expect(submit.occurrences.map((o) => o.date)).toEqual(frozen);
    expect(frozen).toHaveLength(4);
  });

  it("cada ocurrencia conserva cliente, título, ubicación, horario y personal del Servicio confirmado", () => {
    const recurrence = buildSubmit();
    const service = {
      companyId: QK_001592_ROW.company_id,
      clientId: QK_001592_ROW.client_id,
      locationId: "location-elum",
      jobSiteLocationId: "job-site-elum",
      jobSiteAddress: "Elum Franklhall",
      meetingPoint: "Entrada principal",
      meetingPointLocationId: null,
      title: QK_001592_ROW.title,
      startTime: "16:00",
      endTime: "21:00",
      requestedHeadcount: 6,
      notes: "Servicio confirmado",
      specialInstructions: "Uniforme negro",
      claimable: false,
      payType: "hourly" as const,
      dayType: "full_day" as const,
      payOverride: false,
      shiftAdminId: null,
      transportRequired: false,
      carCapacity: 0,
      transportNotes: null,
      driverIds: [],
      clockMethod: "mobile" as const,
      attendanceMode: "standard",
      meetingTime: "15:45",
      employeeIds: [...QK_001592_EMPLOYEE_IDS],
      publicationIntent: "publish_base" as const,
    };
    const intent = buildSeriesIntent({ recurrence, service });
    const rows = intent.recurrence.occurrences.map((occurrence) => buildCanonicalServiceInsert({
      snapshot: intent.service,
      date: occurrence.date,
      sourceRef: occurrence.sourceRef,
      createdBy: "operator-1",
      draft: !occurrence.isBase,
    }));

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.date)).toEqual([...QK_001592_EXPECTED_DATES]);
    for (const row of rows) {
      expect(row).toMatchObject({
        title: "Evento",
        client_id: QK_001592_ROW.client_id,
        location_id: "location-elum",
        job_site_location_id: "job-site-elum",
        job_site_address: "Elum Franklhall",
        start_time: "16:00",
        end_time: "21:00",
        slots: 6,
      });
      expect(String(row.title).toUpperCase()).not.toBe("COCINA");
    }
  });
});
