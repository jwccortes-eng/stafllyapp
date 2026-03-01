import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Building2, Loader2, Trash2, RotateCcw, Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ClientAvatar } from "@/components/ui/client-avatar";
import { PageSkeleton } from "@/components/ui/page-skeleton";
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

  // Form state
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

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
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setName(c.name);
    setContactName(c.contact_name ?? "");
    setContactEmail(c.contact_email ?? "");
    setContactPhone(c.contact_phone ?? "");
    setNotes(c.notes ?? "");
    setFormOpen(true);
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

  return (
    <div className="space-y-6">
      <PageHeader
        variant="1"
        icon={Building2}
        title="Clientes"
        subtitle="Gestiona los clientes de tu empresa"
        rightSlot={canEdit ? (
          <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo cliente</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
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
              </div>
            </DialogContent>
          </Dialog>
        ) : undefined}
      />

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 animate-pulse bg-muted rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="No se encontraron clientes" description={search ? "Intenta con otro término" : "Agrega tu primer cliente"} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => (
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
                  <Badge variant={c.deleted_at ? "secondary" : c.status === "active" ? "default" : "secondary"} className="mt-1 text-[10px]">
                    {c.deleted_at ? "Archivado" : c.status === "active" ? "Activo" : "Inactivo"}
                  </Badge>

                  <div className="mt-2 space-y-0.5">
                    {c.contact_name && (
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                        <Building2 className="h-3 w-3 shrink-0" /> {formatPersonName(c.contact_name)}
                      </p>
                    )}
                    {c.contact_email && (
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                        <span className="shrink-0">✉️</span> {c.contact_email}
                      </p>
                    )}
                    {c.contact_phone && (
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                        <span className="shrink-0">📞</span> {c.contact_phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="relative z-10 flex items-center gap-1.5 mt-3 pt-3 border-t border-border/30">
                {canEdit && !c.deleted_at && (
                  <Button variant="ghost" size="sm" className="flex-1 h-8 text-[11px] font-semibold" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                )}
                {canDelete && !c.deleted_at && (
                  <Button variant="ghost" size="sm" className="flex-1 h-8 text-[11px] font-semibold text-destructive hover:text-destructive" onClick={() => handleArchive(c.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Archivar
                  </Button>
                )}
                {c.deleted_at && canEdit && (
                  <Button variant="ghost" size="sm" className="flex-1 h-8 text-[11px] font-semibold" onClick={() => handleRestore(c.id)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
