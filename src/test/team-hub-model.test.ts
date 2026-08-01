import { describe, it, expect } from "vitest";
import {
  teamSectionOf, summarizeTeam, primaryWorkerAction, detectTeamRisks, teamPrimaryIntent,
  type TeamHubAssignmentLike,
} from "@/lib/shifts/team-hub-model";

const a = (o: Partial<TeamHubAssignmentLike>): TeamHubAssignmentLike => ({
  id: o.id ?? "a1",
  employee_id: o.employee_id ?? "e1",
  status: o.status ?? "accepted",
  ...o,
});

describe("teamSectionOf", () => {
  it("clasifica confirmados y presentes como listos", () => {
    expect(teamSectionOf(a({ status: "confirmed" }))).toBe("ready");
    expect(teamSectionOf(a({ status: "pending", attendance_status: "present" }))).toBe("ready");
  });

  it("manda a atención a quien no tiene teléfono o llegó tarde", () => {
    expect(teamSectionOf(a({ status: "confirmed" }), { hasPhone: false })).toBe("attention");
    expect(teamSectionOf(a({ status: "confirmed", attendance_status: "late" }))).toBe("attention");
  });

  it("manda a reemplazos los rechazos y ausencias", () => {
    expect(teamSectionOf(a({ status: "rejected" }))).toBe("replacement");
    expect(teamSectionOf(a({ status: "confirmed", attendance_status: "absent" }))).toBe("replacement");
  });

  it("separa removidos e importados sin confirmar", () => {
    expect(teamSectionOf(a({ status: "removed" }))).toBe("removed");
    expect(teamSectionOf(a({ status: "accepted", import_batch_id: "b1" }))).toBe("pending");
  });
});

describe("summarizeTeam", () => {
  it("calcula cobertura, pendientes y faltantes", () => {
    const s = summarizeTeam(
      [
        a({ id: "1", status: "confirmed" }),
        a({ id: "2", status: "pending" }),
        a({ id: "3", status: "rejected" }),
        a({ id: "4", status: "removed" }),
      ],
      5,
    );
    expect(s.assigned).toBe(2);
    expect(s.confirmed).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.rejected).toBe(1);
    expect(s.removed).toBe(1);
    expect(s.missing).toBe(3);
    expect(s.isOperable).toBe(false);
  });

  it("marca operable cuando no hay brecha ni riesgo", () => {
    const s = summarizeTeam([a({ id: "1", status: "confirmed" })], 1);
    expect(s.isOperable).toBe(true);
    expect(s.coverageRatio).toBe(1);
  });

  it("cuenta quién no tiene teléfono", () => {
    const s = summarizeTeam([a({ id: "1", status: "confirmed", employee_id: "x" })], 1, () => false);
    expect(s.withoutPhone).toBe(1);
    expect(s.isOperable).toBe(false);
  });
});

describe("primaryWorkerAction", () => {
  it("da una sola acción contextual por persona", () => {
    expect(primaryWorkerAction(a({ status: "pending" })).kind).toBe("confirm");
    expect(primaryWorkerAction(a({ status: "confirmed" })).kind).toBe("contact");
    expect(primaryWorkerAction(a({ status: "rejected" })).kind).toBe("replace");
    expect(primaryWorkerAction(a({ status: "confirmed" }), { hasPhone: false }).kind).toBe("manage");
    expect(primaryWorkerAction(a({ status: "removed" })).kind).toBe("none");
  });

  it("sin permisos nunca ofrece confirmar ni reemplazar", () => {
    expect(primaryWorkerAction(a({ status: "pending" }), { canManage: false }).kind).toBe("contact");
    expect(primaryWorkerAction(a({ status: "rejected" }), { canManage: false }).kind).toBe("contact");
  });
});

describe("detectTeamRisks", () => {
  it("prioriza lo crítico y explica consecuencia", () => {
    const summary = summarizeTeam(
      [a({ id: "1", status: "confirmed", attendance_status: "absent" }), a({ id: "2", status: "pending" })],
      4,
    );
    const risks = detectTeamRisks({ summary, claimsPending: 2, hasLocation: false });
    expect(risks[0].key).toBe("no_show");
    expect(risks.map((r) => r.key)).toContain("open_spots");
    expect(risks.map((r) => r.key)).toContain("no_location");
    for (const r of risks) {
      expect(r.recommendation.length).toBeGreaterThan(0);
      expect(r.because.length).toBeGreaterThan(0);
      expect(r.impact.length).toBeGreaterThan(0);
    }
  });

  it("no inventa riesgos cuando el equipo está listo", () => {
    const summary = summarizeTeam([a({ id: "1", status: "confirmed" })], 1);
    expect(detectTeamRisks({ summary })).toHaveLength(0);
  });
});

describe("teamPrimaryIntent", () => {
  it("pasa de completar a confirmar y a operar", () => {
    expect(teamPrimaryIntent(summarizeTeam([], 3)).kind).toBe("complete");
    expect(teamPrimaryIntent(summarizeTeam([a({ status: "pending" })], 1)).kind).toBe("confirm");
    expect(teamPrimaryIntent(summarizeTeam([a({ status: "confirmed" })], 1)).kind).toBe("operate");
  });
});
