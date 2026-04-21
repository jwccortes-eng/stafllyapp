/**
 * Mapbox Geocoding (Search Box / Forward Geocoding) helpers.
 * Public token is fetched via edge function (useMapboxToken).
 *
 * Reference: https://docs.mapbox.com/api/search/geocoding/
 */

export interface GeocodeFeature {
  id: string;
  place_name: string;        // formatted_address
  text: string;              // primary text (e.g. street name)
  center: [number, number];  // [lng, lat]
  context?: Array<{ id: string; text: string; short_code?: string }>;
  place_type?: string[];
  properties?: Record<string, unknown>;
  address?: string;          // street number when present
}

export interface ParsedAddress {
  formatted_address: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  place_id: string;
}

function ctxFind(feat: GeocodeFeature, prefix: string): string | null {
  const ctx = feat.context?.find((c) => c.id.startsWith(prefix + "."));
  return ctx?.text ?? null;
}

function ctxShortCode(feat: GeocodeFeature, prefix: string): string | null {
  const ctx = feat.context?.find((c) => c.id.startsWith(prefix + "."));
  return ctx?.short_code ?? null;
}

export function parseFeature(feat: GeocodeFeature): ParsedAddress {
  // address_line1: combine street number + street name when available
  const streetName = feat.text;
  const number = feat.address;
  const line1 = number ? `${number} ${streetName}` : feat.place_name.split(",")[0] ?? streetName;

  const country = ctxShortCode(feat, "country")?.toUpperCase() ?? ctxFind(feat, "country");
  const state = ctxShortCode(feat, "region")?.replace(/^[A-Z]{2}-/, "") ?? ctxFind(feat, "region");

  return {
    formatted_address: feat.place_name,
    address_line1: line1,
    city: ctxFind(feat, "place") ?? ctxFind(feat, "locality"),
    state,
    postal_code: ctxFind(feat, "postcode"),
    country,
    latitude: feat.center[1],
    longitude: feat.center[0],
    place_id: feat.id,
  };
}

export async function searchAddresses(
  query: string,
  token: string,
  opts: { country?: string; limit?: number; proximity?: [number, number] } = {},
): Promise<GeocodeFeature[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3 || !token) return [];

  const params = new URLSearchParams({
    access_token: token,
    autocomplete: "true",
    limit: String(opts.limit ?? 6),
    types: "address,poi,place,postcode,locality,neighborhood",
  });
  if (opts.country) params.set("country", opts.country.toLowerCase());
  if (opts.proximity) params.set("proximity", opts.proximity.join(","));

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn("Mapbox geocoding error", res.status);
    return [];
  }
  const json = (await res.json()) as { features?: GeocodeFeature[] };
  return json.features ?? [];
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  token: string,
): Promise<GeocodeFeature | null> {
  if (!token) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { features?: GeocodeFeature[] };
  return json.features?.[0] ?? null;
}
