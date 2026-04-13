import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import AuditPanel from "@/components/audit/AuditPanel";
import { cn } from "@/lib/utils";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Search, Building2, Loader2, Trash2, RotateCcw, Pencil,
  LayoutGrid, List, Download, Phone, Mail, MessageCircle, Filter, X, Users, MapPin, Car
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { EmptyState } from "@/components/ui/empty-state";

interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
}

interface ClientLocation {
  id: string;
  name: string;
  address: string | null;
  default_pay_type: string | null;
  default_clock_method: string | null;
  require_car: boolean;
  contact_name: string | null;
  contact_phone: string | null;
}

type ViewMode = "grid" | "list";

export default function Clients() {
  const { role, hasModuleAccess } = useAuth();
  const { selectedCompanyId } = useCompany();
  const canEdit = role === "owner" || role === "admin" || hasModuleAccess("clients", "edit");
  const canDelete = role === "owner" || role === "admin" || hasModuleAccess("clients", "delete");

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [showDeleted, setShowDeleted] = useState("active");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Form state
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [clientLocations, setClientLocations] = useState<ClientLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  // New location inline form
  const [showLocForm, setShowLocForm] = useState(false);
  const [locName, setLocName] = useState("");
  const [locAddress, setLocAddress] = useState("");
  const [locPayType, setLocPayType] = useState("hourly");
  const [locClockMethod, setLocClockMethod] = useState("both");
  const [locRequireCar, setLocRequireCar] = useState(false);
  const [locContactName, setLocContactName] = useState("");
  const [locContactPhone, setLocContactPhone] = useState("");
  const [savingLoc, setSavingLoc] = useState(false);

  useEffect(() => {
    if (selectedCompanyId) loadClients();
  }, [selectedCompanyId, showDeleted]);

  const loadClients = async () => {
    setLoading(true);
    let query = supabase
      .from("clients")
      .select("*")
      .eq("company_id", selectedCompanyId!)
      .order("name");
    if (showDeleted === "active") query = query.is("deleted_at", null);
    else if (showDeleted === "deleted") query = query.not("deleted_at", "is", null);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setClients((data ?? []) as Client[]);
    setLoading(false);
  };

  const resetForm = () => {
    setName("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setNotes("");
    setEditing(null);
    setClientLocations([]);
    setShowLocForm(false);
    resetLocForm();
  };

  const resetLocForm = () => {
    setLocName(""); setLocAddress(""); setLocPayType("hourly");
    setLocClockMethod("both"); setLocRequireCar(false);
    setLocContactName(""); setLocContactPhone("");
    setShowLocForm(false);
  };

  const loadClientLocations = async (clientId: string) => {
    setLoadingLocations(true);
    const { data } = await supabase
      .from("locations")
      .select("id, name, address, default_pay_type, default_clock_method, require_car, contact_name, contact_phone")
      .eq("client_id", clientId)
      .eq("company_id", selectedCompanyId!)
      .is("deleted_at", null)
      .order("name");
    setClientLocations((data ?? []) as ClientLocation[]);
    setLoadingLocations(false);
  };

  const handleSaveLocation = async () => {
    if (!locName.trim() || !editing || !selectedCompanyId) return;
    setSavingLoc(true);
    const { error } = await supabase.from("locations").insert({
      company_id: selectedCompanyId,
      client_id: editing.id,
      name: locName.trim(),
      address: locAddress.trim() || null,
      default_pay_type: locPayType,
      default_clock_method: locClockMethod,
      require_car: locRequireCar,
      contact_name: locContactName.trim() || null,
      contact_phone: locContactPhone.trim() || null,
    } as any);
    if (error) toast.error(error.message);
    else {
      toast.success("Ubicación creada");
      resetLocForm();
      loadClientLocations(editing.id);
    }
    setSavingLoc(false);
  };

  const handleDeleteLocation = async (locId: string) => {
    const { error } = await supabase.from("locations").update({ deleted_at: new Date().toISOString() } as any).eq("id", locId);
    if (error) toast.error(error.message);
    else if (editing) loadClientLocations(editing.id);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setName(c.name);
    setContactName(c.contact_name ?? "");
    setContactEmail(c.contact_email ?? "");
    setContactPhone(c.contact_phone ?? "");
    setNotes(c.notes ?? "");
    setFormOpen(true);
    loadClientLocations(c.id);
  };

  const handleSave = async () => {
    if (!name.trim() || !selectedCompanyId) return;
    setSaving(true);
    const payload = {
      company_id: selectedCompanyId,
      name: name.trim(),
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      notes: notes.trim() || null,
    };

    if (editing) {
      const { error } = await supabase.from("clients").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message);
      else toast.success("Cliente actualizado");
    } else {
      const { error } = await supabase.from("clients").insert(payload as any);
      if (error) toast.error(error.message);
      else toast.success("Cliente creado");
    }
    setSaving(false);
    setFormOpen(false);
    resetForm();
    loadClients();
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase.from("clients").update({ deleted_at: new Date().toISOString() } as any).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Cliente archivado"); loadClients(); }
  };

  const handleRestore = async (id: string) => {
    const { error } = await supabase.from("clients").update({ deleted_at: null } as any).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Cliente restaurado"); loadClients(); }
  };

  const filtered = useMemo(() => {
    if (!search) return clients;
    const s = search.toLowerCase();
    return clients.filter(c =>
      c.name.toLowerCase().includes(s) ||
      c.contact_name?.toLowerCase().includes(s) ||
      c.contact_email?.toLowerCase().includes(s)
    );
  }, [clients, search]);

  const handleExport = () => {
    const csv = [
      ["Nombre", "Contacto", "Email", "Teléfono", "Estado", "Notas"].join(","),
      ...filtered.map(c => [
        `"${c.name}"`,
        `"${c.contact_name ?? ""}"`,
        `"${c.contact_email ?? ""}"`,
        `"${c.contact_phone ?? ""}"`,
        c.deleted_at ? "Archivado" : c.status,
        `"${(c.notes ?? "").replace(/"/g, '""')}"`,
      ].join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportado correctamente");
  };

  const cleanPhone = (phone: string | null) => phone?.replace(/[^+\d]/g, "") ?? "";

  const activeCount = [search, showDeleted !== "active" ? showDeleted : ""].filter(Boolean).length;

  return (
    <div>
      <PageHeader
        variant="1"
        icon={Building2}
        title="Clientes"
        subtitle={`${filtered.length} cliente${filtered.length !== 1 ? "s" : ""}`}
        rightSlot={canEdit ? (
          <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo cliente</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 pr-2">
                <div className="space-y-4 pb-2">
                  <div>
                    <Label>Nombre *</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del cliente" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Contacto</Label>
                      <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nombre" />
                    </div>
                    <div>
                      <Label>Teléfono</Label>
                      <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="Teléfono" />
                    </div>
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="email@ejemplo.com" />
                  </div>
                  <div>
                    <Label>Notas</Label>
                    <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas opcionales..." rows={2} />
                  </div>
                  <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    {editing ? "Guardar cambios" : "Crear cliente"}
                  </Button>

                  {/* ── Client Locations Section (only in edit mode) ── */}
                  {editing && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-bold">Ubicaciones</h3>
                            <Badge variant="secondary" className="text-[9px]">{clientLocations.length}</Badge>
                          </div>
                          <Button size="xs" variant="outline" onClick={() => setShowLocForm(true)} className="text-[10px] gap-1">
                            <Plus className="h-3 w-3" /> Agregar
                          </Button>
                        </div>

                        {/* Add location form */}
                        {showLocForm && (
                          <div className="rounded-xl border border-primary/20 bg-primary/[0.02] p-3 space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[11px]">Nombre *</Label>
                                <Input value={locName} onChange={e => setLocName(e.target.value)} placeholder="Nombre ubicación" className="h-8 text-xs" />
                              </div>
                              <div>
                                <Label className="text-[11px]">Dirección</Label>
                                <Input value={locAddress} onChange={e => setLocAddress(e.target.value)} placeholder="Dirección" className="h-8 text-xs" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[11px]">Pago por defecto</Label>
                                <Select value={locPayType} onValueChange={setLocPayType}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="hourly">⏱ Por hora</SelectItem>
                                    <SelectItem value="daily">📅 Por día</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-[11px]">Fichaje por defecto</Label>
                                <Select value={locClockMethod} onValueChange={setLocClockMethod}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="both">📱🖥 Ambos</SelectItem>
                                    <SelectItem value="mobile">📱 Móvil</SelectItem>
                                    <SelectItem value="kiosk">🖥 Kiosk</SelectItem>
                                    <SelectItem value="qr">📲 QR</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[11px]">Contacto sitio</Label>
                                <Input value={locContactName} onChange={e => setLocContactName(e.target.value)} placeholder="Nombre" className="h-8 text-xs" />
                              </div>
                              <div>
                                <Label className="text-[11px]">Tel. sitio</Label>
                                <Input value={locContactPhone} onChange={e => setLocContactPhone(e.target.value)} placeholder="Teléfono" className="h-8 text-xs" />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch checked={locRequireCar} onCheckedChange={setLocRequireCar} />
                              <Label className="text-[11px] flex items-center gap-1"><Car className="h-3 w-3" /> Requiere transporte</Label>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleSaveLocation} disabled={savingLoc || !locName.trim()} className="h-7 text-[10px] flex-1">
                                {savingLoc ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                                Crear ubicación
                              </Button>
                              <Button size="sm" variant="ghost" onClick={resetLocForm} className="h-7 text-[10px]">Cancelar</Button>
                            </div>
                          </div>
                        )}

                        {/* Locations list */}
                        {loadingLocations ? (
                          <div className="py-3 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
                        ) : clientLocations.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground text-center py-3">Sin ubicaciones. Agrega la primera.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {clientLocations.map(loc => (
                              <div key={loc.id} className="flex items-center gap-2 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors px-3 py-2">
                                <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate">{loc.name}</p>
                                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                                    {loc.address && <span className="truncate">{loc.address}</span>}
                                    <span className="shrink-0">{loc.default_pay_type === "daily" ? "📅" : "⏱"}</span>
                                    {loc.require_car && <Car className="h-2.5 w-2.5 text-warning shrink-0" />}
                                  </div>
                                </div>
                                <button onClick={() => handleDeleteLocation(loc.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-colors">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        ) : undefined}
      />

      {filtered.length > 0 && (
        <ReportActionsBar
          title="Clientes"
          subtitle={`${filtered.length} cliente${filtered.length !== 1 ? "s" : ""}`}
          onExportCSV={() => {
            const headers = ["Nombre", "Contacto", "Teléfono", "Email", "Estado", "Notas"];
            const rows = filtered.map(c => [
              c.name, c.contact_name ?? "", c.contact_phone ?? "",
              c.contact_email ?? "", c.status, c.notes ?? "",
            ]);
            return [headers, ...rows];
          }}
        />
      )}

      {/* Advanced toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, contacto o email…"
            className="pl-9 h-9 text-xs"
          />
        </div>

        {/* Status filter */}
        <Select value={showDeleted} onValueChange={setShowDeleted}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <Filter className="h-3 w-3 mr-1.5 text-muted-foreground/50" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="deleted">Archivados</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground/50 px-2" onClick={() => { setSearch(""); setShowDeleted("active"); }}>
            <X className="h-3 w-3 mr-1" /> Limpiar
          </Button>
        )}

        <div className="h-5 w-px bg-border/30 mx-1 hidden sm:block" />

        {/* View mode toggle */}
        <div className="flex items-center rounded-lg border border-border/30 overflow-hidden">
          <button
            className={cn(
              "h-9 w-9 flex items-center justify-center transition-colors",
              viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/50"
            )}
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            className={cn(
              "h-9 w-9 flex items-center justify-center transition-colors",
              viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/50"
            )}
            onClick={() => setViewMode("list")}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Export */}
        <Button variant="outline" size="sm" className="h-9 text-xs ml-auto" onClick={handleExport} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className={cn(
          viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" : "space-y-2"
        )}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className={cn("animate-pulse bg-muted rounded-2xl", viewMode === "grid" ? "h-40" : "h-16")} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="No se encontraron clientes" description={search ? "Intenta con otro término" : "Agrega tu primer cliente"} />
      ) : viewMode === "grid" ? (
        /* ─── Grid View ─── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => {
            const phone = cleanPhone(c.contact_phone);
            return (
              <div
                key={c.id}
                className={cn(
                  "group relative rounded-2xl border border-border/40 bg-card p-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden",
                  c.deleted_at && "opacity-60"
                )}
              >
                {/* decorative blob */}
                <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-primary/5 -translate-y-8 translate-x-8 group-hover:scale-[2] transition-transform duration-700" />

                <div className="relative z-10 flex items-start gap-3">
                  <ClientAvatar name={c.name} size="lg" />

                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-bold text-foreground truncate leading-tight">
                      {formatDisplayText(c.name, "name")}
                    </p>
                    <span className={cn(
                      "inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                      c.deleted_at
                        ? "bg-muted text-muted-foreground"
                        : c.status === "active"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                    )}>
                      {c.deleted_at ? "Archivado" : c.status === "active" ? "Activo" : "Inactivo"}
                    </span>

                    <div className="mt-2 space-y-0.5">
                      {c.contact_name && (
                        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                          <Users className="h-3 w-3 shrink-0" /> {formatPersonName(c.contact_name)}
                        </p>
                      )}
                      {c.contact_email && (
                        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                          <Mail className="h-3 w-3 shrink-0" /> {c.contact_email}
                        </p>
                      )}
                      {c.contact_phone && (
                        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" /> {c.contact_phone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick contact + Actions */}
                <div className="relative z-10 flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border/30">
                  {phone && (
                    <>
                      <a
                        href={`tel:${phone}`}
                        className="flex-1 min-w-[3.5rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold bg-earning/10 text-earning hover:bg-earning/20 transition-colors"
                      >
                        <Phone className="h-3 w-3 shrink-0" /> Llamar
                      </a>
                      <a
                        href={`https://wa.me/${phone.replace('+', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-[3.5rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold bg-earning/10 text-earning hover:bg-earning/20 transition-colors"
                      >
                        <MessageCircle className="h-3 w-3 shrink-0" /> WhatsApp
                      </a>
                    </>
                  )}
                  {canEdit && !c.deleted_at && (
                    <button
                      onClick={() => openEdit(c)}
                      className="flex-1 min-w-[3.5rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Pencil className="h-3 w-3 shrink-0" /> Editar
                    </button>
                  )}
                  {canDelete && !c.deleted_at && (
                    <button
                      onClick={() => handleArchive(c.id)}
                      className="flex-1 min-w-[3.5rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      <Trash2 className="h-3 w-3 shrink-0" /> Archivar
                    </button>
                  )}
                  {c.deleted_at && canEdit && (
                    <button
                      onClick={() => handleRestore(c.id)}
                      className="flex-1 min-w-[3.5rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3 shrink-0" /> Restaurar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── List View ─── */
        <div className="rounded-2xl border border-border/40 bg-card overflow-hidden shadow-xs">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_140px_160px_140px_100px_100px] gap-2 px-4 py-2.5 bg-muted/30 border-b border-border/20 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            <span>Cliente</span>
            <span>Contacto</span>
            <span>Email</span>
            <span>Teléfono</span>
            <span>Estado</span>
            <span className="text-right">Acciones</span>
          </div>
          {filtered.map((c, idx) => (
            <div
              key={c.id}
              className={cn(
                "grid grid-cols-[1fr_140px_160px_140px_100px_100px] gap-2 px-4 py-3 items-center text-xs hover:bg-muted/20 transition-colors",
                idx < filtered.length - 1 && "border-b border-border/10",
                c.deleted_at && "opacity-60"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ClientAvatar name={c.name} size="sm" />
                <span className="font-semibold text-foreground truncate">{formatDisplayText(c.name, "name")}</span>
              </div>
              <span className="text-muted-foreground truncate text-[11px]">{c.contact_name ? formatPersonName(c.contact_name) : "—"}</span>
              <span className="text-muted-foreground truncate text-[11px]">{c.contact_email ?? "—"}</span>
              <span className="text-muted-foreground truncate text-[11px]">{c.contact_phone ?? "—"}</span>
              <span>
                <span className={cn(
                  "inline-block px-2 py-0.5 rounded-full text-[9px] font-bold",
                  c.deleted_at
                    ? "bg-muted text-muted-foreground"
                    : c.status === "active"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                )}>
                  {c.deleted_at ? "Archivado" : c.status === "active" ? "Activo" : "Inactivo"}
                </span>
              </span>
              <div className="flex items-center gap-1 justify-end">
                {canEdit && !c.deleted_at && (
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {canDelete && !c.deleted_at && (
                  <button onClick={() => handleArchive(c.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {c.deleted_at && canEdit && (
                  <button onClick={() => handleRestore(c.id)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Audit trail */}
      <div className="mt-8">
        <AuditPanel entityType="client" title="Actividad de clientes" hideViews compact />
      </div>
    </div>
  );
}
