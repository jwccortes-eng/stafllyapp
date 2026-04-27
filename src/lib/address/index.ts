/**
 * Premium Address — public entry point.
 * Import from "@/lib/address" instead of internal paths.
 */
export type {
  StructuredAddress,
  AddressSource,
  AddressValidationStatus,
  OperationalZone,
} from "./types";
export { EMPTY_ADDRESS } from "./types";
export { buildMapsUrl } from "./maps-url";
export { deriveOperationalZone } from "./operational-zone";
export {
  normalizeFromMapbox,
  normalizeFromManual,
  normalizeFromLegacy,
  normalizeFromLegacyColumns,
  recomputeDerived,
} from "./normalize";
