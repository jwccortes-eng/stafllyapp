import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, MapPin, Loader2, Trash2, RotateCcw, Pencil } from "lucide-react";

interface Location {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string;
  client_id: string | null;
  geofence_radius: number | null;
  deleted_at: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

export default function Locations() {
  const { role, hasModuleAccess } = useAuth();
  const { selectedCompanyId } = useCompany();
  const canEdit = role === "owner" || role === "admin" || hasModuleAccess("locations", "edit");
  const canDelete = role === "owner" || role === "admin" || hasModuleAccess("locations", "delete");

  const [locations, setLocations] = useState<Location[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [showDeleted, setShowDeleted] = useState("active");

  // Form
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [radius, setRadius] = useState("200");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedCompanyId) {
      loadLocations();
      loadClients();
    }
  }, [selectedCompanyId, showDeleted]);

  const loadLocations = async () => {
    setLoading(true);
    let query = supabase.from("locations").select("*").eq("company_id", selectedCompanyId!).order("name");
    if (showDeleted === "active") query = query.is("deleted_at", null);
    else if (showDeleted === "deleted") query = query.not("deleted_at", "is", null);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setLocations((data ?? []) as Location[]);
    setLoading(false);
  };

  const loadClients = async () => {
    const { data } = await supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId!).is("deleted_at", null).order("name");
    setClients((data ?? []) as ClientOption[]);
  };

  const resetForm = () => {
    setName(""); setAddress(""); setCity(""); setState("");
    setClientId(""); setRadius("200"); setEditing(null);
  };

  const openEdit = (l: Location) => {
    setEditing(l);
    setName(l.name);
    setAddress(l.address ?? "");
    setCity(l.city ?? "");
    setState(l.state ?? "");
    setClientId(l.client_id ?? "");
    setRadius(String(l.geofence_radius ?? 200));
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !selectedCompanyId) return;
    setSaving(true);
    const payload = {
      company_id: selectedCompanyId,
      name: name.trim(),
      address: address.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      client_id: clientId || null,
      geofence_radius: parseInt(radius) || 200,
    };

    if (editing) {
      const { error } = await supabase.from("locations").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message);
      else toast.success("Ubicación actualizada");
    } else {
      const { error } = await supabase.from("locations").insert(payload as any);
      if (error) toast.error(error.message);
      else toast.success("Ubicación creada");
    }
    setSaving(false);
    setFormOpen(false);
    resetForm();
    loadLocations();
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase.from("locations").update({ deleted_at: new Date().toISOString() } as any).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Ubicación archivada"); loadLocations(); }
  };

  const handleRestore = async (id: string) => {
    const { error } = await supabase.from("locations").update({ deleted_at: null } as any).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Ubicación restaurada"); loadLocations(); }
  };

  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    if (!search) return locations;
    const s = search.toLowerCase();
    return locations.filter(l =>
      l.name.toLowerCase().includes(s) ||
      l.address?.toLowerCase().includes(s) ||
      l.city?.toLowerCase().includes(s)
    );
  }, [locations, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ubicaciones</h1>
          <p className="text-muted-foreground text-sm">Gestiona las ubicaciones de trabajo</p>
        </div>
        {canEdit && (
          <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva ubicación</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar ubicación" : "Nueva ubicación"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nombre *</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la ubicación" />
                </div>
                <div>
                  <Label>Dirección</Label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Dirección" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Ciudad</Label>
                    <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Ciudad" />
                  </div>
                  <div>
                    <Label>Estado</Label>
                    <Input value={state} onChange={e => setState(e.target.value)} placeholder="Estado" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cliente</Label>
                    <Select value={clientId || "none"} onValueChange={v => setClientId(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Sin cliente" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin cliente</SelectItem>
                        {clients.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Radio geofence (m)</Label>
                    <Input type="number" value={radius} onChange={e => setRadius(e.target.value)} />
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editing ? "Guardar cambios" : "Crear ubicación"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9" />
        </div>
        <Select value={showDeleted} onValueChange={setShowDeleted}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="deleted">Archivados</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No se encontraron ubicaciones</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Dirección</TableHead>
                <TableHead className="hidden md:table-cell">Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {[l.address, l.city, l.state].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{getClientName(l.client_id)}</TableCell>
                  <TableCell>
                    {l.deleted_at ? (
                      <Badge variant="secondary">Archivado</Badge>
                    ) : (
                      <Badge variant="default">Activo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {canEdit && !l.deleted_at && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(l)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && !l.deleted_at && (
                        <Button variant="ghost" size="icon" onClick={() => handleArchive(l.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                      {l.deleted_at && canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => handleRestore(l.id)}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
