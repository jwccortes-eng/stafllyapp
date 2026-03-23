import { useEffect, useState, useRef, useMemo } from "react";
import { usePayrollReconciliation, type ReconciliationBatch } from "@/hooks/usePayrollReconciliation";
import type { ReconciliationRowResult, BatchSummary, TopIssue, MatchBreakdown } from "@/lib/payroll-reconciliation-engine";
import { usePageView } from "@/hooks/useAuditLog";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, Upload, Play, CheckCircle2, Lock, AlertTriangle, XCircle,
  Search, FileText, Plus, Eye, Shield, AlertOctagon, Info, ChevronDown,
  ChevronUp, Users, TrendingUp, Hash, Link2, UserCheck, Fingerprint,
  Mail, Phone, Type, Sparkles, ShieldAlert, BarChart3
} from "lucide-react";

// ─── Formatting Helpers ──────────────────────────────────────────────

const fmt = (v: number | null | undefined) => v != null ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const fmtH = (v: number | null | undefined) => v != null ? v.toFixed(2) : "—";
const fmtVar = (v: number | null | undefined) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

// ─── Badge Helpers ───────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { variant: any; label: string }> = {
    EXACT_MATCH: { variant: "success", label: "Exacto" },
    COMPONENT_MISMATCH: { variant: "warning", label: "Parcial" },
    CRITICAL_MISMATCH: { variant: "destructive", label: "Crítico" },
    MISSING_IN_SYSTEM: { variant: "destructive", label: "Sin sistema" },
    MISSING_IN_TRUTH: { variant: "info", label: "Sin truth" },
    PENDING: { variant: "secondary", label: "Pendiente" },
    UNMATCHED: { variant: "destructive", label: "Sin match" },
    NEEDS_REVIEW: { variant: "warning", label: "Revisión" },
  };
  const s = map[status] || { variant: "outline", label: status };
  return <Badge variant={s.variant} className="text-[10px] px-1.5 py-0">{s.label}</Badge>;
}

function matchMethodIcon(method: string) {
  const icons: Record<string, any> = {
    employer_id: Fingerprint, ssn_ein: Hash, email: Mail, phone: Phone,
    external_id: Link2, full_name_exact: UserCheck, alias: Sparkles,
    fuzzy_name: Type, none: XCircle,
  };
  const Icon = icons[method] || Info;
  return <Icon className="h-3 w-3" />;
}

function matchBadge(confidence: number, method: string) {
  const variant = confidence >= 90 ? "success" : confidence >= 75 ? "warning" : confidence > 0 ? "destructive" : "outline";
  const labels: Record<string, string> = {
    employer_id: "ID", ssn_ein: "SSN", email: "Email", phone: "Tel",
    external_id: "ExtID", full_name_exact: "Nombre", alias: "Alias",
    fuzzy_name: "Fuzzy", none: "—",
  };
  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant={variant as any} className="text-[10px] px-1.5 py-0 gap-0.5">
          {matchMethodIcon(method)}
          {confidence > 0 ? `${confidence}%` : "—"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        <p className="font-medium">Matched by: {labels[method] || method}</p>
        <p>Confianza: {confidence}%</p>
      </TooltipContent>
    </Tooltip>
  );
}

