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
import { clientAccentColor, venueAccentIntensity } from "@/lib/clients/client-accent";
import {
  getCalendarServiceIdentity,
  type CalendarServiceIdentity,
  type CalendarShiftLike,
} from "./calendar-service-identity";
import { getServicePreparation, type ServicePreparation } from "./service-preparation";



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
  /** El título original no identificaba el Servicio (estado, nunca titular). */
  infoPending: boolean;

  accent: ServiceAccent;
  /** Color de identidad del Cliente (CSS). Nunca representa estado. */
  accentColor: string | null;
  team: ServiceTeamMember[];
  /** Preparación 0–100 (madurez del evento) — nunca es el estado operativo. */
  preparation: ServicePreparation;

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

/** Títulos que NO identifican al Servicio: si conocemos cliente/venue, mandan ellos. */
const PLACEHOLDER_TITLE = /^(informaci[oó]n?\s+pendien\w*|sin\s+t[ií]tulo|turno|servicio|pendiente)$/i;

/** "IMPERIAL — IMPERIAL" → "IMPERIAL". Sólo dedupe visual, nunca datos. */
function dedupeSegments(raw: string): string {
  const parts = raw.split(/\s+[—·|-]\s+/).map((p) => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const unique = parts.filter((p) => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.length > 0 ? unique.join(" · ") : raw;
}

/** Días naturales hasta la fecha del servicio (negativo = ya pasó). */
function daysUntilDate(date?: string | null): number | null {
  const raw = (date ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const target = new Date(`${raw}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Jerarquía de identidad: cliente/venue → tipo/título → QK.

 * "Información pendiente" es un ESTADO, nunca el título principal.
 */
function resolvePrimaryLabel(title: string, input: ServiceEventInput): string {
  const clean = dedupeSegments((title ?? "").trim());
  const client = (input.clientName ?? "").trim();
  const location = (input.locationName ?? "").trim();
  if (PLACEHOLDER_TITLE.test(clean)) return client || location || clean;
  return clean;
}

export function buildServiceEventModel(
  shift: CalendarShiftLike & { id?: string | null; client_id?: string | null; location_id?: string | null },
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

  const daysUntil = daysUntilDate(shift.date);
  const preparation = getServicePreparation(identity, { daysUntil });



  return {
    identity,
    primaryLabel: resolvePrimaryLabel(identity.title, input),
    timeLabel: identity.time.label,
    coverageLabel,

    coverageComplete: complete,
    isDraft: identity.service.isDraft,
    infoPending: PLACEHOLDER_TITLE.test(dedupeSegments((identity.title ?? "").trim())),

    accent: resolveAccent(identity),
    /** Identidad heredada del Cliente (Venue sólo modula la intensidad). */
    accentColor:
      clientAccentColor(shift.client_id, venueAccentIntensity(shift.location_id)) ?? null,
    team,
    preparation,

  };
}

