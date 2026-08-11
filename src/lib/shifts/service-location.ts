/**
 * service-location — MODELO CANÓNICO ÚNICO de "dónde ocurre el Servicio".
 *
 * PROBLEMA QUE RESUELVE:
 *   El editor del Servicio, el portal del trabajador y el Live Map leían
 *   fuentes distintas (unas `locations` legado, otras `locations_v2`, otras
 *   el texto libre `job_site_address`). Resultado: un Servicio con dirección
 *   válida aparecía "Por confirmar" para el trabajador.
 *
 * FUENTE DE VERDAD (orden de prioridad, sin campos nuevos):
 *   Destino (Job Site):
 *     1. `job_site_location_id` → locations_v2  (estructurado, con coords)
 *     2. `location_id`          → locations     (venue legado, con coords)
 *     3. `job_site_address`     → texto libre   (sin coords)
 *   Punto de encuentro:
 *     1. `meeting_point_location_id` → locations_v2
 *     2. `meeting_point`             → texto libre
 *   El punto de encuentro SOLO es relevante si `transportation_required`.
 *   Con transporte desactivado nunca se pide ni se muestra como pendiente.
 *
 * Puro: sin acceso a datos, sin efectos. Todas las superficies (portal,
 * live map, editor) deben derivar de aquí.
 */
import {
  getShiftLocationStatus,
  type ShiftLocationInput,
  type ShiftLocationStatusResult,
} from "./location-classification";

export {
  getShiftLocationStatus,
  hasSavedJobSite,
  hasManualAddress,
  hasMeetingPoint,
  hasAnyOperationalLocation,
} from "./location-classification";
export type {
  ShiftLocationStatus,
  ShiftLocationInput,
  ShiftLocationStatusResult,
} from "./location-classification";

export type ServiceLocationSource =
  | "job_site_v2"
  | "legacy_venue"
  | "free_text"
  | "meeting_v2"
  | "meeting_text";

export interface ServicePlace {
  source: ServiceLocationSource;
  /** Nombre del sitio si existe (venue, hotel, oficina). */
  name: string | null;
  /** Dirección legible. Puede ser el único dato disponible. */
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number | null;
  /** Enlace a mapas — solo si hay algo navegable. */
  mapsUrl: string | null;
}

export interface ResolvedServiceLocation {
  /** Dónde se trabaja. `null` si el Servicio no tiene ninguna ubicación. */
  destination: ServicePlace | null;
  /** Punto de encuentro — `null` si no aplica o no está definido. */
  meetingPoint: ServicePlace | null;
  /** Solo true cuando hay transporte: nunca pedir meeting point sin transporte. */
  requiresMeetingPoint: boolean;
  /** Falta el punto de encuentro y sí es obligatorio. */
  meetingPointMissing: boolean;
  /** Sitio que debe usar el mapa (destino, o encuentro si el destino no tiene coords). */
  mapTarget: ServicePlace | null;
  /** Clasificación existente para badges/avisos. */
  status: ShiftLocationStatusResult;
}

interface PlaceLike {
  name?: string | null;
  formatted_address?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_meters?: number | null;
}

export interface ServiceLocationInput {
  location_id?: string | null;
  job_site_location_id?: string | null;
  job_site_address?: string | null;
  meeting_point?: string | null;
  meeting_point_location_id?: string | null;
  transportation_required?: boolean | null;
  /** Fila resuelta de locations_v2 para `job_site_location_id`. */
  jobSiteV2?: PlaceLike | null;
  /** Fila resuelta de locations (venue legado) para `location_id`. */
  legacyVenue?: PlaceLike | null;
  /** Fila resuelta de locations_v2 para `meeting_point_location_id`. */
  meetingV2?: PlaceLike | null;
}

function clean(v?: string | null): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

function mapsUrlFor(place: Omit<ServicePlace, "mapsUrl">): string | null {
  if (place.latitude != null && place.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
  }
  const q = place.address ?? place.name;
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

function toPlace(source: ServiceLocationSource, raw: PlaceLike | null | undefined, fallbackText?: string | null): ServicePlace | null {
  const name = clean(raw?.name);
  const address = clean(raw?.formatted_address ?? raw?.address) ?? clean(fallbackText);
  if (!name && !address && raw?.latitude == null) return null;
  const base = {
    source,
    name,
    address,
    latitude: raw?.latitude ?? null,
    longitude: raw?.longitude ?? null,
    geofenceRadiusMeters: raw?.geofence_radius_meters ?? null,
  };
  return { ...base, mapsUrl: mapsUrlFor(base) };
}

export function resolveServiceLocation(input: ServiceLocationInput): ResolvedServiceLocation {
  // ── Destino: v2 → venue legado → texto libre ──
  let destination: ServicePlace | null = null;
  if (input.job_site_location_id && input.jobSiteV2) {
    destination = toPlace("job_site_v2", input.jobSiteV2);
  }
  if (!destination && input.location_id && input.legacyVenue) {
    destination = toPlace("legacy_venue", input.legacyVenue);
  }
  if (!destination) {
    const text = clean(input.job_site_address);
    if (text) destination = toPlace("free_text", null, text);
  }

  // ── Punto de encuentro: solo con transporte activo ──
  const requiresMeetingPoint = Boolean(input.transportation_required);
  let meetingPoint: ServicePlace | null = null;
  if (input.meeting_point_location_id && input.meetingV2) {
    meetingPoint = toPlace("meeting_v2", input.meetingV2);
  }
  if (!meetingPoint) {
    const text = clean(input.meeting_point);
    if (text) meetingPoint = toPlace("meeting_text", null, text);
  }
  if (!requiresMeetingPoint) meetingPoint = meetingPoint && { ...meetingPoint };

  const mapTarget =
    destination && destination.latitude != null && destination.longitude != null
      ? destination
      : meetingPoint && meetingPoint.latitude != null && meetingPoint.longitude != null
        ? meetingPoint
        : destination ?? meetingPoint;

  return {
    destination,
    meetingPoint,
    requiresMeetingPoint,
    meetingPointMissing: requiresMeetingPoint && !meetingPoint,
    mapTarget,
    status: getShiftLocationStatus({
      location_id: input.location_id,
      job_site_location_id: input.job_site_location_id,
      job_site_address: input.job_site_address,
      meeting_point: input.meeting_point,
      meeting_point_location_id: input.meeting_point_location_id,
    }),
  };
}

/** Texto único para el trabajador: nunca duplica nombre y dirección iguales. */
export function formatPlaceLine(place: ServicePlace | null): string | null {
  if (!place) return null;
  if (place.name && place.address && place.name !== place.address) {
    return `${place.name} — ${place.address}`;
  }
  return place.name ?? place.address;
}
