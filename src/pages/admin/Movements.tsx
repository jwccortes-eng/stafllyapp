import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Trash2, Upload, CheckCircle2, AlertTriangle, XCircle, Download, ChevronsUpDown, Check, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { useCompany } from "@/hooks/useCompany";
import { safeRead, safeSheetToJson } from "@/lib/safe-xlsx";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Employee { id: string; first_name: string; last_name: string; }
interface Period { id: string; start_date: string; end_date: string; status: string; }
interface Concept { id: string; name: string; category: string; calc_mode: string; default_rate: number | null; rate_source: string; }
interface Movement {
  id: string; employee_id: string; period_id: string; concept_id: string;
  quantity: number | null; rate: number | null; total_value: number; note: string | null;
  employees: { first_name: string; last_name: string; } | null;
  concepts: { name: string; category: string; } | null;
}

interface ImportResult {
  row: number;
  employeeName: string;
  conceptName: string;
  status: "ok" | "error";
  reason?: string;
  totalValue?: number;
}

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export default function Movements() {
  const { selectedCompanyId } = useCompany();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [filterPeriod, setFilterPeriod] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [employeePopoverOpen, setEmployeePopoverOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: "", period_id: "", concept_id: "",
    quantity: "", rate: "", total_value: "", note: "",
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Bulk import state
  const [importOpen, setImportOpen] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [pendingInserts, setPendingInserts] = useState<any[]>([]);
  const [pendingResults, setPendingResults] = useState<ImportResult[]>([]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    Promise.all([
      supabase.from("employees").select("id, first_name, last_name").eq("is_active", true).eq("company_id", selectedCompanyId).order("first_name"),
      supabase.from("pay_periods").select("*").eq("company_id", selectedCompanyId).order("start_date", { ascending: false }),
      supabase.from("concepts").select("*").eq("is_active", true).eq("company_id", selectedCompanyId).order("name"),
    ]).then(([e, p, c]) => {
      setEmployees((e.data as Employee[]) ?? []);
      setPeriods((p.data as Period[]) ?? []);
      setConcepts((c.data as Concept[]) ?? []);
      if (p.data?.length) setFilterPeriod(p.data[0].id);
    });
  }, [selectedCompanyId]);

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
      company_id: selectedCompanyId,
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

  // --- Bulk Import Logic ---

  const matchEmployee = useCallback((name: string): Employee | undefined => {
    const n = normalize(name);
    return employees.find(e => normalize(`${e.first_name} ${e.last_name}`) === n)
      || employees.find(e => normalize(`${e.last_name} ${e.first_name}`) === n)
      || employees.find(e => normalize(e.first_name) === n || normalize(e.last_name) === n);
  }, [employees]);

  const matchConcept = useCallback((name: string): Concept | undefined => {
    const n = normalize(name);
    return concepts.find(c => normalize(c.name) === n)
      || concepts.find(c => normalize(c.name).includes(n) || n.includes(normalize(c.name)));
  }, [concepts]);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !filterPeriod) return;
    e.target.value = "";

    setImporting(true);
    setImportResults(null);

    try {
      const buf = await file.arrayBuffer();
      const wb = safeRead(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = safeSheetToJson<Record<string, any>>(sheet);

      if (!rows.length) {
        toast({ title: "Archivo vacío", description: "No se encontraron filas para procesar.", variant: "destructive" });
        setImporting(false);
        return;
      }

      // Try to detect column names
      const keys = Object.keys(rows[0]);
      const findCol = (candidates: string[]) =>
        keys.find(k => candidates.some(c => normalize(k).includes(normalize(c))));

      const empCol = findCol(["empleado", "employee", "nombre", "name"]);
      const conceptCol = findCol(["concepto", "concept"]);
      const qtyCol = findCol(["cantidad", "quantity", "qty", "cant"]);
      const rateCol = findCol(["tarifa", "rate", "precio"]);
      const totalCol = findCol(["total", "valor", "value", "monto", "amount"]);
      const noteCol = findCol(["nota", "note", "observacion", "comentario"]);

      if (!empCol) {
        toast({ title: "Columna no encontrada", description: "No se encontró columna de 'Empleado'. Verifica que tu archivo tenga una columna con ese nombre.", variant: "destructive" });
        setImporting(false);
        return;
      }
      if (!conceptCol) {
        toast({ title: "Columna no encontrada", description: "No se encontró columna de 'Concepto'. Verifica que tu archivo tenga una columna con ese nombre.", variant: "destructive" });
        setImporting(false);
        return;
      }

      const results: ImportResult[] = [];
      const inserts: any[] = [];

      rows.forEach((row, idx) => {
        const empName = String(row[empCol!] ?? "").trim();
        const conceptName = String(row[conceptCol!] ?? "").trim();
        const rowNum = idx + 2; // +2 for header + 0-index

        if (!empName && !conceptName) return; // skip blank rows

        if (!empName) {
          results.push({ row: rowNum, employeeName: "(vacío)", conceptName, status: "error", reason: "Nombre de empleado vacío" });
          return;
        }
        if (!conceptName) {
          results.push({ row: rowNum, employeeName: empName, conceptName: "(vacío)", status: "error", reason: "Nombre de concepto vacío" });
          return;
        }

        const emp = matchEmployee(empName);
        if (!emp) {
          results.push({ row: rowNum, employeeName: empName, conceptName, status: "error", reason: `Empleado "${empName}" no encontrado en la empresa` });
          return;
        }

        const concept = matchConcept(conceptName);
        if (!concept) {
          results.push({ row: rowNum, employeeName: empName, conceptName, status: "error", reason: `Concepto "${conceptName}" no existe o está inactivo` });
          return;
        }

        const rawQty = qtyCol ? parseFloat(String(row[qtyCol] ?? "")) : null;
        const rawRate = rateCol ? parseFloat(String(row[rateCol] ?? "")) : null;
        const rawTotal = totalCol ? parseFloat(String(row[totalCol] ?? "")) : null;

        let totalValue: number;
        let quantity: number | null = null;
        let rate: number | null = null;

        if (concept.calc_mode === "quantity_x_rate") {
          quantity = rawQty ?? null;
          rate = rawRate ?? concept.default_rate ?? null;
          if (quantity != null && rate != null) {
            totalValue = quantity * rate;
          } else if (rawTotal != null && !isNaN(rawTotal)) {
            totalValue = rawTotal;
          } else {
            results.push({ row: rowNum, employeeName: empName, conceptName, status: "error", reason: "Concepto tipo 'cantidad × tarifa' requiere cantidad y tarifa o un total" });
            return;
          }
        } else {
          if (rawTotal != null && !isNaN(rawTotal)) {
            totalValue = rawTotal;
          } else if (rawQty != null && rawRate != null && !isNaN(rawQty) && !isNaN(rawRate)) {
            totalValue = rawQty * rawRate;
            quantity = rawQty;
            rate = rawRate;
          } else {
            results.push({ row: rowNum, employeeName: empName, conceptName, status: "error", reason: "No se pudo determinar el valor total" });
            return;
          }
        }

        if (totalValue === 0) {
          results.push({ row: rowNum, employeeName: empName, conceptName, status: "error", reason: "El valor total es $0" });
          return;
        }

        const note = noteCol ? String(row[noteCol] ?? "").trim() || null : null;

        inserts.push({
          employee_id: emp.id,
          period_id: filterPeriod,
          concept_id: concept.id,
          quantity,
          rate,
          total_value: Math.round(totalValue * 100) / 100,
          note,
          company_id: selectedCompanyId,
        });

        results.push({
          row: rowNum, employeeName: `${emp.first_name} ${emp.last_name}`, conceptName: concept.name,
          status: "ok", totalValue: Math.round(totalValue * 100) / 100,
        });
      });

      setPendingInserts(inserts);
      setPendingResults(results);
      setImportResults(results);

      if (inserts.length > 0) {
        setConfirmImport(true);
      } else {
        toast({ title: "Sin registros válidos", description: "Ninguna fila pudo ser procesada. Revisa el reporte.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error al leer archivo", description: err.message || "Formato no válido", variant: "destructive" });
    }
    setImporting(false);
  };

  const executeImport = async () => {
    setImporting(true);
    const { error } = await supabase.from("movements").insert(pendingInserts);
    if (error) {
      toast({ title: "Error al importar", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Importación completada", description: `${pendingInserts.length} novedades registradas` });
      fetchMovements(filterPeriod);
    }
    setConfirmImport(false);
    setPendingInserts([]);
    setImporting(false);
  };

  const exportResultsCSV = () => {
    if (!importResults) return;
    const header = "Fila,Empleado,Concepto,Estado,Razón,Valor\n";
    const csv = importResults.map(r =>
      `${r.row},"${r.employeeName}","${r.conceptName}",${r.status === "ok" ? "OK" : "ERROR"},"${r.reason ?? ""}",${r.totalValue ?? ""}`
    ).join("\n");
    const blob = new Blob([header + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reporte-importacion-novedades.csv";
    a.click();
  };

  const okCount = importResults?.filter(r => r.status === "ok").length ?? 0;
  const errCount = importResults?.filter(r => r.status === "error").length ?? 0;

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Novedades</h1>
          <p className="page-subtitle">Extras y deducciones por periodo</p>
        </div>
        <div className="flex gap-2">
          {/* Bulk Import */}
          <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setImportResults(null); }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="h-4 w-4 mr-2" />Importar</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Importar novedades desde archivo</DialogTitle>
                <DialogDescription>
                  Sube un archivo Excel o CSV con columnas: <strong>Empleado</strong>, <strong>Concepto</strong>, y opcionalmente <strong>Cantidad</strong>, <strong>Tarifa</strong>, <strong>Total</strong>, <strong>Nota</strong>.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label>Periodo destino</Label>
                    <div className="text-sm font-medium mt-1">
                      {periods.find(p => p.id === filterPeriod)
                        ? `${periods.find(p => p.id === filterPeriod)!.start_date} → ${periods.find(p => p.id === filterPeriod)!.end_date}`
                        : "Sin periodo seleccionado"}
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="import-file">Archivo Excel o CSV</Label>
                  <Input id="import-file" type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} disabled={importing || !filterPeriod} className="mt-1" />
                </div>

                {importing && <div className="text-center py-4 text-muted-foreground">Procesando archivo...</div>}

                {/* Results Report */}
                {importResults && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-earning" />
                        {okCount} procesados
                      </Badge>
                      {errCount > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                          {errCount} omitidos
                        </Badge>
                      )}
                      <Button variant="ghost" size="sm" onClick={exportResultsCSV} className="ml-auto">
                        <Download className="h-4 w-4 mr-1" />Exportar reporte
                      </Button>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">Fila</TableHead>
                            <TableHead>Empleado</TableHead>
                            <TableHead>Concepto</TableHead>
                            <TableHead className="w-16">Estado</TableHead>
                            <TableHead>Detalle</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importResults.map((r, i) => (
                            <TableRow key={i} className={r.status === "error" ? "bg-destructive/5" : ""}>
                              <TableCell className="font-mono text-xs">{r.row}</TableCell>
                              <TableCell className="text-sm">{r.employeeName}</TableCell>
                              <TableCell className="text-sm">{r.conceptName}</TableCell>
                              <TableCell>
                                {r.status === "ok"
                                  ? <CheckCircle2 className="h-4 w-4 text-earning" />
                                  : <AlertTriangle className="h-4 w-4 text-destructive" />}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {r.status === "ok" ? `$${r.totalValue?.toFixed(2)}` : r.reason}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Single create */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nueva novedad</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar novedad</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <Label>Empleado</Label>
                  <Popover open={employeePopoverOpen} onOpenChange={setEmployeePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={employeePopoverOpen} className="w-full justify-between font-normal">
                        {form.employee_id
                          ? (() => { const e = employees.find(e => e.id === form.employee_id); return e ? `${e.first_name} ${e.last_name}` : "Seleccionar"; })()
                          : "Buscar empleado..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar por nombre..." />
                        <CommandList>
                          <CommandEmpty>No se encontró empleado.</CommandEmpty>
                          <CommandGroup>
                            {employees.map(e => (
                              <CommandItem
                                key={e.id}
                                value={`${e.first_name} ${e.last_name}`}
                                onSelect={() => {
                                  setForm(f => ({ ...f, employee_id: e.id }));
                                  setEmployeePopoverOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", form.employee_id === e.id ? "opacity-100" : "opacity-0")} />
                                {e.first_name} {e.last_name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
      </div>

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="max-w-xs">
          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger><SelectValue placeholder="Filtrar por periodo" /></SelectTrigger>
            <SelectContent>{periods.map(p => <SelectItem key={p.id} value={p.id}>{p.start_date} → {p.end_date}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empleado o concepto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
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
            {(() => {
              const filtered = movements.filter(m => {
                if (!searchTerm.trim()) return true;
                const s = normalize(searchTerm);
                const empName = normalize(`${m.employees?.first_name ?? ""} ${m.employees?.last_name ?? ""}`);
                const conceptName = normalize(m.concepts?.name ?? "");
                return empName.includes(s) || conceptName.includes(s);
              });
              return filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No hay novedades</TableCell></TableRow>
            ) : (
              filtered.map(m => (
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
            );
            })()}
          </TableBody>
        </Table>
      </div>

      {/* Confirm bulk import */}
      <AlertDialog open={confirmImport} onOpenChange={setConfirmImport}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar importación</AlertDialogTitle>
            <AlertDialogDescription>
              Se registrarán <strong>{pendingInserts.length}</strong> novedades en el periodo seleccionado.
              {errCount > 0 && <> <strong className="text-destructive">{errCount} filas</strong> serán omitidas por errores.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeImport} disabled={importing}>
              {importing ? "Importando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
