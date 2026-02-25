import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Pencil, Trash2, ToggleLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { useCompany } from "@/hooks/useCompany";

interface Concept {
  id: string;
  name: string;
  category: string;
  calc_mode: string;
  unit_label: string;
  default_rate: number | null;
  rate_source: string;
  is_active: boolean;
}

const emptyForm = {
  name: "", category: "extra" as string, calc_mode: "manual_value" as string,
  unit_label: "unidades", default_rate: "", rate_source: "concept_default" as string,
};

export default function Concepts() {
  const { selectedCompanyId } = useCompany();
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [open, setOpen] = useState(false);
  const [editingConcept, setEditingConcept] = useState<Concept | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Concept | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchConcepts = async () => {
    if (!selectedCompanyId) return;
    const { data } = await supabase.from("concepts").select("*").eq("company_id", selectedCompanyId).order("name");
    setConcepts((data as Concept[]) ?? []);
  };

  useEffect(() => { fetchConcepts(); }, [selectedCompanyId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("concepts").insert({
      name: form.name.trim(),
      category: form.category as "extra" | "deduction",
      calc_mode: form.calc_mode as "quantity_x_rate" | "manual_value" | "hybrid",
      unit_label: form.unit_label.trim(),
      default_rate: form.default_rate ? parseFloat(form.default_rate) : null,
      rate_source: form.rate_source as "concept_default" | "per_employee",
      company_id: selectedCompanyId,
    });
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Concepto creado" });
      setOpen(false);
      setForm(emptyForm);
      fetchConcepts();
    }
    setLoading(false);
  };

  const openEdit = (c: Concept) => {
    setEditingConcept(c);
    setEditForm({
      name: c.name,
      category: c.category,
      calc_mode: c.calc_mode,
      unit_label: c.unit_label || "unidades",
      default_rate: c.default_rate?.toString() ?? "",
      rate_source: c.rate_source,
    });
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConcept) return;
    setLoading(true);
    const { error } = await supabase.from("concepts").update({
      name: editForm.name.trim(),
      category: editForm.category as "extra" | "deduction",
      calc_mode: editForm.calc_mode as "quantity_x_rate" | "manual_value" | "hybrid",
      unit_label: editForm.unit_label.trim(),
      default_rate: editForm.default_rate ? parseFloat(editForm.default_rate) : null,
      rate_source: editForm.rate_source as "concept_default" | "per_employee",
    }).eq("id", editingConcept.id);
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Concepto actualizado" });
      setEditOpen(false);
      setEditingConcept(null);
      fetchConcepts();
    }
    setLoading(false);
  };

  const handleToggleActive = async (c: Concept) => {
    const { error } = await supabase.from("concepts").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: c.is_active ? "Concepto desactivado" : "Concepto activado" });
      fetchConcepts();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("concepts").delete().eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Error al eliminar", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Concepto eliminado" });
      fetchConcepts();
    }
    setDeleteTarget(null);
  };

  const ConceptForm = ({ values, onChange, onSubmit, submitLabel }: {
    values: typeof emptyForm;
    onChange: (v: typeof emptyForm) => void;
    onSubmit: (e: React.FormEvent) => void;
    submitLabel: string;
  }) => (
    <form onSubmit={onSubmit} className="space-y-3">
      <div><Label>Nombre</Label><Input value={values.name} onChange={e => onChange({ ...values, name: e.target.value })} required /></div>
      <div>
        <Label>Categoría</Label>
        <Select value={values.category} onValueChange={v => onChange({ ...values, category: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="extra">Extra (suma)</SelectItem>
            <SelectItem value="deduction">Deducción (resta)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Modo de cálculo</Label>
        <Select value={values.calc_mode} onValueChange={v => onChange({ ...values, calc_mode: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="quantity_x_rate">Cantidad × Tarifa</SelectItem>
            <SelectItem value="manual_value">Valor manual</SelectItem>
            <SelectItem value="hybrid">Híbrido</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Unidad</Label><Input value={values.unit_label} onChange={e => onChange({ ...values, unit_label: e.target.value })} /></div>
        <div><Label>Tarifa default</Label><Input type="number" step="0.01" value={values.default_rate} onChange={e => onChange({ ...values, default_rate: e.target.value })} /></div>
      </div>
      <div>
        <Label>Fuente tarifa</Label>
        <Select value={values.rate_source} onValueChange={v => onChange({ ...values, rate_source: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="concept_default">Default del concepto</SelectItem>
            <SelectItem value="per_employee">Por empleado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : submitLabel}</Button>
    </form>
  );

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Conceptos</h1>
          <p className="page-subtitle">Extras y deducciones dinámicas</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nuevo concepto</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo concepto</DialogTitle></DialogHeader>
            <ConceptForm values={form} onChange={setForm} onSubmit={handleCreate} submitLabel="Crear" />
          </DialogContent>
        </Dialog>
      </div>

      <div className="data-table-wrapper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Cálculo</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Tarifa</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {concepts.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No hay conceptos</TableCell></TableRow>
            ) : (
              concepts.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <span className={c.category === "extra" ? "earning-badge" : "deduction-badge"}>
                      {c.category === "extra" ? "Extra" : "Deducción"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{c.calc_mode.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-xs">{c.unit_label}</TableCell>
                  <TableCell className="font-mono text-xs">{c.default_rate ? `$${c.default_rate}` : "—"}</TableCell>
                  <TableCell>
                    <span className={c.is_active ? "earning-badge" : "deduction-badge"}>
                      {c.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleActive(c)}>
                          <ToggleLeft className="h-4 w-4 mr-2" />{c.is_active ? "Desactivar" : "Activar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(c)}>
                          <Trash2 className="h-4 w-4 mr-2" />Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar concepto</DialogTitle></DialogHeader>
          <ConceptForm values={editForm} onChange={setEditForm} onSubmit={handleEdit} submitLabel="Guardar cambios" />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si el concepto tiene movimientos asociados, no podrá eliminarse. Considera desactivarlo en su lugar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
