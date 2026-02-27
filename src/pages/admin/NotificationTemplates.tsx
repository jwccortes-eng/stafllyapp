import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, FileText, Pencil, Trash2 } from "lucide-react";

const TRANSACTION_TYPES = [
  { value: "shift_assigned", label: "Asignación de turno" },
  { value: "shift_approved", label: "Solicitud aprobada" },
  { value: "shift_rejected", label: "Solicitud rechazada" },
  { value: "shift_reminder", label: "Recordatorio de turno" },
  { value: "shift_updated", label: "Turno modificado" },
  { value: "general", label: "General" },
];

const VARIABLE_HINTS = [
  "{turno}", "{fecha}", "{hora_inicio}", "{hora_fin}", "{empleado}",
];

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  transaction_type: string;
  is_default: boolean;
  is_active: boolean;
}

export default function NotificationTemplates() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [transactionType, setTransactionType] = useState("general");
  const [isDefault, setIsDefault] = useState(false);

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    const { data } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("company_id", selectedCompanyId)
      .order("name");
    setTemplates((data ?? []) as Template[]);
    setLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName(""); setSubject(""); setBody(""); setTransactionType("general"); setIsDefault(false);
    setDialogOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setName(t.name); setSubject(t.subject); setBody(t.body);
    setTransactionType(t.transaction_type); setIsDefault(t.is_default);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !selectedCompanyId) return;
    setSaving(true);

    if (editing) {
      const { error } = await supabase.from("notification_templates")
        .update({ name: name.trim(), subject: subject.trim(), body: body.trim(), transaction_type: transactionType, is_default: isDefault } as any)
        .eq("id", editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Plantilla actualizada");
    } else {
      const { error } = await supabase.from("notification_templates").insert({
        company_id: selectedCompanyId,
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        transaction_type: transactionType,
        is_default: isDefault,
        created_by: user?.id,
      } as any);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Plantilla creada");
    }

    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("notification_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Plantilla eliminada");
    load();
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    await supabase.from("notification_templates")
      .update({ is_active: active } as any)
      .eq("id", id);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Plantillas de notificación
          </h1>
          <p className="text-muted-foreground text-xs">Mensajes predeterminados por tipo de transacción</p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nueva plantilla
        </Button>
      </div>

      {/* Variables hint */}
      <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
        <p className="text-[11px] font-medium text-muted-foreground mb-1">Variables disponibles:</p>
        <div className="flex flex-wrap gap-1">
          {VARIABLE_HINTS.map(v => (
            <Badge key={v} variant="secondary" className="text-[10px] font-mono">{v}</Badge>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay plantillas configuradas</p>
          <p className="text-xs mt-1">Crea una plantilla para agilizar el envío de notificaciones</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="rounded-xl border bg-card p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold">{t.name}</p>
                  {t.is_default && <Badge variant="secondary" className="text-[9px]">Predeterminada</Badge>}
                  <Badge variant="outline" className="text-[9px]">
                    {TRANSACTION_TYPES.find(tt => tt.value === t.transaction_type)?.label || t.transaction_type}
                  </Badge>
                </div>
                {t.subject && <p className="text-xs text-muted-foreground">Asunto: {t.subject}</p>}
                {t.body && <p className="text-xs text-muted-foreground truncate">{t.body}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={t.is_active}
                  onCheckedChange={v => handleToggleActive(t.id, v)}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{editing ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Nombre</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Recordatorio turno mañana" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tipo de transacción</Label>
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Asunto</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ej: Recordatorio: {turno} - {fecha}" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Mensaje</Label>
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Ej: Hola, te recordamos que tienes el turno {turno} el {fecha} de {hora_inicio} a {hora_fin}."
                rows={4}
                className="text-sm resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} id="is-default" />
              <Label htmlFor="is-default" className="text-xs cursor-pointer">Usar como plantilla predeterminada</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {editing ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
