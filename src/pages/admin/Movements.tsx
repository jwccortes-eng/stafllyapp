import { useEffect, useState, useCallback } from "react";
import AuditPanel from "@/components/audit/AuditPanel";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Trash2, Upload, CheckCircle2, AlertTriangle, XCircle, Download, ChevronsUpDown, Check, Lock, DollarSign, Pencil, ShieldCheck, ShieldX, Clock3, Eye } from "lucide-react";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { useCompany } from "@/hooks/useCompany";
import { safeRead, safeSheetToJson, getSheetNames, getSheet } from "@/lib/safe-xlsx";
import { cn } from "@/lib/utils";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";
import { EntityCard } from "@/components/entities/EntityCard";
import { buildWorkerEntityView } from "@/lib/entities/entity-presenters";
import { OperationalWorkspace, WorkspaceSearch } from "@/components/stafly-ui/OperationalWorkspace";
import { StaflyFilterBar, StaflyStatusBadge } from "@/components/stafly-ui";

interface Employee { id: string; first_name: string; last_name: string; }
interface Period { id: string; start_date: string; end_date: string; status: string; }
interface Concept { id: string; name: string; category: string; calc_mode: string; default_rate: number | null; rate_source: string; }
interface Movement {
  id: string; employee_id: string; period_id: string; concept_id: string;
  quantity: number | null; rate: number | null; total_value: number; note: string | null;
  approval_status: string; approval_note: string | null; approved_by: string | null;
  employees: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    employer_identification: string | null;
    is_active: boolean | null;
    user_id: string | null;
  } | null;
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
type MovementFilter = "all" | "extra" | "deduction" | "pending" | "approved";