function batchStatusBadge(status: string) {
  const map: Record<string, { variant: any; icon: any; label: string }> = {
    DRAFT: { variant: "secondary", icon: FileText, label: "Borrador" },
    TRUTH_UPLOADED: { variant: "info", icon: Upload, label: "Truth cargado" },
    RECONCILED: { variant: "success", icon: CheckCircle2, label: "Reconciliado" },
    NEEDS_REVIEW: { variant: "warning", icon: AlertTriangle, label: "Revisión" },
    CRITICAL: { variant: "destructive", icon: AlertOctagon, label: "Crítico" },
    APPROVED: { variant: "success", icon: Shield, label: "Aprobado" },
    LOCKED: { variant: "secondary", icon: Lock, label: "Bloqueado" },
    MISMATCHED: { variant: "warning", icon: AlertTriangle, label: "Discrepancias" },
  };
  const s = map[status] || { variant: "outline", icon: Info, label: status };
  const Icon = s.icon;
  return <Badge variant={s.variant} className="gap-1 text-[10px]"><Icon className="h-3 w-3" />{s.label}</Badge>;
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

// ─── KPI Card ────────────────────────────────────────────────────────

function KpiCard({ label, value, subtitle, icon: Icon, accent }: { label: string; value: string | number; subtitle?: string; icon: any; accent?: "success" | "warning" | "destructive" | "muted" }) {
  const colors = {
    success: "text-earning border-earning/20 bg-earning/5",
    warning: "text-warning border-warning/20 bg-warning/5",
    destructive: "text-destructive border-destructive/20 bg-destructive/5",
    muted: "text-muted-foreground border-border bg-muted/30",
  };
  return (
    <Card className={`${colors[accent || "muted"]} border`}>
      <CardContent className="p-3 flex items-start gap-3">
        <div className={`p-1.5 rounded-md ${accent === "success" ? "bg-earning/10" : accent === "warning" ? "bg-warning/10" : accent === "destructive" ? "bg-destructive/10" : "bg-muted"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Summary Card ────────────────────────────────────────────────────

function SummaryCard({ label, truth, system, variance, tolerance }: { label: string; truth: number; system: number; variance: number; tolerance: number }) {
  const ok = Math.abs(variance) <= tolerance;
  const borderColor = ok ? "border-earning/30" : Math.abs(variance) > tolerance * 5 ? "border-destructive/40" : "border-warning/40";
  return (
    <Card className={`${borderColor} border`}>
      <CardContent className="p-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Truth</span>
          <span className="font-mono font-medium">{fmt(truth)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">System</span>
          <span className="font-mono font-medium">{fmt(system)}</span>
        </div>
        <Separator />
        <div className="flex justify-between text-xs font-semibold">
          <span>Δ</span>
          {varianceCell(variance, tolerance)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Validation Report Panel ─────────────────────────────────────────

function ValidationReportPanel({ summary, parseResult }: { summary: BatchSummary; parseResult?: { skipped_summary_rows: number; duplicate_names: string[]; parse_warnings: string[] } | null }) {
  const [expanded, setExpanded] = useState(true);
  const matchRate = summary.truth_count > 0 ? summary.matched / summary.truth_count : 0;
  const exactRate = summary.truth_count > 0 ? summary.exact_match / summary.truth_count : 0;

  const mb = summary.match_breakdown;
  const matchMethods = [
    { label: "Employer ID", count: mb.by_employer_id, icon: Fingerprint },
    { label: "SSN/EIN", count: mb.by_ssn, icon: Hash },
    { label: "Email", count: mb.by_email, icon: Mail },
    { label: "Phone", count: mb.by_phone, icon: Phone },
    { label: "External ID", count: mb.by_external_id, icon: Link2 },
    { label: "Nombre exacto", count: mb.by_full_name_exact, icon: UserCheck },
    { label: "Alias", count: mb.by_alias, icon: Sparkles },
    { label: "Fuzzy", count: mb.by_fuzzy_name, icon: Type },
    { label: "Sin match", count: mb.unmatched, icon: XCircle },
  ].filter(m => m.count > 0);

  return (
    <Card className="border-primary/20">
      <CardHeader className="py-3 px-4 cursor-pointer flex flex-row items-center justify-between" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold">Reporte de Validación</CardTitle>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </CardHeader>
      {expanded && (
        <CardContent className="px-4 pb-4 space-y-4">
          {/* Progress bars */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Tasa de match</span>
                <span className="font-semibold">{fmtPct(matchRate)}</span>
              </div>
              <Progress value={matchRate * 100} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Match exacto</span>
                <span className="font-semibold">{fmtPct(exactRate)}</span>
              </div>
              <Progress value={exactRate * 100} className="h-2" />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <StatMini label="Truth rows" value={summary.truth_count} />
            <StatMini label="System rows" value={summary.system_count} />
            <StatMini label="Matched" value={summary.matched} accent="success" />
            <StatMini label="Exact match" value={summary.exact_match} accent="success" />
            <StatMini label="Mismatch" value={summary.component_mismatch} accent="warning" />
            <StatMini label="Críticos" value={summary.critical_mismatch} accent="destructive" />
          </div>

          <Separator />

          {/* Match method breakdown */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Método de match</p>
            <div className="flex flex-wrap gap-1.5">
              {matchMethods.map(m => (
                <Badge key={m.label} variant={m.label === "Sin match" ? "destructive" : m.label === "Fuzzy" ? "warning" : "secondary"} className="gap-1 text-[10px]">
                  <m.icon className="h-3 w-3" />
                  {m.label}: {m.count}
                </Badge>
              ))}
            </div>
          </div>

          {/* Parse info */}
          {parseResult && (
            <>
              <Separator />
              <div className="grid grid-cols-3 gap-3">
                <StatMini label="Filas totales saltadas" value={parseResult.skipped_summary_rows} />
                <StatMini label="Nombres duplicados" value={parseResult.duplicate_names.length} accent={parseResult.duplicate_names.length > 0 ? "warning" : undefined} />
                <StatMini label="Advertencias" value={parseResult.parse_warnings.length} accent={parseResult.parse_warnings.length > 0 ? "warning" : undefined} />
              </div>
              {parseResult.duplicate_names.length > 0 && (
                <div className="text-xs text-warning bg-warning/10 rounded p-2">
                  Duplicados: {parseResult.duplicate_names.join(", ")}
                </div>
              )}
            </>
          )}

          {/* Top Issues */}
          {summary.top_issues.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Problemas principales</p>
                <div className="space-y-1.5">
                  {summary.top_issues.map((issue, i) => (
                    <div key={i} className={`flex items-center justify-between text-xs p-2 rounded ${issue.severity === "critical" ? "bg-destructive/10 text-destructive" : issue.severity === "warning" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"}`}>
                      <div className="flex items-center gap-1.5">
                        {issue.severity === "critical" ? <AlertOctagon className="h-3 w-3" /> : issue.severity === "warning" ? <AlertTriangle className="h-3 w-3" /> : <Info className="h-3 w-3" />}
                        <span>{issue.label}</span>
                      </div>
                      <Badge variant={issue.severity === "critical" ? "destructive" : issue.severity === "warning" ? "warning" : "secondary"} className="text-[10px]">{issue.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Anomaly summary */}
          {Object.keys(summary.anomaly_summary).length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Anomalías detectadas</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(summary.anomaly_summary).sort((a, b) => b[1] - a[1]).map(([flag, count]) => (
                    <Badge key={flag} variant="outline" className="text-[10px] gap-1">
                      {flag.replace(/_/g, " ")} <span className="font-bold">{count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Variance totals */}
          <Separator />
          <div className="text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Varianza total horas</span>{varianceCell(summary.totals_variance.hours, 0.1)}</div>
            <div className="flex justify-between"><span className="text-muted-foreground">Varianza grand total</span>{varianceCell(summary.totals_variance.grand_total, 1)}</div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function StatMini({ label, value, accent }: { label: string; value: number | string; accent?: "success" | "warning" | "destructive" }) {
  const color = accent === "success" ? "text-earning" : accent === "warning" ? "text-warning" : accent === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

// ─── Pre-Approval Safety Panel ───────────────────────────────────────

function PreApprovalSafetyPanel({ summary, onApprove, onCancel }: { summary: BatchSummary; onApprove: () => void; onCancel: () => void }) {
  const hasBlockers = summary.critical_mismatch > 0 || summary.unmatched_truth > 0;
  const checks = [
    { label: "Discrepancias críticas", value: summary.critical_mismatch, ok: summary.critical_mismatch === 0 },
    { label: "Sin match en sistema", value: summary.unmatched_truth, ok: summary.unmatched_truth === 0 },
    { label: "Sin match en truth", value: summary.unmatched_system, ok: summary.unmatched_system === 0 },
    { label: "Varianza total", value: fmt(summary.total_variance), ok: summary.total_variance < 10 },
  ];

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-warning" />
          Verificación pre-aprobación
        </DialogTitle>
        <DialogDescription>Revisa los indicadores antes de aprobar el batch.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {checks.map((c, i) => (
          <div key={i} className={`flex items-center justify-between p-2.5 rounded-md border text-sm ${c.ok ? "border-earning/30 bg-earning/5" : "border-destructive/30 bg-destructive/5"}`}>
            <div className="flex items-center gap-2">
              {c.ok ? <CheckCircle2 className="h-4 w-4 text-earning" /> : <AlertOctagon className="h-4 w-4 text-destructive" />}
              <span>{c.label}</span>
            </div>
            <span className={`font-mono font-semibold ${c.ok ? "text-earning" : "text-destructive"}`}>{c.value}</span>
          </div>
        ))}
      </div>
      {hasBlockers && (
        <div className="bg-warning/10 border border-warning/30 rounded-md p-3 text-xs text-warning flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Existen problemas críticos sin resolver. Aprobar de todas formas registrará un override en la auditoría.</span>
        </div>
      )}
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onApprove} variant={hasBlockers ? "destructive" : "default"}>
          {hasBlockers ? "Aprobar con advertencias" : "Aprobar batch"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────

function RowDetailPanel({ row, onClose }: { row: ReconciliationRowResult; onClose: () => void }) {
  const name = `${row.truth.first_name} ${row.truth.last_name}`;
  const components = [
    { label: "Hours", truth: row.truth.total_hours, system: row.system?.total_hours ?? null, variance: row.variances.hours, isHours: true },
    { label: "Total Pay", truth: row.truth.total_pay, system: row.system?.total_pay ?? null, variance: row.variances.total_pay },
    { label: "Pay Per Day", truth: row.truth.pay_per_day, system: row.system?.pay_per_day ?? null, variance: row.variances.pay_per_day },
    { label: "Ryde", truth: row.truth.ryde, system: row.system?.ryde ?? null, variance: row.variances.ryde },
    { label: "Tips", truth: row.truth.tips, system: row.system?.tips ?? null, variance: row.variances.tips },
    { label: "Reimbursements", truth: row.truth.reimbursements, system: row.system?.reimbursements ?? null, variance: row.variances.reimbursements },
    { label: "TOTAL", truth: row.truth.total, system: row.system?.total ?? null, variance: row.variances.total },
  ];

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
      <DialogHeader>
        <DialogTitle className="text-base">{name}</DialogTitle>
        <DialogDescription className="flex items-center gap-2 flex-wrap">
          {statusBadge(row.classification.row_status)}
          {matchBadge(row.match.match_confidence, row.match.matched_by)}
          {row.match.match_notes && <span className="text-[10px] text-muted-foreground italic">{row.match.match_notes}</span>}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Identity */}
        {(row.truth.employer_identification || row.truth.verification_ssn_ein) && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            {row.truth.employer_identification && (
              <div><span className="text-muted-foreground">Employer ID: </span><span className="font-mono">{row.truth.employer_identification}</span></div>
            )}
            {row.truth.verification_ssn_ein && (
              <div><span className="text-muted-foreground">SSN/EIN: </span><span className="font-mono">{row.truth.verification_ssn_ein}</span></div>
            )}
          </div>
        )}

        {/* Component comparison */}
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[10px] py-2">Componente</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Truth</TableHead>
                <TableHead className="text-[10px] py-2 text-right">System</TableHead>
                <TableHead className="text-[10px] py-2 text-right">Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.map(c => {
                const hasIssue = c.variance != null && Math.abs(c.variance) > (c.isHours ? 0.1 : 1);
                return (
                  <TableRow key={c.label} className={c.label === "TOTAL" ? "bg-muted/20 font-semibold" : hasIssue ? "bg-destructive/5" : ""}>
                    <TableCell className="py-1.5 text-xs">{c.label}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-xs">{c.isHours ? fmtH(c.truth) : fmt(c.truth)}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-xs">{c.isHours ? fmtH(c.system) : fmt(c.system)}</TableCell>
                    <TableCell className="py-1.5 text-right text-xs">{varianceCell(c.variance, c.isHours ? 0.1 : 1)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Anomaly flags */}
        {row.anomaly_flags.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Anomalías</p>
            <div className="flex flex-wrap gap-1">
              {row.anomaly_flags.map(f => <Badge key={f} variant="destructive" className="text-[9px]">{f.replace(/_/g, " ")}</Badge>)}
            </div>
          </div>
        )}

        {/* Observaciones */}
        {row.truth.observaciones && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Observaciones</p>
            <p className="text-xs bg-muted/50 p-2 rounded border">{row.truth.observaciones}</p>
          </div>
        )}

        {/* System source info */}
        {row.system && (
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><span className="text-muted-foreground">Shifts: </span><span className="font-semibold">{row.system.shift_count}</span></div>
            <div><span className="text-muted-foreground">Clocks: </span><span className="font-semibold">{row.system.clock_count}</span></div>
            <div><span className="text-muted-foreground">Tags: </span><span className="font-mono text-[10px]">{row.system.source_tags.join(", ") || "—"}</span></div>
          </div>
        )}
      </div>
    </DialogContent>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function PayrollReconciliationPage() {
  usePageView("Payroll Reconciliation");
  const {
    batches, activeBatch, setActiveBatch,
    truthParseResult, reconciliationRows, systemOnlyEmployees, batchSummary,
    loading, processing,
    loadBatches, createBatch, uploadTruth,
    runReconciliationForBatch, approveBatch, lockBatch,
    exportCSV,
  } = usePayrollReconciliation();

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<ReconciliationRowResult | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
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

  const handleDownloadCSV = () => {
    const data = exportCSV(reconciliationRows);
    const csv = data.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliation_${activeBatch?.id?.slice(0, 8) || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Batch list view ────────────────────────────────────────────
  if (!activeBatch) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payroll Reconciliation" subtitle="Motor de auditoría y reconciliación de nómina" />

        <Button onClick={() => setShowCreateDialog(true)} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />Nuevo Batch
        </Button>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : batches.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-sm">No hay batches de reconciliación.</p>
              <p className="text-muted-foreground text-xs mt-1">Crea uno para comenzar a comparar truth vs sistema.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {batches.map(b => (
              <Card key={b.id} className="cursor-pointer hover:border-primary/30 transition-all" onClick={() => setActiveBatch(b)}>
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {batchStatusBadge(b.status)}
                    <div>
                      <p className="font-medium text-sm">{b.truth_source_file_name || "Sin archivo"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {b.employees_truth_count} empleados • {b.matched_count} matched • {b.critical_mismatch_count} críticos
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</p>
                    {b.total_variance_amount > 0 && <p className="text-sm font-mono text-destructive">{fmtVar(b.total_variance_amount)}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Nuevo Batch</DialogTitle>
              <DialogDescription>Se creará un batch donde podrás cargar el truth file y ejecutar la reconciliación.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleCreateBatch}>Crear</Button>
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 text-muted-foreground text-xs h-7" onClick={() => { setActiveBatch(null); setSearch(""); setFilter("all"); }}>
            ← Batches
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">Reconciliación</h1>
            {batchStatusBadge(activeBatch.status)}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{activeBatch.truth_source_file_name || "Sin archivo de verdad"}</p>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()} disabled={isLocked || processing}>
          <Upload className="h-3.5 w-3.5 mr-1" />Truth File
        </Button>
        <Button size="sm" className="h-8 text-xs" onClick={() => runReconciliationForBatch(activeBatch.id)} disabled={isLocked || processing || activeBatch.status === "DRAFT"}>
          {processing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
          Ejecutar
        </Button>
        {!isLocked && batchSummary && (
          <>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowApproveDialog(true)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Aprobar
            </Button>
            {activeBatch.status === "APPROVED" && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => lockBatch(activeBatch.id)}>
                <Lock className="h-3.5 w-3.5 mr-1" />Bloquear
              </Button>
            )}
          </>
        )}
        {reconciliationRows.length > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs ml-auto" onClick={handleDownloadCSV}>
            <FileText className="h-3.5 w-3.5 mr-1" />Exportar CSV
          </Button>
        )}
      </div>

      {/* KPI strip */}
      {batchSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiCard label="Empleados Truth" value={batchSummary.truth_count} icon={Users} />
          <KpiCard label="Matched" value={batchSummary.matched} subtitle={fmtPct(batchSummary.truth_count > 0 ? batchSummary.matched / batchSummary.truth_count : 0)} icon={UserCheck} accent="success" />
          <KpiCard label="Match exacto" value={batchSummary.exact_match} icon={CheckCircle2} accent="success" />
          <KpiCard label="Componente" value={batchSummary.component_mismatch} icon={AlertTriangle} accent={batchSummary.component_mismatch > 0 ? "warning" : "muted"} />
          <KpiCard label="Críticos" value={batchSummary.critical_mismatch} icon={AlertOctagon} accent={batchSummary.critical_mismatch > 0 ? "destructive" : "muted"} />
          <KpiCard label="Varianza Total" value={fmt(batchSummary.total_variance)} icon={TrendingUp} accent={batchSummary.total_variance > 10 ? "destructive" : batchSummary.total_variance > 1 ? "warning" : "success"} />
        </div>
      )}

      {/* Component summary cards */}
      {batchSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <SummaryCard label="Hours" truth={batchSummary.totals_truth.hours} system={batchSummary.totals_system.hours} variance={batchSummary.totals_variance.hours} tolerance={tolerance.hours} />
          <SummaryCard label="Total Pay" truth={batchSummary.totals_truth.total_pay} system={batchSummary.totals_system.total_pay} variance={batchSummary.totals_variance.total_pay} tolerance={tolerance.money} />
          <SummaryCard label="Pay/Day" truth={batchSummary.totals_truth.pay_per_day} system={batchSummary.totals_system.pay_per_day} variance={batchSummary.totals_variance.pay_per_day} tolerance={tolerance.money} />
          <SummaryCard label="Ryde" truth={batchSummary.totals_truth.ryde} system={batchSummary.totals_system.ryde} variance={batchSummary.totals_variance.ryde} tolerance={tolerance.money} />
          <SummaryCard label="Tips" truth={batchSummary.totals_truth.tips} system={batchSummary.totals_system.tips} variance={batchSummary.totals_variance.tips} tolerance={tolerance.tips} />
          <SummaryCard label="Reimb." truth={batchSummary.totals_truth.reimbursements} system={batchSummary.totals_system.reimbursements} variance={batchSummary.totals_variance.reimbursements} tolerance={tolerance.money} />
          <SummaryCard label="TOTAL" truth={batchSummary.totals_truth.grand_total} system={batchSummary.totals_system.grand_total} variance={batchSummary.totals_variance.grand_total} tolerance={tolerance.money} />
        </div>
      )}

      {/* Validation Report */}
      {batchSummary && (
        <ValidationReportPanel summary={batchSummary} parseResult={truthParseResult} />
      )}

      {/* Filters */}
      {reconciliationRows.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ({reconciliationRows.length})</SelectItem>
              <SelectItem value="exact">Match exacto ({reconciliationRows.filter(r => r.classification.is_exact_match).length})</SelectItem>
              <SelectItem value="mismatch">Parcial ({reconciliationRows.filter(r => r.classification.has_component_mismatch && !r.classification.has_critical_mismatch).length})</SelectItem>
              <SelectItem value="critical">Críticos ({reconciliationRows.filter(r => r.classification.has_critical_mismatch).length})</SelectItem>
              <SelectItem value="missing_system">Sin sistema ({reconciliationRows.filter(r => r.classification.row_status === "MISSING_IN_SYSTEM").length})</SelectItem>
              <SelectItem value="manual">Ajuste manual ({reconciliationRows.filter(r => r.classification.has_manual_adjustment).length})</SelectItem>
              <SelectItem value="low_confidence">Baja confianza ({reconciliationRows.filter(r => r.match.match_confidence > 0 && r.match.match_confidence < 80).length})</SelectItem>
              <SelectItem value="flags">Anomalías ({reconciliationRows.filter(r => r.anomaly_flags.length > 0).length})</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground ml-auto">{filteredRows.length} de {reconciliationRows.length} filas</p>
        </div>
      )}

      {/* Main grid */}
      {filteredRows.length > 0 && (
        <div className="border rounded-lg overflow-auto max-h-[55vh]">
          <Table>
            <TableHeader className="sticky top-0 z-30 bg-background">
              <TableRow className="text-[10px]">
                <TableHead className="sticky left-0 bg-background z-40 min-w-[160px] py-2">Empleado</TableHead>
                <TableHead className="py-2">Status</TableHead>
                <TableHead className="py-2">Match</TableHead>
                <TableHead className="text-right py-2">T.Hrs</TableHead>
                <TableHead className="text-right py-2">S.Hrs</TableHead>
                <TableHead className="text-right py-2">Δ</TableHead>
                <TableHead className="text-right py-2">T.Pay</TableHead>
                <TableHead className="text-right py-2">S.Pay</TableHead>
                <TableHead className="text-right py-2">Δ</TableHead>
                <TableHead className="text-right py-2">T.PPD</TableHead>
                <TableHead className="text-right py-2">Δ</TableHead>
                <TableHead className="text-right py-2">T.Ryde</TableHead>
                <TableHead className="text-right py-2">Δ</TableHead>
                <TableHead className="text-right py-2">T.Tips</TableHead>
                <TableHead className="text-right py-2">Δ</TableHead>
                <TableHead className="text-right py-2 font-bold">T.Total</TableHead>
                <TableHead className="text-right py-2 font-bold">S.Total</TableHead>
                <TableHead className="text-right py-2 font-bold">Δ Total</TableHead>
                <TableHead className="py-2 w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row, i) => (
                <TableRow
                  key={i}
                  className={`text-xs cursor-pointer hover:bg-accent/30 transition-colors ${row.classification.has_critical_mismatch ? "bg-destructive/5" : row.classification.is_exact_match ? "" : ""}`}
                  onClick={() => setSelectedRow(row)}
                >
                  <TableCell className="sticky left-0 bg-background z-10 py-1.5">
                    <div className="flex items-center gap-1">
                      <span className="font-medium truncate max-w-[140px]">{row.truth.first_name} {row.truth.last_name}</span>
                      {row.anomaly_flags.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger><Badge variant="destructive" className="text-[8px] px-1 py-0 h-3.5">{row.anomaly_flags.length}</Badge></TooltipTrigger>
                          <TooltipContent className="text-[10px] max-w-xs">{row.anomaly_flags.join(", ")}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5">{statusBadge(row.classification.row_status)}</TableCell>
                  <TableCell className="py-1.5">{matchBadge(row.match.match_confidence, row.match.matched_by)}</TableCell>
                  <TableCell className="text-right font-mono py-1.5">{fmtH(row.truth.total_hours)}</TableCell>
                  <TableCell className="text-right font-mono py-1.5">{fmtH(row.system?.total_hours)}</TableCell>
                  <TableCell className="text-right py-1.5">{varianceCell(row.variances.hours, tolerance.hours)}</TableCell>
                  <TableCell className="text-right font-mono py-1.5">{fmt(row.truth.total_pay)}</TableCell>
                  <TableCell className="text-right font-mono py-1.5">{fmt(row.system?.total_pay)}</TableCell>
                  <TableCell className="text-right py-1.5">{varianceCell(row.variances.total_pay, tolerance.money)}</TableCell>
                  <TableCell className="text-right font-mono py-1.5">{fmt(row.truth.pay_per_day)}</TableCell>
                  <TableCell className="text-right py-1.5">{varianceCell(row.variances.pay_per_day, tolerance.money)}</TableCell>
                  <TableCell className="text-right font-mono py-1.5">{fmt(row.truth.ryde)}</TableCell>
                  <TableCell className="text-right py-1.5">{varianceCell(row.variances.ryde, tolerance.money)}</TableCell>
                  <TableCell className="text-right font-mono py-1.5">{fmt(row.truth.tips)}</TableCell>
                  <TableCell className="text-right py-1.5">{varianceCell(row.variances.tips, tolerance.tips)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold py-1.5">{fmt(row.truth.total)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold py-1.5">{fmt(row.system?.total)}</TableCell>
                  <TableCell className="text-right font-semibold py-1.5">{varianceCell(row.variances.total, tolerance.money)}</TableCell>
                  <TableCell className="py-1.5">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* System-only employees */}
      {systemOnlyEmployees.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader className="py-2.5 px-4">
            <CardTitle className="text-xs flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              Solo en sistema — no en truth ({systemOnlyEmployees.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {systemOnlyEmployees.map(e => (
                <Badge key={e.employee_id} variant="outline" className="text-[10px]">{e.first_name} {e.last_name}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedRow} onOpenChange={() => setSelectedRow(null)}>
        {selectedRow && <RowDetailPanel row={selectedRow} onClose={() => setSelectedRow(null)} />}
      </Dialog>

      {/* Pre-approval dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        {batchSummary && (
          <PreApprovalSafetyPanel
            summary={batchSummary}
            onApprove={async () => { await approveBatch(activeBatch.id); setShowApproveDialog(false); }}
            onCancel={() => setShowApproveDialog(false)}
          />
        )}
      </Dialog>

      {/* Empty state */}
      {reconciliationRows.length === 0 && !processing && activeBatch.status !== "DRAFT" && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Carga un truth file y ejecuta la reconciliación.</p>
          </CardContent>
        </Card>
      )}

      {/* Processing state */}
      {processing && (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">Procesando reconciliación...</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
