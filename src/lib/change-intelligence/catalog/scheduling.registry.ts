/**
 * Scheduling change type registry — DATA ONLY (no logic, no imports of domain code).
 * Scope authorised for F1: 6 change types. See CHANGE_INTELLIGENCE_CHANGE_CATALOG.md.
 *
 * F1.1 message quality contract — every template must answer:
 *  1. what changed (before → after)
 *  2. what it means for THIS person
 *  3. what to do
 *  4. whether confirmation is required
 *  5. by when, when applicable
 * Generic wording ("turno actualizado", "revisa la app") is not acceptable.
 */
import type { ChangeTypeRegistration } from "../engine/types";

export const SCHEDULING_CHANGE_TYPES = [
  "shift.time_changed",
  "shift.date_changed",
  "shift.location_changed",
  "shift.worker_added",
  "shift.worker_removed",
  "shift.cancelled",
] as const;

export type SchedulingChangeType = (typeof SCHEDULING_CHANGE_TYPES)[number];

export const schedulingRegistry: ChangeTypeRegistration[] = [
  {
    changeType: "shift.time_changed",
    defaultLevel: 2,
    audienceMatrix: { assigned: 2, supervisor: 2, responsible: 2 },
    requiresAck: "probatory",
    templates: {
      assigned:
        "Cambió tu horario en {subject.label} ({context.shiftDate}). {diff}. Debes presentarte en el nuevo horario. Confirma que puedes cumplirlo antes de {context.ackDeadline}.",
      supervisor:
        "Cambió el horario de {subject.label} ({context.shiftDate}). {diff}. Verifica cobertura en el nuevo horario y confirma la asistencia del equipo antes de {context.ackDeadline}.",
      responsible:
        "Cambió el horario de {subject.label} ({context.shiftDate}). {diff}. Revisa que el turno siga cubierto y resuelve rechazos antes de {context.ackDeadline}.",
    },
  },
  {
    changeType: "shift.date_changed",
    defaultLevel: 3,
    audienceMatrix: { assigned: 3, supervisor: 3, responsible: 3 },
    requiresAck: "probatory",
    templates: {
      assigned:
        "Cambió la fecha de tu turno {subject.label}. {diff}. Ya no debes presentarte en la fecha anterior. Confirma tu disponibilidad para la nueva fecha antes de {context.ackDeadline}.",
      supervisor:
        "Cambió la fecha de {subject.label}. {diff}. Revalida la cobertura para la nueva fecha y confirma antes de {context.ackDeadline}.",
      responsible:
        "Cambió la fecha de {subject.label}. {diff}. Confirma disponibilidad del personal asignado antes de {context.ackDeadline}.",
    },
  },
  {
    changeType: "shift.location_changed",
    defaultLevel: 3,
    audienceMatrix: { assigned: 3, supervisor: 3, responsible: 2 },
    requiresAck: "probatory",
    templates: {
      assigned:
        "Cambió el lugar de tu turno {subject.label} ({context.shiftDate}). {diff}. Debes presentarte en la nueva ubicación; no vayas a la anterior. Confirma que puedes llegar antes de {context.ackDeadline}.",
      supervisor:
        "Cambió la ubicación de {subject.label} ({context.shiftDate}). {diff}. Verifica traslados y punto de encuentro del equipo antes de {context.ackDeadline}.",
      responsible:
        "Cambió la ubicación de {subject.label} ({context.shiftDate}). {diff}. Confirma que el equipo asignado puede llegar al nuevo sitio antes de {context.ackDeadline}.",
    },
  },
  {
    changeType: "shift.worker_added",
    defaultLevel: 3,
    audienceMatrix: { assigned: 3, supervisor: 2, responsible: 2 },
    requiresAck: "light",
    templates: {
      assigned:
        "Fuiste asignado al turno {subject.label} ({context.shiftDate}). Debes presentarte en el horario y lugar indicados en el turno. Confirma que aceptas la asignación antes de {context.ackDeadline}.",
      supervisor:
        "{context.workerInLabel} entra al turno {subject.label} ({context.shiftDate}). Inclúyelo en el briefing y en el control de asistencia.",
      responsible:
        "{context.workerInLabel} entra al turno {subject.label} ({context.shiftDate}). El turno queda cubierto con esta asignación.",
    },
  },
  {
    changeType: "shift.worker_removed",
    defaultLevel: 3,
    audienceMatrix: { removed: 3, assigned: 3, supervisor: 2, responsible: 2 },
    requiresAck: "light",
    templates: {
      removed:
        "Ya no estás asignado al turno {subject.label} ({context.shiftDate}). No debes presentarte. No se requiere acción de tu parte; este turno ya no cuenta en tu agenda.",
      assigned:
        "Fuiste asignado al turno {subject.label} ({context.shiftDate}) en reemplazo de {context.workerOutLabel}. Debes presentarte en el horario y lugar del turno. Confirma la asignación antes de {context.ackDeadline}.",
      supervisor:
        "{context.workerOutLabel} sale y {context.workerInLabel} entra en {subject.label} ({context.shiftDate}). Actualiza el briefing y el control de asistencia con la persona correcta.",
      responsible:
        "{context.workerOutLabel} sale y {context.workerInLabel} entra en {subject.label} ({context.shiftDate}). El turno permanece cubierto; no requiere reasignación adicional.",
    },
  },
  {
    changeType: "shift.cancelled",
    defaultLevel: 3,
    audienceMatrix: { assigned: 3, supervisor: 3, responsible: 3 },
    requiresAck: "probatory",
    templates: {
      assigned:
        "El turno {subject.label} del {context.shiftDate} fue cancelado. No debes presentarte. Confirma que viste esta cancelación antes de {context.ackDeadline}.",
      supervisor:
        "El turno {subject.label} del {context.shiftDate} fue cancelado. No habrá operación; avisa al personal en sitio y confirma antes de {context.ackDeadline}.",
      responsible:
        "El turno {subject.label} del {context.shiftDate} fue cancelado. Verifica impacto con el cliente y confirma antes de {context.ackDeadline}.",
    },
  },
];
