/**
 * SmartLocationField — premium one-off address input for shift Job Site /
 * Meeting Point.
 *
 * UX rules (Stafly product decision):
 *  - Primary mode is free-text smart address search (paste from WhatsApp,
 *    type, or pick a Mapbox suggestion). Stored as plain text on the shift.
 *  - Saved/reusable locations are SECONDARY ("Usar ubicación guardada").
 *  - Default behavior: address is used only for this shift. NO locations_v2
 *    row is created unless the operator explicitly clicks
 *    "Guardar esta ubicación para usar después".
 *
 * Wiring:
 *  - When the operator selects a saved location → emits onSavedLocation(id, addr).
 *  - When they type/paste/pick a one-off → emits onFreeText(text).
 *  - "Guardar para reusar" creates a locations_v2 row via existing
 *    useLocationsV2.create, then promotes the entry to saved (clears free text).
 *
 * No payroll / time_entries / attendance / portal coupling. Pure form-state.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin, Search, Loader2, ExternalLink, Check, X, Bookmark,
  ChevronDown, Sparkles, Clipboard,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useMapboxToken } from "@/hooks/useMapboxToken";
import {
  searchAddresses,
  parseFeature,
  type GeocodeFeature,
} from "@/lib/mapbox-geocoding";
import {
  useLocationsV2,
  fetchLocationById,
  type LocationV2,
  type LocationType,
} from "@/hooks/useLocationsV2";
import { toast } from "sonner";

interface Props {
  companyId: string | null;
  /** Which kind of location we're capturing. Drives saved-location filter + copy. */
  kind: "job_site" | "meeting_point";
  /** Title displayed above the field. */
  title: string;
  /** Helper sentence under the title. */
  helper: string;
  /** Free-text value (mirrors to scheduled_shifts.job_site_address / meeting_point). */
  freeTextValue: string;
  /** Currently-selected saved location id (or null). */
  savedLocationId: string | null;
  /** When the operator types / pastes / picks a one-off suggestion. */
  onFreeText: (text: string) => void;
  /**
   * When the operator picks an existing saved location.
   * formattedAddress is provided so meeting-point can also mirror text
   * (preserves worker-portal copy that reads the legacy text field).
   */
  onSavedLocation: (id: string | null, formattedAddress: string | null) => void;
  /** Optional placeholder override. */
  placeholder?: string;
}

function buildMapsUrl(text: string | null | undefined): string | null {
  const a = (text ?? "").trim();
  if (!a) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
}

const KIND_TYPE: Record<Props["kind"], LocationType> = {
  job_site: "job_site",
  meeting_point: "meeting_point",
};

