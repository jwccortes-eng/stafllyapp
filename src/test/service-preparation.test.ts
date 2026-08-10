import { describe, it, expect } from "vitest";
import { getCalendarServiceIdentity } from "@/lib/shifts/calendar-service-identity";
import { getServicePreparation } from "@/lib/shifts/service-preparation";

const shift = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  title: "Imperial",
  date: "2026-08-30",
  start_time: "17:00",
  end_time: "23:00",
  slots: 2,
  notes: "",
  client_id: "c1",
  job_site_address: "1601 Broadway, New York, NY",
  publication_status: "published",
  ...over,
});

const prep = (over: Record<string, unknown> = {}, assignedCount = 2, daysUntil = 3) =>
  getServicePreparation(
    getCalendarServiceIdentity(shift(over) as any, { assignedCount, clientName: "Imperial" }),
    { daysUntil },
  );

describe("service preparation (Operation Planner)", () => {
  it("un servicio completo llega a 100 y no propone siguiente paso", () => {
    const p = prep();
    expect(p.score).toBe(100);
    expect(p.band).toBe("ready");
    expect(p.nextAction).toBeNull();
  });

  it("un borrador incompleto nunca es 0: la preparación es progresiva", () => {
    const p = prep({ publication_status: "draft", end_time: "", slots: 0 }, 0);
    expect(p.score).toBeGreaterThan(0);
    expect(p.score).toBeLessThan(100);
  });

  it("la preparación es independiente del estado operativo", () => {
    const draft = prep({ publication_status: "draft" });
    expect(draft.score).toBeGreaterThanOrEqual(80);
    expect(draft.pending.map((i) => i.key)).toEqual(["published"]);
  });

  it("siempre responde qué falta con la siguiente acción recomendada", () => {
    const p = prep({ end_time: "", slots: 0 }, 0);
    expect(p.nextAction).not.toBeNull();
    expect(p.nextAction!.label.length).toBeGreaterThan(3);
    expect(p.nextAction!.hint.length).toBeGreaterThan(3);
  });

  it("lo lejano y razonablemente avanzado puede esperar", () => {
    const p = prep({ publication_status: "draft" }, 2, 20);
    expect(p.band).toBe("later");
  });

  it("lo inminente e incompleto pide atención", () => {
    const p = prep({ publication_status: "draft", slots: 4 }, 1, 1);
    expect(p.band).toBe("attention");
  });
});
