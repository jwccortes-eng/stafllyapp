/**
 * normalizeAddress — converts raw inputs (Mapbox feature, manual fields,
 * legacy text) into the canonical StructuredAddress shape.
 *
 * Source of truth for the JSONB stored in `<table>.address_structured`.
 */
import type { GeocodeFeature } from "@/lib/mapbox-geocoding";
import { parseFeature } from "@/lib/mapbox-geocoding";
import type {
  StructuredAddress,
  AddressSource,
  AddressValidationStatus,
} from "./types";
import { EMPTY_ADDRESS } from "./types";
import { buildMapsUrl } from "./maps-url";
import { deriveOperationalZone } from "./operational-zone";

function computeValidation(
  a: Pick<
    StructuredAddress,
    "formatted_address" | "city" | "state" | "postal_code" | "latitude" | "longitude" | "place_id"
  >,
  source: AddressSource,
): AddressValidationStatus {
  const text = (a.formatted_address ?? "").trim();
  if (!text) return "empty";

  const hasGeo =
    typeof a.latitude === "number" &&
    typeof a.longitude === "number" &&
    !!a.place_id;
  const hasCore = !!a.city && !!a.state && !!a.postal_code;

  if (source === "legacy") return "legacy";
  if (source === "imported" && !hasGeo) return "imported";
  if (hasGeo && hasCore) return "validated";
  if (!hasCore) return "incomplete";
  return "manual";
}

/** Normalize a Mapbox feature into our canonical shape. */
export function normalizeFromMapbox(feat: GeocodeFeature): StructuredAddress {
  const parsed = parseFeature(feat);
  const base: StructuredAddress = {
    ...EMPTY_ADDRESS,
    formatted_address: parsed.formatted_address,
    address_line1: parsed.address_line1,
    address_line2: null,
    city: parsed.city,
    state: parsed.state,
    postal_code: parsed.postal_code,
    country: parsed.country,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    place_id: parsed.place_id,
    source: "autocomplete",
    captured_at: new Date().toISOString(),
  };
  base.maps_url = buildMapsUrl(base);
  base.operational_zone = deriveOperationalZone(base);
  base.validation_status = computeValidation(base, "autocomplete");
  return base;
}

/** Normalize manual field-by-field input. */
export function normalizeFromManual(input: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  formatted_address?: string | null;
}): StructuredAddress {
  const line1 = input.address_line1?.trim() || null;
  const city = input.city?.trim() || null;
  const state = input.state?.trim() || null;
  const zip = input.postal_code?.trim() || null;
  const country = input.country?.trim() || "US";

  const formatted =
    input.formatted_address?.trim() ||
    [line1, [city, state].filter(Boolean).join(", "), zip]
      .filter(Boolean)
      .join(", ");

  const base: StructuredAddress = {
    ...EMPTY_ADDRESS,
    formatted_address: formatted,
    address_line1: line1,
    address_line2: input.address_line2?.trim() || null,
    city,
    state,
    postal_code: zip,
    country,
    latitude: typeof input.latitude === "number" ? input.latitude : null,
    longitude: typeof input.longitude === "number" ? input.longitude : null,
    place_id: null,
    source: "manual",
    captured_at: new Date().toISOString(),
  };
  base.maps_url = buildMapsUrl(base);
  base.operational_zone = deriveOperationalZone(base);
  base.validation_status = computeValidation(base, "manual");
  return base;
}

/**
 * Normalize a legacy free-text address (no structure available).
 * Used to lift existing `employees.address` rows into the new shape.
 */
export function normalizeFromLegacy(text: string | null | undefined): StructuredAddress | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  const base: StructuredAddress = {
    ...EMPTY_ADDRESS,
    formatted_address: trimmed,
    source: "legacy",
    validation_status: "legacy",
  };
  base.maps_url = buildMapsUrl(base);
  return base;
}

/**
 * Build a StructuredAddress from existing legacy columns
 * (address_line, address_city, address_state, address_zip, lat, lng).
 * Used by migrations / hydrators to create the JSONB on the fly.
 */
export function normalizeFromLegacyColumns(input: {
  address_line?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  address?: string | null;
  county?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): StructuredAddress | null {
  const hasAny =
    input.address_line || input.address_city || input.address_state ||
    input.address_zip || input.address;
  if (!hasAny) return null;

  const result = normalizeFromManual({
    address_line1: input.address_line ?? null,
    city: input.address_city ?? null,
    state: input.address_state ?? null,
    postal_code: input.address_zip ?? null,
    country: "US",
    formatted_address: input.address ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
  });
  // Mark as imported (came from legacy storage, not a fresh user action).
  result.source = "imported";
  result.county = input.county ?? null;
  result.operational_zone = deriveOperationalZone(result);
  result.validation_status = computeValidation(result, "imported");
  return result;
}

/** Re-derive zone + validation after the user edits any field. */
export function recomputeDerived(addr: StructuredAddress): StructuredAddress {
  const next = { ...addr };
  next.maps_url = buildMapsUrl(next);
  next.operational_zone = deriveOperationalZone(next);
  next.validation_status = computeValidation(next, next.source);
  return next;
}
