/**
 * Geolocation helper — captures GPS position with timeout and error handling.
 * Only used during clock in/out (privacy: no tracking outside shifts).
 */
export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function capturePosition(timeoutMs = 10000): Promise<GeoPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported");
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      console.warn("Geolocation timeout");
      resolve(null);
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        clearTimeout(timer);
        console.warn("Geolocation error:", err.message);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 5000 }
    );
  });
}

/**
 * Calculate distance in meters between two lat/lng points using Haversine formula.
 */
export function distanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Get device identifier string for fraud detection.
 */
export function getDeviceId(): string {
  const ua = navigator.userAgent;
  const platform = navigator.platform ?? "unknown";
  return `${platform} | ${ua.slice(0, 80)}`;
}

/**
 * Build navigation URLs.
 */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function appleMapsUrl(lat: number, lng: number): string {
  return `http://maps.apple.com/?ll=${lat},${lng}`;
}

export function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}
