import { useEffect, useMemo, useRef, useState } from "react";
import { useMapboxToken } from "@/hooks/useMapboxToken";
import { searchAddresses, parseFeature, type GeocodeFeature, type ParsedAddress } from "@/lib/mapbox-geocoding";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MapPin, Loader2, Search, ExternalLink, Compass, Navigation, Crosshair } from "lucide-react";
import { googleMapsUrl, appleMapsUrl, wazeUrl } from "@/lib/geo-helpers";
import LocationMiniMap from "./LocationMiniMap";

export interface LocationPickerValue {
  // Persisted-ready shape mirroring locations_v2 (subset)
  name: string | null;
  formatted_address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  access_notes: string | null;
  arrival_notes: string | null;
  parking_notes: string | null;
  contact_on_site: string | null;
  geofence_radius_meters: number | null;
}

export const EMPTY_LOCATION: LocationPickerValue = {
  name: "",
  formatted_address: null,
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  place_id: null,
  latitude: null,
  longitude: null,
  access_notes: null,
  arrival_notes: null,
  parking_notes: null,
  contact_on_site: null,
  geofence_radius_meters: null,
};

interface Props {
  value: LocationPickerValue;
  onChange: (v: LocationPickerValue) => void;
  showName?: boolean;
  showOperationalNotes?: boolean;
  showGeofence?: boolean;
  countryHint?: string; // e.g. "us", "co"
  className?: string;
  namePlaceholder?: string;
}

