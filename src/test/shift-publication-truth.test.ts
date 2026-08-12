import { describe, it, expect } from "vitest";
import {
  resolveShiftPublicationTruth,
  canAnnounceOpenShift,
  resolveShiftCapacity,
} from "@/lib/shifts/publication-truth";

const draftShift = { publication_status: "draft" as const, status: "open", slots: 2 };
const pubShift = { publication_status: "published" as const, status: "open", slots: 2 };
const cancelled = { publication_status: "cancelled" as const, status: "cancelled", slots: 2 };

const active = { status: "assigned", response_status: "pending", is_draft_reservation: false };
const reservation = { status: "assigned", response_status: "pending", is_draft_reservation: true };

describe("publication truth", () => {
  it("A · asignación interna sobre borrador no es visible ni notificable", () => {
    const t = resolveShiftPublicationTruth({ shift: draftShift, assignment: active });
    expect(t.state).toBe("ASSIGNED_INTERNAL");
    expect(t.visible_to_worker).toBe(false);
    expect(t.notification_eligible).toBe(false);
    expect(t.notification_status).toBe("not_eligible");
    expect(t.admin_label).toBe("Asignado internamente · pendiente de publicar");
    expect(t.admin_blocking_reason).toMatch(/borrador/);
  });

  it("B · publicado con asignación activa es visible", () => {
    const t = resolveShiftPublicationTruth({ shift: pubShift, assignment: active });
    expect(t.state).toBe("VISIBLE_TO_WORKER");
    expect(t.visible_to_worker).toBe(true);
    expect(t.notification_status).toBe("not_sent");
    expect(t.worker_action_available).toBe(true);
  });

  it("C · publicado + notificado", () => {
    const t = resolveShiftPublicationTruth({
      shift: pubShift,
      assignment: { ...active, notified_at: "2026-08-11T10:00:00Z" },
    });
    expect(t.state).toBe("NOTIFIED");
    expect(t.admin_label).toBe("Publicado · notificado");
  });

  it("acepta y rechaza", () => {
    expect(
      resolveShiftPublicationTruth({
        shift: pubShift,
        assignment: { ...active, response_status: "accepted" },
      }).state,
    ).toBe("ACCEPTED");
    expect(
      resolveShiftPublicationTruth({
        shift: pubShift,
        assignment: { ...active, response_status: "rejected" },
      }).state,
    ).toBe("REJECTED");
  });

  it("reserva de borrador nunca es visible", () => {
    const t = resolveShiftPublicationTruth({ shift: pubShift, assignment: reservation });
    expect(t.visible_to_worker).toBe(false);
    expect(t.assignment_status).toBe("draft_reservation");
  });

  it("D · cupo lleno cancela la convocatoria abierta", () => {
    const full = canAnnounceOpenShift({
      shift: { ...pubShift, claimable: true },
      assignments: [active, active],
    });
    expect(full).toBe(false);
    const open = canAnnounceOpenShift({
      shift: { ...pubShift, claimable: true },
      assignments: [active],
    });
    expect(open).toBe(true);
  });

  it("borrador y cancelado nunca ofrecen convocatoria abierta", () => {
    expect(canAnnounceOpenShift({ shift: { ...draftShift, claimable: true } })).toBe(false);
    expect(canAnnounceOpenShift({ shift: { ...cancelled, claimable: true } })).toBe(false);
  });

  it("trabajador no elegible no recibe convocatoria ni notificación", () => {
    const t = resolveShiftPublicationTruth({
      shift: { ...pubShift, claimable: true },
      assignment: active,
      workerEligible: false,
    });
    expect(t.notification_eligible).toBe(false);
    expect(t.open_call_available).toBe(false);
  });

  it("fichaje y cierre mandan sobre el resto", () => {
    expect(
      resolveShiftPublicationTruth({
        shift: pubShift,
        assignment: { ...active, clock_in_at: "2026-08-11T12:00:00Z" },
      }).state,
    ).toBe("CLOCKED_IN");
    expect(
      resolveShiftPublicationTruth({
        shift: { ...pubShift, closed_at: "2026-08-11T22:00:00Z" },
        assignment: active,
      }).state,
    ).toBe("CLOSED");
  });

  it("cancelado gana siempre", () => {
    const t = resolveShiftPublicationTruth({ shift: cancelled, assignment: active });
    expect(t.state).toBe("CANCELLED");
    expect(t.visible_to_worker).toBe(false);
  });

  it("capacidad canónica", () => {
    const c = resolveShiftCapacity({ slots: 3 }, [active, { ...active, response_status: "accepted" }]);
    expect(c).toMatchObject({ required_count: 3, assigned_count: 2, confirmed_count: 1, open_slots: 1, is_full: false });
  });
});
