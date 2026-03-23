import { useEffect, useState, useRef, useMemo } from "react";
import { usePayrollReconciliation, type ReconciliationBatch } from "@/hooks/usePayrollReconciliation";
import type { ReconciliationRowResult } from "@/lib/payroll-reconciliation-engine";
import { usePageView } from "@/hooks/useAuditLog";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";
import { Loader2, Upload, Play, CheckCircle2, Lock, AlertTriangle, XCircle, Search, FileText, Plus, Eye, Shield, AlertOctagon, Info, ChevronDown, ChevronUp } from "lucide-react";

const fmt = (v: number | null | undefined) => v != null ? `$${v.toFixed(2)}` : "—";
const fmtH = (v: number | null | undefined) => v != null ? v.toFixed(2) : "—";
const fmtVar = (v: number | null | undefined) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}$${abs.toFixed(2)}`;
};

function statusBadge(status: string) {
  const map: Record<string, { variant: any; label: string }> = {
    EXACT_MATCH: { variant: "success", label: "Match exacto" },
    COMPONENT_MISMATCH: { variant: "warning", label: "Componente" },
    CRITICAL_MISMATCH: { variant: "destructive", label: "Crítico" },
    MISSING_IN_SYSTEM: { variant: "destructive", label: "Falta en sistema" },
    MISSING_IN_TRUTH: { variant: "info", label: "Falta en verdad" },
    PENDING: { variant: "secondary", label: "Pendiente" },
    UNMATCHED: { variant: "destructive", label: "Sin match" },
    NEEDS_REVIEW: { variant: "warning", label: "Revisión" },
  };
  const s = map[status] || { variant: "outline", label: status };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function matchBadge(confidence: number) {
  if (confidence >= 90) return <Badge variant="success">{confidence}%</Badge>;
  if (confidence >= 70) return <Badge variant="warning">{confidence}%</Badge>;
  if (confidence > 0) return <Badge variant="destructive">{confidence}%</Badge>;
  return <Badge variant="outline">—</Badge>;
}

function batchStatusBadge(status: string) {
  const map: Record<string, { variant: any; icon: any }> = {
    DRAFT: { variant: "secondary", icon: FileText },
    TRUTH_UPLOADED: { variant: "info", icon: Upload },
    RECONCILED: { variant: "success", icon: CheckCircle2 },
    NEEDS_REVIEW: { variant: "warning", icon: AlertTriangle },
    CRITICAL: { variant: "destructive", icon: AlertOctagon },
    APPROVED: { variant: "success", icon: Shield },
    LOCKED: { variant: "secondary", icon: Lock },
    MISMATCHED: { variant: "warning", icon: AlertTriangle },
  };
  const s = map[status] || { variant: "outline", icon: Info };
  const Icon = s.icon;
  return <Badge variant={s.variant} className="gap-1"><Icon className="h-3 w-3" />{status}</Badge>;
}

function varianceCell(val: number | null | undefined, tolerance: number) {
  if (val == null) return <span className="text-muted-foreground">—</span>;
  const abs = Math.abs(val);
  const ok = abs <= tolerance;
  return (
    <span className={ok ? "text-earning" : abs > tolerance * 5 ? "text-destructive font-bold" : "text-warning font-medium"}>
      {fmtVar(val)}
    </span>
  );
}

// ─── Summary Card ────────────────────────────────────────────────────

function SummaryCard({ label, truth, system, variance, tolerance }: { label: string; truth: number; system: number; variance: number; tolerance: number }) {
  const ok = Math.abs(variance) <= tolerance;
  return (
    <Card className={ok ? "border-earning/30" : Math.abs(variance) > tolerance * 5 ? "border-destructive/50" : "border-warning/50"}>
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Truth</span>
          <span className="font-mono">{fmt(truth)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">System</span>
          <span className="font-mono">{fmt(system)}</span>
        </div>
        <div className="flex justify-between text-sm font-semibold border-t pt-1">
          <span>Varianza</span>
          {varianceCell(variance, tolerance)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────

function RowDetailPanel({ row, onClose, onAddNote, batchId }: {
  row: ReconciliationRowResult;
  onClose: () => void;
  onAddNote: (rowId: string, note: string, batchId: string) => Promise<void>;
  batchId: string;
}) {
  const [note, setNote] = useState("");
  const name = `${row.truth.first_name} ${row.truth.last_name}`;

  const components = [
    { label: "Hours", truth: row.truth.total_hours, system: row.system?.total_hours ?? null, variance: row.variances.hours },
    { label: "Total Pay", truth: row.truth.total_pay, system: row.system?.total_pay ?? null, variance: row.variances.total_pay },
    { label: "Pay Per Day", truth: row.truth.pay_per_day, system: row.system?.pay_per_day ?? null, variance: row.variances.pay_per_day },
    { label: "Ryde", truth: row.truth.ryde, system: row.system?.ryde ?? null, variance: row.variances.ryde },
    { label: "Tips", truth: row.truth.tips, system: row.system?.tips ?? null, variance: row.variances.tips },
    { label: "Reimbursements", truth: row.truth.reimbursements, system: row.system?.reimbursements ?? null, variance: row.variances.reimbursements },
    { label: "TOTAL", truth: row.truth.total, system: row.system?.total ?? null, variance: row.variances.total },
  ];

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
      <DialogHeader>
        <DialogTitle>{name}</DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          {statusBadge(row.classification.row_status)}
          {matchBadge(row.match.match_confidence)}
          <span className="text-xs text-muted-foreground">via {row.match.matched_by}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Component comparison */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Componente</TableHead>
              <TableHead className="text-right">Truth</TableHead>
              <TableHead className="text-right">System</TableHead>
              <TableHead className="text-right">Varianza</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.map(c => (
              <TableRow key={c.label}>
                <TableCell className="font-medium">{c.label}</TableCell>
                <TableCell className="text-right font-mono">{c.label === "Hours" ? fmtH(c.truth) : fmt(c.truth)}</TableCell>
                <TableCell className="text-right font-mono">{c.label === "Hours" ? fmtH(c.system) : fmt(c.system)}</TableCell>
                <TableCell className="text-right">{varianceCell(c.variance, c.label === "Hours" ? 0.1 : 1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Anomaly flags */}
        {row.anomaly_flags.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-1">Anomalías detectadas</h4>
            <div className="flex flex-wrap gap-1">
              {row.anomaly_flags.map(f => <Badge key={f} variant="destructive" className="text-[10px]">{f}</Badge>)}
            </div>
          </div>
        )}

        {/* Observaciones */}
        {row.truth.observaciones && (
          <div>
            <h4 className="text-sm font-semibold mb-1">Observaciones (Truth)</h4>
            <p className="text-sm text-muted-foreground bg-muted p-2 rounded">{row.truth.observaciones}</p>
          </div>
        )}

        {/* Review note */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Nota de revisión</h4>
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Agregar nota..." rows={2} />
          <Button size="sm" disabled={!note.trim()} onClick={async () => { /* needs row ID from DB */ }}>Guardar nota</Button>
        </div>
      </div>
    </DialogContent>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function PayrollReconciliationPage() {
  usePageView("Payroll Reconciliation");
  const {
    batches, activeBatch, setActiveBatch,
    reconciliationRows, systemOnlyEmployees, batchSummary,
    loading, processing,
    loadBatches, createBatch, uploadTruth,
    runReconciliationForBatch, approveBatch, lockBatch,
    exportCSV,
  } = usePayrollReconciliation();

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<ReconciliationRowResult | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const filteredRows = useMemo(() => {
    let rows = reconciliationRows;
    if (filter === "exact") rows = rows.filter(r => r.classification.is_exact_match);
    if (filter === "mismatch") rows = rows.filter(r => r.classification.has_component_mismatch && !r.classification.has_critical_mismatch);
    if (filter === "critical") rows = rows.filter(r => r.classification.has_critical_mismatch);
    if (filter === "missing_system") rows = rows.filter(r => r.classification.row_status === "MISSING_IN_SYSTEM");
    if (filter === "unmatched") rows = rows.filter(r => r.match.match_status === "UNMATCHED");
    if (filter === "manual") rows = rows.filter(r => r.classification.has_manual_adjustment);
    if (filter === "low_confidence") rows = rows.filter(r => r.match.match_confidence > 0 && r.match.match_confidence < 80);
    if (filter === "flags") rows = rows.filter(r => r.anomaly_flags.length > 0);

    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter(r => `${r.truth.first_name} ${r.truth.last_name}`.toLowerCase().includes(s));
    }
    return rows;
  }, [reconciliationRows, filter, search]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeBatch) return;
    await uploadTruth(file, activeBatch.id);
    e.target.value = "";
  };

  const handleCreateBatch = async () => {
    await createBatch();
    setShowCreateDialog(false);
  };

  // ─── No active batch view ────────────────────────────────────────
  if (!activeBatch) {
    return (
      <div className="space-y-6">
        <PageHeader heading="Payroll Reconciliation" text="Motor de reconciliación de nómina contra archivo de verdad" />

        <div className="flex items-center gap-3">
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Nuevo Batch
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : batches.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No hay batches de reconciliación. Crea uno para comenzar.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {batches.map(b => (
              <Card key={b.id} className="cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setActiveBatch(b)}>
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {batchStatusBadge(b.status)}
                    <div>
                      <p className="font-medium text-sm">{b.truth_source_file_name || "Sin archivo"}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.employees_truth_count} empleados • {b.matched_count} matched • {b.critical_mismatch_count} críticos
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</p>
                    {b.total_variance_amount > 0 && <p className="text-sm font-mono text-destructive">{fmtVar(b.total_variance_amount)}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo Batch de Reconciliación</DialogTitle>
              <DialogDescription>Se creará un batch vacío donde podrás cargar el archivo de verdad y ejecutar la reconciliación.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
              <Button onClick={handleCreateBatch}>Crear Batch</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Active batch view ───────────────────────────────────────────
  const isLocked = activeBatch.status === "LOCKED" || activeBatch.status === "APPROVED";
  const tolerance = { hours: activeBatch.tolerance_hours, money: activeBatch.tolerance_money, tips: activeBatch.tolerance_tips };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 text-muted-foreground" onClick={() => { setActiveBatch(null); setSearch(""); setFilter("all"); }}>
            ← Volver a batches
          </Button>
          <PageHeader heading="Reconciliación" text={activeBatch.truth_source_file_name || "Batch sin archivo"} />
        </div>
        <div className="flex items-center gap-2">
          {batchStatusBadge(activeBatch.status)}
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLocked || processing}>
          <Upload className="h-4 w-4 mr-1.5" />Cargar Truth File
        </Button>
        <Button size="sm" onClick={() => runReconciliationForBatch(activeBatch.id)} disabled={isLocked || processing || activeBatch.status === "DRAFT"}>
          {processing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />}
          Ejecutar Reconciliación
        </Button>
        {!isLocked && batchSummary && (
          <>
            <Button size="sm" variant="outline" onClick={() => approveBatch(activeBatch.id)}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />Aprobar
            </Button>
            {activeBatch.status === "APPROVED" || (
              <Button size="sm" variant="outline" onClick={() => lockBatch(activeBatch.id)} disabled={activeBatch.status !== "APPROVED"}>
                <Lock className="h-4 w-4 mr-1.5" />Bloquear
              </Button>
            )}
          </>
        )}
        {reconciliationRows.length > 0 && (
          <ReportActionsBar
            title="Payroll Reconciliation"
            onExportCSV={() => exportCSV(reconciliationRows)}
          />
        )}
      </div>

      {/* Summary cards */}
      {batchSummary && (
        <>
          {/* KPI strip */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">{batchSummary.exact_match} Match exacto</Badge>
            <Badge variant="warning">{batchSummary.component_mismatch} Componente</Badge>
            <Badge variant="destructive">{batchSummary.critical_mismatch} Crítico</Badge>
            <Badge variant="info">{batchSummary.matched} Matched</Badge>
            <Badge variant="destructive">{batchSummary.unmatched_truth} Sin match (truth)</Badge>
            <Badge variant="outline">{batchSummary.unmatched_system} Sin match (system)</Badge>
          </div>

          {/* Component cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <SummaryCard label="Hours" truth={batchSummary.totals_truth.hours} system={batchSummary.totals_system.hours} variance={batchSummary.totals_variance.hours} tolerance={tolerance.hours} />
            <SummaryCard label="Total Pay" truth={batchSummary.totals_truth.total_pay} system={batchSummary.totals_system.total_pay} variance={batchSummary.totals_variance.total_pay} tolerance={tolerance.money} />
            <SummaryCard label="Pay/Day" truth={batchSummary.totals_truth.pay_per_day} system={batchSummary.totals_system.pay_per_day} variance={batchSummary.totals_variance.pay_per_day} tolerance={tolerance.money} />
            <SummaryCard label="Ryde" truth={batchSummary.totals_truth.ryde} system={batchSummary.totals_system.ryde} variance={batchSummary.totals_variance.ryde} tolerance={tolerance.money} />
            <SummaryCard label="Tips" truth={batchSummary.totals_truth.tips} system={batchSummary.totals_system.tips} variance={batchSummary.totals_variance.tips} tolerance={tolerance.tips} />
            <SummaryCard label="Reimb." truth={batchSummary.totals_truth.reimbursements} system={batchSummary.totals_system.reimbursements} variance={batchSummary.totals_variance.reimbursements} tolerance={tolerance.money} />
            <SummaryCard label="TOTAL" truth={batchSummary.totals_truth.grand_total} system={batchSummary.totals_system.grand_total} variance={batchSummary.totals_variance.grand_total} tolerance={tolerance.money} />
          </div>
        </>
      )}

      {/* Filters */}
      {reconciliationRows.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ({reconciliationRows.length})</SelectItem>
              <SelectItem value="exact">Match exacto</SelectItem>
              <SelectItem value="mismatch">Componente</SelectItem>
              <SelectItem value="critical">Críticos</SelectItem>
              <SelectItem value="missing_system">Falta en sistema</SelectItem>
              <SelectItem value="unmatched">Sin match</SelectItem>
              <SelectItem value="manual">Ajuste manual</SelectItem>
              <SelectItem value="low_confidence">Baja confianza</SelectItem>
              <SelectItem value="flags">Con anomalías</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Main grid */}
      {filteredRows.length > 0 && (
        <div className="border rounded-lg overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-surface-2 z-20 min-w-[180px]">Empleado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Match</TableHead>
                <TableHead className="text-right">T.Hours</TableHead>
                <TableHead className="text-right">S.Hours</TableHead>
                <TableHead className="text-right">Δ Hours</TableHead>
                <TableHead className="text-right">T.Pay</TableHead>
                <TableHead className="text-right">S.Pay</TableHead>
                <TableHead className="text-right">Δ Pay</TableHead>
                <TableHead className="text-right">T.PPD</TableHead>
                <TableHead className="text-right">S.PPD</TableHead>
                <TableHead className="text-right">Δ PPD</TableHead>
                <TableHead className="text-right">T.Ryde</TableHead>
                <TableHead className="text-right">S.Ryde</TableHead>
                <TableHead className="text-right">Δ Ryde</TableHead>
                <TableHead className="text-right">T.Tips</TableHead>
                <TableHead className="text-right">S.Tips</TableHead>
                <TableHead className="text-right">Δ Tips</TableHead>
                <TableHead className="text-right">T.Total</TableHead>
                <TableHead className="text-right">S.Total</TableHead>
                <TableHead className="text-right">Δ Total</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row, i) => (
                <TableRow key={i} className={row.classification.has_critical_mismatch ? "bg-destructive/5" : row.classification.is_exact_match ? "bg-earning/5" : ""}>
                  <TableCell className="sticky left-0 bg-background z-10 font-medium">
                    <div>
                      <span className="text-sm">{row.truth.first_name} {row.truth.last_name}</span>
                      {row.truth.observaciones && (
                        <Tooltip>
                          <TooltipTrigger><Info className="h-3 w-3 inline ml-1 text-muted-foreground" /></TooltipTrigger>
                          <TooltipContent>{row.truth.observaciones}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{statusBadge(row.classification.row_status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {matchBadge(row.match.match_confidence)}
                      <span className="text-[10px] text-muted-foreground">{row.match.matched_by}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtH(row.truth.total_hours)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtH(row.system?.total_hours)}</TableCell>
                  <TableCell className="text-right text-sm">{varianceCell(row.variances.hours, tolerance.hours)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(row.truth.total_pay)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(row.system?.total_pay)}</TableCell>
                  <TableCell className="text-right text-sm">{varianceCell(row.variances.total_pay, tolerance.money)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(row.truth.pay_per_day)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(row.system?.pay_per_day)}</TableCell>
                  <TableCell className="text-right text-sm">{varianceCell(row.variances.pay_per_day, tolerance.money)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(row.truth.ryde)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(row.system?.ryde)}</TableCell>
                  <TableCell className="text-right text-sm">{varianceCell(row.variances.ryde, tolerance.money)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(row.truth.tips)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(row.system?.tips)}</TableCell>
                  <TableCell className="text-right text-sm">{varianceCell(row.variances.tips, tolerance.tips)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{fmt(row.truth.total)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{fmt(row.system?.total)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">{varianceCell(row.variances.total, tolerance.money)}</TableCell>
                  <TableCell>
                    {row.anomaly_flags.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="destructive" className="text-[9px]">{row.anomaly_flags.length}</Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          {row.anomaly_flags.join(", ")}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedRow(row)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* System-only employees */}
      {systemOnlyEmployees.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Empleados solo en sistema ({systemOnlyEmployees.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-2">
              {systemOnlyEmployees.map(e => (
                <Badge key={e.employee_id} variant="outline">{e.first_name} {e.last_name}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedRow} onOpenChange={() => setSelectedRow(null)}>
        {selectedRow && (
          <RowDetailPanel
            row={selectedRow}
            onClose={() => setSelectedRow(null)}
            onAddNote={async () => {}}
            batchId={activeBatch.id}
          />
        )}
      </Dialog>

      {/* Empty state */}
      {reconciliationRows.length === 0 && !processing && activeBatch.status !== "DRAFT" && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Carga un archivo de verdad y ejecuta la reconciliación para ver resultados.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
