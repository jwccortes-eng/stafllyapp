/**
 * JobSiteSection — protagonist card. The main work address.
 *
 * Owns:
 *  - Saved location (Location row)
 *  - Premium structured Job Site (locations_v2 → job_site_location_id)
 *  - Worker-facing notes ("indicaciones para llegar" → special_instructions)
 *  - "Open in Google Maps" link when an address is available
 *
 * Meeting points are NOT in this card. They live in MeetingPointsSection.
 */
import { memo, useMemo, useState } from "react";
import { MapPin, Plus, ExternalLink, Loader2, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SectionCard } from "./section-card";
import { SingleLocationPicker } from "../ShiftLocationsSection";
import type { LocationOption } from "../ShiftFormFields";

interface Props {
  companyId: string | null;
  locationId: string;
  jobSiteLocationId: string | null;
  specialInstructions: string;
  locations: LocationOption[];
  onChange: (patch: {
    locationId?: string;
    jobSiteLocationId?: string | null;
    specialInstructions?: string;
    /** Side-effects propagated from saved-location auto-fill */
    meetingPoint?: string;
    clockMethod?: "mobile" | "kiosk" | "both";
    transportRequired?: boolean;
  }) => void;
  onQuickAddLocation?: (name: string, address: string) => Promise<void>;
}

function buildMapsUrl(address: string | null | undefined): string | null {
  if (!address) return null;
  const a = address.trim();
  if (!a) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
}

function JobSiteSectionImpl({
  companyId,
  locationId,
  jobSiteLocationId,
  specialInstructions,
  locations,
  onChange,
  onQuickAddLocation,
}: Props) {
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [adding, setAdding] = useState(false);

  const selectedLoc = useMemo(
    () => (locationId ? locations.find((l) => l.id === locationId) ?? null : null),
    [locationId, locations],
  );
  const mapsUrl = useMemo(() => buildMapsUrl(selectedLoc?.address), [selectedLoc]);

  const handleLocationChange = (val: string) => {
    const id = val === "none" ? "" : val;
    const patch: Parameters<typeof onChange>[0] = { locationId: id };
    if (id) {
      const loc = locations.find((l) => l.id === id);
      if (loc) {
        if (loc.address) patch.meetingPoint = loc.address;
        if (loc.default_clock_method) patch.clockMethod = loc.default_clock_method as any;
        if (loc.require_car) patch.transportRequired = true;
        if (loc.default_instructions) patch.specialInstructions = loc.default_instructions;
      }
    }
    onChange(patch);
  };

  const submitNew = async () => {
    if (!newName.trim() || !onQuickAddLocation) return;
    setAdding(true);
    try {
      await onQuickAddLocation(newName.trim(), newAddress.trim());
      setNewName("");
      setNewAddress("");
      setShowAddLocation(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <SectionCard
      icon={MapPin}
      title="Job Site"
      subtitle="Dirección principal donde se realizará el trabajo."
      variant="hero"
    >
      <div>
        <Label className="text-[11px] text-muted-foreground font-medium">Ubicación guardada</Label>
        <div className="flex gap-1 mt-1">
          <Select value={locationId || "none"} onValueChange={handleLocationChange}>
            <SelectTrigger className="h-9 text-sm flex-1">
              <SelectValue placeholder="Sin asignar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin asignar</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {onQuickAddLocation && (
            <Popover open={showAddLocation} onOpenChange={setShowAddLocation}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <p className="text-xs font-medium mb-2">Nueva ubicación</p>
                <div className="space-y-1.5">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre"
                    className="h-8 text-sm"
                  />
                  <Input
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Dirección (opcional)"
                    className="h-8 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && submitNew()}
                  />
                  <Button size="sm" className="h-8 w-full text-xs" onClick={submitNew} disabled={adding || !newName.trim()}>
                    {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : "Crear"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {selectedLoc?.address && (
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="truncate">{selectedLoc.address}</span>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"
              >
                <ExternalLink className="h-3 w-3" /> Maps
              </a>
            )}
          </div>
        )}
      </div>

      {/* Premium structured Job Site (autocomplete) */}
      {companyId && (
        <SingleLocationPicker
          label="Job site (premium)"
          icon={MapPin}
          helper="Sitio real donde se realiza el trabajo (autocomplete con coordenadas)."
          companyId={companyId}
          type="job_site"
          selectedId={jobSiteLocationId}
          onSelect={(id) => onChange({ jobSiteLocationId: id })}
        />
      )}

      <div>
        <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
          <FileText className="h-3 w-3" /> Indicaciones para el trabajador
        </Label>
        <Textarea
          value={specialInstructions}
          onChange={(e) => onChange({ specialInstructions: e.target.value })}
          rows={2}
          placeholder="Ej: Entrar por la puerta lateral, parking en sótano 2…"
          className="text-sm resize-none mt-1"
        />
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Visible para el equipo en su portal — solo del Job Site, no del meeting point.
        </p>
      </div>
    </SectionCard>
  );
}

export const JobSiteSection = memo(JobSiteSectionImpl);
