import { useState } from "react";
import { useBillingClientLocations, type BillingClientLocation } from "@/hooks/useBillingClientLocations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { MapPin, Plus, Loader2, Pencil, Archive, RotateCcw, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
}

interface FormState {
  name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
}

const EMPTY: FormState = {
  name: "", address_line1: "", address_line2: "",
  city: "", state: "", zip: "", notes: "",
};

export default function BillingClientLocationsManager({ clientId }: Props) {
  const { locations, isLoading, create, update, setActive } = useBillingClientLocations(clientId);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (loc: BillingClientLocation) => {
    setEditingId(loc.id);
    setForm({
      name: loc.name,
      address_line1: loc.address_line1 ?? "",
      address_line2: loc.address_line2 ?? "",
      city: loc.city ?? "",
      state: loc.state ?? "",
      zip: loc.zip ?? "",
      notes: loc.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editingId) {
      await update.mutateAsync({ id: editingId, patch: form });
    } else {
      await create.mutateAsync({ client_id: clientId, ...form });
    }
    reset();
  };

  const active = locations.filter(l => l.is_active);
  const inactive = locations.filter(l => !l.is_active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Ubicaciones de facturación
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {active.length} activa{active.length !== 1 ? "s" : ""}
            {inactive.length > 0 && ` · ${inactive.length} archivada${inactive.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Nueva
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.02] p-4 space-y-3">
          <div>
            <Label className="text-xs">Nombre *</Label>
            <Input
              autoFocus
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="HQ, Warehouse Norte…"
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Dirección línea 1</Label>
            <Input
              value={form.address_line1}
              onChange={e => setForm({ ...form, address_line1: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Dirección línea 2</Label>
            <Input
              value={form.address_line2}
              onChange={e => setForm({ ...form, address_line2: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Ciudad</Label>
              <Input
                value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Input
                value={form.state}
                onChange={e => setForm({ ...form, state: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">ZIP</Label>
              <Input
                value={form.zip}
                onChange={e => setForm({ ...form, zip: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" onClick={reset} className="gap-1.5 text-xs">
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!form.name.trim() || create.isPending || update.isPending}
              className="gap-1.5 text-xs press-scale"
            >
              {(create.isPending || update.isPending) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {editingId ? "Guardar" : "Crear ubicación"}
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
            Sin ubicaciones. Agrega la primera.
          </p>
        ) : (
          <>
            {active.map(loc => (
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
                  Archivadas
                </p>
                {inactive.map(loc => (
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
  loc, onEdit, onArchive, onRestore, archived,
}: {
  loc: BillingClientLocation;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  archived?: boolean;
}) {
  const addressParts = [
    loc.address_line1, loc.address_line2, loc.city, loc.state, loc.zip,
  ].filter(Boolean);
  return (
    <div className={cn(
      "rounded-xl border bg-card p-3 flex items-start gap-3 transition-colors",
      archived ? "opacity-60" : "hover:border-primary/40",
    )}>
      <div className="h-8 w-8 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0">
        <MapPin className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{loc.name}</span>
          {archived && <Badge variant="secondary" className="text-[9px]">Archivada</Badge>}
        </div>
        {addressParts.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {addressParts.join(", ")}
          </p>
        )}
        {loc.notes && (
          <p className="text-[11px] text-muted-foreground mt-1 italic">{loc.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {archived ? (
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onRestore} title="Reactivar">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onArchive} title="Archivar">
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
