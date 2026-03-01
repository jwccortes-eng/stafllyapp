import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Plus, MoreHorizontal, Pencil, Trash2, ToggleLeft, Upload, Download, Search, TrendingUp, TrendingDown, Calculator, DollarSign, Hash, Layers } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { useCompany } from "@/hooks/useCompany";
import { safeRead, safeSheetToJson, getSheetNames, getSheet, writeExcelFile } from "@/lib/safe-xlsx";

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

const calcModeLabels: Record<string, string> = {
  quantity_x_rate: "Cantidad × Tarifa",
  manual_value: "Valor manual",
  hybrid: "Híbrido",
};

const calcModeIcons: Record<string, typeof Calculator> = {
  quantity_x_rate: Hash,
  manual_value: DollarSign,
  hybrid: Layers,
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
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const fetchConcepts = async () => {
    if (!selectedCompanyId) return;
    const { data } = await supabase.from("concepts").select("*").eq("company_id", selectedCompanyId).order("name");
    setConcepts((data as Concept[]) ?? []);
  };

  useEffect(() => { fetchConcepts(); }, [selectedCompanyId]);

  const filtered = concepts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const activeConcepts = filtered.filter(c => c.is_active);
  const inactiveConcepts = filtered.filter(c => !c.is_active);

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

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompanyId) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = await safeRead(data);
      const sheetNames = getSheetNames(wb);
      const sheet = getSheet(wb, sheetNames[0]);
      if (!sheet) { setImporting(false); return; }
      const rows = safeSheetToJson<Record<string, any>>(sheet);
      if (rows.length === 0) {
        toast({ title: "Archivo vacío", description: "No se encontraron filas.", variant: "destructive" });
        setImporting(false);
        return;
      }
      const normalize = (s: string) => s?.toString().trim().toLowerCase().replace(/[^a-záéíóúñü0-9]/g, "") ?? "";
      const categoryMap: Record<string, "extra" | "deduction"> = {
        extra: "extra", extras: "extra", suma: "extra", pago: "extra",
        deduccion: "deduction", deducción: "deduction", deduction: "deduction", resta: "deduction",
      };
      const calcModeMap: Record<string, "quantity_x_rate" | "manual_value" | "hybrid"> = {
        cantidadxtarifa: "quantity_x_rate", quantityxrate: "quantity_x_rate", "quantity_x_rate": "quantity_x_rate",
        valormanual: "manual_value", manualvalue: "manual_value", "manual_value": "manual_value",
        hibrido: "hybrid", híbrido: "hybrid", hybrid: "hybrid",
      };
      const rateSourceMap: Record<string, "concept_default" | "per_employee"> = {
        conceptdefault: "concept_default", defaultdelconcepto: "concept_default", "concept_default": "concept_default",
        perempleado: "per_employee", porempleado: "per_employee", "per_employee": "per_employee",
      };
      const findCol = (row: Record<string, any>, candidates: string[]) => {
        for (const key of Object.keys(row)) {
          if (candidates.includes(normalize(key))) return row[key];
        }
        return undefined;
      };
      let created = 0, skipped = 0;
      for (const row of rows) {
        const name = (findCol(row, ["nombre", "name"]) ?? "").toString().trim();
        if (!name) { skipped++; continue; }
        const catRaw = normalize((findCol(row, ["categoria", "categoría", "category"]) ?? "extra").toString());
        const calcRaw = normalize((findCol(row, ["calculo", "cálculo", "calcmode", "modocalculo", "mododecalculo", "calculation"]) ?? "manual_value").toString());
        const rateSourceRaw = normalize((findCol(row, ["fuentetarifa", "ratesource", "fuente"]) ?? "concept_default").toString());
        const unitLabel = (findCol(row, ["unidad", "unit", "unitlabel"]) ?? "unidades").toString().trim();
        const defaultRate = parseFloat((findCol(row, ["tarifa", "tarifadefault", "rate", "defaultrate"]) ?? "").toString()) || null;
        const { error } = await supabase.from("concepts").insert({
          name, category: categoryMap[catRaw] ?? "extra", calc_mode: calcModeMap[calcRaw] ?? "manual_value",
          unit_label: unitLabel, default_rate: defaultRate, rate_source: rateSourceMap[rateSourceRaw] ?? "concept_default",
          company_id: selectedCompanyId,
        });
        if (error) { skipped++; } else { created++; }
      }
      toast({ title: `Importación completada`, description: `${created} creados, ${skipped} omitidos` });
      fetchConcepts();
    } catch (err: any) {
      toast({ title: "Error al importar", description: err.message, variant: "destructive" });
    }
    setImporting(false);
    e.target.value = "";
  };

  const ConceptForm = ({ values, onChange, onSubmit, submitLabel }: {
    values: typeof emptyForm;
    onChange: (v: typeof emptyForm) => void;
    onSubmit: (e: React.FormEvent) => void;
    submitLabel: string;
  }) => (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormField label="Nombre" required><Input value={values.name} onChange={e => onChange({ ...values, name: e.target.value })} required /></FormField>
      <FormField label="Categoría">
        <Select value={values.category} onValueChange={v => onChange({ ...values, category: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="extra">Pago (suma)</SelectItem>
            <SelectItem value="deduction">Deducción (resta)</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Modo de cálculo">
        <Select value={values.calc_mode} onValueChange={v => onChange({ ...values, calc_mode: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="quantity_x_rate">Cantidad × Tarifa</SelectItem>
            <SelectItem value="manual_value">Valor manual</SelectItem>
            <SelectItem value="hybrid">Híbrido</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Unidad"><Input value={values.unit_label} onChange={e => onChange({ ...values, unit_label: e.target.value })} /></FormField>
        <FormField label="Tarifa default"><Input type="number" step="0.01" value={values.default_rate} onChange={e => onChange({ ...values, default_rate: e.target.value })} /></FormField>
      </div>
      <FormField label="Fuente tarifa">
        <Select value={values.rate_source} onValueChange={v => onChange({ ...values, rate_source: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="concept_default">Default del concepto</SelectItem>
            <SelectItem value="per_employee">Por empleado</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : submitLabel}</Button>
    </form>
  );

  const ConceptCard = ({ concept, inactive = false }: { concept: Concept; inactive?: boolean }) => {
    const isPayment = concept.category === "extra";
    const CalcIcon = calcModeIcons[concept.calc_mode] || Calculator;

    return (
      <div className={`group relative rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/20 ${inactive ? "opacity-50" : ""}`}>
        {/* Top row: category badge + menu */}
        <div className="flex items-start justify-between mb-3">
          <Badge
            variant="outline"
            className={
              isPayment
                ? "border-earning/30 bg-earning-bg text-earning font-medium"
                : "border-destructive/30 bg-deduction-bg text-destructive font-medium"
            }
          >
            {isPayment ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
            {isPayment ? "Pago" : "Deducción"}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!inactive && (
                <DropdownMenuItem onClick={() => openEdit(concept)}>
                  <Pencil className="h-4 w-4 mr-2" />Editar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleToggleActive(concept)}>
                <ToggleLeft className="h-4 w-4 mr-2" />{inactive ? "Activar" : "Desactivar"}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(concept)}>
                <Trash2 className="h-4 w-4 mr-2" />Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Name */}
        <h3 className="font-semibold text-sm text-foreground mb-3 leading-tight">{concept.name}</h3>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalcIcon className="h-3.5 w-3.5" />
            {calcModeLabels[concept.calc_mode] || concept.calc_mode}
          </span>
          <span className="text-border">•</span>
          <span>{concept.unit_label}</span>
        </div>

        {/* Rate */}
        {concept.default_rate != null && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Tarifa: </span>
            <span className="font-mono text-sm font-semibold text-foreground">${concept.default_rate}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        variant="3"
        title="Conceptos"
        subtitle="Extras y deducciones dinámicas"
        rightSlot={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => {
              const template = [
                { nombre: "Bono productividad", categoría: "extra", cálculo: "quantity_x_rate", unidad: "unidades", tarifa: 50, fuente_tarifa: "concept_default" },
                { nombre: "Descuento uniforme", categoría: "deducción", cálculo: "manual_value", unidad: "pesos", tarifa: "", fuente_tarifa: "concept_default" },
              ];
              writeExcelFile(template, "Conceptos", "plantilla_conceptos.xlsx");
            }}>
              <Download className="h-4 w-4 mr-2" />Plantilla
            </Button>
            <Button variant="outline" disabled={importing} onClick={() => document.getElementById("import-concepts-file")?.click()}>
              <Upload className="h-4 w-4 mr-2" />{importing ? "Importando..." : "Importar XLS"}
            </Button>
            <input id="import-concepts-file" type="file" accept=".xls,.xlsx" className="hidden" onChange={handleImportFile} />
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
        }
      />

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar concepto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Active concepts grid */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          Activos
          <Badge variant="secondary" className="font-mono text-xs">{activeConcepts.length}</Badge>
        </h2>
        {activeConcepts.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/30 py-12 text-center text-muted-foreground text-sm">
            {search ? "Sin resultados para esta búsqueda" : "No hay conceptos activos"}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {activeConcepts.map(c => <ConceptCard key={c.id} concept={c} />)}
          </div>
        )}
      </div>

      {/* Inactive concepts grid */}
      {inactiveConcepts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            Inactivos
            <Badge variant="secondary" className="font-mono text-xs">{inactiveConcepts.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {inactiveConcepts.map(c => <ConceptCard key={c.id} concept={c} inactive />)}
          </div>
        </div>
      )}

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
