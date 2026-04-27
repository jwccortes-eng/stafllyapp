/**
 * deriveOperationalZone — NYC-area hardcoded zone detector.
 * Future: read from company_config.operational_zones for non-NYC tenants.
 *
 * Strategy: look at city/county/neighborhood fields in any case, normalize,
 * then match against known NYC borough/region keywords.
 */
import type { OperationalZone } from "./types";

const QUEENS_KEYS = [
  "queens", "astoria", "long island city", "lic", "jackson heights",
  "flushing", "elmhurst", "corona", "jamaica", "ridgewood",
  "forest hills", "rego park", "woodside", "sunnyside", "bayside",
  "rockaway", "ozone park", "richmond hill",
];
const BROOKLYN_KEYS = [
  "brooklyn", "williamsburg", "bushwick", "bedford-stuyvesant", "bed-stuy",
  "park slope", "crown heights", "flatbush", "sunset park", "dumbo",
  "greenpoint", "bensonhurst", "coney island", "canarsie",
  "east new york", "fort greene", "prospect", "borough park",
];
const BRONX_KEYS = [
  "bronx", "fordham", "riverdale", "morris park", "mott haven",
  "kingsbridge", "throgs neck", "pelham bay", "soundview",
];
const MANHATTAN_KEYS = [
  "manhattan", "new york, ny", "new york city",
  "harlem", "midtown", "chelsea", "soho", "tribeca",
  "upper east", "upper west", "east village", "west village",
  "lower east side", "financial district", "washington heights",
  "morningside", "inwood", "chinatown", "noho",
];
const STATEN_KEYS = ["staten island", "richmond, ny"];
const LONG_ISLAND_KEYS = [
  "nassau", "suffolk", "hempstead", "garden city", "long beach, ny",
  "huntington, ny", "smithtown", "babylon", "islip", "brentwood",
  "freeport", "uniondale", "elmont", "valley stream", "mineola",
  "great neck", "port washington",
];

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function anyMatch(haystack: string, needles: string[]): boolean {
  if (!haystack) return false;
  return needles.some((n) => haystack.includes(n));
}

export function deriveOperationalZone(input: {
  city?: string | null;
  state?: string | null;
  county?: string | null;
  neighborhood?: string | null;
  formatted_address?: string | null;
}): OperationalZone | null {
  const blob = [
    norm(input.city),
    norm(input.county),
    norm(input.neighborhood),
    norm(input.formatted_address),
  ]
    .filter(Boolean)
    .join(" | ");

  if (!blob) return null;

  // NJ first (covers all of New Jersey — broad rule).
  const state = norm(input.state);
  if (state === "nj" || blob.includes("new jersey") || blob.includes(", nj")) {
    return "New Jersey";
  }

  if (anyMatch(blob, STATEN_KEYS)) return "Staten Island";
  if (anyMatch(blob, BRONX_KEYS)) return "Bronx";
  if (anyMatch(blob, BROOKLYN_KEYS)) return "Brooklyn";
  if (anyMatch(blob, QUEENS_KEYS)) return "Queens";
  if (anyMatch(blob, LONG_ISLAND_KEYS)) return "Long Island";
  if (anyMatch(blob, MANHATTAN_KEYS)) return "Manhattan";

  // NY default — if state is NY but no borough hint, lean Other.
  return "Other";
}
