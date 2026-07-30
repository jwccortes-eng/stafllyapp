/**
 * Scheduling change type registry — DATA ONLY (no logic, no imports of domain code).
 * Scope authorised for F1: 6 change types. See CHANGE_INTELLIGENCE_CHANGE_CATALOG.md.
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
      assigned: "Cambió el horario de {subject.label}. {diff}",
      supervisor: "Horario actualizado en {subject.label}. {diff}",
      responsible: "Horario actualizado en {subject.label}. {diff}",
    },
  },
  {
    changeType: "shift.date_changed",
    defaultLevel: 3,
    audienceMatrix: { assigned: 3, supervisor: 3, responsible: 3 },
    requiresAck: "probatory",
    templates: {
      assigned: "Cambió la fecha de {subject.label}. {diff}",
      supervisor: "Fecha actualizada en {subject.label}. {diff}",
      responsible: "Fecha actualizada en {subject.label}. {diff}",
    },
  },
  {
    changeType: "shift.location_changed",
    defaultLevel: 3,
    audienceMatrix: { assigned: 3, supervisor: 3, responsible: 2 },
    requiresAck: "probatory",
    templates: {
      assigned: "Cambió la ubicación de {subject.label}. {diff}",
      supervisor: "Ubicación actualizada en {subject.label}. {diff}",
      responsible: "Ubicación actualizada en {subject.label}. {diff}",
    },
  },
  {
    changeType: "shift.worker_added",
    defaultLevel: 3,
    audienceMatrix: { assigned: 3, supervisor: 2, responsible: 2 },
    requiresAck: "light",
    templates: {
      assigned: "Has sido asignado al turno {subject.label}.",
      supervisor: "{context.workerInLabel} fue asignado a {subject.label}.",
      responsible: "{context.workerInLabel} fue asignado a {subject.label}.",
    },
  },
  {
    changeType: "shift.worker_removed",
    defaultLevel: 3,
    audienceMatrix: { removed: 3, assigned: 3, supervisor: 2, responsible: 2 },
    requiresAck: "light",
    templates: {
      removed: "Ya no estás asignado al turno {subject.label}.",
      assigned: "Has sido asignado al turno {subject.label}.",
      supervisor: "{context.workerOutLabel} fue reemplazado por {context.workerInLabel} en {subject.label}.",
      responsible: "{context.workerOutLabel} fue reemplazado por {context.workerInLabel} en {subject.label}.",
    },
  },
  {
    changeType: "shift.cancelled",
    defaultLevel: 3,
    audienceMatrix: { assigned: 3, supervisor: 3, responsible: 3 },
    requiresAck: "probatory",
    templates: {
      assigned: "El turno {subject.label} fue cancelado. {diff}",
      supervisor: "El turno {subject.label} fue cancelado. {diff}",
      responsible: "El turno {subject.label} fue cancelado. {diff}",
    },
  },
];
