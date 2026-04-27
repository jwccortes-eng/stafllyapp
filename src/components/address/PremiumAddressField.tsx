/**
 * PremiumAddressField — global premium address input.
 *
 * Behavior:
 *   - Mapbox autocomplete when token is available; manual mode otherwise.
 *   - Always allows toggling to manual mode for edge cases.
 *   - On valid selection / manual save → emits a normalized `StructuredAddress`.
 *   - Renders an `AddressPreviewCard` once the user has anything entered.
 *
 * Designed mobile-first, "Stripe/Linear" premium feel:
 *   - 1 protagonist input on top
 *   - dropdown with up to 6 suggestions
 *   - inline manual editor
 *   - preview card below
 *
 * Wire-up: provide `value` (StructuredAddress | null) and `onChange`. Use
 * `country="US"` (default) to bias geocoding.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin, Search, Loader2, Pencil, X, ChevronDown, Building2,
  Compass, AlertCircle, CheckCircle2, Eraser,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useMapboxToken } from "@/hooks/useMapboxToken";
import {
  searchAddresses,
  type GeocodeFeature,
} from "@/lib/mapbox-geocoding";
import {
  EMPTY_ADDRESS,
  normalizeFromMapbox,
  normalizeFromManual,
  recomputeDerived,
  type StructuredAddress,
} from "@/lib/address";
import { AddressPreviewCard } from "./AddressPreviewCard";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
] as const;

interface Props {
  /** Current structured address (or null for empty). */
  value: StructuredAddress | null;
  /** Emits the new normalized address (or null when cleared). */
  onChange: (next: StructuredAddress | null) => void;

  /** Visible label above the field. */
  label?: string;
  /** Helper text under the label. */
  helper?: string;
  /** Placeholder for the autocomplete input. */
  placeholder?: string;
  /** Optional icon override. */
  icon?: React.ComponentType<{ className?: string }>;

  /** ISO 3166-1 alpha-2 — biases geocoding (default "US"). */
  country?: string;
  /** Lat/lng to bias suggestions toward. */
  proximity?: [number, number];

  /** Mark as required for visual hint. */
  required?: boolean;
  /** Disable the whole field. */
  disabled?: boolean;
  /** Compact preview card. */
  compact?: boolean;
  /** Hide the preview card (only show input). */
  hidePreview?: boolean;
  /** className for the wrapper. */
  className?: string;
}

function PremiumAddressFieldImpl({
  value,
  onChange,
  label = "Dirección",
  helper,
  placeholder = "Empieza a escribir una dirección…",
  icon: IconProp,
  country = "US",
  proximity,
  required,
  disabled,
  compact,
  hidePreview,
  className,
}: Props) {
  const Icon = IconProp ?? MapPin;
  const { token, loading: tokenLoading, isAvailable } = useMapboxToken();

  // Top-level mode: "auto" tries Mapbox first; "manual" exposes the form.
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<HTMLDivElement>(null);

  // Force manual mode if Mapbox token is unavailable.
  useEffect(() => {
    if (!tokenLoading && !isAvailable) setMode("manual");
  }, [tokenLoading, isAvailable]);

  // Close suggestions / state dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
      if (stateRef.current && !stateRef.current.contains(e.target as Node)) {
        setStateOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced Mapbox search.
  useEffect(() => {
    if (mode !== "auto" || !token) return;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const features = await searchAddresses(trimmed, token, {
          country,
          proximity,
          limit: 6,
        });
        if (!cancelled) {
          setResults(features);
          setOpen(true);
        }
      } catch (err) {
        console.warn("Address search failed:", err);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, token, mode, country, proximity]);

  // Manual form local state — initialized from value for smooth typing.
  const [manualForm, setManualForm] = useState(() => ({
    address_line1: value?.address_line1 ?? "",
    address_line2: value?.address_line2 ?? "",
    city: value?.city ?? "",
    state: value?.state ?? "",
    postal_code: value?.postal_code ?? "",
  }));

  // Re-sync manual form if value changes externally.
  useEffect(() => {
    setManualForm({
      address_line1: value?.address_line1 ?? "",
      address_line2: value?.address_line2 ?? "",
      city: value?.city ?? "",
      state: value?.state ?? "",
      postal_code: value?.postal_code ?? "",
    });
  }, [value?.formatted_address]);

  const handlePickFeature = useCallback(
    (feat: GeocodeFeature) => {
      const next = normalizeFromMapbox(feat);
      onChange(next);
      setQuery("");
      setResults([]);
      setOpen(false);
    },
    [onChange],
  );

  const handleManualCommit = useCallback(() => {
    const next = normalizeFromManual({
      address_line1: manualForm.address_line1,
      address_line2: manualForm.address_line2,
      city: manualForm.city,
      state: manualForm.state,
      postal_code: manualForm.postal_code,
      country,
      latitude: value?.latitude ?? null,
      longitude: value?.longitude ?? null,
    });
    if (!next.formatted_address) {
      onChange(null);
    } else {
      onChange(next);
    }
  }, [manualForm, country, value?.latitude, value?.longitude, onChange]);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setManualForm({
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      postal_code: "",
    });
    onChange(null);
  }, [onChange]);

  const validationHint = useMemo(() => {
    if (!value) return null;
    if (value.validation_status === "validated") {
      return { tone: "ok" as const, msg: "Dirección validada con coordenadas." };
    }
    if (value.validation_status === "incomplete") {
      return { tone: "warn" as const, msg: "Faltan ciudad, estado o ZIP." };
    }
    if (value.validation_status === "manual") {
      return { tone: "info" as const, msg: "Dirección manual sin geocodificar." };
    }
    if (value.validation_status === "legacy") {
      return { tone: "info" as const, msg: "Dirección legacy — considera reingresarla." };
    }
    return null;
  }, [value]);

  const showAutocomplete = mode === "auto" && isAvailable;

  return (
    <div className={cn("space-y-2", className)} ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>

        <div className="flex items-center gap-1">
          {value?.formatted_address && (
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <Eraser className="h-3 w-3" />
              Limpiar
            </button>
          )}
          {isAvailable && (
            <button
              type="button"
              onClick={() => setMode((m) => (m === "auto" ? "manual" : "auto"))}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              {mode === "auto" ? (
                <><Pencil className="h-3 w-3" /> Editar manual</>
              ) : (
                <><Search className="h-3 w-3" /> Buscar dirección</>
              )}
            </button>
          )}
        </div>
      </div>

      {helper && (
        <p className="text-[10.5px] text-muted-foreground -mt-1">{helper}</p>
      )}

      {/* Autocomplete or Manual */}
      {showAutocomplete ? (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={placeholder}
            disabled={disabled || tokenLoading}
            className="h-10 pl-9 pr-9 text-sm"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}

          {open && results.length > 0 && (
            <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg animate-fade-in">
              <div className="max-h-72 overflow-y-auto p-1">
                {results.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handlePickFeature(f)}
                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-foreground">{f.text}</p>
                      <p className="truncate text-[10.5px] text-muted-foreground">{f.place_name}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="border-t border-border/60 bg-muted/30 px-2.5 py-1 text-[9.5px] text-muted-foreground">
                Powered by Mapbox · {results.length} resultado(s)
              </div>
            </div>
          )}
        </div>
      ) : (
        <ManualAddressForm
          form={manualForm}
          setForm={setManualForm}
          stateOpen={stateOpen}
          setStateOpen={setStateOpen}
          stateRef={stateRef}
          disabled={disabled}
          onCommit={handleManualCommit}
        />
      )}

      {/* Inline validation hint */}
      {validationHint && (
        <div
          className={cn(
            "flex items-center gap-1.5 text-[10.5px]",
            validationHint.tone === "ok" && "text-emerald-600 dark:text-emerald-400",
            validationHint.tone === "warn" && "text-amber-700 dark:text-amber-400",
            validationHint.tone === "info" && "text-muted-foreground",
          )}
        >
          {validationHint.tone === "ok" ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : validationHint.tone === "warn" ? (
            <AlertCircle className="h-3 w-3" />
          ) : (
            <Compass className="h-3 w-3" />
          )}
          {validationHint.msg}
        </div>
      )}

      {/* Preview */}
      {!hidePreview && value?.formatted_address && (
        <AddressPreviewCard address={value} compact={compact} />
      )}
    </div>
  );
}

