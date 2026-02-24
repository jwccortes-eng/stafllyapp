import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";

interface Employee { id: string; first_name: string; last_name: string; }
interface Period { id: string; start_date: string; end_date: string; status: string; }
interface Concept { id: string; name: string; category: string; calc_mode: string; default_rate: number | null; rate_source: string; }
interface Movement {
  id: string; employee_id: string; period_id: string; concept_id: string;
  quantity: number | null; rate: number | null; total_value: number; note: string | null;
  employees: { first_name: string; last_name: string; } | null;
  concepts: { name: string; category: string; } | null;
}

export default function Movements() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [filterPeriod, setFilterPeriod] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: "", period_id: "", concept_id: "",
    quantity: "", rate: "", total_value: "", note: "",
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      supabase.from("employees").select("id, first_name, last_name").eq("is_active", true).order("first_name"),
      supabase.from("pay_periods").select("*").order("start_date", { ascending: false }),
      supabase.from("concepts").select("*").eq("is_active", true).order("name"),
    ]).then(([e, p, c]) => {
      setEmployees((e.data as Employee[]) ?? []);
      setPeriods((p.data as Period[]) ?? []);
      setConcepts((c.data as Concept[]) ?? []);
      if (p.data?.length) setFilterPeriod(p.data[0].id);
    });
  }, []);

  const fetchMovements = async (periodId: string) => {
    if (!periodId) return;
    const { data } = await supabase
      .from("movements")
      .select("*, employees(first_name, last_name), concepts(name, category)")
      .eq("period_id", periodId)
      .order("created_at", { ascending: false });
    setMovements((data as Movement[]) ?? []);
  };

  useEffect(() => { if (filterPeriod) fetchMovements(filterPeriod); }, [filterPeriod]);

  const selectedConcept = concepts.find(c => c.id === form.concept_id);

  const calcTotal = () => {
    if (!selectedConcept) return;
    if (selectedConcept.calc_mode === "quantity_x_rate") {
      const q = parseFloat(form.quantity) || 0;
      const r = parseFloat(form.rate) || selectedConcept.default_rate || 0;
      setForm(f => ({ ...f, total_value: (q * r).toFixed(2), rate: r.toString() }));
    }
  };

  useEffect(calcTotal, [form.quantity, form.rate, form.concept_id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("movements").insert({
      employee_id: form.employee_id,
      period_id: form.period_id || filterPeriod,
      concept_id: form.concept_id,
      quantity: form.quantity ? parseFloat(form.quantity) : null,
      rate: form.rate ? parseFloat(form.rate) : null,
      total_value: parseFloat(form.total_value) || 0,
      note: form.note.trim() || null,
    });
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Movimiento registrado" });
      setOpen(false);
      setForm({ employee_id: "", period_id: "", concept_id: "", quantity: "", rate: "", total_value: "", note: "" });
      fetchMovements(filterPeriod);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("movements").delete().eq("id", id);
    fetchMovements(filterPeriod);
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Novedades</h1>
          <p className="page-subtitle">Extras y deducciones por periodo</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nueva novedad</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar novedad</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Empleado</Label>
                <Select value={form.employee_id} onValueChange={v => setForm(f => ({ ...f, employee_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Periodo</Label>
                <Select value={form.period_id || filterPeriod} onValueChange={v => setForm(f => ({ ...f, period_id: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{periods.map(p => <SelectItem key={p.id} value={p.id}>{p.start_date} → {p.end_date}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Concepto</Label>
                <Select value={form.concept_id} onValueChange={v => setForm(f => ({ ...f, concept_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar concepto" /></SelectTrigger>
                  <SelectContent>{concepts.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.category})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {selectedConcept && selectedConcept.calc_mode !== "manual_value" && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Cantidad</Label><Input type="number" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
                  <div><Label>Tarifa</Label><Input type="number" step="0.01" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} /></div>
                </div>
              )}
              <div>
                <Label>Total</Label>
                <Input type="number" step="0.01" value={form.total_value} onChange={e => setForm(f => ({ ...f, total_value: e.target.value }))} required />
              </div>
              <div><Label>Nota</Label><Textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} /></div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : "Registrar"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4 max-w-xs">
        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
          <SelectTrigger><SelectValue placeholder="Filtrar por periodo" /></SelectTrigger>
          <SelectContent>{periods.map(p => <SelectItem key={p.id} value={p.id}>{p.start_date} → {p.end_date}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="data-table-wrapper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Cant.</TableHead>
              <TableHead>Tarifa</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Nota</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No hay novedades</TableCell></TableRow>
            ) : (
              movements.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.employees?.first_name} {m.employees?.last_name}</TableCell>
                  <TableCell>{m.concepts?.name}</TableCell>
                  <TableCell>
                    <span className={m.concepts?.category === "extra" ? "earning-badge" : "deduction-badge"}>
                      {m.concepts?.category === "extra" ? "Extra" : "Deducción"}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{m.quantity ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{m.rate ? `$${m.rate}` : "—"}</TableCell>
                  <TableCell className="font-mono font-medium">${m.total_value}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-32 truncate">{m.note ?? ""}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)} className="text-deduction hover:text-deduction">
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
