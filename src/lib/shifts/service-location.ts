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

// ═══════════════════════════════════════════════════════════════════════════
// P0 — SERVICE LOCATION SINGLE SOURCE OF TRUTH
//
// Contrato canónico único. Separa tres preguntas que antes se mezclaban:
//   A. DESTINO OPERATIVO   → ¿el worker sabe a dónde ir?      (destinationStatus)
//   B. READINESS GEOESPACIAL → ¿hay coordenadas para mapa/geofence? (geospatialStatus)
//   C. PUNTO DE ENCUENTRO  → solo si transportation_required === true
//
// Prohibido crear resolvers paralelos. Cualquier superficie (editor, command
// center, operaciones, portal, live map, clock) deriva de `resolveServiceLocationTruth`.
// ═══════════════════════════════════════════════════════════════════════════

/** ¿El worker sabe a dónde ir? */
export type DestinationStatus = "RESOLVED" | "MISSING_DESTINATION";

/** De dónde salió el destino resuelto. */
export type DestinationSource = "job_site_v2" | "legacy_venue" | "free_text" | null;

/**
 * Readiness geoespacial — NUNCA se convierte en MISSING_DESTINATION.
 *  - COORDINATES : hay lat/lng → Live Map y geofence disponibles.
 *  - ADDRESS_ONLY: hay dirección legible pero sin coordenadas.
 *  - UNKNOWN     : hay FK estructurada pero la fila no fue hidratada por el llamador.
 *  - NONE        : no hay destino.
 */
export type GeospatialStatus = "COORDINATES" | "ADDRESS_ONLY" | "UNKNOWN" | "NONE";

/** Estado del punto de encuentro. NOT_REQUIRED cuando no hay transporte. */
export type MeetingPointStatus = "NOT_REQUIRED" | "RESOLVED" | "MISSING";

export interface ServiceLocationTruth {
  // ── A. Destino operativo ──
  destinationStatus: DestinationStatus;
  destinationSource: DestinationSource;
  /** Nombre del sitio, si existe. */
  displayName: string | null;
  /** Dirección legible que se muestra al worker y al admin. Misma en todas las pantallas. */
  displayAddress: string | null;
  /** Línea única lista para UI (nombre — dirección, sin duplicar). */
  displayLine: string | null;
  /** FK usada como destino (locations_v2 o locations). `null` si es texto libre. */
  locationId: string | null;

  // ── B. Readiness geoespacial ──
  lat: number | null;
  lng: number | null;
  hasCoordinates: boolean;
  geofenceRadiusMeters: number | null;
  geospatialStatus: GeospatialStatus;
  /** Copy único cuando mapa/geofence son relevantes y no hay coordenadas. */
  geospatialHint: string | null;
  /** El mapa en vivo y el geofence pueden operar. */
  mapReady: boolean;

  // ── C. Punto de encuentro / transporte ──
  transportationRequired: boolean;
  meetingPointRequired: boolean;
  meetingPointStatus: MeetingPointStatus;
  /** Solo true cuando es obligatorio y falta. Nunca con transporte desactivado. */
  meetingPointMissing: boolean;
  meetingPointLine: string | null;
}

export const GEOSPATIAL_HINT =
  "Dirección disponible. Agrega una ubicación con coordenadas para habilitar mapa en vivo y geofence.";

export const GEOFENCE_REQUIRED_BLOCK =
  "Este servicio requiere ubicación geográfica configurada.";

/**
 * Resolver canónico único.
 *
 * Orden de destino (regla dura): `job_site_location_id` → `location_id` → `job_site_address`.
 * Si cualquiera existe válidamente → `destinationStatus = "RESOLVED"`.
 *
 * Puro. No lee datos, no crea ubicaciones, no inventa coordenadas.
 */
export function resolveServiceLocationTruth(
  input: ServiceLocationInput,
): ServiceLocationTruth {
  const resolved = resolveServiceLocation(input);
  const dest = resolved.destination;

  // Destino declarado por FK aunque el llamador no haya hidratado la fila.
  const structuredId = clean(input.job_site_location_id) ?? clean(input.location_id);
  const hydratedStructured =
    dest?.source === "job_site_v2" || dest?.source === "legacy_venue";

  const destinationStatus: DestinationStatus =
    dest || structuredId ? "RESOLVED" : "MISSING_DESTINATION";

  const destinationSource: DestinationSource = dest
    ? (dest.source as DestinationSource)
    : structuredId
      ? clean(input.job_site_location_id)
        ? "job_site_v2"
        : "legacy_venue"
      : null;

  const displayAddress = dest?.address ?? clean(input.job_site_address);
  const lat = dest?.latitude ?? null;
  const lng = dest?.longitude ?? null;
  const hasCoordinates = lat != null && lng != null;

  let geospatialStatus: GeospatialStatus;
  if (hasCoordinates) geospatialStatus = "COORDINATES";
  else if (structuredId && !hydratedStructured) geospatialStatus = "UNKNOWN";
  else if (displayAddress || dest?.name) geospatialStatus = "ADDRESS_ONLY";
  else geospatialStatus = "NONE";

  const transportationRequired = Boolean(input.transportation_required);
  const meetingResolved = Boolean(resolved.meetingPoint);
  const meetingPointStatus: MeetingPointStatus = !transportationRequired
    ? "NOT_REQUIRED"
    : meetingResolved
      ? "RESOLVED"
      : "MISSING";

  return {
    destinationStatus,
    destinationSource,
    displayName: dest?.name ?? null,
    displayAddress,
    displayLine: formatPlaceLine(dest) ?? displayAddress,
    locationId: hydratedStructured || structuredId ? structuredId : null,

    lat,
    lng,
    hasCoordinates,
    geofenceRadiusMeters: dest?.geofenceRadiusMeters ?? null,
    geospatialStatus,
    geospatialHint: geospatialStatus === "ADDRESS_ONLY" ? GEOSPATIAL_HINT : null,
    mapReady: hasCoordinates,

    transportationRequired,
    meetingPointRequired: transportationRequired,
    meetingPointStatus,
    meetingPointMissing: meetingPointStatus === "MISSING",
    meetingPointLine: formatPlaceLine(resolved.meetingPoint),
  };
}

/**
 * Atajo para filas crudas de `scheduled_shifts` sin hidratación de FK.
 * Útil en listas y colas donde solo se leyeron las 6 columnas.
 */
export function resolveShiftLocationTruth(row: {
  location_id?: string | null;
  job_site_location_id?: string | null;
  job_site_address?: string | null;
  meeting_point?: string | null;
  meeting_point_location_id?: string | null;
  transportation_required?: boolean | null;
}): ServiceLocationTruth {
  return resolveServiceLocationTruth(row);
}
