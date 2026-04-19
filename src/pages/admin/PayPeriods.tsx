import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Lock, Unlock, CalendarPlus, Send, EyeOff, ChevronDown, ChevronRight, FileSpreadsheet, RefreshCw, Clock, CheckCircle2, AlertCircle, Upload, ShieldAlert } from "lucide-react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { ErrorBlock } from "@/components/ui/error-block";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { format, addDays, nextWednesday, isWednesday, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useCompany } from "@/hooks/useCompany";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import PayrollSequenceSettings from "@/components/payroll/PayrollSequenceSettings";
import PeriodReconciliationCell from "@/components/payroll/PeriodReconciliationCell";
import { usePayrollSequenceConfig, formatSequence } from "@/hooks/usePayrollSequenceConfig";
import { Settings } from "lucide-react";

interface PayPeriod {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  closed_at: string | null;
  published_at: string | null;
  paid_at?: string | null;
  sequence_number?: number | null;
  source_type?: string | null;
  reconciliation_status?: string | null;
  last_reconciled_at?: string | null;
}

interface ImportInfo {
  id: string;
  file_name: string;
  status: string;
  row_count: number | null;
  created_at: string;
  imported_by: string | null;
  error_message: string | null;
}

export default function PayPeriods() {
  const { selectedCompanyId } = useCompany();
  const { role, hasActionPermission } = useAuth();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [open, setOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const [yearValue, setYearValue] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingYear, setGeneratingYear] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<PayPeriod | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());
  const [bulkOpenDialog, setBulkOpenDialog] = useState(false);
  const [bulkMode, setBulkMode] = useState<"all" | "range">("all");
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [bulkOpening, setBulkOpening] = useState(false);
  const [importsMap, setImportsMap] = useState<Record<string, ImportInfo[]>>({});
  const [loadingImports, setLoadingImports] = useState<Set<string>>(new Set());
  const [periodMeta, setPeriodMeta] = useState<Record<string, { hasImports: boolean; hasBasePay: boolean }>>({});
  const [showSequenceConfig, setShowSequenceConfig] = useState(false);
  const { config: seqConfig } = usePayrollSequenceConfig();
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchPeriods = async () => {
    if (!selectedCompanyId) return;
    setFetchError(false);
    try {
      const { data, error } = await supabase.from("pay_periods").select("*").eq("company_id", selectedCompanyId).order("start_date", { ascending: false });
      if (error) throw error;
      setPeriods((data as PayPeriod[]) ?? []);
    } catch (err) {
      console.error("fetchPeriods error:", err);
      setFetchError(true);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => { fetchPeriods(); }, [selectedCompanyId]);

  // Fetch management metadata (imports + base_pay) for all periods
  useEffect(() => {
    if (!selectedCompanyId || periods.length === 0) return;
    async function fetchMeta() {
      const periodIds = periods.map(p => p.id);
      const [importsRes, basePayRes] = await Promise.all([
        supabase.from("imports").select("period_id").eq("company_id", selectedCompanyId!).in("period_id", periodIds),
        supabase.from("period_base_pay").select("period_id").eq("company_id", selectedCompanyId!).in("period_id", periodIds),
      ]);
      const importSet = new Set((importsRes.data ?? []).map(r => r.period_id));
      const basePaySet = new Set((basePayRes.data ?? []).map(r => r.period_id));
      const meta: Record<string, { hasImports: boolean; hasBasePay: boolean }> = {};
      for (const pid of periodIds) {
        meta[pid] = { hasImports: importSet.has(pid), hasBasePay: basePaySet.has(pid) };
      }
      setPeriodMeta(meta);
    }
    fetchMeta();
  }, [selectedCompanyId, periods]);

  // Determine which period can be opened next (sequential rule)
  const canOpenPeriodId = useMemo(() => {
    if (periods.length === 0) return null;
    // Periods are sorted desc by start_date; reverse for chronological order
    const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
    // If first period is closed and no period is open, it can be opened
    // General rule: the first closed period whose predecessor is also closed (or doesn't exist)
    const openPeriod = sorted.find(p => p.status === "open");
    if (openPeriod) return null; // Already one open — no other can be opened
    for (const p of sorted) {
      if (p.status === "closed") {
        const idx = sorted.indexOf(p);
        const prev = idx > 0 ? sorted[idx - 1] : null;
        if (!prev || prev.status === "closed") return p.id;
      }
    }
    return null;
  }, [periods]);

  const canReopen = hasActionPermission("reabrir_periodo");

  const fetchImportsForPeriod = async (periodId: string) => {
    if (importsMap[periodId]) return; // Already loaded
    setLoadingImports(prev => new Set(prev).add(periodId));
    const { data } = await supabase
      .from("imports")
      .select("id, file_name, status, row_count, created_at, imported_by, error_message")
      .eq("period_id", periodId)
      .eq("company_id", selectedCompanyId!)
      .order("created_at", { ascending: false });
    setImportsMap(prev => ({ ...prev, [periodId]: (data as ImportInfo[]) ?? [] }));
    setLoadingImports(prev => { const next = new Set(prev); next.delete(periodId); return next; });
  };

  const toggleExpand = (periodId: string) => {
    setExpandedPeriods(prev => {
      const next = new Set(prev);
      if (next.has(periodId)) {
        next.delete(periodId);
      } else {
        next.add(periodId);
        fetchImportsForPeriod(periodId);
      }
      return next;
    });
  };

  const suggestNextWednesday = () => {
    const today = new Date();
    const wed = isWednesday(today) ? today : nextWednesday(today);
    setStartDate(format(wed, "yyyy-MM-dd"));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const start = new Date(startDate + "T00:00:00");
    const end = addDays(start, 6);
    const { error } = await supabase.from("pay_periods").insert({
      start_date: format(start, "yyyy-MM-dd"),
      end_date: format(end, "yyyy-MM-dd"),
      company_id: selectedCompanyId,
    });
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Periodo creado" });
      setOpen(false);
      setStartDate("");
      fetchPeriods();
    }
    setLoading(false);
  };

  const handleGenerateYear = async () => {
    if (!selectedCompanyId) return;
    setGeneratingYear(true);
    let d = new Date(yearValue, 0, 1);
    while (d.getDay() !== 3) { d = addDays(d, 1); }
    const rows: { start_date: string; end_date: string; company_id: string }[] = [];
    while (d.getFullYear() === yearValue) {
      const end = addDays(d, 6);
      rows.push({ start_date: format(d, "yyyy-MM-dd"), end_date: format(end, "yyyy-MM-dd"), company_id: selectedCompanyId });
      d = addDays(d, 7);
    }
    let created = 0;
    let skipped = 0;
    for (let i = 0; i < rows.length; i += 20) {
      const batch = rows.slice(i, i + 20);
      const { error, data } = await supabase.from("pay_periods").insert(batch).select();
      if (error) {
        for (const row of batch) {
          const { error: singleErr } = await supabase.from("pay_periods").insert(row);
          if (singleErr) skipped++; else created++;
        }
      } else { created += (data?.length ?? batch.length); }
    }
    toast({ title: `${created} periodos creados`, description: skipped > 0 ? `${skipped} ya existían y fueron omitidos` : `Año ${yearValue} completo` });
    setYearOpen(false);
    fetchPeriods();
    setGeneratingYear(false);
  };

  const handleBulkOpen = async () => {
    if (!selectedCompanyId) return;
    setBulkOpening(true);
    let target = periods.filter(p => p.status === "closed");
    if (bulkMode === "range" && bulkFrom && bulkTo) {
      target = target.filter(p => p.start_date >= bulkFrom && p.start_date <= bulkTo);
    }
    let opened = 0;
    for (const p of target) {
      const { error } = await supabase
        .from("pay_periods")
        .update({ status: "open", closed_at: null })
        .eq("id", p.id);
      if (!error) opened++;
    }
    toast({ title: `${opened} periodos abiertos` });
    setBulkOpening(false);
    setBulkOpenDialog(false);
    fetchPeriods();
  };

  const requestToggle = (period: PayPeriod) => {
    setPendingToggle(period);
    // Closing (locking) doesn't require password — only reopening (unlocking) does
    if (period.status === "open") {
      // Will call toggleStatus directly after setting pendingToggle
      closePeriodDirectly(period);
    } else {
      setPasswordOpen(true);
    }
  };

  const closePeriodDirectly = async (period: PayPeriod) => {
    // Block close if there are pending approval movements
    const { count } = await supabase
      .from("movements")
      .select("id", { count: "exact", head: true })
      .eq("period_id", period.id)
      .eq("approval_status", "pending");
    if (count && count > 0) {
      toast({ title: "No se puede cerrar", description: `Hay ${count} novedad(es) pendientes de aprobación. Aprueba o deniega todas antes de cerrar el periodo.`, variant: "destructive" });
      setPendingToggle(null);
      return;
    }
    const { error } = await supabase
      .from("pay_periods")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", period.id);
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Periodo cerrado" });
      fetchPeriods();
    }
    setPendingToggle(null);
  };

  const toggleStatus = async () => {
    if (!pendingToggle) return;
    // This is only called for reopening (unlocking) since closing is handled directly
    const { error } = await supabase
      .from("pay_periods")
      .update({ status: "open", closed_at: null })
      .eq("id", pendingToggle.id);
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Periodo reabierto" });
      fetchPeriods();
    }
    setPendingToggle(null);
  };

  const togglePublish = async (period: PayPeriod) => {
    const isPublished = !!period.published_at;
    const { error } = await supabase
      .from("pay_periods")
      .update({ published_at: isPublished ? null : new Date().toISOString() })
      .eq("id", period.id);
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: isPublished ? "Publicación retirada" : "Periodo publicado — visible para empleados" });
      fetchPeriods();
    }
  };

  const getImportStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-4 w-4 text-earning" />;
      case "error": return <AlertCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getImportStatusLabel = (status: string) => {
    switch (status) {
      case "completed": return "Completada";
      case "error": return "Error";
      case "pending": return "Pendiente";
      default: return status;
    }
  };

  const handleReimport = (periodId: string) => {
    navigate(`/app/import?period=${periodId}`);
  };

  if (initialLoading) return <PageSkeleton variant="table" />;
  if (fetchError) return <ErrorBlock title="Error al cargar periodos" onRetry={fetchPeriods} />;

  return (
    <div>
      <PageHeader
        variant="2"
        title="Periodos de pago"
        subtitle="Miércoles a Martes — ciclo semanal"
        badge="Semanal"
        rightSlot={<div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowSequenceConfig(s => !s)}>
            <Settings className="h-4 w-4 mr-2" />
            {seqConfig.use_payroll_sequence ? `Consecutivo: ${seqConfig.prefix || ""}${seqConfig.next_number}` : "Consecutivo"}
          </Button>
          <Dialog open={bulkOpenDialog} onOpenChange={setBulkOpenDialog}>
            <DialogTrigger asChild>
              <Button variant="outline"><Unlock className="h-4 w-4 mr-2" />Abrir periodos</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Abrir periodos en lote</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Selecciona el rango de periodos cerrados que deseas abrir.
                </p>
                {/* Quick range presets */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Accesos rápidos</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant={bulkMode === "all" ? "default" : "outline"} size="sm" onClick={() => { setBulkMode("all"); setBulkFrom(""); setBulkTo(""); }}>
                      Todos los cerrados
                    </Button>
                    {(() => {
                      const now = new Date();
                      const currentYear = now.getFullYear();
                      const currentMonth = now.getMonth(); // 0-indexed
                      const months = [];
                      // Show current month + 2 previous months
                      for (let i = 0; i < 3; i++) {
                        const d = new Date(currentYear, currentMonth - i, 1);
                        const y = d.getFullYear();
                        const m = d.getMonth();
                        const lastDay = new Date(y, m + 1, 0).getDate();
                        const label = format(d, "MMM yyyy", { locale: es });
                        const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
                        const to = `${y}-${String(m + 1).padStart(2, "0")}-${lastDay}`;
                        months.push({ label, from, to });
                      }
                      return months.map(({ label, from, to }) => (
                        <Button key={from} type="button" variant={bulkMode === "range" && bulkFrom === from && bulkTo === to ? "default" : "outline"} size="sm"
                          onClick={() => { setBulkMode("range"); setBulkFrom(from); setBulkTo(to); }}
                          className="capitalize">
                          {label}
                        </Button>
                      ));
                    })()}
                  </div>
                </div>
                {/* Quarter presets */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Trimestres</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Q1", from: "-01-01", to: "-03-31" },
                      { label: "Q2", from: "-04-01", to: "-06-30" },
                      { label: "Q3", from: "-07-01", to: "-09-30" },
                      { label: "Q4", from: "-10-01", to: "-12-31" },
                    ].map(q => {
                      const y = new Date().getFullYear();
                      const from = `${y}${q.from}`;
                      const to = `${y}${q.to}`;
                      return (
                        <Button key={q.label} type="button" variant={bulkMode === "range" && bulkFrom === from && bulkTo === to ? "default" : "outline"} size="sm"
                          onClick={() => { setBulkMode("range"); setBulkFrom(from); setBulkTo(to); }}>
                          {q.label} {y}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                {/* Custom range */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Rango personalizado</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Desde</Label>
                      <Input type="date" value={bulkFrom} onChange={e => { setBulkMode("range"); setBulkFrom(e.target.value); }} className="mt-1" />
                    </div>
                    <div>
                      <Label>Hasta</Label>
                      <Input type="date" value={bulkTo} onChange={e => { setBulkMode("range"); setBulkTo(e.target.value); }} className="mt-1" />
                    </div>
                  </div>
                </div>
                {/* Preview count */}
                {(() => {
                  let target = periods.filter(p => p.status === "closed");
                  if (bulkMode === "range" && bulkFrom && bulkTo) {
                    target = target.filter(p => p.start_date >= bulkFrom && p.start_date <= bulkTo);
                  }
                  return (
                    <p className="text-sm font-medium text-muted-foreground">
                      {target.length} periodo{target.length !== 1 ? "s" : ""} cerrado{target.length !== 1 ? "s" : ""} {bulkMode === "range" && bulkFrom && bulkTo ? `entre ${bulkFrom} y ${bulkTo}` : "en total"}
                    </p>
                  );
                })()}
                <Button className="w-full" onClick={handleBulkOpen} disabled={bulkOpening || (bulkMode === "range" && (!bulkFrom || !bulkTo))}>
                  {bulkOpening ? "Abriendo..." : `Abrir periodos${bulkMode === "range" ? ` (${bulkFrom} → ${bulkTo})` : " (todos)"}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={yearOpen} onOpenChange={setYearOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><CalendarPlus className="h-4 w-4 mr-2" />Generar año</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generar periodos de un año</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Se crearán ~52 periodos semanales (miércoles a martes) para el año seleccionado. Los periodos que ya existan serán omitidos.
                </p>
                <div>
                  <Label>Año</Label>
                  <Input type="number" value={yearValue} onChange={e => setYearValue(Number(e.target.value))} min={2020} max={2030} className="mt-1" />
                </div>
                <Button className="w-full" onClick={handleGenerateYear} disabled={generatingYear}>
                  {generatingYear ? "Generando..." : `Crear periodos ${yearValue}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nuevo periodo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear periodo semanal</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label>Fecha inicio (miércoles)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                    <Button type="button" variant="outline" size="sm" onClick={suggestNextWednesday}>Próx. miércoles</Button>
                  </div>
                </div>
                {startDate && (
                  <p className="text-sm text-muted-foreground">
                    Periodo: {startDate} → {format(addDays(new Date(startDate + "T00:00:00"), 6), "yyyy-MM-dd")}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creando..." : "Crear periodo"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>}
      />

      {showSequenceConfig && (
        <div className="mb-4">
          <PayrollSequenceSettings />
        </div>
      )}

      <div className="data-table-wrapper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead>Fin</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Origen / Reconciliation</TableHead>
              <TableHead>Cerrado</TableHead>
              <TableHead className="w-28">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No hay periodos</TableCell></TableRow>
            ) : (
              periods.map((p) => {
                const isExpanded = expandedPeriods.has(p.id);
                const imports = importsMap[p.id];
                const isLoadingImports = loadingImports.has(p.id);
                const hasImports = imports && imports.length > 0;
                const today = new Date().toISOString().slice(0, 10);
                const isCurrentWeek = p.start_date <= today && p.end_date >= today;

                return (
                  <Collapsible key={p.id} open={isExpanded} onOpenChange={() => toggleExpand(p.id)} asChild>
                    <>
                       <TableRow
                        className={cn(
                          "group cursor-pointer hover:bg-accent/50",
                          isCurrentWeek && "bg-primary/[0.04] ring-1 ring-inset ring-primary/15"
                        )}
                        onClick={() => toggleExpand(p.id)}
                      >
                        <TableCell className="w-10">
                          <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {p.sequence_number ? formatSequence(p.sequence_number, seqConfig) : "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {isCurrentWeek && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-2" />}
                          {p.start_date}
                        </TableCell>
                        <TableCell>{p.end_date}</TableCell>
                        <TableCell>
                          {(() => {
                            const meta = periodMeta[p.id];
                            const steps = [
                              { label: "Abierto", done: true },
                              { label: "Importado", done: meta?.hasImports ?? false },
                              { label: "Consolidado", done: meta?.hasBasePay ?? false },
                              { label: "Cerrado", done: p.status === "closed" },
                              { label: "Publicado", done: !!p.published_at },
                            ];
                            // Find the highest completed step
                            let currentLabel = "Nuevo";
                            for (let i = steps.length - 1; i >= 0; i--) {
                              if (steps[i].done) { currentLabel = steps[i].label; break; }
                            }
                            const completedCount = steps.filter(s => s.done).length;
                            const colorMap: Record<string, string> = {
                              "Nuevo": "bg-muted text-muted-foreground",
                              "Abierto": "bg-primary/10 text-primary",
                              "Importado": "bg-accent-warm/15 text-accent-warm",
                              "Consolidado": "bg-warning/15 text-warning",
                              "Cerrado": "bg-destructive/10 text-destructive",
                              "Publicado": "bg-earning/15 text-earning",
                            };
                            return (
                              <div className="flex items-center gap-2">
                                <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", colorMap[currentLabel] || "bg-muted text-muted-foreground")}>
                                  {currentLabel}
                                </span>
                                <div className="flex gap-0.5">
                                  {steps.map((s, i) => (
                                    <TooltipProvider key={i}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className={cn("block w-2 h-2 rounded-full transition-colors", s.done ? "bg-earning" : "bg-border/40")} />
                                        </TooltipTrigger>
                                        <TooltipContent className="text-xs">{s.label}{s.done ? " ✓" : ""}</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <PeriodReconciliationCell
                            periodId={p.id}
                            sourceType={p.source_type}
                            reconciliationStatus={p.reconciliation_status}
                            lastReconciledAt={p.last_reconciled_at}
                            onOpenSummary={() => {
                              if (!expandedPeriods.has(p.id)) toggleExpand(p.id);
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.closed_at ? format(new Date(p.closed_at), "yyyy-MM-dd HH:mm") : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            {p.status === "open" ? (
                              /* Close period — always allowed for admins */
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => requestToggle(p)}>
                                      <Lock className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Cerrar periodo</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : canOpenPeriodId === p.id ? (
                              /* Open next sequential period */
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => requestToggle(p)}>
                                      <Unlock className="h-4 w-4 text-primary" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Abrir periodo (siguiente en secuencia)</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              /* Reopen — requires reabrir_periodo permission */
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => requestToggle(p)}
                                      disabled={!canReopen}
                                    >
                                      <ShieldAlert className="h-4 w-4 text-warning" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {canReopen ? "Reabrir periodo (requiere privilegios)" : "Sin permiso para reabrir periodos"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => togglePublish(p)}
                                    disabled={p.status === "open"}
                                  >
                                    {p.published_at ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Send className="h-4 w-4 text-primary" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{p.published_at ? "Retirar publicación" : "Publicar para empleados"}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>

                      <CollapsibleContent asChild>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={8} className="p-0">
                            <div className="px-6 py-4 border-t border-border/50">
                              {isLoadingImports ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                  Cargando importaciones...
                                </div>
                              ) : !hasImports ? (
                                <div className="flex items-center justify-between py-2">
                                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <FileSpreadsheet className="h-5 w-5 text-muted-foreground/50" />
                                    <span>Sin importaciones para este periodo</span>
                                  </div>
                                  {p.status === "open" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleReimport(p.id)}
                                    >
                                      <Upload className="h-4 w-4 mr-2" />
                                      Importar archivo
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-medium">Importaciones ({imports.length})</h4>
                                    {p.status === "open" && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleReimport(p.id)}
                                      >
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                        Reimportar
                                      </Button>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    {imports.map((imp) => (
                                      <div
                                        key={imp.id}
                                        className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-4 py-3"
                                      >
                                        <div className="flex items-center gap-3">
                                          {getImportStatusIcon(imp.status)}
                                          <div>
                                            <p className="text-sm font-medium flex items-center gap-2">
                                              <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
                                              {imp.file_name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {formatDistanceToNow(new Date(imp.created_at), { addSuffix: true, locale: es })}
                                              {imp.row_count != null && ` · ${imp.row_count} filas`}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                                            imp.status === "completed" ? "bg-earning/10 text-earning" :
                                            imp.status === "error" ? "bg-destructive/10 text-destructive" :
                                            "bg-muted text-muted-foreground"
                                          }`}>
                                            {getImportStatusLabel(imp.status)}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  {imports.some(i => i.error_message) && (
                                    <div className="text-xs text-destructive bg-destructive/5 rounded-md px-3 py-2">
                                      {imports.find(i => i.error_message)?.error_message}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <PasswordConfirmDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        title={canOpenPeriodId === pendingToggle?.id ? "Abrir periodo" : "Reabrir periodo"}
        description={canOpenPeriodId === pendingToggle?.id
          ? "Este es el siguiente periodo en secuencia. Confirma tu contraseña para abrirlo."
          : "Reabrir un periodo fuera de secuencia requiere privilegios especiales. Confirma tu contraseña para continuar."}
        onConfirm={toggleStatus}
      />
    </div>
  );
}
