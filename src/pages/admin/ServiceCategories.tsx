import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { usePageView } from "@/hooks/useAuditLog";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Tags, Plus, Loader2, Pencil, Trash2 } from "lucide-react";

interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
}

export default function ServiceCategories() {
  usePageView("Categorías de servicio");
  const { selectedCompanyId } = useCompany();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const { data } = await supabase.from("service_categories").select("*").eq("company_id", selectedCompanyId).order("sort_order").order("name");
    setCategories((data ?? []) as Category[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [selectedCompanyId]);

  const handleCreate = async () => {
    if (!name.trim() || !selectedCompanyId) return;
    setSaving(true);
    const { error } = await supabase.from("service_categories").insert({
      company_id: selectedCompanyId,
      name: name.trim(),
      description: description.trim() || null,
    } as any);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Categoría creada");
    setSaving(false); setCreateOpen(false); setName(""); setDescription("");
    loadData();
  };

  const handleUpdate = async () => {
    if (!editCat || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("service_categories").update({
      name: name.trim(),
      description: description.trim() || null,
    } as any).eq("id", editCat.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Categoría actualizada");
    setSaving(false); setEditCat(null); setName(""); setDescription("");
    loadData();
  };

  const toggleActive = async (cat: Category) => {
    await supabase.from("service_categories").update({ is_active: !cat.is_active } as any).eq("id", cat.id);
    loadData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("service_categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Categoría eliminada");
    loadData();
  };

  const defaultCategories = [
    "Limpieza", "Handyman", "Plomería", "Electricidad", "Pintura",
    "Carpintería", "Mudanzas", "Personal de cocina", "Meseros",
    "Bartenders", "Housekeeping", "Mantenimiento", "Trabajo general",
  ];

  const seedDefaults = async () => {
    if (!selectedCompanyId) return;
    const inserts = defaultCategories.map((n, i) => ({
      company_id: selectedCompanyId,
      name: n,
      sort_order: i,
    }));
    await supabase.from("service_categories").insert(inserts as any);
    toast.success("Categorías predeterminadas creadas");
    loadData();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        variant="1"
        icon={Tags}
        title="Categorías de servicio"
        subtitle="Define los tipos de servicio que ofreces"
        rightSlot={
          <div className="flex gap-2">
            {categories.length === 0 && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={seedDefaults}>
                Cargar predeterminadas
              </Button>
            )}
            <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) { setName(""); setDescription(""); } }}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" /> Nueva categoría</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>Nueva categoría</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div><Label className="text-xs">Nombre *</Label><Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm mt-1" placeholder="Ej: Meseros" /></div>
                  <div><Label className="text-xs">Descripción</Label><Input value={description} onChange={e => setDescription(e.target.value)} className="h-9 text-sm mt-1" placeholder="Opcional" /></div>
                  <Button onClick={handleCreate} disabled={saving || !name.trim()} className="w-full h-9 text-sm">{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Crear</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16">
          <Tags className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No hay categorías de servicio</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={seedDefaults}>Cargar predeterminadas</Button>
        </div>
      ) : (
        <div className="grid gap-2">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center justify-between rounded-xl border border-border/20 bg-card px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Tags className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{cat.name}</p>
                  {cat.description && <p className="text-[11px] text-muted-foreground">{cat.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={cat.is_active} onCheckedChange={() => toggleActive(cat)} />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditCat(cat); setName(cat.name); setDescription(cat.description || ""); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(cat.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editCat} onOpenChange={o => { if (!o) { setEditCat(null); setName(""); setDescription(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar categoría</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label className="text-xs">Nombre *</Label><Input value={name} onChange={e => setName(e.target.value)} className="h-9 text-sm mt-1" /></div>
            <div><Label className="text-xs">Descripción</Label><Input value={description} onChange={e => setDescription(e.target.value)} className="h-9 text-sm mt-1" /></div>
            <Button onClick={handleUpdate} disabled={saving || !name.trim()} className="w-full h-9 text-sm">{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
