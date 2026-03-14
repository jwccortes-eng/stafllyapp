import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Monitor, Plus, Pencil, Trash2, Copy, Check, QrCode, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface KioskDevice {
  id: string;
  company_id: string;
  name: string;
  location_id: string | null;
  device_identifier: string;
  is_active: boolean;
  created_at: string;
}

interface Location {
  id: string;
  name: string;
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

  // Form state
  const [formName, setFormName] = useState("");
  const [formLocation, setFormLocation] = useState<string>("");
  const [formDeviceId, setFormDeviceId] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchDevices = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("kiosk_devices" as any)
      .select("*")
      .eq("company_id", selectedCompanyId)
      .order("created_at", { ascending: false });
    setDevices((data as any[]) ?? []);
    setLoading(false);
  };

  const fetchLocations = async () => {
    if (!selectedCompanyId) return;
    const { data } = await supabase
      .from("locations")
      .select("id, name")
      .eq("company_id", selectedCompanyId)
      .eq("is_active", true)
      .order("name");
    setLocations(data ?? []);
  };

  useEffect(() => {
    fetchDevices();
    fetchLocations();
  }, [selectedCompanyId]);

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormLocation("");
    setFormDeviceId(crypto.randomUUID().slice(0, 8).toUpperCase());
    setDialogOpen(true);
  };

  const openEdit = (device: KioskDevice) => {
    setEditing(device);
    setFormName(device.name);
    setFormLocation(device.location_id ?? "");
    setFormDeviceId(device.device_identifier);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !selectedCompanyId) return;
    setSaving(true);

    const payload: any = {
      company_id: selectedCompanyId,
      name: formName.trim(),
      location_id: formLocation || null,
      device_identifier: formDeviceId || crypto.randomUUID().slice(0, 8).toUpperCase(),
    };

    if (editing) {
      const { error } = await supabase
        .from("kiosk_devices" as any)
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Kiosk actualizado" });
      }
    } else {
      const { error } = await supabase
        .from("kiosk_devices" as any)
        .insert(payload);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Kiosk creado" });
      }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchDevices();
  };

  const toggleActive = async (device: KioskDevice) => {
    await supabase
      .from("kiosk_devices" as any)
      .update({ is_active: !device.is_active })
      .eq("id", device.id);
    fetchDevices();
  };

  const handleDelete = async (device: KioskDevice) => {
    if (!confirm(`¿Eliminar kiosk "${device.name}"?`)) return;
    await (supabase as any).from("kiosk_devices").delete().eq("id", device.id);
    toast({ title: "Kiosk eliminado" });
    fetchDevices();
  };

  const copyKioskUrl = (device: KioskDevice) => {
    const url = `${window.location.origin}/kiosk?device=${device.device_identifier}`;
    navigator.clipboard.writeText(url);
    setCopied(device.id);
    toast({ title: "URL copiada" });
    setTimeout(() => setCopied(null), 2000);
  };

  const kioskUrl = `${window.location.origin}/kiosk`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispositivos Kiosk"
        description="Gestiona los terminales de fichaje compartido"
        icon={<Monitor className="h-5 w-5" />}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={kioskUrl} target="_blank" rel="noopener">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Abrir Kiosk
            </a>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nuevo Kiosk
          </Button>
        </div>
      </PageHeader>

      {devices.length === 0 && !loading ? (
        <EmptyState
          icon={<Monitor className="h-10 w-10" />}
          title="Sin dispositivos kiosk"
          description="Registra un dispositivo compartido para que los empleados puedan fichar desde una tablet."
          action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Crear Kiosk</Button>}
        />
      ) : (
        <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => {
                const loc = locations.find((l) => l.id === device.location_id);
                return (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">{device.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{loc?.name ?? "—"}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{device.device_identifier}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={device.is_active ? "default" : "secondary"} className="text-[10px]">
                        {device.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyKioskUrl(device)}>
                          {copied === device.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(device)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(device)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Kiosk" : "Nuevo Kiosk"}</DialogTitle>
            <DialogDescription>Configura un dispositivo de fichaje compartido</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre del Kiosk</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej: Tablet Entrada Principal"
              />
            </div>

            <div className="space-y-2">
              <Label>Ubicación</Label>
              <Select value={formLocation} onValueChange={setFormLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar ubicación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin ubicación</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Device ID</Label>
              <Input
                value={formDeviceId}
                onChange={(e) => setFormDeviceId(e.target.value)}
                placeholder="Identificador del dispositivo"
                className="font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Se genera automáticamente si se deja vacío</p>
            </div>

            <Button onClick={handleSave} disabled={!formName.trim() || saving} className="w-full">
              {saving ? "Guardando..." : editing ? "Guardar Cambios" : "Crear Kiosk"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