const formatMoney = (value: number) => value.toLocaleString("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const formatPeriod = (period?: Period) => {
  if (!period) return "Selecciona un período";
  const start = new Date(`${period.start_date}T12:00:00`);
  const end = new Date(`${period.end_date}T12:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = new Intl.DateTimeFormat("es-US", sameMonth
    ? { day: "numeric" }
    : { month: "short", day: "numeric" }).format(start);
  const endLabel = new Intl.DateTimeFormat("es-US", { month: "short", day: "numeric", year: "numeric" }).format(end);
  return `${startLabel}–${endLabel}`;
};

export default function Movements() {
  const { selectedCompanyId } = useCompany();
  const { role, hasActionPermission } = useAuth();
  const { can } = usePermissions();
  const canApprove = can("payroll.approve") || hasActionPermission("aprobar_novedades");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [filterPeriod, setFilterPeriod] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [detailMovement, setDetailMovement] = useState<Movement | null>(null);
  const [open, setOpen] = useState(false);
  const [employeePopoverOpen, setEmployeePopoverOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: "", period_id: "", concept_id: "",
    quantity: "", rate: "", total_value: "", note: "",
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [pendingInserts, setPendingInserts] = useState<any[]>([]);
  const [pendingResults, setPendingResults] = useState<ImportResult[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editMovement, setEditMovement] = useState<Movement | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ quantity: "", rate: "", total_value: "", note: "" });
  const [editSaving, setEditSaving] = useState(false);
  // Deny dialog state
  const [denyTarget, setDenyTarget] = useState<string | null>(null);
  const [denyNote, setDenyNote] = useState("");
  const [denyOpen, setDenyOpen] = useState(false);

  const selectedPeriod = periods.find(p => p.id === filterPeriod);
  const isPeriodClosed = selectedPeriod?.status === "closed";

  useEffect(() => {
    if (!selectedCompanyId) return;
    Promise.all([
      supabase.from("employees").select("id, first_name, last_name").eq("is_active", true).eq("company_id", selectedCompanyId).order("first_name"),
      supabase.from("pay_periods").select("*").eq("company_id", selectedCompanyId).order("start_date", { ascending: false }),
      supabase.from("concepts").select("*").eq("is_active", true).eq("company_id", selectedCompanyId).order("name"),
    ]).then(([e, p, c]) => {
      const emps = (e.data as Employee[]) ?? [];
      const pers = (p.data as Period[]) ?? [];
      const cons = (c.data as Concept[]) ?? [];
      setEmployees(emps);
      setPeriods(pers);
      setConcepts(cons);
      if (pers.length) {
        const today = new Date().toISOString().slice(0, 10);
        const current = pers.find(pp => pp.start_date <= today && pp.end_date >= today);
        if (current) {
          setFilterPeriod(current.id);
        } else {
          const past = pers.find(pp => pp.end_date < today);
          setFilterPeriod(past?.id ?? pers[0].id);
        }
      }
    });
  }, [selectedCompanyId]);

  const fetchMovements = async (periodId: string) => {
    if (!periodId) return;
    const { data } = await supabase
      .from("movements")
      .select("*, employees(id, first_name, last_name, avatar_url, employer_identification, is_active, user_id), concepts(name, category)")
      .eq("period_id", periodId)
      .order("created_at", { ascending: false });
    setMovements((data as Movement[]) ?? []);
  };

  const handleApprove = async (id: string) => {
    const { error } = await supabase.from("movements").update({ approval_status: "approved", approved_by: (await supabase.auth.getUser()).data.user?.id } as any).eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Novedad aprobada ✓" }); fetchMovements(filterPeriod); }
  };

  const openDenyDialog = (id: string) => { setDenyTarget(id); setDenyNote(""); setDenyOpen(true); };
  const handleDeny = async () => {
    if (!denyTarget || !denyNote.trim()) { toast({ title: "Escribe un motivo", variant: "destructive" }); return; }
    const { error } = await supabase.from("movements").update({ approval_status: "denied", approval_note: denyNote.trim(), approved_by: (await supabase.auth.getUser()).data.user?.id } as any).eq("id", denyTarget);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Novedad denegada" }); setDenyOpen(false); setDenyTarget(null); fetchMovements(filterPeriod); }
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
    const targetPeriodId = form.period_id || filterPeriod;
    const targetPeriod = periods.find(p => p.id === targetPeriodId);
    if (targetPeriod?.status === "closed") {
      toast({ title: "Periodo cerrado", description: "No se pueden agregar novedades a un periodo cerrado.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("movements").insert({
      employee_id: form.employee_id,
      period_id: targetPeriodId,
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

  const requestDelete = (id: string) => { setPendingDeleteId(id); setPasswordConfirmOpen(true); };
  const executeDelete = async () => {
    if (!pendingDeleteId) return;
    await supabase.from("movements").delete().eq("id", pendingDeleteId);
    setPendingDeleteId(null);
    fetchMovements(filterPeriod);
    toast({ title: "Novedad eliminada" });
  };

  const openEditMovement = (m: Movement) => {
    setEditMovement(m);
    setEditForm({
      quantity: m.quantity?.toString() ?? "",
      rate: m.rate?.toString() ?? "",
      total_value: m.total_value.toString(),
      note: m.note ?? "",
    });
    setEditOpen(true);
  };

  const handleEditMovement = async () => {
    if (!editMovement) return;
    setEditSaving(true);
    const { error } = await supabase.from("movements").update({
      quantity: editForm.quantity ? parseFloat(editForm.quantity) : null,
      rate: editForm.rate ? parseFloat(editForm.rate) : null,
      total_value: parseFloat(editForm.total_value) || 0,
      note: editForm.note.trim() || null,
    }).eq("id", editMovement.id);
    if (error) toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    else { toast({ title: "Novedad actualizada" }); setEditOpen(false); setEditMovement(null); fetchMovements(filterPeriod); }
    setEditSaving(false);
  };

  // --- Bulk Import Logic (unchanged) ---
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
      const wb = await safeRead(buf);
      const names = getSheetNames(wb);
      const sheet = getSheet(wb, names[0]);
      if (!sheet) { setImporting(false); return; }
      const rows = safeSheetToJson<Record<string, any>>(sheet);
      if (!rows.length) { toast({ title: "Archivo vacío", variant: "destructive" }); setImporting(false); return; }
      const keys = Object.keys(rows[0]);
      const findCol = (candidates: string[]) => keys.find(k => candidates.some(c => normalize(k).includes(normalize(c))));
      const empCol = findCol(["empleado", "employee", "nombre", "name"]);
      const conceptCol = findCol(["concepto", "concept"]);
      const qtyCol = findCol(["cantidad", "quantity", "qty", "cant"]);
      const rateCol = findCol(["tarifa", "rate", "precio"]);
      const totalCol = findCol(["total", "valor", "value", "monto", "amount"]);
      const noteCol = findCol(["nota", "note", "observacion", "comentario"]);
      if (!empCol) { toast({ title: "Columna 'Empleado' no encontrada", variant: "destructive" }); setImporting(false); return; }
      if (!conceptCol) { toast({ title: "Columna 'Concepto' no encontrada", variant: "destructive" }); setImporting(false); return; }
      const results: ImportResult[] = [];
      const inserts: any[] = [];
      rows.forEach((row, idx) => {
        const empName = String(row[empCol!] ?? "").trim();
        const conceptName = String(row[conceptCol!] ?? "").trim();
        const rowNum = idx + 2;
        if (!empName && !conceptName) return;
        if (!empName) { results.push({ row: rowNum, employeeName: "(vacío)", conceptName, status: "error", reason: "Nombre vacío" }); return; }
        if (!conceptName) { results.push({ row: rowNum, employeeName: empName, conceptName: "(vacío)", status: "error", reason: "Concepto vacío" }); return; }
        const emp = matchEmployee(empName);
        if (!emp) { results.push({ row: rowNum, employeeName: empName, conceptName, status: "error", reason: `"${empName}" no encontrado` }); return; }
        const concept = matchConcept(conceptName);
        if (!concept) { results.push({ row: rowNum, employeeName: empName, conceptName, status: "error", reason: `"${conceptName}" no existe` }); return; }
        const rawQty = qtyCol ? parseFloat(String(row[qtyCol] ?? "")) : null;
        const rawRate = rateCol ? parseFloat(String(row[rateCol] ?? "")) : null;
        const rawTotal = totalCol ? parseFloat(String(row[totalCol] ?? "")) : null;
        let totalValue: number; let quantity: number | null = null; let rate: number | null = null;
        if (concept.calc_mode === "quantity_x_rate") {
          quantity = rawQty ?? null; rate = rawRate ?? concept.default_rate ?? null;
          if (quantity != null && rate != null) totalValue = quantity * rate;
          else if (rawTotal != null && !isNaN(rawTotal)) totalValue = rawTotal;
          else { results.push({ row: rowNum, employeeName: empName, conceptName, status: "error", reason: "Faltan cantidad/tarifa/total" }); return; }
        } else {
          if (rawTotal != null && !isNaN(rawTotal)) totalValue = rawTotal;
          else if (rawQty != null && rawRate != null) { totalValue = rawQty * rawRate; quantity = rawQty; rate = rawRate; }
          else { results.push({ row: rowNum, employeeName: empName, conceptName, status: "error", reason: "Sin valor total" }); return; }
        }
        if (totalValue === 0) { results.push({ row: rowNum, employeeName: empName, conceptName, status: "error", reason: "Valor $0" }); return; }
        const note = noteCol ? String(row[noteCol] ?? "").trim() || null : null;
        inserts.push({ employee_id: emp.id, period_id: filterPeriod, concept_id: concept.id, quantity, rate, total_value: Math.round(totalValue * 100) / 100, note, company_id: selectedCompanyId });
        results.push({ row: rowNum, employeeName: `${emp.first_name} ${emp.last_name}`, conceptName: concept.name, status: "ok", totalValue: Math.round(totalValue * 100) / 100 });
      });
      setPendingInserts(inserts); setPendingResults(results); setImportResults(results);
      if (inserts.length > 0) setConfirmImport(true);
      else toast({ title: "Sin registros válidos", variant: "destructive" });
    } catch (err: any) { toast({ title: "Error al leer archivo", description: err.message, variant: "destructive" }); }
    setImporting(false);
  };

  const executeImport = async () => {
    setImporting(true);
    const { error } = await supabase.from("movements").insert(pendingInserts);
    if (error) toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    else { toast({ title: "Importación completada", description: `${pendingInserts.length} novedades registradas` }); fetchMovements(filterPeriod); }
    setConfirmImport(false); setPendingInserts([]); setImporting(false);
  };

  const exportResultsCSV = () => {
    if (!importResults) return;
    const header = "Fila,Empleado,Concepto,Estado,Razón,Valor\n";
    const csv = importResults.map(r => `${r.row},"${r.employeeName}","${r.conceptName}",${r.status === "ok" ? "OK" : "ERROR"},"${r.reason ?? ""}",${r.totalValue ?? ""}`).join("\n");
    const blob = new Blob([header + csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "reporte-importacion-novedades.csv"; a.click();
  };

  const okCount = importResults?.filter(r => r.status === "ok").length ?? 0;
  const errCount = importResults?.filter(r => r.status === "error").length ?? 0;

  // Presentational aggregation only: no persisted payroll total is created.
  const filtered = movements.filter(m => {
    const matchesType = movementFilter === "all"
      || (movementFilter === "extra" && m.concepts?.category === "extra")
      || (movementFilter === "deduction" && m.concepts?.category !== "extra")
      || (movementFilter === "pending" && m.approval_status === "pending")
      || (movementFilter === "approved" && m.approval_status === "approved");
    if (!matchesType) return false;
    if (!searchTerm.trim()) return true;
    const s = normalize(searchTerm);
    const empName = normalize(`${m.employees?.first_name ?? ""} ${m.employees?.last_name ?? ""}`);
    const conceptName = normalize(m.concepts?.name ?? "");
    return empName.includes(s) || conceptName.includes(s) || normalize(m.note ?? "").includes(s);
  });
  const approvedMovements = movements.filter(m => m.approval_status === "approved");
  const pendingCount = movements.filter(m => m.approval_status === "pending").length;
  const extrasTotal = approvedMovements.filter(m => m.concepts?.category === "extra").reduce((sum, m) => sum + Math.abs(m.total_value), 0);
  const deductionsTotal = approvedMovements.filter(m => m.concepts?.category !== "extra").reduce((sum, m) => sum + Math.abs(m.total_value), 0);
  const movementNet = extrasTotal - deductionsTotal;

  const movementFilters = [
    { value: "all", label: "Todos", count: movements.length },
    { value: "extra", label: "Extras", count: movements.filter(m => m.concepts?.category === "extra").length },
    { value: "deduction", label: "Deducciones", count: movements.filter(m => m.concepts?.category !== "extra").length },
    { value: "pending", label: "Pendientes", count: pendingCount },
    { value: "approved", label: "Aprobados", count: approvedMovements.length },
  ];

  const movementTypeBadge = (movement: Movement) => (
    <StaflyStatusBadge tone={movement.concepts?.category === "extra" ? "success" : "critical"}>
      {movement.concepts?.category === "extra" ? "Extra" : "Deducción"}
    </StaflyStatusBadge>
  );

  const movementStatusBadge = (movement: Movement) => {
    if (movement.approval_status === "approved") return <StaflyStatusBadge tone="success" icon={ShieldCheck}>Aprobado</StaflyStatusBadge>;
    if (movement.approval_status === "pending") return <StaflyStatusBadge tone="warning" icon={Clock3}>Pendiente</StaflyStatusBadge>;
    return <StaflyStatusBadge tone="critical" icon={ShieldX} title={movement.approval_note || "Sin motivo"}>Denegado</StaflyStatusBadge>;
  };

  const movementActions = (movement: Movement, compact = false) => (
    <div className="flex items-center gap-1">
      {canApprove && movement.approval_status === "pending" && (
        <>
          <Button variant="ghost" size="icon" className="text-success hover:text-success" onClick={() => handleApprove(movement.id)} title="Aprobar" aria-label="Aprobar ajuste">
            <ShieldCheck className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => openDenyDialog(movement.id)} title="Denegar" aria-label="Denegar ajuste">
            <ShieldX className="h-4 w-4" />
          </Button>
        </>
      )}
      {compact && (
        <Button variant="ghost" size="icon" onClick={() => setDetailMovement(movement)} title="Ver detalle" aria-label="Ver detalle del ajuste">
          <Eye className="h-4 w-4" />
        </Button>
      )}
      <Button variant="ghost" size="icon" onClick={() => openEditMovement(movement)} disabled={isPeriodClosed} title="Editar" aria-label="Editar ajuste">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => requestDelete(movement.id)} className="text-destructive hover:text-destructive" disabled={isPeriodClosed} title="Eliminar" aria-label="Eliminar ajuste">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  const identityFor = (movement: Movement, mobile = false) => {
    const employee = movement.employees;
    const view = buildWorkerEntityView({
      id: employee?.id ?? movement.employee_id,
      first_name: employee?.first_name,
      last_name: employee?.last_name,
      avatar_url: employee?.avatar_url,
      employer_identification: employee?.employer_identification,
      is_active: employee?.is_active,
      user_id: employee?.user_id,
    });
    return (
      <EntityCard
        kind="worker"
        name={view.name}
        avatarUrl={employee?.avatar_url}
        reference={view.reference}
        status={view.status}
        statusLabel={view.statusLabel}
        density="compact"
        bare
        primaryDetail={mobile ? view.primaryDetail : undefined}
        className="p-0 sm:p-0"
      />
    );
  };

  const headerActions = (
    <>
      <Dialog open={importOpen} onOpenChange={(value) => { setImportOpen(value); if (!value) setImportResults(null); }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={isPeriodClosed}><Upload className="h-4 w-4 mr-1.5" />Importar</Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar ajustes desde archivo</DialogTitle>
            <DialogDescription>Columnas: <strong>Empleado</strong>, <strong>Concepto</strong>, y opcionalmente Cantidad, Tarifa, Total, Nota.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Período destino">
              <div className="mt-1 text-sm font-medium">{formatPeriod(selectedPeriod)}</div>
            </FormField>
            <FormField label="Archivo Excel o CSV" htmlFor="import-file">
              <Input id="import-file" type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} disabled={importing || !filterPeriod} className="mt-1" />
            </FormField>
            {importing && <div className="py-4 text-center text-muted-foreground">Procesando...</div>}
            {importResults && (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <StaflyStatusBadge tone="success" icon={CheckCircle2}>{okCount} procesados</StaflyStatusBadge>
                  {errCount > 0 && <StaflyStatusBadge tone="critical" icon={XCircle}>{errCount} omitidos</StaflyStatusBadge>}
                  <Button variant="ghost" size="sm" onClick={exportResultsCSV} className="ml-auto"><Download className="h-4 w-4 mr-1" />Exportar</Button>
                </div>
                <div className="max-h-[300px] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader><TableRow><TableHead className="w-14">Fila</TableHead><TableHead>Empleado</TableHead><TableHead>Concepto</TableHead><TableHead className="w-16">Estado</TableHead><TableHead>Detalle</TableHead></TableRow></TableHeader>
                    <TableBody>{importResults.map((result, index) => (
                      <TableRow key={index} className={result.status === "error" ? "bg-destructive/5" : ""}>
                        <TableCell className="font-mono text-xs">{result.row}</TableCell>
                        <TableCell className="text-sm">{result.employeeName}</TableCell>
                        <TableCell className="text-sm">{result.conceptName}</TableCell>
                        <TableCell>{result.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{result.status === "ok" ? formatMoney(result.totalValue ?? 0) : result.reason}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" disabled={isPeriodClosed}><Plus className="h-4 w-4 mr-1.5" />Nuevo ajuste</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar ajuste</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <FormField label="Empleado">
              <Popover open={employeePopoverOpen} onOpenChange={setEmployeePopoverOpen}>
                <PopoverTrigger asChild><Button variant="outline" role="combobox" className="w-full justify-between font-normal">{form.employee_id ? (() => { const employee = employees.find(item => item.id === form.employee_id); return employee ? `${employee.first_name} ${employee.last_name}` : "Seleccionar"; })() : "Buscar empleado..."}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start"><Command><CommandInput placeholder="Buscar por nombre..." /><CommandList><CommandEmpty>No encontrado.</CommandEmpty><CommandGroup>{employees.map(employee => <CommandItem key={employee.id} value={`${employee.first_name} ${employee.last_name}`} onSelect={() => { setForm(current => ({ ...current, employee_id: employee.id })); setEmployeePopoverOpen(false); }}><Check className={cn("mr-2 h-4 w-4", form.employee_id === employee.id ? "opacity-100" : "opacity-0")} />{employee.first_name} {employee.last_name}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
              </Popover>
            </FormField>
            <FormField label="Período"><Select value={form.period_id || filterPeriod} onValueChange={value => setForm(current => ({ ...current, period_id: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{periods.map(period => <SelectItem key={period.id} value={period.id}>{formatPeriod(period)}</SelectItem>)}</SelectContent></Select></FormField>
            <FormField label="Concepto"><Select value={form.concept_id} onValueChange={value => setForm(current => ({ ...current, concept_id: value }))}><SelectTrigger><SelectValue placeholder="Seleccionar concepto" /></SelectTrigger><SelectContent>{concepts.map(concept => <SelectItem key={concept.id} value={concept.id}>{concept.name} ({concept.category})</SelectItem>)}</SelectContent></Select></FormField>
            {selectedConcept && selectedConcept.calc_mode !== "manual_value" && <div className="grid grid-cols-2 gap-3"><FormField label="Cantidad"><Input type="number" step="0.01" value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} /></FormField><FormField label="Valor unitario"><Input type="number" step="0.01" value={form.rate} onChange={event => setForm(current => ({ ...current, rate: event.target.value }))} /></FormField></div>}
            <FormField label="Total"><Input type="number" step="0.01" value={form.total_value} onChange={event => setForm(current => ({ ...current, total_value: event.target.value }))} required /></FormField>
            <FormField label="Origen o nota"><Textarea value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} rows={2} /></FormField>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : "Registrar"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );

  return (
    <OperationalWorkspace
      title="Ajustes"
      context={selectedPeriod ? formatPeriod(selectedPeriod) : "Selecciona un período"}
      search={<WorkspaceSearch value={searchTerm} onChange={setSearchTerm} placeholder="Buscar persona, concepto u origen..." />}
      action={headerActions}
      filters={(
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="h-9 w-full md:w-[230px]"><SelectValue placeholder="Seleccionar período" /></SelectTrigger>
            <SelectContent>{periods.map(period => <SelectItem key={period.id} value={period.id}>{formatPeriod(period)}{period.status === "closed" ? " · Cerrado" : ""}</SelectItem>)}</SelectContent>
          </Select>
          <StaflyFilterBar options={movementFilters} value={movementFilter} onChange={value => setMovementFilter(value as MovementFilter)} wrap={false} aria-label="Filtrar ajustes" />
        </div>
      )}
      filtersActiveCount={movementFilter === "all" ? 0 : 1}
      mobileFiltersTitle="Período y filtros"
      metrics={movements.length > 0 ? [
        { label: "movimientos", value: movements.length, tone: "neutral" },
        { label: "extras", value: `+${formatMoney(extrasTotal)}`, tone: "success" },
        { label: "deducciones", value: `−${formatMoney(deductionsTotal)}`, tone: "critical" },
        { label: "neto ajustes", value: formatMoney(movementNet), tone: movementNet < 0 ? "critical" : "primary" },
      ] : []}
    >
      <div className="space-y-3">
        {isPeriodClosed && <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3"><Lock className="h-4 w-4 shrink-0 text-warning" /><p className="text-sm"><strong>Período cerrado.</strong> Los ajustes están disponibles solo para consulta.</p></div>}
        {pendingCount > 0 && <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3"><Clock3 className="h-4 w-4 shrink-0 text-warning" /><p className="text-sm"><strong>{pendingCount} ajuste(s) pendiente(s)</strong> de aprobación.</p></div>}

        {filtered.length > 0 && <ReportActionsBar title="Ajustes" subtitle={formatPeriod(selectedPeriod)} onExportCSV={() => {
          const headers = ["Empleado", "Concepto", "Categoría", "Cantidad", "Tarifa", "Total", "Estado", "Nota"];
          const rows = filtered.map(movement => [movement.employees ? `${movement.employees.first_name} ${movement.employees.last_name}` : "", movement.concepts?.name ?? "", movement.concepts?.category ?? "", String(movement.quantity ?? ""), String(movement.rate ?? ""), String(movement.total_value), movement.approval_status, movement.note ?? ""]);
          return [headers, ...rows];
        }} />}

        <div className="hidden md:block data-table-wrapper">
          <Table>
            <TableHeader><TableRow className="bg-muted/30"><TableHead>Persona</TableHead><TableHead>Concepto</TableHead><TableHead>Tipo</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Cant.</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Origen</TableHead><TableHead className="w-36">Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {movements.length === 0 && !filterPeriod ? <TableRow><TableCell colSpan={9} className="p-0"><PageSkeleton variant="table" className="border-0 p-4 shadow-none" /></TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="p-0"><EmptyState icon={DollarSign} title="No hay ajustes" description="No hay registros para este período y filtro" compact /></TableCell></TableRow> : filtered.map(movement => (
                <TableRow key={movement.id} className={cn("group transition-colors hover:bg-accent/40", movement.approval_status === "denied" && "opacity-60", movement.approval_status === "pending" && "bg-warning/5")}>
                  <TableCell className="min-w-[210px]">{identityFor(movement)}</TableCell>
                  <TableCell className="max-w-[220px] font-medium"><span className="line-clamp-2">{movement.concepts?.name}</span></TableCell>
                  <TableCell>{movementTypeBadge(movement)}</TableCell>
                  <TableCell>{movementStatusBadge(movement)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{movement.quantity ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{movement.rate != null ? formatMoney(movement.rate) : "—"}</TableCell>
                  <TableCell className={cn("text-right font-mono font-semibold tabular-nums", movement.approval_status === "denied" ? "text-muted-foreground line-through" : movement.concepts?.category === "extra" ? "text-success" : "text-destructive")}>{movement.concepts?.category === "extra" ? "+" : "−"}{formatMoney(Math.abs(movement.total_value))}</TableCell>
                  <TableCell><Button type="button" variant="link" size="sm" onClick={() => setDetailMovement(movement)} className="h-auto max-w-[180px] justify-start truncate p-0 text-left text-xs font-normal text-muted-foreground" title="Ver detalle">{movement.note || "Sin origen registrado"}</Button></TableCell>
                  <TableCell>{movementActions(movement)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-2 md:hidden">
          {filtered.length === 0 ? <EmptyState icon={DollarSign} title="No hay ajustes" description="No hay registros para este período y filtro" compact /> : filtered.map(movement => (
            <div key={movement.id} className={cn("rounded-lg border border-border/60 bg-card p-3", movement.approval_status === "pending" && "border-warning/30", movement.approval_status === "denied" && "opacity-70")}>
              <div className="flex items-start justify-between gap-3">{identityFor(movement, true)}<p className={cn("shrink-0 font-mono text-base font-bold tabular-nums", movement.concepts?.category === "extra" ? "text-success" : "text-destructive")}>{movement.concepts?.category === "extra" ? "+" : "−"}{formatMoney(Math.abs(movement.total_value))}</p></div>
              <div className="mt-3 border-t border-border/50 pt-3"><p className="font-medium">{movement.concepts?.name}</p><div className="mt-2 flex flex-wrap gap-1.5">{movementTypeBadge(movement)}{movementStatusBadge(movement)}</div></div>
              <div className="mt-3 flex items-end justify-between gap-3"><div className="min-w-0 text-xs text-muted-foreground"><p className="font-mono tabular-nums">{movement.quantity != null && movement.rate != null ? `${movement.quantity} × ${formatMoney(movement.rate)}` : "Valor directo"}</p><p className="mt-1 truncate">{movement.note || "Sin origen registrado"}</p></div>{movementActions(movement, true)}</div>
            </div>
          ))}
        </div>
      </div>

      <AlertDialog open={confirmImport} onOpenChange={setConfirmImport}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar importación</AlertDialogTitle>
            <AlertDialogDescription>
              Se registrarán <strong>{pendingInserts.length}</strong> novedades.
              {errCount > 0 && <> <strong className="text-destructive">{errCount} filas</strong> omitidas.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeImport} disabled={importing}>{importing ? "Importando..." : "Confirmar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PasswordConfirmDialog open={passwordConfirmOpen} onOpenChange={setPasswordConfirmOpen} title="Eliminar novedad" description="Confirma tu contraseña para eliminar." onConfirm={executeDelete} />

      {/* Edit Movement Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditMovement(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar novedad</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {editMovement?.employees?.first_name} {editMovement?.employees?.last_name} — {editMovement?.concepts?.name}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Cantidad"><Input type="number" step="0.01" value={editForm.quantity} onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))} /></FormField>
              <FormField label="Tarifa"><Input type="number" step="0.01" value={editForm.rate} onChange={e => setEditForm(f => ({ ...f, rate: e.target.value }))} /></FormField>
            </div>
            <FormField label="Total"><Input type="number" step="0.01" value={editForm.total_value} onChange={e => setEditForm(f => ({ ...f, total_value: e.target.value }))} required /></FormField>
            <FormField label="Nota"><Textarea value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} rows={2} /></FormField>
            <Button onClick={handleEditMovement} disabled={editSaving} className="w-full">
              {editSaving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deny Movement Dialog */}
      <Dialog open={denyOpen} onOpenChange={(o) => { setDenyOpen(o); if (!o) setDenyTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Denegar novedad</DialogTitle>
            <DialogDescription>Escribe el motivo por el cual se deniega esta novedad. El monto no será incluido en el cálculo de pago.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Motivo (obligatorio)">
              <Textarea value={denyNote} onChange={e => setDenyNote(e.target.value)} rows={3} placeholder="Ej: Movimiento duplicado, error de importación..." />
            </FormField>
            <Button onClick={handleDeny} disabled={!denyNote.trim()} variant="destructive" className="w-full">
              <ShieldX className="h-4 w-4 mr-1.5" /> Confirmar denegación
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailMovement} onOpenChange={(value) => { if (!value) setDetailMovement(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle del ajuste</DialogTitle>
            <DialogDescription>{detailMovement ? `${detailMovement.employees?.first_name ?? ""} ${detailMovement.employees?.last_name ?? ""}`.trim() : ""}</DialogDescription>
          </DialogHeader>
          {detailMovement && (
            <div className="space-y-4">
              {identityFor(detailMovement, true)}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Concepto</p><p className="font-semibold">{detailMovement.concepts?.name}</p></div>
                <div><p className="text-xs text-muted-foreground">Tipo</p><div className="mt-1">{movementTypeBadge(detailMovement)}</div></div>
                <div><p className="text-xs text-muted-foreground">Estado</p><div className="mt-1">{movementStatusBadge(detailMovement)}</div></div>
                <div><p className="text-xs text-muted-foreground">Cálculo</p><p className="mt-1 font-mono tabular-nums">{detailMovement.quantity != null && detailMovement.rate != null ? `${detailMovement.quantity} × ${formatMoney(detailMovement.rate)}` : "Valor directo"}</p></div>
                <div><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 font-mono font-bold tabular-nums">{formatMoney(detailMovement.total_value)}</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Origen o nota</p><p className="mt-1">{detailMovement.note || "Sin origen registrado"}</p></div>
                {detailMovement.approval_note && <div className="col-span-2"><p className="text-xs text-muted-foreground">Motivo de denegación</p><p className="mt-1">{detailMovement.approval_note}</p></div>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Audit trail */}
      <div className="mt-8">
        <AuditPanel entityType="movement" title="Actividad de novedades" hideViews compact />
      </div>
    </OperationalWorkspace>
  );
}