/* ── Manual form (sub-component, kept local) ── */
interface ManualForm {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
}

function ManualAddressForm({
  form, setForm, stateOpen, setStateOpen, stateRef, disabled, onCommit,
}: {
  form: ManualForm;
  setForm: React.Dispatch<React.SetStateAction<ManualForm>>;
  stateOpen: boolean;
  setStateOpen: (v: boolean) => void;
  stateRef: React.RefObject<HTMLDivElement>;
  disabled?: boolean;
  onCommit: () => void;
}) {
  const update = (k: keyof ManualForm, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-2.5">
      <Input
        placeholder="Dirección (calle, número, apto)"
        value={form.address_line1}
        onChange={(e) => update("address_line1", e.target.value)}
        onBlur={onCommit}
        disabled={disabled}
        autoComplete="street-address"
        className="h-9 text-sm"
      />
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-5">
          <Input
            placeholder="Ciudad"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            onBlur={onCommit}
            disabled={disabled}
            autoComplete="address-level2"
            className="h-9 text-sm"
          />
        </div>
        <div className="col-span-4 relative" ref={stateRef}>
          <button
            type="button"
            onClick={() => setStateOpen(!stateOpen)}
            disabled={disabled}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-xl border bg-background px-3 text-sm transition-colors",
              form.state ? "border-border text-foreground" : "border-border text-muted-foreground",
              stateOpen && "border-primary/40 ring-1 ring-primary/20",
            )}
          >
            <span className="truncate">{form.state || "Estado"}</span>
            <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", stateOpen && "rotate-180")} />
          </button>
          {stateOpen && (
            <div className="absolute z-50 top-full mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg animate-fade-in">
              {US_STATES.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => { update("state", st); setStateOpen(false); setTimeout(onCommit, 0); }}
                  className={cn(
                    "w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors",
                    form.state === st ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted/50",
                  )}
                >
                  {st}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="col-span-3">
          <Input
            placeholder="ZIP"
            value={form.postal_code}
            onChange={(e) => update("postal_code", e.target.value.replace(/\D/g, "").slice(0, 5))}
            onBlur={onCommit}
            disabled={disabled}
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={5}
            className="h-9 text-sm tabular-nums"
          />
        </div>
      </div>
      <Input
        placeholder="Apto / piso / referencia (opcional)"
        value={form.address_line2}
        onChange={(e) => update("address_line2", e.target.value)}
        onBlur={onCommit}
        disabled={disabled}
        className="h-9 text-sm"
      />
    </div>
  );
}

export const PremiumAddressField = memo(PremiumAddressFieldImpl);