export function SmartLocationField({
  companyId,
  kind,
  title,
  helper,
  freeTextValue,
  savedLocationId,
  onFreeText,
  onSavedLocation,
  placeholder,
}: Props) {
  const { token } = useMapboxToken();
  const { data: savedList, create } = useLocationsV2(companyId, KIND_TYPE[kind]);

  const [draft, setDraft] = useState<string>(freeTextValue);
  const [suggestions, setSuggestions] = useState<GeocodeFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveForReuse, setSaveForReuse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolvedSaved, setResolvedSaved] = useState<LocationV2 | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Keep local draft in sync if parent resets it
  useEffect(() => {
    setDraft(freeTextValue);
  }, [freeTextValue]);

  // Resolve currently-selected saved location for display (may be cross-list)
  useEffect(() => {
    let alive = true;
    if (!savedLocationId) {
      setResolvedSaved(null);
      return;
    }
    const fromList = (savedList ?? []).find((l) => l.id === savedLocationId) ?? null;
    if (fromList) {
      setResolvedSaved(fromList);
      return;
    }
    fetchLocationById(savedLocationId).then((res) => {
      if (alive) setResolvedSaved(res);
    });
    return () => {
      alive = false;
    };
  }, [savedLocationId, savedList]);

  // Debounced Mapbox autocomplete on the draft input
  useEffect(() => {
    if (savedLocationId) return; // saved mode — skip autocomplete
    if (!token) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = draft.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const feats = await searchAddresses(q, token, { country: "US", limit: 5 });
        setSuggestions(feats);
        setShowSuggestions(true);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [draft, token, savedLocationId]);

  const handlePickSuggestion = (feat: GeocodeFeature) => {
    const text = feat.place_name;
    setDraft(text);
    onFreeText(text);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleBlur = () => {
    // Commit draft to parent on blur so paste-and-publish works without picking
    if (draft !== freeTextValue) onFreeText(draft);
    // Delay hiding so click on suggestion still fires
    window.setTimeout(() => setShowSuggestions(false), 150);
  };

  const handlePaste = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt?.trim()) {
        setDraft(txt.trim());
        onFreeText(txt.trim());
      }
    } catch {
      toast.error("No se pudo leer el portapapeles");
    }
  };

  const handleClearFreeText = () => {
    setDraft("");
    onFreeText("");
    setSaveForReuse(false);
  };

  const handlePickSaved = (loc: LocationV2) => {
    onSavedLocation(loc.id, loc.formatted_address ?? loc.name ?? null);
    // For meeting point, mirror into the text field so worker portal still sees it
    if (kind === "meeting_point") {
      const mirror = loc.formatted_address ?? loc.name ?? "";
      setDraft(mirror);
      onFreeText(mirror);
    } else {
      // Job site: saved selection wins; free text becomes irrelevant
      setDraft("");
      onFreeText("");
    }
    setSavedOpen(false);
    setSaveForReuse(false);
  };

  const handleClearSaved = () => {
    onSavedLocation(null, null);
    setResolvedSaved(null);
  };

  const handleSaveForReuse = async () => {
    if (!companyId) return;
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    try {
      // Try to enrich from the first matching suggestion (same query as displayed)
      let enriched: ReturnType<typeof parseFeature> | null = null;
      if (token) {
        const feats = await searchAddresses(text, token, { country: "US", limit: 1 });
        if (feats[0]) enriched = parseFeature(feats[0]);
      }
      const created = await create.mutateAsync({
        company_id: companyId,
        location_type: KIND_TYPE[kind],
        name: enriched?.address_line1 ?? text.slice(0, 60),
        formatted_address: enriched?.formatted_address ?? text,
        address_line1: enriched?.address_line1 ?? null,
        city: enriched?.city ?? null,
        state: enriched?.state ?? null,
        postal_code: enriched?.postal_code ?? null,
        country: enriched?.country ?? null,
        place_id: enriched?.place_id ?? null,
        latitude: enriched?.latitude ?? null,
        longitude: enriched?.longitude ?? null,
      } as never);
      onSavedLocation(created.id, created.formatted_address ?? text);
      if (kind === "meeting_point") {
        // Keep mirrored text
        setDraft(created.formatted_address ?? text);
        onFreeText(created.formatted_address ?? text);
      } else {
        setDraft("");
        onFreeText("");
      }
      setSaveForReuse(false);
      toast.success("Ubicación guardada", {
        description: "Ya puedes reutilizarla en futuros turnos.",
      });
    } catch (e: any) {
      toast.error("No se pudo guardar", { description: e?.message ?? "Error desconocido" });
    } finally {
      setSaving(false);
    }
  };

  const recentSaved = useMemo(() => (savedList ?? []).slice(0, 6), [savedList]);
  const mapsUrl = buildMapsUrl(resolvedSaved?.formatted_address ?? draft);

  // ── Saved selected → compact card ───────────────────────────────────────
  if (resolvedSaved) {
    return (
      <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border/30">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
              {title}
            </span>
            <Badge variant="secondary" className="text-[9px] gap-1">
              <Bookmark className="h-2.5 w-2.5" /> Guardada
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearSaved}
            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3 mr-1" /> Quitar
          </Button>
        </div>
        <div className="p-3 space-y-1.5">
          <div className="text-[13px] font-semibold truncate">
            {resolvedSaved.name ?? "Sin nombre"}
          </div>
          {resolvedSaved.formatted_address && (
            <div className="text-[11px] text-muted-foreground truncate">
              {resolvedSaved.formatted_address}
            </div>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-1 text-[11px] text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Abrir en Google Maps
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── Free-text smart address (primary mode) ──────────────────────────────
  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="px-3 py-2 bg-muted/20 border-b border-border/30 flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold leading-tight truncate">{title}</p>
          <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-snug">{helper}</p>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
            <Input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={handleBlur}
              placeholder={placeholder ?? "Pega o busca una dirección…"}
              className="h-9 pl-8 pr-16 text-sm"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {searching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />}
              {draft && !searching && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFreeText}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  title="Limpiar"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePaste}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                title="Pegar del portapapeles"
              >
                <Clipboard className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border/60 bg-popover shadow-lg overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handlePickSuggestion(s)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b border-border/30 last:border-0"
                  >
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[12px] font-medium truncate">{s.text}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {s.place_name}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-3 py-1.5 text-[10px] text-muted-foreground/70 bg-muted/30 border-t border-border/30">
                Sugerencias de Mapbox · solo se usa para este turno
              </div>
            </div>
          )}
        </div>

        {/* Preview + maps link when there's free text */}
        {draft.trim() && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-muted/10 px-2.5 py-1.5">
            <span className="text-[11px] text-foreground truncate">{draft.trim()}</span>
            {buildMapsUrl(draft) && (
              <a
                href={buildMapsUrl(draft)!}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline shrink-0"
              >
                <ExternalLink className="h-2.5 w-2.5" /> Maps
              </a>
            )}
          </div>
        )}

        {/* Save for reuse — OFF by default */}
        {draft.trim() && companyId && (
          <div className="flex items-start gap-2 rounded-lg border border-dashed border-border/40 bg-background px-2.5 py-2">
            <Checkbox
              id={`save-reuse-${kind}`}
              checked={saveForReuse}
              onCheckedChange={(c) => setSaveForReuse(!!c)}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <Label
                htmlFor={`save-reuse-${kind}`}
                className="text-[11px] font-medium cursor-pointer"
              >
                Guardar esta ubicación para usar después
              </Label>
              <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-snug">
                Solo guárdala si la vas a reutilizar. Por defecto se usa solo
                para este turno.
              </p>
              {saveForReuse && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveForReuse}
                  disabled={saving}
                  className="h-7 text-[11px] mt-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Guardando…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 mr-1" /> Guardar y reutilizar
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Saved locations — secondary */}
        {companyId && recentSaved.length > 0 && (
          <Collapsible open={savedOpen} onOpenChange={setSavedOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground w-full justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <Bookmark className="h-3 w-3" />
                  Usar ubicación guardada
                  <span className="text-muted-foreground/60">
                    · {recentSaved.length}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    savedOpen && "rotate-180",
                  )}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1.5">
              <div className="flex flex-wrap gap-1.5">
                {recentSaved.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => handlePickSaved(l)}
                    className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background hover:border-primary/40 hover:bg-primary/[0.04] px-2.5 py-1 text-[11px] transition-colors"
                  >
                    <Bookmark className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="truncate max-w-[160px]">
                      {l.name ?? l.formatted_address ?? "Sin nombre"}
                    </span>
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
