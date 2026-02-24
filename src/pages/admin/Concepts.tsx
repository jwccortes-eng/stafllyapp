import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";

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

export default function Concepts() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", category: "extra" as string, calc_mode: "manual_value" as string,
    unit_label: "unidades", default_rate: "", rate_source: "concept_default" as string,
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetch = async () => {
    const { data } = await supabase.from("concepts").select("*").order("name");
    setConcepts((data as Concept[]) ?? []);
  };

  useEffect(() => { fetch(); }, []);

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
    });
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Concepto creado" });
      setOpen(false);
      setForm({ name: "", category: "extra", calc_mode: "manual_value", unit_label: "unidades", default_rate: "", rate_source: "concept_default" });
      fetch();
    }
    setLoading(false);
  };

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
            <form onSubmit={handleCreate} className="space-y-3">
              <div><Label>Nombre</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div>
                <Label>Categoría</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="extra">Extra (suma)</SelectItem>
                    <SelectItem value="deduction">Deducción (resta)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Modo de cálculo</Label>
                <Select value={form.calc_mode} onValueChange={v => setForm(f => ({ ...f, calc_mode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quantity_x_rate">Cantidad × Tarifa</SelectItem>
                    <SelectItem value="manual_value">Valor manual</SelectItem>
                    <SelectItem value="hybrid">Híbrido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Unidad</Label><Input value={form.unit_label} onChange={e => setForm(f => ({ ...f, unit_label: e.target.value }))} /></div>
                <div><Label>Tarifa default</Label><Input type="number" step="0.01" value={form.default_rate} onChange={e => setForm(f => ({ ...f, default_rate: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Fuente tarifa</Label>
                <Select value={form.rate_source} onValueChange={v => setForm(f => ({ ...f, rate_source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concept_default">Default del concepto</SelectItem>
                    <SelectItem value="per_employee">Por empleado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : "Crear"}</Button>
            </form>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {concepts.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No hay conceptos</TableCell></TableRow>
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
