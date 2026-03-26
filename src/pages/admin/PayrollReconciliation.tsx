import { useEffect, useState, useRef, useMemo } from "react";
import { getDefaultPayPeriod, sortPeriodsDesc } from "@/lib/pay-period-helpers";
import { supabase } from "@/integrations/supabase/client";
import { usePayrollReconciliation, type ReconciliationBatch } from "@/hooks/usePayrollReconciliation";
import type { ReconciliationRowResult, BatchSummary, TopIssue, MatchBreakdown } from "@/lib/payroll-reconciliation-engine";
import { usePageView } from "@/hooks/useAuditLog";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import BasePayReport from "@/components/reconciliation/BasePayReport";
import {
  Loader2, Upload, Play, CheckCircle2, Lock, AlertTriangle, XCircle,
  Search, FileText, Plus, Eye, Shield, AlertOctagon, Info, ChevronDown,
  ChevronUp, Users, TrendingUp, Hash, Link2, UserCheck, Fingerprint,
  Mail, Phone, Type, Sparkles, ShieldAlert, BarChart3, ArrowLeft,
  Download, Clock, DollarSign, Car, UtensilsCrossed, Receipt, ArrowUpDown
} from "lucide-react";

// ─── Formatting ──────────────────────────────────────────────────────

const fmt = (v: number | null | undefined) => v != null ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const fmtH = (v: number | null | undefined) => v != null ? v.toFixed(2) : "—";
const fmtVar = (v: number | null | undefined) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

const toAbsMoney = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.abs(value) : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.abs(n) : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? Math.abs(n) : 0;
};

const truthDiscount = (row: ReconciliationRowResult): number => {
  const raw = (row.truth.raw || {}) as Record<string, unknown>;
  return toAbsMoney(
    (row.truth as any).discount
      ?? raw.discount
      ?? raw.Discount
      ?? raw.descuentos
      ?? raw.Descuentos,
  );
};

const truthObservation = (row: ReconciliationRowResult): string => {
  const raw = (row.truth.raw || {}) as Record<string, unknown>;
  const rawObs = raw.observaciones
    ?? raw.Observaciones
    ?? raw.OBSERVACIONES
    ?? raw.observation
    ?? raw.observacion
    ?? raw.observations;
  const obs = row.truth.observaciones ?? (typeof rawObs === "string" ? rawObs : "");
  return typeof obs === "string" ? obs.trim() : "";
};

/* Removed hardcoded TARGET_TRUTH_PERIOD — all period references are now dynamic */

const formatPeriodLabel = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  const end = new Date(`${endDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  return `${start} → ${end}`;
};

// ─── Badge Helpers ───────────────────────────────────────────────────

function truthAuthoritativeStatus(row: ReconciliationRowResult): { label: string; variant: any; className: string } {
  // In truth-authoritative mode, if truth.total exists, the closure IS the truth
  if (row.truth.total != null) {
    const disc = truthDiscount(row);
    const adic = (row.truth.pay_per_day || 0) + (row.truth.ryde || 0) + (row.truth.tips || 0) + (row.truth.reimbursements || 0);
    const hasComposition = adic > 0 || disc > 0;
    if (hasComposition) {
      return { label: "✓ Composición OK", variant: "default", className: "bg-earning/15 text-earning border-earning/30" };
    }
    if (row.truth.total_hours != null && row.truth.total_pay != null && row.truth.total_hours > 0) {
      return { label: "✓ Base OK", variant: "default", className: "bg-earning/15 text-earning border-earning/30" };
    }
    return { label: "✓ Truth-validado", variant: "default", className: "bg-primary/15 text-primary border-primary/30" };
  }
  return { label: row.classification.row_status.replace(/_/g, " "), variant: "outline", className: "" };
}

function statusBadge(status: string, row?: ReconciliationRowResult) {
  if (row) {
    const ta = truthAuthoritativeStatus(row);
    return <Badge variant={ta.variant as any} className={`text-[10px] px-1.5 py-0 font-medium ${ta.className}`}>{ta.label}</Badge>;
  }
  const map: Record<string, { variant: any; label: string; className?: string }> = {
    EXACT_MATCH: { variant: "default", label: "Exacto", className: "bg-earning/15 text-earning border-earning/30 hover:bg-earning/20" },
    COMPONENT_MISMATCH: { variant: "default", label: "Parcial", className: "bg-warning/15 text-warning border-warning/30 hover:bg-warning/20" },
    CRITICAL_MISMATCH: { variant: "destructive", label: "Crítico" },
    MISSING_IN_SYSTEM: { variant: "destructive", label: "Sin sistema" },
    MISSING_IN_TRUTH: { variant: "default", label: "Sin truth", className: "bg-info/15 text-info border-info/30" },
    PENDING: { variant: "secondary", label: "Pendiente" },
    UNMATCHED: { variant: "destructive", label: "Sin match" },
    NEEDS_REVIEW: { variant: "default", label: "Revisión", className: "bg-warning/15 text-warning border-warning/30" },
  };
  const s = map[status] || { variant: "outline", label: status };
  return <Badge variant={s.variant as any} className={`text-[10px] px-1.5 py-0 font-medium ${s.className || ""}`}>{s.label}</Badge>;
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
  const cls = confidence >= 90
    ? "bg-earning/10 text-earning border-earning/25"
    : confidence >= 75
      ? "bg-warning/10 text-warning border-warning/25"
      : confidence > 0
        ? "bg-destructive/10 text-destructive border-destructive/25"
        : "bg-muted text-muted-foreground border-border";
  const labels: Record<string, string> = {
    employer_id: "ID", ssn_ein: "SSN", email: "Email", phone: "Tel",
    external_id: "ExtID", full_name_exact: "Nombre", alias: "Alias",
    fuzzy_name: "Fuzzy", none: "—",
  };
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${cls}`}>
          {matchMethodIcon(method)}
          {confidence > 0 ? `${confidence}%` : "—"}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        <p className="font-medium">Matched by: {labels[method] || method}</p>
        <p>Confianza: {confidence}%</p>
      </TooltipContent>
    </Tooltip>
  );
}

function deriveTruthStatus(dbStatus: string, tc?: { validated: number; pending: number; total: number }): string {
  if (tc && tc.total > 0 && tc.pending === 0) return "TRUTH_VALIDATED";
  if (tc && tc.total > 0 && tc.pending > 0) return "NEEDS_REVIEW";
  return dbStatus;
}

