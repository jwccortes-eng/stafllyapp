/**
 * P0 — BUG EN RECURRENCIA (rango 14–16 Ago producía 1 Servicio)
 *
 * El modal de confirmación y la creación real usan `computeRepeatDates`.
 * Un rango válido sin restricción de días debe producir todas las fechas.
 */
import { describe, it, expect } from "vitest";

import { computeRepeatDates, DEFAULT_REPEAT } from "@/components/shifts/ShiftRepeatSection";
import { planRecurrenceOccurrences } from "@/lib/shifts/recurrence";

const base = "2026-08-14";

describe("computeRepeatDates — rango sin días marcados", () => {
  it("modo weekdays: rango 14–16 Ago sin días marcados crea las 3 fechas", () => {
    const dates = computeRepeatDates(base, {
      ...DEFAULT_REPEAT,
      enabled: true,
      mode: "weekdays",
      selectedDays: [],
      rangeStart: base,
      rangeEnd: "2026-08-16",
    });
    expect(dates).toEqual(["2026-08-15", "2026-08-16"]);
    const plan = planRecurrenceOccurrences(base, dates, "intent-1");
    expect(plan.map((o) => o.date)).toEqual(["2026-08-14", "2026-08-15", "2026-08-16"]);
  });

  it("modo range: rango 14–16 Ago crea las 3 fechas", () => {
    const dates = computeRepeatDates(base, {
      ...DEFAULT_REPEAT,
      enabled: true,
      mode: "range",
      rangeStart: base,
      rangeEnd: "2026-08-16",
    });
    expect(dates).toEqual(["2026-08-15", "2026-08-16"]);
  });

  it("modo range sin inicio explícito usa la fecha del Servicio", () => {
    const dates = computeRepeatDates(base, {
      ...DEFAULT_REPEAT,
      enabled: true,
      mode: "range",
      rangeStart: "",
      rangeEnd: "2026-08-16",
    });
    expect(dates).toEqual(["2026-08-15", "2026-08-16"]);
  });

  it("los días marcados siguen restringiendo el rango", () => {
    const dates = computeRepeatDates(base, {
      ...DEFAULT_REPEAT,
      enabled: true,
      mode: "weekdays",
      selectedDays: [6], // sábado
      rangeStart: base,
      rangeEnd: "2026-08-16",
    });
    expect(dates).toEqual(["2026-08-15"]);
  });

  it("sin rango y sin días no hay repeticiones", () => {
    expect(
      computeRepeatDates(base, { ...DEFAULT_REPEAT, enabled: true, mode: "weekdays" }),
    ).toEqual([]);
  });

  it("rango invertido no genera fechas", () => {
    expect(
      computeRepeatDates(base, {
        ...DEFAULT_REPEAT,
        enabled: true,
        mode: "range",
        rangeStart: "2026-08-16",
        rangeEnd: "2026-08-14",
      }),
    ).toEqual([]);
  });
});
