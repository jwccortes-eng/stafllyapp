import { useState, useEffect } from "react";
import { safeRandomUUID } from "@/lib/safe-storage";
import { supabase } from "@/integrations/supabase/client";
import { APP_BASE_URL } from "@/lib/app-url";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Monitor, Plus, Pencil, Trash2, Copy, Check, ExternalLink } from "lucide-react";

interface KioskDevice {
  id: string;
  company_id: string;
  name: string;
  location_id: string | null;
  device_identifier: string;
  is_active: boolean;
  created_at: string;
}

interface Location { id: string; name: string; }

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function kioskFetch(path: string, opts?: RequestInit) {
  const session = (await supabase.auth.getSession()).data.session;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts?.method === "POST" ? "return=representation" : "return=minimal",
      ...(opts?.headers ?? {}),
    },
  });
}

export default function KioskDevices() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<KioskDevice | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formLocation, setFormLocation] = useState<string>("");
  const [formDeviceId, setFormDeviceId] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchDevices = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const res = await kioskFetch(`kiosk_devices?company_id=eq.${selectedCompanyId}&order=created_at.desc`);
    setDevices(res.ok ? await res.json() : []);
    setLoading(false);
  };

  const fetchLocations = async () => {
    if (!selectedCompanyId) return;
    const res = await kioskFetch(`locations?company_id=eq.${selectedCompanyId}&is_active=eq.true&order=name&select=id,name`);
    setLocations(res.ok ? await res.json() : []);
  };

  useEffect(() => { fetchDevices(); fetchLocations(); }, [selectedCompanyId]);

  const openCreate = () => { setEditing(null); setFormName(""); setFormLocation(""); setFormDeviceId(safeRandomUUID().slice(0, 8).toUpperCase()); setDialogOpen(true); };
  const openEdit = (d: KioskDevice) => { setEditing(d); setFormName(d.name); setFormLocation(d.location_id ?? ""); setFormDeviceId(d.device_identifier); setDialogOpen(true); };

  const handleSave = async () => {
    if (!formName.trim() || !selectedCompanyId) return;
    setSaving(true);
    const payload = { company_id: selectedCompanyId, name: formName.trim(), location_id: formLocation && formLocation !== "none" ? formLocation : null, device_identifier: formDeviceId || safeRandomUUID().slice(0, 8).toUpperCase() };

    if (editing) {
      await kioskFetch(`kiosk_devices?id=eq.${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      toast({ title: "Kiosk actualizado" });
    } else {
      await kioskFetch("kiosk_devices", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "Kiosk creado" });
    }
    setSaving(false); setDialogOpen(false); fetchDevices();
  };

  const handleDelete = async (d: KioskDevice) => {
    if (!confirm(`¿Eliminar kiosk "${d.name}"?`)) return;
    await kioskFetch(`kiosk_devices?id=eq.${d.id}`, { method: "DELETE" });
    toast({ title: "Kiosk eliminado" }); fetchDevices();
  };

  const copyKioskUrl = (d: KioskDevice) => {
    navigator.clipboard.writeText(`${APP_BASE_URL}/kiosk?device=${d.device_identifier}`);
    setCopied(d.id); toast({ title: "URL copiada" }); setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Dispositivos Kiosk" subtitle="Gestiona los terminales de fichaje compartido" icon={Monitor}
        rightSlot={<div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild><a href={`${APP_BASE_URL}/kiosk`} target="_blank" rel="noopener"><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Abrir Kiosk</a></Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1.5" />Nuevo Kiosk</Button>
        </div>}
      />

      {devices.length === 0 && !loading ? (
        <EmptyState icon={Monitor} title="Sin dispositivos kiosk" description="Registra un dispositivo compartido para que los empleados puedan fichar desde una tablet." actionLabel="Crear Kiosk" onAction={openCreate} />
      ) : (
        <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Ubicación</TableHead><TableHead>ID</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {devices.map((d) => {
                const loc = locations.find((l) => l.id === d.location_id);
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{loc?.name ?? "—"}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{d.device_identifier}</code></TableCell>
                    <TableCell><Badge variant={d.is_active ? "default" : "secondary"} className="text-[10px]">{d.is_active ? "Activo" : "Inactivo"}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyKioskUrl(d)}>{copied === d.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}</Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(d)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar Kiosk" : "Nuevo Kiosk"}</DialogTitle><DialogDescription>Configura un dispositivo de fichaje compartido</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nombre del Kiosk</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej: Tablet Entrada Principal" /></div>
            <div className="space-y-2">
              <Label>Ubicación</Label>
              <Select value={formLocation} onValueChange={setFormLocation}><SelectTrigger><SelectValue placeholder="Seleccionar ubicación" /></SelectTrigger><SelectContent><SelectItem value="none">Sin ubicación</SelectItem>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-2"><Label>Device ID</Label><Input value={formDeviceId} onChange={(e) => setFormDeviceId(e.target.value)} placeholder="Identificador" className="font-mono" /><p className="text-[10px] text-muted-foreground">Se genera automáticamente si se deja vacío</p></div>
            <Button onClick={handleSave} disabled={!formName.trim() || saving} className="w-full">{saving ? "Guardando..." : editing ? "Guardar Cambios" : "Crear Kiosk"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