export default function LocationPicker({
  value,
  onChange,
  showName = true,
  showOperationalNotes = true,
  showGeofence = false,
  countryHint = "us",
  className,
  namePlaceholder = "HQ, Warehouse North…",
}: Props) {
  const { token, isAvailable, loading: tokenLoading } = useMapboxToken();
  const [query, setQuery] = useState(value.formatted_address ?? "");
  const [suggestions, setSuggestions] = useState<GeocodeFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [openSuggestions, setOpenSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value -> query when it changes (edit mode)
  useEffect(() => {
    setQuery(value.formatted_address ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.place_id]);

  useEffect(() => {
    if (!isAvailable || !token) return;
    if (!query || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    if (query === value.formatted_address) return; // no re-search after pick
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchAddresses(query, token, { country: countryHint });
      setSuggestions(results);
      setSearching(false);
      setOpenSuggestions(true);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, token, isAvailable, countryHint]);

  const applyParsed = (parsed: ParsedAddress) => {
    onChange({
      ...value,
      formatted_address: parsed.formatted_address,
      address_line1: parsed.address_line1,
      city: parsed.city,
      state: parsed.state,
      postal_code: parsed.postal_code,
      country: parsed.country,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      place_id: parsed.place_id,
    });
    setQuery(parsed.formatted_address);
    setOpenSuggestions(false);
    setSuggestions([]);
  };

  const handlePick = (feat: GeocodeFeature) => {
    applyParsed(parseFeature(feat));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          ...value,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const hasCoords = value.latitude != null && value.longitude != null;

  const externalLinks = useMemo(() => {
    if (!hasCoords) return null;
    const lat = value.latitude!;
    const lng = value.longitude!;
    return { google: googleMapsUrl(lat, lng), apple: appleMapsUrl(lat, lng), waze: wazeUrl(lat, lng) };
  }, [hasCoords, value.latitude, value.longitude]);

  return (
    <div className={cn("space-y-3", className)}>
      {showName && (
        <div>
          <Label className="text-xs">Name</Label>
          <Input
            value={value.name ?? ""}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder={namePlaceholder}
            className="h-9 text-sm"
          />
        </div>
      )}

      {/* Autocomplete */}
      <div className="relative">
        <Label className="text-xs flex items-center gap-1.5">
          <Search className="h-3 w-3" /> Address search
          {!isAvailable && !tokenLoading && (
            <Badge variant="outline" className="text-[9px] ml-1">manual mode</Badge>
          )}
        </Label>
        <div className="relative">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpenSuggestions(true)}
            onBlur={() => setTimeout(() => setOpenSuggestions(false), 150)}
            placeholder={isAvailable ? "Start typing an address…" : "Mapbox unavailable — fill below"}
            disabled={!isAvailable && !tokenLoading}
            className="h-9 text-sm pr-9"
          />
          {searching && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {openSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border bg-popover shadow-lg overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handlePick(s)}
                className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex items-start gap-2 border-b last:border-0"
              >
                <MapPin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold truncate">{s.text}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{s.place_name}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Structured fields */}
      <div className="grid grid-cols-1 gap-2">
        <div>
          <Label className="text-xs">Address line 1</Label>
          <Input
            value={value.address_line1 ?? ""}
            onChange={(e) => onChange({ ...value, address_line1: e.target.value || null })}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Address line 2</Label>
          <Input
            value={value.address_line2 ?? ""}
            onChange={(e) => onChange({ ...value, address_line2: e.target.value || null })}
            className="h-9 text-sm"
            placeholder="Suite, floor, unit…"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">City</Label>
            <Input
              value={value.city ?? ""}
              onChange={(e) => onChange({ ...value, city: e.target.value || null })}
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">State</Label>
            <Input
              value={value.state ?? ""}
              onChange={(e) => onChange({ ...value, state: e.target.value || null })}
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">ZIP</Label>
            <Input
              value={value.postal_code ?? ""}
              onChange={(e) => onChange({ ...value, postal_code: e.target.value || null })}
              className="h-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Coordinates / map preview */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Crosshair className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Coordinates</span>
            {hasCoords ? (
              <Badge variant="secondary" className="text-[10px] font-mono">
                {value.latitude!.toFixed(5)}, {value.longitude!.toFixed(5)}
              </Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">No coordinates yet</span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={useMyLocation}
            className="h-7 text-[10px] gap-1"
          >
            <Navigation className="h-3 w-3" />
            Use my location
          </Button>
        </div>

        <div className="h-40 bg-muted/40">
          {hasCoords ? (
            <LocationMiniMap
              lat={value.latitude!}
              lng={value.longitude!}
              radius={value.geofence_radius_meters ?? null}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
              Pick an address or capture your location to preview the map
            </div>
          )}
        </div>

        {externalLinks && (
          <div className="px-3 py-2 border-t flex items-center gap-2 flex-wrap">
            <a
              href={externalLinks.google}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Google Maps <ExternalLink className="h-2.5 w-2.5" />
            </a>
            <a
              href={externalLinks.apple}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Apple Maps <ExternalLink className="h-2.5 w-2.5" />
            </a>
            <a
              href={externalLinks.waze}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
            >
              Waze <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        )}
      </div>

      {showGeofence && (
        <div>
          <Label className="text-xs flex items-center gap-1.5">
            <Compass className="h-3 w-3" /> Geofence radius (meters)
          </Label>
          <Input
            type="number"
            min={0}
            value={value.geofence_radius_meters ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                geofence_radius_meters: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="h-9 text-sm w-32"
            placeholder="e.g. 100"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Distance allowed from this point for clock-in / arrival validation. Empty = no enforcement.
          </p>
        </div>
      )}

      {showOperationalNotes && (
        <div className="grid grid-cols-1 gap-2">
          <div>
            <Label className="text-xs">Arrival notes</Label>
            <Textarea
              value={value.arrival_notes ?? ""}
              onChange={(e) => onChange({ ...value, arrival_notes: e.target.value || null })}
              rows={2}
              className="text-sm"
              placeholder="How to find the entrance, gate code, who to ask for…"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Parking</Label>
              <Input
                value={value.parking_notes ?? ""}
                onChange={(e) => onChange({ ...value, parking_notes: e.target.value || null })}
                className="h-9 text-sm"
                placeholder="Lot B / street…"
              />
            </div>
            <div>
              <Label className="text-xs">On-site contact</Label>
              <Input
                value={value.contact_on_site ?? ""}
                onChange={(e) => onChange({ ...value, contact_on_site: e.target.value || null })}
                className="h-9 text-sm"
                placeholder="Name + phone"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Access notes (private)</Label>
            <Textarea
              value={value.access_notes ?? ""}
              onChange={(e) => onChange({ ...value, access_notes: e.target.value || null })}
              rows={2}
              className="text-sm"
              placeholder="Codes, badges, dock instructions…"
            />
          </div>
        </div>
      )}
    </div>
  );
}
