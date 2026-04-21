import { useState } from "react";
import { useBillingClientLocations, type BillingClientLocation } from "@/hooks/useBillingClientLocations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MapPin, Plus, Loader2, Pencil, Archive, RotateCcw, Save, X, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import LocationPicker, { EMPTY_LOCATION, type LocationPickerValue } from "@/components/locations/LocationPicker";

interface Props {
  clientId: string;
}

function rowToPickerValue(loc: BillingClientLocation): LocationPickerValue {
  return {
    name: loc.name,
    formatted_address: loc.formatted_address,
    address_line1: loc.address_line1,
    address_line2: loc.address_line2,
    city: loc.city,
    state: loc.state,
    postal_code: loc.zip,
    country: null,
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

export default function BillingClientLocationsManager({ clientId }: Props) {
  const { locations, isLoading, create, update, setActive } = useBillingClientLocations(clientId);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [picker, setPicker] = useState<LocationPickerValue>(EMPTY_LOCATION);
  const [notes, setNotes] = useState("");

  const reset = () => {
    setPicker(EMPTY_LOCATION);
    setNotes("");
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (loc: BillingClientLocation) => {
    setEditingId(loc.id);
    setPicker(rowToPickerValue(loc));
    setNotes(loc.notes ?? "");
    setShowForm(true);
  };

  const handleSave = async () => {
    const trimmedName = (picker.name ?? "").trim();
    if (!trimmedName) return;

    const payload = {
      client_id: clientId,
      name: trimmedName,
      address_line1: picker.address_line1,
      address_line2: picker.address_line2,
      city: picker.city,
      state: picker.state,
      zip: picker.postal_code,
      notes: notes,
      formatted_address: picker.formatted_address,
      latitude: picker.latitude,
      longitude: picker.longitude,
      place_id: picker.place_id,
      geofence_radius_meters: picker.geofence_radius_meters,
      arrival_notes: picker.arrival_notes,
      parking_notes: picker.parking_notes,
      contact_on_site: picker.contact_on_site,
      access_notes: picker.access_notes,
    };

    if (editingId) {
      await update.mutateAsync({ id: editingId, patch: payload });
    } else {
      await create.mutateAsync(payload);
    }
    reset();
  };

  const active = locations.filter((l) => l.is_active);
  const inactive = locations.filter((l) => !l.is_active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Billing locations
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {active.length} active{active.length !== 1 ? "" : ""}
            {inactive.length > 0 && ` · ${inactive.length} archived`}
          </p>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.02] p-4 space-y-3">
          <LocationPicker
            value={picker}
            onChange={setPicker}
            showName
            showOperationalNotes
            showGeofence
            namePlaceholder="HQ, North Warehouse…"
          />

          <div>
            <label className="text-xs font-medium">Internal notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full text-sm rounded-md border bg-background px-3 py-2 mt-1"
              placeholder="Free-text notes (visible only to your team)"
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" onClick={reset} className="gap-1.5 text-xs">
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!(picker.name ?? "").trim() || create.isPending || update.isPending}
              className="gap-1.5 text-xs press-scale"
            >
              {(create.isPending || update.isPending) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {editingId ? "Save" : "Create location"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : locations.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-6">
            No locations yet. Add the first one.
          </p>
        ) : (
          <>
            {active.map((loc) => (
              <LocationRow
                key={loc.id}
                loc={loc}
                onEdit={() => startEdit(loc)}
                onArchive={() => setActive.mutate({ id: loc.id, client_id: clientId, is_active: false })}
                onRestore={() => setActive.mutate({ id: loc.id, client_id: clientId, is_active: true })}
              />
            ))}
            {inactive.length > 0 && (
              <>
                <Separator className="my-3" />
                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  Archived
                </p>
                {inactive.map((loc) => (
                  <LocationRow
                    key={loc.id}
                    loc={loc}
                    onEdit={() => startEdit(loc)}
                    onArchive={() => setActive.mutate({ id: loc.id, client_id: clientId, is_active: false })}
                    onRestore={() => setActive.mutate({ id: loc.id, client_id: clientId, is_active: true })}
                    archived
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LocationRow({
  loc,
  onEdit,
  onArchive,
  onRestore,
  archived,
}: {
  loc: BillingClientLocation;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  archived?: boolean;
}) {
  const addressParts = [loc.address_line1, loc.address_line2, loc.city, loc.state, loc.zip].filter(Boolean);
  const hasCoords = loc.latitude != null && loc.longitude != null;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 flex items-start gap-3 transition-colors",
        archived ? "opacity-60" : "hover:border-primary/40",
      )}
    >
      <div className="h-8 w-8 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0">
        <MapPin className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{loc.name}</span>
          {archived && (
            <Badge variant="secondary" className="text-[9px]">
              Archived
            </Badge>
          )}
          {hasCoords && (
            <Badge variant="outline" className="text-[9px] gap-1">
              <Compass className="h-2.5 w-2.5" /> Geocoded
            </Badge>
          )}
          {loc.geofence_radius_meters != null && loc.geofence_radius_meters > 0 && (
            <Badge variant="outline" className="text-[9px] font-mono">
              {loc.geofence_radius_meters}m fence
            </Badge>
          )}
        </div>
        {(loc.formatted_address || addressParts.length > 0) && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {loc.formatted_address ?? addressParts.join(", ")}
          </p>
        )}
        {loc.arrival_notes && (
          <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">→ {loc.arrival_notes}</p>
        )}
        {loc.notes && (
          <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">{loc.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {archived ? (
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onRestore} title="Restore">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onArchive} title="Archive">
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
