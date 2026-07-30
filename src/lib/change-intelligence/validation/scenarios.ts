/**
 * F1.1 — controlled validation scenario matrix (A..O).
 *
 * PURE fixtures. No database, no network, no delivery. Used by the test suite
 * and by the observation panel to run a synthetic pass on demand.
 */
import type { AudienceRef, DomainChangeEvent, FieldDelta } from "../engine/types";

const AT = "2026-07-30T12:00:00.000Z";
const SHIFT_DATE = "2026-08-05";

export interface Scenario {
  id: string;
  group: string;
  title: string;
  expectation: string;
  event: DomainChangeEvent;
}

const reachable = (): Pick<AudienceRef, "reachableChannels" | "reachability"> => ({
  reachableChannels: ["inbox"],
  reachability: "reachable",
});

export const worker = (id: string, extra: Partial<AudienceRef> = {}): AudienceRef => ({
  partyId: id,
  partyType: "worker",
  relation: "assigned",
  sourceObjectId: "shift-1",
  deduplicationKey: `person:${id}`,
  displayLabel: id,
  ...reachable(),
  ...extra,
});

export const shiftManager = (id: string, extra: Partial<AudienceRef> = {}): AudienceRef => ({
  partyId: id,
  partyType: "manager",
  relation: "responsible",
  relationshipType: "shift_explicit",
  resolutionPriority: 1,
  sourceObjectId: "shift-1",
  deduplicationKey: `person:${id}`,
  displayLabel: id,
  ...reachable(),
  ...extra,
});

export const supervisor = (id: string, extra: Partial<AudienceRef> = {}): AudienceRef =>
  worker(id, { relation: "supervisor", ...extra });

const delta = (over: Partial<FieldDelta> & Pick<FieldDelta, "field" | "semantic" | "before" | "after">): FieldDelta => ({
  materiality: "operational",
  ...over,
});

const baseContext = {
  shiftCode: "SH-001",
  subjectLabel: "SH-001",
  shiftDate: SHIFT_DATE,
  locationId: "loc-1",
  locationLabel: "Bodega Norte",
  clientId: "cli-1",
  clientLabel: "Cliente Alfa",
  ackDeadline: "2026-08-04 18:00",
};

function event(over: Partial<DomainChangeEvent>): DomainChangeEvent {
  return {
    eventId: "evt",
    correlationId: "corr",
    occurredAt: AT,
    schemaVersion: 1,
    domain: "scheduling",
    changeType: "shift.time_changed",
    aggregateType: "shift",
    subject: { type: "shift", id: "shift-1", label: "SH-001" },
    actor: { id: "actor-admin", type: "user", label: "Admin" },
    tenantId: "company-1",
    fields: [],
    audienceHints: [],
    context: { ...baseContext },
    ...over,
  };
}

const timeDelta = delta({
  field: "start_time",
  semantic: "time",
  label: "Inicio",
  before: "08:00",
  after: "10:00",
});
const endDelta = delta({
  field: "end_time",
  semantic: "time",
  label: "Fin",
  before: "16:00",
  after: "18:00",
});
const dateDelta = delta({
  field: "date",
  semantic: "date",
  label: "Fecha",
  before: "2026-08-05",
  after: "2026-08-07",
});
const locationDelta = delta({
  field: "location_id",
  semantic: "location",
  label: "Ubicación",
  before: "loc-1",
  after: "loc-2",
  beforeLabel: "Bodega Norte",
  afterLabel: "Planta Sur",
});

