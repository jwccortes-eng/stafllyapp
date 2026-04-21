import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cachedToken: string | null = null;
let inFlight: Promise<string | null> | null = null;

async function fetchToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-mapbox-token");
      if (error) {
        console.warn("Mapbox token fetch error:", error.message);
        return null;
      }
      const token = (data as { token?: string } | null)?.token ?? null;
      cachedToken = token;
      return token;
    } catch (e) {
      console.warn("Mapbox token fetch failed:", e);
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Hook to get the public Mapbox token (used for autocomplete only).
 * Returns null while loading or if Mapbox is not configured — components
 * should gracefully fall back to manual entry in that case.
 */
export function useMapboxToken() {
  const [token, setToken] = useState<string | null>(cachedToken);
  const [loading, setLoading] = useState<boolean>(!cachedToken);

  useEffect(() => {
    if (cachedToken) {
      setToken(cachedToken);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchToken().then((t) => {
      if (cancelled) return;
      setToken(t);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { token, loading, isAvailable: !!token };
}
