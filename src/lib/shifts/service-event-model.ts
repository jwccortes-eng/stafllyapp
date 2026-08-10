/**
 * P1 — PREMIUM SERVICE CALENDAR SYSTEM
 * ====================================
 *
 * Modelo de presentación canónico de un SERVICIO dentro de cualquier calendario
 * (Mes · Semana · Cliente · Cuadrícula).
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro / solo lectura. Sin React, sin BD, sin escrituras.
 *   No crea datos nuevos: reutiliza `getCalendarServiceIdentity` (fuente única
 *   de identidad/estado) y añade únicamente lo que la tarjeta necesita pintar
 *   (equipo asignado como METADATA del Servicio, nunca como evento propio).
 */
import {
  getCalendarServiceIdentity,
  type CalendarServiceIdentity,
  type CalendarShiftLike,
} from "./calendar-service-identity";

export type ServiceAccent = "positive" | "warning" | "draft" | "critical" | "neutral";

export interface ServiceTeamMember {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  gender?: string | null;
}

export interface ServiceEventModel {
  identity: CalendarServiceIdentity;
  /** Cliente/Venue/título operativo — SIEMPRE la primera línea de la tarjeta. */
  primaryLabel: string;
  /** "16:00–21:00" / "Aprox. 17:00" / "Horario pendiente". */
  timeLabel: string;
  /** "6/6" · "0/2" · "3 asignados" cuando las plazas están pendientes. */
  coverageLabel: string;
  coverageComplete: boolean;
  isDraft: boolean;
  accent: ServiceAccent;
  team: ServiceTeamMember[];
}

interface MinimalEmployee {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  gender?: string | null;
}

interface MinimalAssignment {
  shift_id: string;
  employee_id: string;
  status?: string;
}

export interface ServiceEventInput {
  assignments: MinimalAssignment[];
  employees?: MinimalEmployee[];
  clientName?: string | null;
  locationName?: string | null;
}

/** Estado visual: sólo rojo cuando existe un problema real (cancelado). */
function resolveAccent(identity: CalendarServiceIdentity): ServiceAccent {
  if (identity.service.code === "cancelled") return "critical";
  if (identity.service.isDraft) return "draft";
  if (identity.service.code === "archived") return "neutral";
  if (identity.staffing.complete) return "positive";
  return "warning";
}

export function buildServiceEventModel(
  shift: CalendarShiftLike & { id?: string | null },
  input: ServiceEventInput,
): ServiceEventModel {
  const shiftId = shift.id ?? "";
  const shiftAssignments = input.assignments.filter((a) => a.shift_id === shiftId);
  const employees = input.employees ?? [];

  const team: ServiceTeamMember[] = shiftAssignments
    .map((a) => employees.find((e) => e.id === a.employee_id))
    .filter((e): e is MinimalEmployee => !!e)
    .map((e) => ({
      id: e.id,
      firstName: e.first_name,
      lastName: e.last_name,
      avatarUrl: e.avatar_url ?? null,
      gender: e.gender ?? null,
    }));

  const identity = getCalendarServiceIdentity(shift, {
    assignedCount: shiftAssignments.length,
    clientName: input.clientName ?? null,
    locationName: input.locationName ?? null,
  });

  const { assigned, slots, pending, complete } = identity.staffing;
  const coverageLabel = pending
    ? assigned > 0
      ? `${assigned} asignados`
      : "Personal pendiente"
    : `${assigned}/${slots ?? 0}`;

  return {
    identity,
    primaryLabel: resolvePrimaryLabel(identity.title, input),
    timeLabel: identity.time.label,
    coverageLabel,

    coverageComplete: complete,
    isDraft: identity.service.isDraft,
    accent: resolveAccent(identity),
    team,
  };
}
