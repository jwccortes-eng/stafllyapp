/**
 * Premium Address — shared types for the global Address system.
 *
 * Goal: stop treating addresses as plain text. Every operational surface
 * (employees, job sites, meeting points, clients, billing) should converge
 * on the same shape so we can later do real logistics: zone grouping,
 * driver-proximity, meeting-point suggestions, route building.
 *
 * Storage: persisted as JSONB in `<table>.address_structured`, while the
 * legacy plain-text `address` columns remain as fallback. Never delete
 * legacy data — only enrich it.
 */

/** Where this address came from. Drives badge + trust level. */
export type AddressSource =
  | "manual"        // user typed it field-by-field
  | "autocomplete"  // picked from Mapbox / search provider
  | "imported"      // came from CSV/Connecteam/legacy import
  | "legacy";       // pre-existing free-text address (no structure)

/** How trustworthy / complete the address is for operations. */
export type AddressValidationStatus =
  | "validated"   // has place_id + lat/lng + city/state/zip
  | "incomplete"  // missing one of city/state/zip
  | "manual"      // typed but no geocoding
  | "imported"    // from import — assume legacy quality
  | "legacy"      // free-text only, no structure
  | "empty";      // nothing entered

/**
 * Operational zone (NYC-area hardcoded for Stafly's current ops).
 * `Other` is the catch-all for anywhere else. We can later make this
 * configurable per company via company_config.operational_zones.
 */
export type OperationalZone =
  | "Queens"
  | "Brooklyn"
  | "Bronx"
  | "Manhattan"
  | "Staten Island"
  | "New Jersey"
  | "Long Island"
  | "Other";

/**
 * Canonical structured address shape. All optional except formatted_address
 * (which is always something — even for legacy/manual entries).
 */
export interface StructuredAddress {
  /** Always present — at minimum the raw text the user typed. */
  formatted_address: string;

  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;       // 2-letter US code preferred (e.g. "NY")
  postal_code: string | null;
  country: string | null;     // 2-letter code preferred (e.g. "US")

  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  maps_url: string | null;

  source: AddressSource;
  validation_status: AddressValidationStatus;

  /** Derived from city/borough — used for grouping/logistics. */
  operational_zone: OperationalZone | null;
  neighborhood: string | null;
  county: string | null;

  /** 0-1 confidence from the geocoder (when available). */
  confidence_score: number | null;

  /** ISO timestamp, when this address was captured/last updated. */
  captured_at: string | null;
}

/** Empty/initial value — used when starting a fresh form. */
export const EMPTY_ADDRESS: StructuredAddress = {
  formatted_address: "",
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  latitude: null,
  longitude: null,
  place_id: null,
  maps_url: null,
  source: "manual",
  validation_status: "empty",
  operational_zone: null,
  neighborhood: null,
  county: null,
  confidence_score: null,
  captured_at: null,
};
