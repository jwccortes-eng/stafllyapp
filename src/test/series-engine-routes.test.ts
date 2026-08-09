/**
 * P0 FINAL — STAFLY COMO ESPEJO DE LA OPERACIÓN
 *
 * Todas las rutas que crean Servicios (Crear, Borrador, Publicar, Duplicar,
 * Copiar semana, Editar → Repetir) comparten un único contrato: snapshot
 * canónico → intención → vista previa → verificación.
 */
import { describe, it, expect } from "vitest";

import {
  snapshotFromServiceRow,
  buildSeriesIntentFromSnapshot,
  buildSeriesPreview,
  verifySeriesIntegrity,
} from "@/lib/shifts/series-engine";
import { buildCanonicalServiceInsert } from "@/lib/shifts/recurrence";

const COMPANY = "11111111-1111-1111-1111-111111111111";

const row = {
  id: "src-1",
  title: "Imperial — Meseros",
  date: "2026-08-30",
  start_time: "17:00",
  end_time: "23:00",
  slots: 4,
  client_id: "client-imperial",
  location_id: "loc-1",
  job_site_location_id: "venue-1",
  notes: "Entrada por atrás",
  special_instructions: "Uniforme negro",
  pay_type: "hourly",
  day_type: "full_day",
  transportation_required: true,
  car_capacity: 6,
};

describe("Motor único de series — snapshot canónico", () => {
  it("conserva la realidad del Servicio origen", () => {
    const snap = snapshotFromServiceRow(row, { companyId: COMPANY });
    expect(snap.clientId).toBe("client-imperial");
    expect(snap.jobSiteLocationId).toBe("venue-1");
    expect(snap.startTime).toBe("17:00");
    expect(snap.endTime).toBe("23:00");
    expect(snap.requestedHeadcount).toBe(4);
    expect(snap.title).toBe("Imperial — Meseros");
    expect(snap.transportRequired).toBe(true);
  });

  it("respeta las exclusiones explícitas del operador", () => {
    const snap = snapshotFromServiceRow(row, {
      companyId: COMPANY,
      include: { client: false, notes: false, roles: false },
    });
    expect(snap.clientId).toBeNull();
    expect(snap.notes).toBeNull();
    expect(snap.shiftAdminId).toBeNull();
    // La identidad operativa mínima nunca se pierde.
    expect(snap.title).toBe("Imperial — Meseros");
    expect(snap.startTime).toBe("17:00");
  });

  it("la fila insertada deriva solo del snapshot", () => {
    const snap = snapshotFromServiceRow(row, { companyId: COMPANY });
    const insert = buildCanonicalServiceInsert({
      snapshot: snap,
      date: "2026-09-06",
      sourceRef: "ref-1",
      createdBy: "user-1",
      draft: true,
    }) as Record<string, unknown>;
    expect(insert.date).toBe("2026-09-06");
    expect(insert.client_id).toBe("client-imperial");
    expect(insert.slots).toBe(4);
    expect(insert.company_id).toBe(COMPANY);
  });
});

describe("Vista previa y verificación", () => {
  it("previsualiza exactamente las ocurrencias que se crearán", () => {
    const snap = snapshotFromServiceRow(row, { companyId: COMPANY });
    const intent = buildSeriesIntentFromSnapshot({
      snapshot: snap,
      baseDate: "2026-08-30",
      repeatDates: ["2026-08-31", "2026-09-01"],
    });
    const preview = buildSeriesPreview(intent);
    expect(preview.total).toBe(3);
    expect(preview.rows.map((r) => r.date)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ]);
  });

  it("detecta divergencias entre lo previsto y lo persistido", () => {
    const snap = snapshotFromServiceRow(row, { companyId: COMPANY });
    const intent = buildSeriesIntentFromSnapshot({ snapshot: snap, baseDate: "2026-08-30" });
    const bad = verifySeriesIntegrity({
      intent,
      persisted: [{
        date: "2026-08-30",
        shiftId: "new-1",
        ref: "QK-001600",
        clientId: null, // cliente perdido
        venueId: "venue-1",
        startTime: "17:00",
        endTime: "23:00",
        headcount: 4,
        assignmentCount: 0,
        seriesRef: intent.recurrence.occurrences[0].sourceRef,
      }],
    });
    expect(bad.ok).toBe(false);

    const good = verifySeriesIntegrity({
      intent,
      persisted: [{
        date: "2026-08-30",
        shiftId: "new-1",
        ref: "QK-001600",
        clientId: "client-imperial",
        venueId: "venue-1",
        startTime: "17:00",
        endTime: "23:00",
        headcount: 4,
        assignmentCount: 0,
        seriesRef: intent.recurrence.occurrences[0].sourceRef,
      }],
    });
    expect(good.ok).toBe(true);
  });
});