export const SCENARIOS: Scenario[] = [
  {
    id: "A1",
    group: "A. Cambio de hora",
    title: "Un trabajador asignado",
    expectation: "Nivel 2; 1 mensaje al trabajador; manager resuelto si existe evidencia.",
    event: event({
      eventId: "A1",
      correlationId: "A1",
      fields: [timeDelta],
      audienceHints: [worker("w1")],
      legacyAudience: ["w1", "mgr-global-1", "mgr-global-2"],
    }),
  },
  {
    id: "A2",
    group: "A. Cambio de hora",
    title: "Varios trabajadores asignados",
    expectation: "Un mensaje por trabajador, sin duplicados.",
    event: event({
      eventId: "A2",
      correlationId: "A2",
      fields: [timeDelta],
      audienceHints: [worker("w1"), worker("w2"), worker("w3")],
      legacyAudience: ["w1", "w2", "w3", "mgr-global-1"],
    }),
  },
  {
    id: "A3",
    group: "A. Cambio de hora",
    title: "Varios campos en una sola operación",
    expectation: "Un único resumen consolidado con ambos deltas.",
    event: event({
      eventId: "A3",
      correlationId: "A3",
      fields: [timeDelta, endDelta],
      audienceHints: [worker("w1")],
      legacyAudience: ["w1"],
    }),
  },
  {
    id: "B",
    group: "B. Cambio de fecha",
    title: "Fecha movida",
    expectation: "Nivel 3 con ack probatorio.",
    event: event({
      eventId: "B",
      correlationId: "B",
      changeType: "shift.date_changed",
      fields: [dateDelta],
      audienceHints: [worker("w1"), shiftManager("m1")],
      legacyAudience: ["w1", "m1", "mgr-global-1"],
    }),
  },
  {
    id: "C",
    group: "C. Cambio de ubicación",
    title: "Ubicación movida",
    expectation: "Nivel 3 para trabajador; mensaje indica no ir al sitio anterior.",
    event: event({
      eventId: "C",
      correlationId: "C",
      changeType: "shift.location_changed",
      fields: [locationDelta],
      audienceHints: [worker("w1"), shiftManager("m1")],
      legacyAudience: ["w1", "m1"],
    }),
  },
  {
    id: "D",
    group: "D. Trabajador agregado",
    title: "Alta de trabajador",
    expectation: "Solo el nuevo trabajador recibe asignación; el resto no.",
    event: event({
      eventId: "D",
      correlationId: "D",
      changeType: "shift.worker_added",
      fields: [
        delta({ field: "assigned_worker", semantic: "person", label: "Trabajador", before: null, after: "w-in", afterLabel: "Luis" }),
      ],
      context: { ...baseContext, workerInLabel: "Luis" },
      audienceHints: [worker("w-in"), supervisor("sup-1")],
      legacyAudience: ["w-in", "w-other", "sup-1", "mgr-global-1"],
    }),
  },
  {
    id: "E",
    group: "E. Trabajador removido",
    title: "Baja de trabajador sin reemplazo",
    expectation: "El removido recibe solo información de su salida.",
    event: event({
      eventId: "E",
      correlationId: "E",
      changeType: "shift.worker_removed",
      fields: [
        delta({ field: "assigned_worker", semantic: "person", label: "Trabajador", before: "w-out", after: null, beforeLabel: "Ana" }),
      ],
      context: { ...baseContext, workerOutLabel: "Ana", isReplacement: false },
      audienceHints: [worker("w-out", { relation: "removed" }), supervisor("sup-1")],
      legacyAudience: ["w-out", "sup-1", "mgr-global-1"],
    }),
  },
  {
    id: "F",
    group: "F. Reemplazo",
    title: "A sale, B entra en una sola operación",
    expectation: "Un correlationId; mensajes diferenciados; terceros no reciben nada nuevo.",
    event: event({
      eventId: "F",
      correlationId: "F",
      changeType: "shift.worker_removed",
      fields: [
        delta({
          field: "assigned_worker",
          semantic: "person",
          label: "Trabajador",
          before: "w-out",
          after: "w-in",
          beforeLabel: "Ana",
          afterLabel: "Luis",
        }),
      ],
      context: { ...baseContext, workerOutLabel: "Ana", workerInLabel: "Luis", isReplacement: true },
      audienceHints: [
        worker("w-out", { relation: "removed" }),
        worker("w-in"),
        supervisor("sup-1"),
      ],
      legacyAudience: ["w-out", "w-in", "w-other", "sup-1", "mgr-global-1"],
    }),
  },
  {
    id: "G",
    group: "G. Cancelación",
    title: "Turno cancelado",
    expectation: "Nivel 3, ack probatorio, indica no presentarse.",
    event: event({
      eventId: "G",
      correlationId: "G",
      changeType: "shift.cancelled",
      fields: [
        delta({ field: "status", semantic: "status", label: "Estado", before: "scheduled", after: "cancelled" }),
      ],
      audienceHints: [worker("w1"), worker("w2"), shiftManager("m1")],
      legacyAudience: ["w1", "w2", "m1", "mgr-global-1"],
    }),
  },
  {
    id: "H",
    group: "H. Manager explícito (shift_admin_id)",
    title: "Manager por campo del turno",
    expectation: "managerResolution = resolved, prioridad 1.",
    event: event({
      eventId: "H",
      correlationId: "H",
      fields: [timeDelta],
      audienceHints: [worker("w1"), shiftManager("m-field", { sourceObjectId: "shift-1" })],
      legacyAudience: ["w1", "m-field"],
    }),
  },
  {
    id: "I",
    group: "I. Manager explícito (assignment_role)",
    title: "Manager por asignación shift_admin",
    expectation: "managerResolution = resolved con sourceObjectId de la asignación.",
    event: event({
      eventId: "I",
      correlationId: "I",
      fields: [timeDelta],
      audienceHints: [worker("w1"), shiftManager("m-assign", { sourceObjectId: "assign-9" })],
      legacyAudience: ["w1", "m-assign"],
    }),
  },
  {
    id: "J",
    group: "J. Supervisor check_in_admin",
    title: "check_in_admin no es manager",
    expectation: "Relación supervisor; managerResolution permanece unresolved.",
    event: event({
      eventId: "J",
      correlationId: "J",
      fields: [timeDelta],
      audienceHints: [worker("w1"), supervisor("chk-1")],
      legacyAudience: ["w1", "chk-1"],
    }),
  },
  {
    id: "K",
    group: "K. Manager = Supervisor",
    title: "Misma persona en dos relaciones",
    expectation: "Una sola comunicación consolidada.",
    event: event({
      eventId: "K",
      correlationId: "K",
      fields: [timeDelta],
      audienceHints: [shiftManager("p1"), supervisor("p1"), worker("w1")],
      legacyAudience: ["p1", "w1"],
    }),
  },
  {
    id: "L",
    group: "L. Sin manager explícito",
    title: "Turno sin relación verificable",
    expectation: "unresolved; no se amplía audiencia a managers de tenant.",
    event: event({
      eventId: "L",
      correlationId: "L",
      fields: [timeDelta],
      audienceHints: [worker("w1")],
      legacyAudience: ["w1", "mgr-global-1", "mgr-global-2", "mgr-global-3"],
    }),
  },
  {
    id: "M",
    group: "M. Sin puente employee → user",
    title: "Afectado no alcanzable",
    expectation: "Aparece como afectado, canal simulado 'none', razón explícita.",
    event: event({
      eventId: "M",
      correlationId: "M",
      fields: [timeDelta],
      audienceHints: [
        worker("w-nolink", {
          reachability: "unreachable",
          reachableChannels: [],
          reachabilityReason: "no_employee_to_user_bridge",
        }),
      ],
      legacyAudience: ["w-nolink"],
    }),
  },
  {
    id: "N",
    group: "N. Nivel 0",
    title: "Solo nota interna",
    expectation: "Silencio total; razón de supresión registrada.",
    event: event({
      eventId: "N",
      correlationId: "N",
      fields: [
        delta({ field: "notes", semantic: "text", materiality: "internal", before: "a", after: "b" }),
      ],
      audienceHints: [worker("w1"), shiftManager("m1")],
      legacyAudience: ["w1", "m1", "mgr-global-1"],
    }),
  },
  {
    id: "O",
    group: "O. Cambio ambiguo",
    title: "Tipo de cambio no registrado",
    expectation: "Sin mensajes; suppressionReason = change_type_not_registered.",
    event: event({
      eventId: "O",
      correlationId: "O",
      changeType: "shift.something_unknown",
      fields: [timeDelta],
      audienceHints: [worker("w1")],
      legacyAudience: ["w1", "mgr-global-1"],
    }),
  },
];
