/**
 * ShiftLocationsSection — premium location picker for shifts.
 *
 * Provides two optional structured locations linked to `locations_v2`:
 *   - meeting_point_location_id   (where the team gathers)
 *   - job_site_location_id        (where the actual work happens)
 *
 * Designed as an INCREMENTAL, opt-in upgrade on top of the existing
 * `meeting_point` text field. Picking a premium location mirrors its
 * formatted address into the legacy text so downstream consumers
 * (portal, notifications, exports) keep working without changes.
 *
 * Backward compatible:
 *   - Old shifts with only legacy text → still render fine
 *   - Each picker is collapsed by default to avoid overwhelming the form
 */
import { useEffect, useState } from "react";
import { MapPin, Navigation, ChevronDown, Sparkles, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import LocationPicker, {
  EMPTY_LOCATION,
  type LocationPickerValue,
} from "@/components/locations/LocationPicker";
import {
  useLocationsV2,
  fetchLocationById,
  type LocationV2,
} from "@/hooks/useLocationsV2";

interface Props {
  companyId: string | null;
  meetingPointLocationId: string | null;
  jobSiteLocationId: string | null;
  onChange: (patch: {
    meetingPointLocationId?: string | null;
    jobSiteLocationId?: string | null;
    /** Mirror text into legacy meeting_point so existing UIs keep working */
    meetingPointText?: string;
  }) => void;
}

function locationToPickerValue(loc: LocationV2 | null): LocationPickerValue {
  if (!loc) return { ...EMPTY_LOCATION };
  return {
    name: loc.name,
    formatted_address: loc.formatted_address,
    address_line1: loc.address_line1,
    address_line2: loc.address_line2,
    city: loc.city,
    state: loc.state,
    postal_code: loc.postal_code,
    country: loc.country,
    place_id: loc.place_id,
    latitude: loc.latitude,
    longitude: loc.longitude,
    access_notes: loc.access_notes,
    arrival_notes: loc.arrival_notes,
    parking_notes: loc.parking_notes,
    contact_on_site: loc.contact_on_site,
    geofence_radius_meters: loc.geofence_radius_meters,
  };
}

function pickerValueToInsertPayload(
  v: LocationPickerValue,
  companyId: string,
  type: "meeting_point" | "job_site",
) {
  return {
    company_id: companyId,
    location_type: type as any,
    name: v.name?.trim() || v.formatted_address?.slice(0, 60) || "Untitled location",
    formatted_address: v.formatted_address,
    address_line1: v.address_line1,
    address_line2: v.address_line2,
    city: v.city,
    state: v.state,
    postal_code: v.postal_code,
    country: v.country,
    place_id: v.place_id,
    latitude: v.latitude,
    longitude: v.longitude,
    access_notes: v.access_notes,
    arrival_notes: v.arrival_notes,
    parking_notes: v.parking_notes,
    contact_on_site: v.contact_on_site,
    geofence_radius_meters: v.geofence_radius_meters,
  };
}

interface SinglePickerProps {
  label: string;
  icon: typeof MapPin;
  helper: string;
  companyId: string | null;
  type: "meeting_point" | "job_site";
  selectedId: string | null;
  onSelect: (id: string | null, formattedAddress: string | null) => void;
}

export function SingleLocationPicker({
  label,
  icon: Icon,
  helper,
  companyId,
  type,
  selectedId,
  onSelect,
}: SinglePickerProps) {
  const { data: locations, create } = useLocationsV2(companyId, type);
  const [draft, setDraft] = useState<LocationPickerValue>({ ...EMPTY_LOCATION });
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [resolvedSelected, setResolvedSelected] = useState<LocationV2 | null>(null);

  // Resolve currently-selected location for display (covers cross-page items)
  useEffect(() => {
    let alive = true;
    if (!selectedId) {
      setResolvedSelected(null);
      return;
    }
    const fromList = (locations ?? []).find((l) => l.id === selectedId) ?? null;
    if (fromList) {
      setResolvedSelected(fromList);
      return;
    }
    fetchLocationById(selectedId).then((res) => {
      if (alive) setResolvedSelected(res);
    });
    return () => {
      alive = false;
    };
  }, [selectedId, locations]);

  const handlePickExisting = (id: string) => {
    const loc = (locations ?? []).find((l) => l.id === id);
    onSelect(id, loc?.formatted_address ?? null);
    setOpen(false);
  };

  const handleSaveNew = async () => {
    if (!companyId) return;
    if (!draft.formatted_address && !draft.address_line1) return;
    setCreating(true);
    try {
      const created = await create.mutateAsync(
        pickerValueToInsertPayload(draft, companyId, type) as any,
      );
      onSelect(created.id, created.formatted_address ?? null);
      setDraft({ ...EMPTY_LOCATION });
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const clearSelection = () => onSelect(null, null);

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider truncate">{label}</span>
          {resolvedSelected && (
            <Badge variant="secondary" className="text-[9px] gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              Premium
            </Badge>
          )}
        </div>
        {resolvedSelected && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3 mr-1" />
            Quitar
          </Button>
        )}
      </div>

      <div className="p-3">
        {resolvedSelected ? (
          <div className="space-y-1.5">
            <div className="text-[12px] font-semibold truncate">{resolvedSelected.name ?? "Sin nombre"}</div>
            {resolvedSelected.formatted_address && (
              <div className="text-[11px] text-muted-foreground truncate">
                {resolvedSelected.formatted_address}
              </div>
            )}
            {resolvedSelected.geofence_radius_meters != null && (
              <div className="text-[10px] text-muted-foreground">
                Geofence: {resolvedSelected.geofence_radius_meters}m
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/80">{helper}</p>
        )}

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-[11px] mt-2 w-full justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Plus className="h-3 w-3" />
                {resolvedSelected ? "Cambiar ubicación" : "Seleccionar ubicación premium"}
              </span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            {/* Pick existing */}
            {(locations?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Reutilizar
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(locations ?? []).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => handlePickExisting(l.id)}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-lg border border-border/30 hover:border-primary/40 hover:bg-muted/40 transition-colors",
                        selectedId === l.id && "border-primary/60 bg-primary/5",
                      )}
                    >
                      <div className="text-[11px] font-semibold truncate">{l.name ?? "Sin nombre"}</div>
                      {l.formatted_address && (
                        <div className="text-[10px] text-muted-foreground truncate">{l.formatted_address}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Or create */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Crear nueva
              </p>
              <LocationPicker
                value={draft}
                onChange={setDraft}
                showName
                showOperationalNotes={false}
                showGeofence={type === "job_site"}
                namePlaceholder={type === "meeting_point" ? "Punto de encuentro principal…" : "Sitio del cliente…"}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 text-[11px] w-full mt-2"
                onClick={handleSaveNew}
                disabled={creating || (!draft.formatted_address && !draft.address_line1)}
              >
                {creating ? "Guardando…" : "Guardar y seleccionar"}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

export default function ShiftLocationsSection({
  companyId,
  meetingPointLocationId,
  jobSiteLocationId,
  onChange,
}: Props) {
  return (
    <div className="space-y-2">
      <SingleLocationPicker
        label="Meeting point"
        icon={Navigation}
        helper="Lugar donde el equipo se reúne antes de iniciar el turno."
        companyId={companyId}
        type="meeting_point"
        selectedId={meetingPointLocationId}
        onSelect={(id, addr) =>
          onChange({
            meetingPointLocationId: id,
            // mirror into legacy text so portal / notifications keep working
            meetingPointText: addr ?? undefined,
          })
        }
      />
      <SingleLocationPicker
        label="Job site"
        icon={MapPin}
        helper="Sitio real donde se realiza el trabajo (puede coincidir con el cliente)."
        companyId={companyId}
        type="job_site"
        selectedId={jobSiteLocationId}
        onSelect={(id) => onChange({ jobSiteLocationId: id })}
      />
    </div>
  );
}
