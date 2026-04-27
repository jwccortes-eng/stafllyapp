/**
 * buildMapsUrl — universal Google Maps link builder.
 * Prefers lat/lng (most precise); falls back to query string.
 */
export function buildMapsUrl(input: {
  latitude?: number | null;
  longitude?: number | null;
  formatted_address?: string | null;
}): string | null {
  const { latitude, longitude, formatted_address } = input;
  if (typeof latitude === "number" && typeof longitude === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  const text = (formatted_address ?? "").trim();
  if (!text) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}
