import { describe, it, expect } from "vitest";
import {
  resolveAssignmentResponseTruth,
  isWorkerConfirmed,
} from "../assignment-response-truth";

describe("assignment response truth", () => {
  it("no afirma confirmación del trabajador sin evidencia (caso de las 5.809 filas)", () => {
    const t = resolveAssignmentResponseTruth({
      status: "confirmed",
      response_status: "pending",
      accepted_at: null,
      responded_at: null,
    });
    expect(t.code).toBe("roster_committed_no_response");
    expect(t.workerAttested).toBe(false);
    expect(t.operationallyCommitted).toBe(true);
    expect(isWorkerConfirmed({ status: "confirmed", response_status: "pending" })).toBe(false);
  });

  it("acepta status=accepted importado como roster, no como respuesta", () => {
    const t = resolveAssignmentResponseTruth({ status: "accepted", response_status: "pending" });
    expect(t.code).toBe("roster_committed_no_response");
  });

  it("reconoce la aceptación real del trabajador", () => {
    const t = resolveAssignmentResponseTruth({
      status: "confirmed",
      response_status: "accepted",
      accepted_at: "2026-01-01T00:00:00Z",
    });
    expect(t.code).toBe("accepted_by_worker");
    expect(t.workerAttested).toBe(true);
  });

  it("trata evidencia de respuesta sin response_status como aceptación", () => {
    const t = resolveAssignmentResponseTruth({
      status: "confirmed",
      response_status: "pending",
      responded_at: "2026-01-01T00:00:00Z",
    });
    expect(t.code).toBe("accepted_by_worker");
  });

  it("distingue rechazo, retiro y reconfirmación", () => {
    expect(resolveAssignmentResponseTruth({ status: "confirmed", response_status: "rejected" }).code)
      .toBe("rejected_by_worker");
    expect(resolveAssignmentResponseTruth({ status: "removed", response_status: "accepted" }).code)
      .toBe("removed");
    expect(
      resolveAssignmentResponseTruth({ status: "confirmed", response_status: "needs_reacceptance" }).code,
    ).toBe("needs_reacceptance");
  });

  it("marca espera de respuesta en asignaciones nuevas", () => {
    const t = resolveAssignmentResponseTruth({ status: "pending", response_status: "pending" });
    expect(t.code).toBe("awaiting_worker_response");
    expect(t.operationallyCommitted).toBe(false);
  });

  it("no inventa estado cuando no hay datos", () => {
    expect(resolveAssignmentResponseTruth(null).code).toBe("unknown");
    expect(resolveAssignmentResponseTruth({ status: "weird", response_status: "" }).code).toBe("unknown");
  });

  it("identifica reservas de borrador", () => {
    const t = resolveAssignmentResponseTruth({ status: "confirmed", is_draft_reservation: true });
    expect(t.code).toBe("draft_reservation");
    expect(t.operationallyCommitted).toBe(false);
  });
});
