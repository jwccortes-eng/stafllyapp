import { describe, expect, it } from "vitest";
import { evaluateOperationalSignal } from "@/lib/operational-signals/engine";
import { computeShadowMetrics, type ShadowDecisionRow } from "@/lib/operational-signals/metrics";
import { estimateNoiseReduction } from "@/lib/operational-signals/sink";

const base = {
  eventId: "e1",
  companyId: "co-1",
  shiftId: "shift-1",
  occurredAt: "2026-08-01T10:00:00.000Z",
  sourceSystem: "test",
};

const ctx = {
  companyId: "co-1",
  activeAssignedWorkerIds: ["w1", "w2"],
  removedWorkerIds: ["w3"],
  captainUserIds: ["cap"],
  dispatcherUserIds: ["disp"],
  operationsManagerUserIds: ["om"],
  payrollReviewerUserIds: ["pr"],
};

describe("operational signal engine (shadow)", () => {
  it("QA1 — asignación: familia assignment, prioridad media, requiere confirmación", () => {
    const d = evaluateOperationalSignal({ ...base, eventType: "shift_assigned" }, ctx);
    expect(d.notificationFamily).toBe("assignment");
    expect(d.priority).toBe("medium");
    expect(d.requiresAcknowledgement).toBe(true);
    expect(d.recommendedAudience.map((m) => m.userId)).toContain("w1");
  });

  it("QA2 — meeting point: solo participantes; excluye removidos", () => {
    const d = evaluateOperationalSignal(
      { ...base, eventType: "meeting_point_changed" },
      { ...ctx, minutesToShiftStart: 60 },
    );
    expect(d.priority).toBe("critical");
    expect(d.recommendedAudience.map((m) => m.userId)).toEqual(["w1", "w2", "cap"]);
    expect(d.excludedAudience.map((m) => m.userId)).toContain("w3");
    expect(d.excludedAudience[0].reason).toBeTruthy();
  });

  it("QA3 — ráfaga: marca agrupación recomendada", () => {
    const d = evaluateOperationalSignal(
      { ...base, eventType: "shift_updated" },
      { ...ctx, recentSameKeyEventCount: 5 },
    );
    expect(d.shouldGroup).toBe(true);
    expect(d.groupWindowSeconds).toBeGreaterThan(0);
  });

  it("QA4 — no-show: crítico, no agrupable, no va a todo el equipo", () => {
    const d = evaluateOperationalSignal({ ...base, eventType: "no_show_alert" }, ctx);
    expect(d.priority).toBe("critical");
    expect(d.shouldGroup).toBe(false);
    expect(d.recommendedAudience.map((m) => m.role)).toEqual([
      "captain",
      "dispatcher",
      "operations_manager",
    ]);
    expect(d.excludedAudience.some((m) => m.userId === "w1")).toBe(true);
  });

  it("QA5 — informativo repetido: puede ser silent", () => {
    const d = evaluateOperationalSignal(
      { ...base, eventType: "announcement" },
      { ...ctx, recentSameKeyEventCount: 2 },
    );
    expect(d.priority).toBe("silent");
    expect(d.recommendedAudience).toHaveLength(0);
    expect(d.suppressReason).toBeTruthy();
  });

  it("QA6 — multi-tenant: dedupe key aislada por company", () => {
    const a = evaluateOperationalSignal({ ...base, eventType: "shift_updated" }, ctx);
    const b = evaluateOperationalSignal(
      { ...base, companyId: "co-2", eventType: "shift_updated" },
      { ...ctx, companyId: "co-2" },
    );
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
    expect(a.dedupeKey.startsWith("co:co-1")).toBe(true);
  });

  it("payroll exception no incluye workers", () => {
    const d = evaluateOperationalSignal({ ...base, eventType: "payroll_exception" }, ctx);
    expect(d.recommendedAudience.map((m) => m.userId)).toEqual(["pr"]);
  });

  it("detecta audiencia demasiado amplia", () => {
    const d = evaluateOperationalSignal(
      { ...base, eventType: "no_show_alert", actualRecipientsCount: 40 },
      ctx,
    );
    expect(d.riskDetected).toContain("over_broad_audience");
  });

  it("métricas de ruido", () => {
    expect(estimateNoiseReduction(40, 3)).toBeCloseTo(0.925, 3);
    const rows: ShadowDecisionRow[] = [
      {
        id: "1",
        company_id: "co-1",
        event_type: "no_show_alert",
        notification_family: "no_show",
        priority: "critical",
        should_group: false,
        requires_acknowledgement: true,
        suppress_reason: null,
        actual_recipients_count: 40,
        recommended_recipients_count: 3,
        estimated_noise_reduction: 0.925,
        risk_detected: ["over_broad_audience"],
        subject_user_id: "w1",
        created_at: "2026-08-01T10:00:00.000Z",
      },
    ];
    const m = computeShadowMetrics(rows);
    expect(m.criticalAlerts).toBe(1);
    expect(m.overBroadAudienceEvents).toBe(1);
    expect(m.estimatedNotificationReductionPct).toBeCloseTo(92.5, 1);
  });
});