function batchStatusBadge(status: string, tc?: { validated: number; pending: number; total: number }, mode?: string) {
  const isHistorical = mode === "historical_truth_authoritative";
  const effective = deriveTruthStatus(status, tc);
  const map: Record<string, { icon: any; label: string; className: string }> = {
    DRAFT: { icon: FileText, label: "Borrador", className: "bg-muted text-muted-foreground border-border" },
    TRUTH_UPLOADED: { icon: Upload, label: "Truth cargado", className: "bg-info/15 text-info border-info/30" },
    TRUTH_VALIDATED: { icon: CheckCircle2, label: isHistorical ? "Histórico ✓" : "Truth-validado", className: "bg-earning/15 text-earning border-earning/30" },
    RECONCILED: { icon: CheckCircle2, label: "Reconciliado", className: "bg-earning/15 text-earning border-earning/30" },
    NEEDS_REVIEW: { icon: AlertTriangle, label: "Revisión", className: "bg-warning/15 text-warning border-warning/30" },
    CRITICAL: { icon: AlertOctagon, label: "Crítico", className: "bg-destructive/15 text-destructive border-destructive/30" },
    APPROVED: { icon: Shield, label: "Aprobado", className: "bg-earning/15 text-earning border-earning/30" },
    LOCKED: { icon: Lock, label: "Bloqueado", className: "bg-muted text-muted-foreground border-border" },
    MISMATCHED: { icon: AlertTriangle, label: "Discrepancias", className: "bg-warning/15 text-warning border-warning/30" },
  };
  const s = map[effective] || { icon: Info, label: effective, className: "bg-muted text-muted-foreground border-border" };
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.className}`}>
        <Icon className="h-3 w-3" />{s.label}
      </span>
      {isHistorical && (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-info/15 text-info border-info/30">
          <Clock className="h-3 w-3" />Modo Histórico
        </span>
      )}
    </span>
  );
}

function varianceCell(val: number | null | undefined, tolerance: number) {
  if (val == null) return <span className="text-muted-foreground/50">—</span>;
  const abs = Math.abs(val);
  const ok = abs <= tolerance;
  return (
    <span className={`tabular-nums ${ok ? "text-earning" : abs > tolerance * 5 ? "text-destructive font-semibold" : "text-warning font-medium"}`}>
      {fmtVar(val)}
    </span>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────

function KpiCard({ label, value, subtitle, icon: Icon, accent }: { label: string; value: string | number; subtitle?: string; icon: any; accent?: "success" | "warning" | "destructive" | "muted" }) {
  const styles = {
    success: { card: "border-earning/20 bg-gradient-to-br from-earning/[0.04] to-earning/[0.08]", icon: "bg-earning/12 text-earning", value: "text-earning" },
    warning: { card: "border-warning/20 bg-gradient-to-br from-warning/[0.04] to-warning/[0.08]", icon: "bg-warning/12 text-warning", value: "text-warning" },
    destructive: { card: "border-destructive/20 bg-gradient-to-br from-destructive/[0.04] to-destructive/[0.08]", icon: "bg-destructive/12 text-destructive", value: "text-destructive" },
    muted: { card: "border-border/60 bg-card", icon: "bg-muted text-muted-foreground", value: "text-foreground" },
  };
  const s = styles[accent || "muted"];
  return (
    <Card className={`${s.card} shadow-none`}>
      <CardContent className="p-3.5 flex items-start gap-3">
        <div className={`p-2 rounded-xl ${s.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
          <p className={`text-xl font-bold font-heading tabular-nums leading-tight mt-0.5 ${s.value}`}>{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-medium">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Component Summary Card ──────────────────────────────────────────

function SummaryCard({ label, truth, system, variance, tolerance, icon: Icon, isHistorical }: { label: string; truth: number; system: number; variance: number; tolerance: number; icon?: any; isHistorical?: boolean }) {
  const abs = Math.abs(variance);
  const ok = isHistorical || abs <= tolerance;
  const status = ok ? "earning" : abs > tolerance * 5 ? "destructive" : "warning";
  return (
    <Card className={`shadow-none border-${status}/20 hover:shadow-sm transition-shadow`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{label}</p>
          {Icon && <Icon className="h-3 w-3 text-muted-foreground/50" />}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Truth</span>
            <span className="font-mono font-semibold">{fmt(truth)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">{isHistorical ? "Mirror" : "System"}</span>
            <span className="font-mono font-semibold">{isHistorical ? <span className="text-earning">= Truth</span> : fmt(system)}</span>
          </div>
        </div>
        <div className={`flex items-center justify-between pt-1.5 border-t border-${status}/15`}>
          <span className="text-[10px] font-semibold text-muted-foreground">Δ Varianza</span>
          {isHistorical ? (
            <span className="text-[11px] font-semibold text-earning tabular-nums">$0.00</span>
          ) : varianceCell(variance, tolerance)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Validation Report ───────────────────────────────────────────────

function ValidationReportPanel({ summary, parseResult, truthCounts }: { summary: BatchSummary; parseResult?: { skipped_summary_rows: number; duplicate_names: string[]; parse_warnings: string[] } | null; truthCounts?: { validated: number; compositionOk: number; baseOk: number; pending: number; total: number } }) {
  const [expanded, setExpanded] = useState(false);
  const tc = truthCounts || { validated: summary.exact_match, compositionOk: 0, baseOk: summary.exact_match, pending: summary.critical_mismatch, total: summary.truth_count };
  const validatedRate = tc.total > 0 ? tc.validated / tc.total : 0;

  const mb = summary.match_breakdown;
  const matchMethods = [
    { label: "Employer ID", count: mb.by_employer_id, icon: Fingerprint, accent: "secondary" },
    { label: "SSN/EIN", count: mb.by_ssn, icon: Hash, accent: "secondary" },
    { label: "Email", count: mb.by_email, icon: Mail, accent: "secondary" },
    { label: "Phone", count: mb.by_phone, icon: Phone, accent: "secondary" },
    { label: "External ID", count: mb.by_external_id, icon: Link2, accent: "secondary" },
    { label: "Nombre exacto", count: mb.by_full_name_exact, icon: UserCheck, accent: "secondary" },
    { label: "Alias", count: mb.by_alias, icon: Sparkles, accent: "secondary" },
    { label: "Fuzzy", count: mb.by_fuzzy_name, icon: Type, accent: "warning" },
    { label: "Sin match", count: mb.unmatched, icon: XCircle, accent: "destructive" },
  ].filter(m => m.count > 0);

  return (
    <Card className="shadow-none border-primary/15">
      <button
        className="w-full py-3 px-4 flex items-center justify-between text-left hover:bg-accent/30 transition-colors rounded-t-2xl"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold font-heading">Reporte de Validación</p>
            <p className="text-[10px] text-muted-foreground">
              {tc.validated}/{tc.total} validados • {tc.compositionOk} composición • {tc.baseOk} base • {tc.pending} pendientes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <Progress value={validatedRate * 100} className="h-1.5 w-20" />
            <span className="text-xs font-semibold text-muted-foreground">{fmtPct(validatedRate)}</span>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <CardContent className="px-4 pb-4 pt-0 space-y-5 border-t border-border/50">
          {/* Progress bars */}
          <div className="grid grid-cols-2 gap-6 pt-4">
            <div>
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="text-muted-foreground font-medium">Truth Validados</span>
                <span className="font-bold">{fmtPct(validatedRate)}</span>
              </div>
              <Progress value={validatedRate * 100} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="text-muted-foreground font-medium">Con composición</span>
                <span className="font-bold">{fmtPct(tc.total > 0 ? tc.compositionOk / tc.total : 0)}</span>
              </div>
              <Progress value={tc.total > 0 ? (tc.compositionOk / tc.total) * 100 : 0} className="h-2" />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
            <StatMini label="Total empleados" value={tc.total} />
            <StatMini label="✓ Validados" value={tc.validated} accent="success" />
            <StatMini label="Composición OK" value={tc.compositionOk} accent="success" />
            <StatMini label="Base OK" value={tc.baseOk} accent="success" />
            <StatMini label="Pendientes" value={tc.pending} accent={tc.pending > 0 ? "warning" : "success"} />
          </div>

          <Separator className="bg-border/50" />

          {/* Match method breakdown */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">Método de match</p>
            <div className="flex flex-wrap gap-1.5">
              {matchMethods.map(m => (
                <span key={m.label} className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border ${
                  m.accent === "destructive" ? "bg-destructive/10 text-destructive border-destructive/20" :
                  m.accent === "warning" ? "bg-warning/10 text-warning border-warning/20" :
                  "bg-muted/50 text-muted-foreground border-border/60"
                }`}>
                  <m.icon className="h-3 w-3" />
                  {m.label}: <span className="font-bold">{m.count}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Parse info */}
          {parseResult && (
            <>
              <Separator className="bg-border/50" />
              <div className="grid grid-cols-3 gap-4">
                <StatMini label="Filas totales saltadas" value={parseResult.skipped_summary_rows} />
                <StatMini label="Nombres duplicados" value={parseResult.duplicate_names.length} accent={parseResult.duplicate_names.length > 0 ? "warning" : undefined} />
                <StatMini label="Advertencias" value={parseResult.parse_warnings.length} accent={parseResult.parse_warnings.length > 0 ? "warning" : undefined} />
              </div>
              {parseResult.duplicate_names.length > 0 && (
                <div className="text-[11px] text-warning bg-warning/8 rounded-lg p-2.5 border border-warning/15">
                  <span className="font-semibold">Duplicados:</span> {parseResult.duplicate_names.join(", ")}
                </div>
              )}
            </>
          )}

          {/* Top Issues */}
          {summary.top_issues.length > 0 && (
            <>
              <Separator className="bg-border/50" />
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">Problemas principales</p>
                <div className="space-y-1.5">
                  {summary.top_issues.map((issue, i) => (
                    <div key={i} className={`flex items-center justify-between text-[11px] px-3 py-2 rounded-lg border ${
                      issue.severity === "critical" ? "bg-destructive/6 border-destructive/15 text-destructive" :
                      issue.severity === "warning" ? "bg-warning/6 border-warning/15 text-warning" :
                      "bg-muted/40 border-border/40 text-muted-foreground"
                    }`}>
                      <div className="flex items-center gap-2">
                        {issue.severity === "critical" ? <AlertOctagon className="h-3.5 w-3.5" /> : issue.severity === "warning" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
                        <span className="font-medium">{issue.label}</span>
                      </div>
                      <span className="font-bold text-xs">{issue.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Anomaly summary */}
          {Object.keys(summary.anomaly_summary).length > 0 && (
            <>
              <Separator className="bg-border/50" />
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">Anomalías detectadas</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(summary.anomaly_summary).sort((a, b) => b[1] - a[1]).map(([flag, count]) => (
                    <Badge key={flag} variant="outline" className="text-[9px] gap-1 font-normal">
                      {flag.replace(/_/g, " ")} <span className="font-bold">{count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Variance totals */}
          <Separator className="bg-border/50" />
          <div className="grid grid-cols-2 gap-4 text-[11px]">
            <div className="flex justify-between items-center p-2 rounded-md bg-muted/30">
              <span className="text-muted-foreground font-medium">Varianza total horas</span>
              {varianceCell(summary.totals_variance.hours, 0.1)}
            </div>
            <div className="flex justify-between items-center p-2 rounded-md bg-muted/30">
              <span className="text-muted-foreground font-medium">Varianza grand total</span>
              {varianceCell(summary.totals_variance.grand_total, 1)}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function StatMini({ label, value, accent }: { label: string; value: number | string; accent?: "success" | "warning" | "destructive" }) {
  const color = accent === "success" ? "text-earning" : accent === "warning" ? "text-warning" : accent === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="space-y-0.5">
      <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">{label}</p>
      <p className={`text-lg font-bold font-heading tabular-nums ${color}`}>{value}</p>
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
        <DialogTitle className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl ${hasBlockers ? "bg-warning/12" : "bg-earning/12"}`}>
            <ShieldAlert className={`h-5 w-5 ${hasBlockers ? "text-warning" : "text-earning"}`} />
          </div>
          Verificación pre-aprobación
        </DialogTitle>
        <DialogDescription>Revisa los indicadores antes de aprobar el batch.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2.5">
        {checks.map((c, i) => (
          <div key={i} className={`flex items-center justify-between p-3 rounded-xl border text-sm transition-colors ${c.ok ? "border-earning/25 bg-earning/5" : "border-destructive/25 bg-destructive/5"}`}>
            <div className="flex items-center gap-2.5">
              {c.ok ? <CheckCircle2 className="h-4 w-4 text-earning" /> : <AlertOctagon className="h-4 w-4 text-destructive" />}
              <span className="font-medium">{c.label}</span>
            </div>
            <span className={`font-mono font-bold ${c.ok ? "text-earning" : "text-destructive"}`}>{c.value}</span>
          </div>
        ))}
      </div>
      {hasBlockers && (
        <div className="bg-warning/8 border border-warning/20 rounded-xl p-3.5 text-xs text-warning flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Existen problemas críticos sin resolver. Aprobar de todas formas registrará un override en la auditoría.</span>
        </div>
      )}
      <DialogFooter className="gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="rounded-xl">Cancelar</Button>
        <Button onClick={onApprove} variant={hasBlockers ? "destructive" : "default"} className="rounded-xl">
          {hasBlockers ? "Aprobar con advertencias" : "Aprobar batch"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────

function RowDetailPanel({ row, onClose }: { row: ReconciliationRowResult; onClose: () => void }) {
  const name = `${row.truth.first_name} ${row.truth.last_name}`;

  const hrs = row.truth.total_hours;
  const basePay = row.truth.total_pay || 0;
  const rate = hrs && hrs > 0 && basePay > 0 ? Math.round((basePay / hrs) * 100) / 100 : null;
  const ppd = row.truth.pay_per_day || 0;
  const ryde = row.truth.ryde || 0;
  const tips = row.truth.tips || 0;
  const reimb = row.truth.reimbursements || 0;
  const disc = truthDiscount(row);
  const travelHrs = Number(row.truth.raw?.travel_hours ?? 0);
  const otros = Number(row.truth.raw?.otros ?? 0);
  const adicionales = ppd + ryde + tips + reimb + travelHrs + otros;
  const total = row.truth.total;
  const obs = truthObservation(row);

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto p-0">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 px-6 pt-6 pb-4 border-b border-border/50">
        <DialogHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-heading">{name}</DialogTitle>
          </div>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            {statusBadge(row.classification.row_status, row)}
            {matchBadge(row.match.match_confidence, row.match.matched_by)}
            {row.match.match_notes && <span className="text-[10px] text-muted-foreground/70 italic">{row.match.match_notes}</span>}
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Identity */}
        {(row.truth.employer_identification || row.truth.verification_ssn_ein) && (
          <div className="grid grid-cols-2 gap-3">
            {row.truth.employer_identification && (
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">Employer ID</p>
                <p className="font-mono text-sm font-semibold mt-0.5">{row.truth.employer_identification}</p>
              </div>
            )}
            {row.truth.verification_ssn_ein && (
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40">
                <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">SSN / EIN</p>
                <p className="font-mono text-sm font-semibold mt-0.5">{row.truth.verification_ssn_ein}</p>
              </div>
            )}
          </div>
        )}

        {/* 4-Block Composition */}
        <div className="space-y-3">
          {/* A. Base por horas */}
          <div className="rounded-lg border border-border/50 p-4">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-3">A. Base por horas</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground">Horas</p>
                <p className="font-mono text-lg font-bold">{hrs != null ? hrs.toFixed(2) : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Tarifa/h</p>
                <p className="font-mono text-lg font-bold">{rate != null ? `$${rate.toFixed(2)}` : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">= Pago Base</p>
                <p className="font-mono text-lg font-bold">{fmt(basePay)}</p>
              </div>
            </div>
            {hrs != null && rate != null && (
              <p className="text-[10px] text-muted-foreground mt-2 font-mono">{hrs.toFixed(2)}h × ${rate.toFixed(2)}/h = {fmt(basePay)}</p>
            )}
          </div>

          {/* B. Adicionales */}
          {adicionales > 0 && (
            <div className="rounded-lg border border-earning/30 bg-earning/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-widest font-bold text-earning mb-3">B. Adicionales (+${adicionales.toFixed(2)})</p>
              <div className="grid grid-cols-3 gap-3">
                {ppd > 0 && <div><p className="text-[10px] text-muted-foreground">Pay Per Day</p><p className="font-mono font-semibold">{fmt(ppd)}</p></div>}
                {ryde > 0 && <div><p className="text-[10px] text-muted-foreground">Ryde</p><p className="font-mono font-semibold">{fmt(ryde)}</p></div>}
                {tips > 0 && <div><p className="text-[10px] text-muted-foreground">Tips</p><p className="font-mono font-semibold">{fmt(tips)}</p></div>}
                {reimb > 0 && <div><p className="text-[10px] text-muted-foreground">Reimbursements</p><p className="font-mono font-semibold">{fmt(reimb)}</p></div>}
                {travelHrs > 0 && <div><p className="text-[10px] text-muted-foreground">Travel Hours</p><p className="font-mono font-semibold">{fmt(travelHrs)}</p></div>}
                {otros > 0 && <div><p className="text-[10px] text-muted-foreground">Otros</p><p className="font-mono font-semibold">{fmt(otros)}</p></div>}
              </div>
            </div>
          )}

          {/* C. Descuentos */}
          {disc > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-widest font-bold text-destructive mb-2">C. Descuentos (−${disc.toFixed(2)})</p>
              <p className="font-mono text-lg font-bold text-destructive">−{fmt(disc)}</p>
            </div>
          )}

          {/* D. Total final */}
          <div className="rounded-lg border-2 border-primary/40 bg-primary/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-widest font-bold text-primary mb-2">D. Total Final</p>
            <p className="font-mono text-2xl font-black">{fmt(total)}</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {basePay > 0 ? fmt(basePay) : "$0"}
              {adicionales > 0 ? ` + $${adicionales.toFixed(2)}` : ""}
              {disc > 0 ? ` − $${disc.toFixed(2)}` : ""}
              {" = "}{fmt(total)}
            </p>
          </div>
        </div>

        {/* Anomaly flags */}
        {row.anomaly_flags.length > 0 && (
          <div>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Anomalías</p>
            <div className="flex flex-wrap gap-1">
              {row.anomaly_flags.map(f => (
                <span key={f} className="inline-flex text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive border border-destructive/15">
                  {f.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Observaciones */}
        {obs && (
          <div>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Observaciones</p>
            <p className="text-xs bg-muted/40 p-3 rounded-lg border border-border/40 leading-relaxed">{obs}</p>
          </div>
        )}

        {/* System source info */}
        {row.system && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Shifts", value: row.system.shift_count },
              { label: "Clocks", value: row.system.clock_count },
              { label: "Tags", value: row.system.source_tags.join(", ") || "—" },
            ].map(item => (
              <div key={item.label} className="p-2.5 rounded-lg bg-muted/30 border border-border/30 text-center">
                <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">{item.label}</p>
                <p className="font-semibold text-sm mt-0.5 font-mono">{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DialogContent>
  );
}

// ─── Debug Panel ─────────────────────────────────────────────────────

function DebugPanel({ companyId, batch, batchSummary, reconciliationRows }: {
  companyId: string;
  batch: ReconciliationBatch;
  batchSummary: BatchSummary | null;
  reconciliationRows: ReconciliationRowResult[];
}) {
  const [info, setInfo] = useState<{
    periodId: string | null;
    basePay: number;
    movements: number;
    truthRows: number;
    employees: number;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!companyId || !batch.payroll_period_start) {
      setInfo({ periodId: null, basePay: 0, movements: 0, truthRows: 0, employees: 0 });
      return;
    }
    async function load() {
      // Find real period ID
      const { data: periods } = await supabase
        .from("pay_periods")
        .select("id")
        .eq("company_id", companyId)
        .lte("start_date", batch.payroll_period_end || batch.payroll_period_start!)
        .gte("end_date", batch.payroll_period_start!);
      const pid = periods?.[0]?.id || null;
      if (!pid) {
        setInfo({ periodId: null, basePay: 0, movements: 0, truthRows: 0, employees: 0 });
        return;
      }
      const [{ count: bp }, { count: mv }, { count: tr }, { count: emp }] = await Promise.all([
        supabase.from("period_base_pay").select("id", { count: "exact", head: true }).eq("period_id", pid).eq("company_id", companyId),
        supabase.from("movements").select("id", { count: "exact", head: true }).eq("period_id", pid).eq("company_id", companyId),
        supabase.from("reconciliation_employee_rows").select("id", { count: "exact", head: true }).eq("batch_id", batch.id),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("is_active", true),
      ]);
      setInfo({ periodId: pid, basePay: bp || 0, movements: mv || 0, truthRows: tr || 0, employees: emp || 0 });
    }
    load();
  }, [companyId, batch.id, batch.payroll_period_start]);

  if (!info) return null;

  const hasPeriod = !!batch.payroll_period_start;
  const hasData = info.basePay > 0 || info.movements > 0;
  const hasTruth = info.truthRows > 0;

  return (
    <Card className={`shadow-none border-dashed ${!hasPeriod ? "border-destructive/40 bg-destructive/[0.03]" : !hasData ? "border-warning/40 bg-warning/[0.03]" : "border-info/40 bg-info/[0.03]"}`}>
      <button className="w-full px-4 py-2.5 flex items-center justify-between text-left" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Debug: Conectividad de datos</span>
          {!hasPeriod && <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Sin periodo</Badge>}
          {hasPeriod && !hasData && <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-warning/40 text-warning">Sin datos</Badge>}
          {hasPeriod && hasData && <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-earning/40 text-earning">Conectado</Badge>}
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {expanded && (
        <CardContent className="pt-0 pb-3 px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            <div className="p-2 rounded-md bg-background border border-border/40">
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">Company</p>
              <p className="font-mono text-[10px] truncate mt-0.5">{companyId.slice(0, 12)}...</p>
            </div>
            <div className="p-2 rounded-md bg-background border border-border/40">
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">Period ID</p>
              <p className={`font-mono text-[10px] truncate mt-0.5 ${info.periodId ? "" : "text-destructive font-bold"}`}>{info.periodId ? info.periodId.slice(0, 12) + "..." : "NO PERIOD LINKED"}</p>
            </div>
            <div className="p-2 rounded-md bg-background border border-border/40">
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">Period dates</p>
              <p className="font-mono text-[10px] mt-0.5">{batch.payroll_period_start || "—"} → {batch.payroll_period_end || "—"}</p>
            </div>
            <div className="p-2 rounded-md bg-background border border-border/40">
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">Batch status</p>
              <p className="font-mono text-[10px] mt-0.5">{deriveTruthStatus(batch.status, info.truthRows > 0 ? { validated: info.truthRows, pending: 0, total: info.truthRows } : undefined)} <span className="text-muted-foreground">({batch.status})</span></p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-2 text-[11px]">
            <div className={`p-2 rounded-md border ${info.truthRows > 0 ? "bg-earning/5 border-earning/20" : "bg-muted/30 border-border/40"}`}>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">Truth rows</p>
              <p className="font-bold text-lg tabular-nums mt-0.5">{info.truthRows}</p>
              <p className="text-[9px] text-muted-foreground">{hasTruth ? "✓ Cargado" : "Pendiente subir"}</p>
            </div>
            <div className={`p-2 rounded-md border ${info.basePay > 0 ? "bg-earning/5 border-earning/20" : "bg-warning/5 border-warning/20"}`}>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">Base pay rows</p>
              <p className="font-bold text-lg tabular-nums mt-0.5">{info.basePay}</p>
              <p className="text-[9px] text-muted-foreground">{info.basePay > 0 ? "✓ Disponible" : "⚠ Vacío"}</p>
            </div>
            <div className={`p-2 rounded-md border ${info.movements > 0 ? "bg-earning/5 border-earning/20" : "bg-muted/30 border-border/40"}`}>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">Movements</p>
              <p className="font-bold text-lg tabular-nums mt-0.5">{info.movements}</p>
              <p className="text-[9px] text-muted-foreground">{info.movements > 0 ? "✓ Componentes" : "Sin novedades"}</p>
            </div>
            <div className="p-2 rounded-md bg-muted/30 border border-border/40">
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">System employees</p>
              <p className="font-bold text-lg tabular-nums mt-0.5">{info.employees}</p>
              <p className="text-[9px] text-muted-foreground">Activos en roster</p>
            </div>
          </div>
          {batchSummary && (
            <div className="grid grid-cols-3 gap-3 mt-2 text-[11px]">
              <div className="p-2 rounded-md bg-background border border-border/40">
                <p className="text-[9px] text-muted-foreground uppercase font-semibold">Truth Grand Total</p>
                <p className="font-mono font-bold mt-0.5">{fmt(batchSummary.totals_truth.grand_total)}</p>
              </div>
              <div className="p-2 rounded-md bg-background border border-border/40">
                <p className="text-[9px] text-muted-foreground uppercase font-semibold">System Grand Total</p>
                <p className="font-mono font-bold mt-0.5">{fmt(batchSummary.totals_system.grand_total)}</p>
              </div>
              <div className={`p-2 rounded-md border ${Math.abs(batchSummary.totals_variance.grand_total) < 10 ? "bg-earning/5 border-earning/20" : "bg-destructive/5 border-destructive/20"}`}>
                <p className="text-[9px] text-muted-foreground uppercase font-semibold">Variance</p>
                <p className="font-mono font-bold mt-0.5">{fmtVar(batchSummary.totals_variance.grand_total)}</p>
              </div>
            </div>
          )}
          {!hasPeriod && (
            <div className="mt-2 p-2 rounded-md bg-destructive/8 border border-destructive/15 text-[10px] text-destructive">
              <strong>⚠ Batch sin periodo:</strong> Este batch fue creado sin vincular a un periodo de nómina. El sistema no puede cargar period_base_pay ni movements. Crea un nuevo batch seleccionando un periodo.
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function PayrollReconciliationPage() {
  usePageView("Payroll Reconciliation");
  const { selectedCompanyId } = useCompany();
  const { role } = useAuth();
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
  const [periods, setPeriods] = useState<{ id: string; start_date: string; end_date: string; status: string }[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [periodSearch, setPeriodSearch] = useState("");
  const [debugInfo, setDebugInfo] = useState<{ basePay: number; movements: number; truthRows: number; periodId: string } | null>(null);
  const isDev = role === "developer" || role === "owner" || role === "admin";

  // Load periods for the create dialog
  useEffect(() => {
    if (!selectedCompanyId) return;
    let mounted = true;

    const loadPeriods = async () => {
      const { data } = await supabase.from("pay_periods").select("id, start_date, end_date, status")
        .eq("company_id", selectedCompanyId)
        .order("start_date", { ascending: false })
        .limit(100);

      if (!mounted) return;

      const list = (data || []) as { id: string; start_date: string; end_date: string; status: string }[];
      const sorted = sortPeriodsDesc(list);
      setPeriods(sorted);
      setSelectedPeriodId(getDefaultPayPeriod(sorted)?.id || "");
    };

    loadPeriods();

    return () => {
      mounted = false;
    };
  }, [selectedCompanyId]);

  const selectedPeriod = useMemo(
    () => periods.find(p => p.id === selectedPeriodId) || null,
    [periods, selectedPeriodId],
  );

  const filteredPeriods = useMemo(() => {
    const normalized = periodSearch.trim().toLowerCase();
    const sorted = sortPeriodsDesc(periods);
    if (!normalized) return sorted;

    return sorted.filter((p) => {
      const label = formatPeriodLabel(p.start_date, p.end_date).toLowerCase();
      const searchable = `${p.start_date} ${p.end_date} ${p.status} ${label}`.toLowerCase();
      return searchable.includes(normalized);
    });
  }, [periods, periodSearch]);

  useEffect(() => {
    if (!showCreateDialog) return;
    if (selectedPeriodId) return;
    if (periods.length > 0) setSelectedPeriodId(getDefaultPayPeriod(periods)?.id || "");
  }, [showCreateDialog, periods, selectedPeriodId]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  // ─── Truth-authoritative reclassification ─────────────────────────
  // Rows with a valid truth.total are considered "validated" regardless of engine classification
  const truthCounts = useMemo(() => {
    let validated = 0;
    let compositionOk = 0;
    let baseOk = 0;
    let pending = 0;

    for (const row of reconciliationRows) {
      if (row.truth.total != null) {
        validated++;
        const disc = truthDiscount(row);
        const adic = (row.truth.pay_per_day || 0) + (row.truth.ryde || 0) + (row.truth.tips || 0) + (row.truth.reimbursements || 0);
        if (adic > 0 || disc > 0) compositionOk++;
        else if (row.truth.total_hours != null && row.truth.total_hours > 0) baseOk++;
      } else {
        pending++;
      }
    }
    return { validated, compositionOk, baseOk, pending, total: reconciliationRows.length };
  }, [reconciliationRows]);

  // Truth-authoritative filter helper
  const isTruthValidated = (row: ReconciliationRowResult) => row.truth.total != null;
  const hasComposition = (row: ReconciliationRowResult) => {
    const disc = truthDiscount(row);
    const adic = (row.truth.pay_per_day || 0) + (row.truth.ryde || 0) + (row.truth.tips || 0) + (row.truth.reimbursements || 0);
    return adic > 0 || disc > 0;
  };

  const filteredRows = useMemo(() => {
    let rows = reconciliationRows;
    if (filter === "validated") rows = rows.filter(r => isTruthValidated(r));
    if (filter === "composition") rows = rows.filter(r => hasComposition(r));
    if (filter === "base_only") rows = rows.filter(r => isTruthValidated(r) && !hasComposition(r) && (r.truth.total_hours || 0) > 0);
    if (filter === "pending") rows = rows.filter(r => !isTruthValidated(r));
    if (filter === "missing_system") rows = rows.filter(r => r.classification.row_status === "MISSING_IN_SYSTEM");
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
    const period = periods.find(p => p.id === selectedPeriodId);
    if (!period) return;
    const batch = await createBatch(period.start_date, period.end_date);
    setShowCreateDialog(false);
    // Load debug info for this period
    if (batch && selectedCompanyId) {
      const [{ count: bpCount }, { count: movCount }] = await Promise.all([
        supabase.from("period_base_pay").select("id", { count: "exact", head: true }).eq("period_id", selectedPeriodId).eq("company_id", selectedCompanyId),
        supabase.from("movements").select("id", { count: "exact", head: true }).eq("period_id", selectedPeriodId).eq("company_id", selectedCompanyId),
      ]);
      setDebugInfo({ basePay: bpCount || 0, movements: movCount || 0, truthRows: 0, periodId: selectedPeriodId });
    }
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

  /* Removed hardcoded exact period shortcut */

  // ─── Batch list view ────────────────────────────────────────────
  if (!activeBatch) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Payroll Reconciliation" subtitle="Motor de auditoría y reconciliación de nómina" />
          <div className="flex items-center gap-2">
            {false && (
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5">
                <Clock className="h-4 w-4" />Placeholder
              </Button>
            )}
            <Button onClick={() => setShowCreateDialog(true)} size="sm" className="rounded-xl gap-1.5">
              <Plus className="h-4 w-4" />Nuevo Batch
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Cargando batches...</p>
          </div>
        ) : batches.length === 0 ? (
          <Card className="border-dashed border-2 shadow-none">
            <CardContent className="py-20 flex flex-col items-center text-center">
              <div className="p-4 rounded-2xl bg-muted/50 mb-4">
                <FileText className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-muted-foreground font-medium">No hay batches de reconciliación</p>
              <p className="text-muted-foreground/70 text-sm mt-1 max-w-sm">Crea uno para comenzar a comparar el truth file contra los datos del sistema.</p>
              <Button onClick={() => setShowCreateDialog(true)} size="sm" className="mt-4 rounded-xl gap-1.5">
                <Plus className="h-4 w-4" />Crear primer batch
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {batches.map(b => (
              <Card key={b.id} className="cursor-pointer hover:border-primary/30 hover:shadow-md transition-all shadow-none group" onClick={() => setActiveBatch(b)}>
                <CardContent className="py-3.5 px-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {batchStatusBadge(b.status, b.employees_truth_count > 0 ? { validated: b.employees_truth_count, pending: b.critical_mismatch_count || 0, total: b.employees_truth_count } : undefined, (b as any).reconciliation_mode)}
                    <div>
                      <p className="font-medium text-sm group-hover:text-primary transition-colors">
                        {b.truth_source_file_name || "Sin archivo"}
                        {b.payroll_period_start && <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">({b.payroll_period_start} → {b.payroll_period_end})</span>}
                        {!b.payroll_period_start && <span className="ml-1.5 text-[10px] text-destructive">⚠ sin periodo</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {b.employees_truth_count} empleados • {b.matched_count} matched • Health: {b.health_grade || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div>
                      <p className="text-[11px] text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</p>
                      {b.total_variance_amount > 0 && <p className="text-sm font-mono font-semibold text-destructive">{fmtVar(b.total_variance_amount)}</p>}
                    </div>
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary/50 transition-colors" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nuevo Batch de Reconciliación</DialogTitle>
              <DialogDescription>Selecciona el periodo de nómina y luego carga el truth file para comparar.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Periodo de nómina</label>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={periodSearch}
                      onChange={(e) => setPeriodSearch(e.target.value)}
                      placeholder="Buscar por fecha o etiqueta"
                      className="h-9 text-xs pl-8 rounded-lg"
                    />
                  </div>


                  <div className="rounded-lg border border-border/50 bg-background overflow-hidden">
                    <ScrollArea className="h-52">
                      <div className="p-1.5 space-y-1">
                        {filteredPeriods.length === 0 ? (
                          <div className="px-2 py-3 text-xs text-muted-foreground">No hay periodos que coincidan con la búsqueda.</div>
                        ) : (
                          filteredPeriods.map((p) => {
                            const isSelected = selectedPeriodId === p.id;
                            const isExact = false;

                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setSelectedPeriodId(p.id)}
                                className={`w-full text-left px-2.5 py-2 rounded-md border transition-colors ${
                                  isSelected
                                    ? "bg-primary/10 border-primary/30"
                                    : "bg-background border-transparent hover:bg-muted/50"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium">
                                    {p.start_date} → {p.end_date}
                                  </p>
                                  <div className="flex items-center gap-1">
                                    {isExact && (
                                      <Badge className="text-[9px] px-1.5 py-0 bg-info/15 text-info border-info/30">Truth target</Badge>
                                    )}
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 uppercase">
                                      {p.status}
                                    </Badge>
                                  </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {formatPeriodLabel(p.start_date, p.end_date)}
                                </p>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </div>
              {selectedPeriodId && (
                <div className="p-3 rounded-lg bg-muted/40 border border-border/40 text-xs space-y-1">
                  <p className="font-medium text-muted-foreground">El sistema comparará los datos de este periodo contra el truth file que cargues.</p>
                  <p className="text-muted-foreground/70">Fuentes: period_base_pay + movements del periodo seleccionado.</p>
                  {selectedPeriod && (
                    <p className="text-muted-foreground/70 font-mono text-[11px]">Periodo activo: {selectedPeriod.start_date} → {selectedPeriod.end_date}</p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(false)} className="rounded-xl">Cancelar</Button>
              <Button size="sm" onClick={handleCreateBatch} className="rounded-xl" disabled={!selectedPeriodId}>Crear</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Active batch view ───────────────────────────────────────────
  const isLocked = activeBatch.status === "LOCKED" || activeBatch.status === "APPROVED";
  const tolerance = { hours: activeBatch.tolerance_hours, money: activeBatch.tolerance_money, tips: activeBatch.tolerance_tips };
  const isHistorical = (activeBatch as any).reconciliation_mode === "historical_truth_authoritative";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            onClick={() => { setActiveBatch(null); setSearch(""); setFilter("all"); }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Todos los batches</span>
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold font-heading">Reconciliación</h1>
            {batchStatusBadge(activeBatch.status, truthCounts, (activeBatch as any).reconciliation_mode)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {activeBatch.truth_source_file_name || "Sin archivo de verdad"}
            {activeBatch.payroll_period_start && (
              <span className="ml-2 font-mono text-[10px] bg-muted/50 px-1.5 py-0.5 rounded">
                {activeBatch.payroll_period_start} → {activeBatch.payroll_period_end}
              </span>
            )}
            {!activeBatch.payroll_period_start && (
              <span className="ml-2 text-[10px] text-destructive font-medium">⚠ Sin periodo vinculado</span>
            )}
          </p>
        </div>
      </div>

      {/* Actions bar */}
      <Card className="shadow-none bg-muted/20 border-border/40">
        <CardContent className="py-2.5 px-4 flex items-center gap-2 flex-wrap">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={isLocked || processing}>
            <Upload className="h-3.5 w-3.5" />Truth File
          </Button>
          <Button size="sm" className="h-8 text-xs rounded-lg gap-1.5" onClick={() => runReconciliationForBatch(activeBatch.id)} disabled={isLocked || processing || activeBatch.status === "DRAFT"}>
            {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Ejecutar
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Historical mode toggle */}
          {!isLocked && (
            <Button
              size="sm"
              variant={isHistorical ? "default" : "outline"}
              className={`h-8 text-xs rounded-lg gap-1.5 ${isHistorical ? "bg-info hover:bg-info/90 text-info-foreground" : ""}`}
              onClick={async () => {
                const newMode = isHistorical ? "standard" : "historical_truth_authoritative";
                await supabase.from("reconciliation_batches").update({ reconciliation_mode: newMode } as any).eq("id", activeBatch.id);
                setActiveBatch({ ...activeBatch, reconciliation_mode: newMode } as any);
              }}
            >
              <Clock className="h-3.5 w-3.5" />
              {isHistorical ? "Modo Histórico ✓" : "Modo Histórico"}
            </Button>
          )}

          <Separator orientation="vertical" className="h-5 mx-1" />

          {!isLocked && batchSummary && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs rounded-lg gap-1.5" onClick={() => setShowApproveDialog(true)}>
                <CheckCircle2 className="h-3.5 w-3.5" />Aprobar
              </Button>
              {activeBatch.status === "APPROVED" && (
                <Button size="sm" variant="outline" className="h-8 text-xs rounded-lg gap-1.5" onClick={() => lockBatch(activeBatch.id)}>
                  <Lock className="h-3.5 w-3.5" />Bloquear
                </Button>
              )}
            </>
          )}

          {reconciliationRows.length > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs rounded-lg gap-1.5 ml-auto" onClick={handleDownloadCSV}>
              <Download className="h-3.5 w-3.5" />Exportar CSV
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Debug Panel — visible to dev/admin/owner */}
      {isDev && activeBatch && (
        <DebugPanel
          companyId={selectedCompanyId || ""}
          batch={activeBatch}
          batchSummary={batchSummary}
          reconciliationRows={reconciliationRows}
        />
      )}

      {/* KPI strip */}
      {batchSummary && (
        <>
          {/* Historical mode banner */}
          {isHistorical && (
            <Card className="shadow-none border-info/30 bg-info/[0.06]">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-info/12">
                  <Clock className="h-4 w-4 text-info" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-info">Modo Histórico — Truth Autoritativo</p>
                  <p className="text-[11px] text-muted-foreground">Periodo pre-cutover. System = mirror de Truth. Varianzas = $0. Solo se valida identidad y composición.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Empleados Truth" value={truthCounts.total} icon={Users} />
            <KpiCard label="✓ Validados" value={truthCounts.validated} subtitle={fmtPct(truthCounts.total > 0 ? truthCounts.validated / truthCounts.total : 0)} icon={CheckCircle2} accent="success" />
            <KpiCard label="Composición OK" value={truthCounts.compositionOk} icon={CheckCircle2} accent="success" />
            <KpiCard label="Base OK" value={truthCounts.baseOk} icon={CheckCircle2} accent={truthCounts.baseOk > 0 ? "success" : "muted"} />
            <KpiCard label="Pendientes" value={truthCounts.pending} icon={AlertOctagon} accent={truthCounts.pending > 0 ? "warning" : "muted"} />
            <KpiCard label="Grand Total" value={fmt(batchSummary.totals_truth.grand_total)} icon={DollarSign} accent="success" />
          </div>
        </>
      )}

      {/* Component summary cards */}
      {batchSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <SummaryCard label="Hours" truth={batchSummary.totals_truth.hours} system={batchSummary.totals_system.hours} variance={batchSummary.totals_variance.hours} tolerance={tolerance.hours} icon={Clock} isHistorical={isHistorical} />
          <SummaryCard label="Total Pay" truth={batchSummary.totals_truth.total_pay} system={batchSummary.totals_system.total_pay} variance={batchSummary.totals_variance.total_pay} tolerance={tolerance.money} icon={DollarSign} isHistorical={isHistorical} />
          <SummaryCard label="Pay/Day" truth={batchSummary.totals_truth.pay_per_day} system={batchSummary.totals_system.pay_per_day} variance={batchSummary.totals_variance.pay_per_day} tolerance={tolerance.money} icon={DollarSign} isHistorical={isHistorical} />
          <SummaryCard label="Ryde" truth={batchSummary.totals_truth.ryde} system={batchSummary.totals_system.ryde} variance={batchSummary.totals_variance.ryde} tolerance={tolerance.money} icon={Car} isHistorical={isHistorical} />
          <SummaryCard label="Tips" truth={batchSummary.totals_truth.tips} system={batchSummary.totals_system.tips} variance={batchSummary.totals_variance.tips} tolerance={tolerance.tips} icon={UtensilsCrossed} isHistorical={isHistorical} />
          <SummaryCard label="Reimb." truth={batchSummary.totals_truth.reimbursements} system={batchSummary.totals_system.reimbursements} variance={batchSummary.totals_variance.reimbursements} tolerance={tolerance.money} icon={Receipt} isHistorical={isHistorical} />
          <SummaryCard label="Descuentos" truth={batchSummary.totals_truth.discount} system={batchSummary.totals_system.discount} variance={batchSummary.totals_variance.discount} tolerance={tolerance.money} icon={AlertTriangle} isHistorical={isHistorical} />
          <SummaryCard label="TOTAL" truth={batchSummary.totals_truth.grand_total} system={batchSummary.totals_system.grand_total} variance={batchSummary.totals_variance.grand_total} tolerance={tolerance.money} icon={DollarSign} isHistorical={isHistorical} />
        </div>
      )}

      {/* Validation Report */}
      {batchSummary && (
        <ValidationReportPanel summary={batchSummary} parseResult={truthParseResult} truthCounts={truthCounts} />
      )}

      {/* Filters + Search */}
      {reconciliationRows.length > 0 && (
        <Card className="shadow-none border-border/50">
          <CardContent className="py-2.5 px-4 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded-lg" />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[200px] h-8 text-xs rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos ({reconciliationRows.length})</SelectItem>
                <SelectItem value="validated">✓ Validados ({truthCounts.validated})</SelectItem>
                <SelectItem value="composition">✓ Composición ({truthCounts.compositionOk})</SelectItem>
                <SelectItem value="base_only">✓ Base OK ({truthCounts.baseOk})</SelectItem>
                <SelectItem value="pending">⚠ Pendientes ({truthCounts.pending})</SelectItem>
                <SelectItem value="missing_system">⊘ Sin sistema ({reconciliationRows.filter(r => r.classification.row_status === "MISSING_IN_SYSTEM").length})</SelectItem>
                <SelectItem value="manual">◉ Ajuste manual ({reconciliationRows.filter(r => r.classification.has_manual_adjustment).length})</SelectItem>
                <SelectItem value="low_confidence">◎ Baja confianza ({reconciliationRows.filter(r => r.match.match_confidence > 0 && r.match.match_confidence < 80).length})</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground ml-auto tabular-nums font-medium">{filteredRows.length} de {reconciliationRows.length} filas</p>
          </CardContent>
        </Card>
      )}

      {/* Main grid */}
      {filteredRows.length > 0 && (
        <Card className="shadow-none overflow-hidden">
          <div className="overflow-auto max-h-[55vh]">
            <Table>
              <TableHeader className="sticky top-0 z-30">
                <TableRow>
                  <TableHead className="sticky left-0 z-40 bg-surface-2 min-w-[170px] py-2.5">Empleado</TableHead>
                  <TableHead className="py-2.5">Estado</TableHead>
                  <TableHead className="text-right py-2.5">Hrs</TableHead>
                  <TableHead className="text-right py-2.5">Tarifa</TableHead>
                  <TableHead className="text-right py-2.5 border-l border-border/30">A. Base</TableHead>
                  <TableHead className="text-right py-2.5 text-earning">+ Adic.</TableHead>
                  <TableHead className="text-right py-2.5 text-destructive">− Desc.</TableHead>
                  <TableHead className="text-right py-2.5 !font-bold border-l border-border/30">= Total</TableHead>
                  <TableHead className="py-2.5 min-w-[200px]">Composición</TableHead>
                  <TableHead className="py-2.5 w-10">Obs</TableHead>
                  <TableHead className="py-2.5 w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row, i) => {
                  const hrs = row.truth.total_hours;
                  const basePay = row.truth.total_pay || 0;
                  const rate = hrs && hrs > 0 && basePay > 0 ? Math.round((basePay / hrs) * 100) / 100 : null;
                  const ppd = row.truth.pay_per_day || 0;
                  const ryde = row.truth.ryde || 0;
                  const tips = row.truth.tips || 0;
                  const reimb = row.truth.reimbursements || 0;
                  const disc = truthDiscount(row);
                  const adicionales = ppd + ryde + tips + reimb;
                  const total = row.truth.total;

                  // Composition formula — always show full breakdown
                  const fmtC = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
                  let formula: string;
                  if (basePay > 0 && adicionales > 0 && disc > 0) {
                    formula = `${fmtC(basePay)} + ${fmtC(adicionales)} − ${fmtC(disc)} = ${fmt(total)}`;
                  } else if (basePay > 0 && adicionales > 0) {
                    formula = `${fmtC(basePay)} + ${fmtC(adicionales)} = ${fmt(total)}`;
                  } else if (basePay > 0 && disc > 0) {
                    formula = `${fmtC(basePay)} − ${fmtC(disc)} = ${fmt(total)}`;
                  } else if (adicionales > 0 && disc > 0) {
                    formula = `$0 + ${fmtC(adicionales)} − ${fmtC(disc)} = ${fmt(total)}`;
                  } else if (adicionales > 0) {
                    formula = `$0 + ${fmtC(adicionales)} = ${fmt(total)}`;
                  } else if (basePay > 0) {
                    formula = `${fmtC(basePay)} = ${fmt(total)}`;
                  } else {
                    formula = total != null ? fmt(total) : "—";
                  }
                  const obs = truthObservation(row);

                  return (
                    <TableRow
                      key={i}
                      className="text-xs cursor-pointer transition-colors hover:bg-accent/40"
                      onClick={() => setSelectedRow(row)}
                    >
                      <TableCell className="sticky left-0 bg-card z-10 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-earning shrink-0" />
                          <span className="font-medium truncate max-w-[130px]">{row.truth.first_name} {row.truth.last_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">{statusBadge(row.classification.row_status, row)}</TableCell>
                      <TableCell className="text-right font-mono py-2">{hrs != null ? hrs.toFixed(2) : "—"}</TableCell>
                      <TableCell className="text-right font-mono py-2 text-muted-foreground">{rate != null ? `$${rate.toFixed(2)}` : "—"}</TableCell>
                      <TableCell className="text-right font-mono py-2 border-l border-border/20">{basePay > 0 ? fmt(basePay) : "—"}</TableCell>
                      <TableCell className="text-right font-mono py-2 text-earning font-medium">{adicionales > 0 ? fmt(adicionales) : "—"}</TableCell>
                      <TableCell className="text-right font-mono py-2 text-destructive font-medium">{disc > 0 ? fmt(disc) : "—"}</TableCell>
                      <TableCell className="text-right font-mono font-bold py-2 border-l border-border/20">{fmt(total)}</TableCell>
                      <TableCell className="py-2">
                        <span className="text-[10px] font-mono text-muted-foreground">{formula}</span>
                      </TableCell>
                      <TableCell className="py-2">
                        {obs ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-info/10 text-info border border-info/20">
                                <FileText className="h-3 w-3" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs text-xs">{obs}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* System-only employees */}
      {systemOnlyEmployees.length > 0 && (
        <Card className="shadow-none border-warning/25 bg-warning/[0.03]">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs flex items-center gap-2 font-semibold">
              <div className="p-1 rounded-md bg-warning/12">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              </div>
              Solo en sistema — no en truth ({systemOnlyEmployees.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {systemOnlyEmployees.map(e => (
                <Badge key={e.employee_id} variant="outline" className="text-[10px] bg-card">{e.first_name} {e.last_name}</Badge>
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
            onApprove={async () => { await approveBatch(activeBatch.id, {} as any); setShowApproveDialog(false); }}
            onCancel={() => setShowApproveDialog(false)}
          />
        )}
      </Dialog>

      {/* Empty state */}
      {reconciliationRows.length === 0 && !processing && activeBatch.status !== "DRAFT" && (
        <Card className="border-dashed border-2 shadow-none">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="p-4 rounded-2xl bg-muted/50 mb-4">
              <Upload className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <p className="font-medium text-muted-foreground">Carga un truth file y ejecuta la reconciliación</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Sube un archivo .xlsx o .csv con los datos de nómina reales.</p>
          </CardContent>
        </Card>
      )}

      {/* Processing state */}
      {processing && (
        <Card className="shadow-none">
          <CardContent className="py-12 flex flex-col items-center text-center">
            <div className="p-4 rounded-2xl bg-primary/8 mb-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <p className="font-medium text-sm">Procesando reconciliación...</p>
            <p className="text-xs text-muted-foreground mt-1">Comparando truth vs sistema, esto puede tomar unos segundos.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
