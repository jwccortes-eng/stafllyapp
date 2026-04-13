import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import AuditPanel from "@/components/audit/AuditPanel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, MapPin, Loader2, Trash2, RotateCcw, Pencil, Car, Clock, CreditCard, Phone, Mail, User } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";

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
  default_pay_type: string | null;
  default_clock_method: string | null;
  require_car: boolean;
  default_instructions: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
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

  // Form fields
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [radius, setRadius] = useState("200");
  const [defaultPayType, setDefaultPayType] = useState("hourly");
  const [defaultClockMethod, setDefaultClockMethod] = useState("both");
  const [requireCar, setRequireCar] = useState(false);
  const [defaultInstructions, setDefaultInstructions] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
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
    setDefaultPayType("hourly"); setDefaultClockMethod("both");
    setRequireCar(false); setDefaultInstructions("");
    setContactName(""); setContactPhone(""); setContactEmail("");
  };

  const openEdit = (l: Location) => {
    setEditing(l);
    setName(l.name);
    setAddress(l.address ?? "");
    setCity(l.city ?? "");
    setState(l.state ?? "");
    setClientId(l.client_id ?? "");
    setRadius(String(l.geofence_radius ?? 200));
    setDefaultPayType(l.default_pay_type ?? "hourly");
    setDefaultClockMethod(l.default_clock_method ?? "both");
    setRequireCar(l.require_car ?? false);
    setDefaultInstructions(l.default_instructions ?? "");
    setContactName(l.contact_name ?? "");
    setContactPhone(l.contact_phone ?? "");
    setContactEmail(l.contact_email ?? "");
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
      default_pay_type: defaultPayType,
      default_clock_method: defaultClockMethod,
      require_car: requireCar,
      default_instructions: defaultInstructions.trim() || null,
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
    };

    if (editing) {
      const { error } = await supabase.from("locations").update(payload as any).eq("id", editing.id);
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
      <PageHeader
        variant="1"
        icon={MapPin}
        title="Ubicaciones"
        subtitle="Gestiona las ubicaciones de trabajo con defaults operacionales"
        rightSlot={canEdit ? (
          <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva ubicación</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar ubicación" : "Nueva ubicación"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Basic info */}
                <div>
                  <Label>Nombre *</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la ubicación" />
                </div>
                <div>
                  <Label>Dirección</Label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Dirección completa" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Ciudad</Label>
                    <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Ciudad" />
                  </div>
                  <div>
                    <Label>Estado / Borough</Label>
                    <Input value={state} onChange={e => setState(e.target.value)} placeholder="Ej: Queens, NJ" />
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

                {/* Contact info */}
                <div className="border-t border-border/30 pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Contacto en sitio
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Nombre</Label>
                      <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nombre" className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Teléfono</Label>
                      <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="Teléfono" className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Email" className="h-8 text-sm" />
                    </div>
                  </div>
                </div>

                {/* Operational defaults */}
                <div className="border-t border-border/30 pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    ⚙️ Defaults operacionales
                  </p>
                  <p className="text-[10px] text-muted-foreground mb-3">
                    Se aplicarán automáticamente al crear un turno en esta ubicación.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs flex items-center gap-1"><CreditCard className="h-3 w-3" /> Tipo de pago</Label>
                      <Select value={defaultPayType} onValueChange={setDefaultPayType}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hourly">⏱ Por hora</SelectItem>
                          <SelectItem value="daily">📅 Por día</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Método fichaje</Label>
                      <Select value={defaultClockMethod} onValueChange={setDefaultClockMethod}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">📱🖥 Ambos</SelectItem>
                          <SelectItem value="mobile">📱 Móvil</SelectItem>
                          <SelectItem value="kiosk">🖥 Kiosk</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Checkbox checked={requireCar} onCheckedChange={c => setRequireCar(!!c)} id="require-car" />
                    <Label htmlFor="require-car" className="text-xs font-normal cursor-pointer flex items-center gap-1">
                      <Car className="h-3 w-3" /> Requiere transporte (vehículo)
                    </Label>
                  </div>
                  <div className="mt-3">
                    <Label className="text-xs">Instrucciones por defecto</Label>
                    <Textarea
                      value={defaultInstructions}
                      onChange={e => setDefaultInstructions(e.target.value)}
                      rows={2}
                      placeholder="Ej: Uniforme negro, llegar 15 min antes, reportar con el supervisor..."
                      className="text-sm resize-none"
                    />
                  </div>
                </div>

                <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editing ? "Guardar cambios" : "Crear ubicación"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : undefined}
      />

      {filtered.length > 0 && (
        <ReportActionsBar
          title="Ubicaciones"
          subtitle={`${filtered.length} ubicación${filtered.length !== 1 ? "es" : ""}`}
          onExportCSV={() => {
            const headers = ["Nombre", "Dirección", "Ciudad", "Estado", "Cliente", "Radio geocerca", "Pago default", "Fichaje default", "Req. carro", "Status"];
            const rows = filtered.map(l => [
              l.name, l.address ?? "", l.city ?? "", l.state ?? "",
              clients.find(c => c.id === l.client_id)?.name ?? "",
              String(l.geofence_radius ?? ""), l.default_pay_type ?? "",
              l.default_clock_method ?? "", l.require_car ? "Sí" : "No", l.status,
            ]);
            return [headers, ...rows];
          }}
        />
      )}

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
        <div className="text-center py-16 text-muted-foreground/50">
          <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No se encontraron ubicaciones</p>
          <p className="text-xs mt-1">{search ? "Intenta con otro término" : "Agrega tu primera ubicación"}</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Dirección</TableHead>
                <TableHead className="hidden md:table-cell">Cliente</TableHead>
                <TableHead className="hidden lg:table-cell">Defaults</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(l => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{l.name}</span>
                      {l.state && <span className="text-[10px] text-muted-foreground ml-1.5">({l.state})</span>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {[l.address, l.city].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{getClientName(l.client_id)}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5">
                        {l.default_pay_type === "daily" ? "📅 Día" : "⏱ Hora"}
                      </Badge>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5">
                        {l.default_clock_method === "mobile" ? "📱" : l.default_clock_method === "kiosk" ? "🖥" : "📱🖥"}
                      </Badge>
                      {l.require_car && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 border-warning/30 text-warning">
                          <Car className="h-2.5 w-2.5 mr-0.5" /> Carro
                        </Badge>
                      )}
                    </div>
                  </TableCell>
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

      <div className="mt-8">
        <AuditPanel entityType="location" title="Actividad de ubicaciones" hideViews compact />
      </div>
    </div>
  );
}
