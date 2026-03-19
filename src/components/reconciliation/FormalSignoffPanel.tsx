import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle2, Shield, FileText, Lock, User, Clock, Rocket, AlertTriangle,
  ClipboardCheck, Award, TrendingUp,
} from "lucide-react";
import type { PeriodStatus, EmployeeFinalRecord, EmployeeVariance, ClosingReceipt } from "@/hooks/useReconciliationPeriod";

/* ── Go-Live Checklist items ── */
const GOLIVE_ITEMS = [
  { key: "schedules_imported", label: "Schedules importados" },
  { key: "clocks_imported", label: "Clocks importados" },
  { key: "payroll_imported", label: "Payroll importado" },
  { key: "no_critical_blockers", label: "Sin bloqueadores críticos" },
  { key: "no_unknown_classifications", label: "Sin clasificaciones desconocidas" },
  { key: "major_variances_resolved", label: "Varianzas mayores resueltas o aceptadas" },
  { key: "validation_completed", label: "Validación completada" },
  { key: "financial_review_done", label: "Revisión financiera completada" },
  { key: "prepublish_acknowledged", label: "Pre-publicación revisada" },
  { key: "postpublish_passed", label: "Verificación post-publicación pasó" },
  { key: "signoff_recorded", label: "Signoff final registrado" },
] as const;

/* ── Outcome options ── */
const OUTCOME_OPTIONS = [
  { value: "closed_clean", label: "Cerrado Limpio", color: "text-green-600" },
  { value: "closed_with_warnings", label: "Cerrado con Advertencias", color: "text-amber-600" },
  { value: "reopened_after_publish", label: "Reabierto Post-Publicación", color: "text-red-600" },
  { value: "pilot_success", label: "Piloto Exitoso", color: "text-blue-600" },
  { value: "pilot_needs_review", label: "Piloto Requiere Revisión", color: "text-orange-600" },
] as const;

interface Props {
  period: PeriodStatus;
  finalRecords: EmployeeFinalRecord[];
  closingReceipt: ClosingReceipt | null;
  variances?: EmployeeVariance[];
  employees: Map<string, string>;
  onSignoff: (step: string, note: string) => Promise<void>;
  onSetOutcome: (outcome: string) => Promise<void>;
  onSaveChecklist: (checklist: Record<string, boolean>) => Promise<void>;
}

export default function FormalSignoffPanel({
  period, finalRecords, closingReceipt, variances, employees,
  onSignoff, onSetOutcome, onSaveChecklist,
}: Props) {
  const [signoffNote, setSignoffNote] = useState("");
  const [signing, setSigning] = useState(false);

  const p = period as any;

  // Go-live checklist state from period
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    const saved = (p.golive_checklist || {}) as Record<string, boolean>;
    // Auto-detect some items
    return {
      schedules_imported: saved.schedules_imported || (period.total_schedules > 0),
      clocks_imported: saved.clocks_imported || (period.total_clocks > 0),
      payroll_imported: saved.payroll_imported || (period.total_payroll_rows > 0),
      no_critical_blockers: saved.no_critical_blockers || false,
      no_unknown_classifications: saved.no_unknown_classifications || (finalRecords.filter(r => r.pay_classification === "unknown").length === 0),
      major_variances_resolved: saved.major_variances_resolved || false,
      validation_completed: saved.validation_completed || false,
      financial_review_done: saved.financial_review_done || false,
      prepublish_acknowledged: saved.prepublish_acknowledged || false,
      postpublish_passed: saved.postpublish_passed || false,
      signoff_recorded: saved.signoff_recorded || false,
    };
  });

  const checklistComplete = GOLIVE_ITEMS.every(item => checklist[item.key]);

  const handleToggleCheck = async (key: string) => {
    const updated = { ...checklist, [key]: !checklist[key] };
    setChecklist(updated);
    await onSaveChecklist(updated);
  };

  const handleSignoff = async (step: string) => {
    setSigning(true);
    await onSignoff(step, signoffNote);
    setSignoffNote("");
    setSigning(false);
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  // Signoff steps
  const signoffSteps = [
    { key: "reconciled", label: "Reconciliado por", by: p.reconciled_by, at: p.reconciled_at, note: p.reconciled_note, status: "reviewing", icon: ClipboardCheck },
    { key: "validated", label: "Validado por", by: p.validated_by, at: p.validated_at, note: p.validated_note, status: "reviewing", icon: Shield },
    { key: "approved", label: "Aprobado por", by: p.approved_by, at: p.approved_at, note: p.approved_note, status: "approved", icon: CheckCircle2 },
    { key: "posted", label: "Publicado por", by: p.posted_by, at: p.posted_at, note: p.posted_note, status: "posted", icon: FileText },
    { key: "closed", label: "Cerrado por", by: p.closed_by, at: p.closed_at, note: p.closed_note, status: "locked", icon: Lock },
  ];

  const isPosted = ["posted", "locked"].includes(period.status);
  const isLocked = period.status === "locked";

  // Stats for final summary
  const stats = useMemo(() => {
    const exact = (variances || []).filter(v => v.variance_status === "exact_match").length;
    const manual = finalRecords.filter(r => (r.manual_adjustment_total || r.manual_amount || 0) !== 0).length;
    const warnings = (variances || []).filter(v => v.warnings.length > 0).reduce((s, v) => s + v.warnings.length, 0);
    const total = finalRecords.reduce((s, r) => s + (r.grand_total || r.final_total_pay || 0), 0);
    const sourceTotal = finalRecords.reduce((s, r) => s + (r.source_payroll_total || 0), 0);
    return { exact, manual, warnings, total, sourceTotal, count: finalRecords.length };
  }, [finalRecords, variances]);

  return (
    <div className="space-y-6">
      {/* ── Go-Live Checklist ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-5 w-5 text-amber-600" />
            Go-Live Checklist
            <Badge variant={checklistComplete ? "default" : "outline"} className="ml-auto text-[10px]">
              {GOLIVE_ITEMS.filter(i => checklist[i.key]).length}/{GOLIVE_ITEMS.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {GOLIVE_ITEMS.map(item => (
              <div key={item.key} className="flex items-center space-x-2">
                <Checkbox
                  id={`gl-${item.key}`}
                  checked={!!checklist[item.key]}
                  onCheckedChange={() => handleToggleCheck(item.key)}
                />
                <Label htmlFor={`gl-${item.key}`} className="text-xs cursor-pointer">{item.label}</Label>
              </div>
            ))}
          </div>
          {checklistComplete && (
            <Alert className="mt-3 border-green-300 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-xs text-green-700 dark:text-green-400">
                Checklist completo. El periodo está listo para cierre formal.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── Formal Signoff Timeline ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5" /> Signoff Formal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {signoffSteps.map((step, i) => {
            const done = !!step.by;
            const isNext = !done && (i === 0 || !!signoffSteps[i - 1].by);
            return (
              <div key={step.key} className={`flex items-start gap-3 p-3 rounded-lg border ${done ? "bg-primary/5 border-primary/20" : isNext ? "border-dashed border-primary/40" : "border-border opacity-50"}`}>
                <step.icon className={`h-5 w-5 mt-0.5 ${done ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{step.label}</span>
                    {done && <Badge variant="default" className="text-[10px]">✓</Badge>}
                  </div>
                  {done && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {step.by?.slice(0, 8)}…
                        <Clock className="h-3 w-3 ml-2" /> {step.at ? new Date(step.at).toLocaleString() : "—"}
                      </span>
                      {step.note && <p className="mt-1 italic">"{step.note}"</p>}
                    </div>
                  )}
                  {isNext && (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={signoffNote}
                        onChange={e => setSignoffNote(e.target.value)}
                        placeholder="Nota de signoff (opcional)..."
                        rows={2}
                        className="text-xs"
                      />
                      <Button size="sm" onClick={() => handleSignoff(step.key)} disabled={signing}>
                        {signing ? "Firmando..." : `Firmar: ${step.label.replace(" por", "")}`}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Period Outcome Label ── */}
      {isLocked && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-5 w-5" /> Resultado del Periodo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {OUTCOME_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={p.outcome_label === opt.value ? "default" : "outline"}
                  className="text-xs"
                  onClick={() => onSetOutcome(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            {p.outcome_label && (
              <p className="mt-2 text-sm font-medium">
                Resultado: <Badge variant="secondary">{OUTCOME_OPTIONS.find(o => o.value === p.outcome_label)?.label || p.outcome_label}</Badge>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Final Summary (shown when posted/locked) ── */}
      {isPosted && closingReceipt && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Resumen Final de Cierre
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div><span className="text-muted-foreground">Periodo:</span> {period.period_label}</div>
              <div><span className="text-muted-foreground">Rango:</span> {period.period_start} → {period.period_end}</div>
              <div><span className="text-muted-foreground">Empleados:</span> {closingReceipt.total_employees}</div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Source Total", value: fmt(stats.sourceTotal) },
                { label: "Reconciled Total", value: fmt(stats.total) },
                { label: "Published Total", value: fmt(closingReceipt.grand_total_posted || 0) },
                { label: "Varianza", value: fmt(Math.abs(stats.sourceTotal - stats.total)) },
                { label: "Exact Match %", value: stats.count > 0 ? `${((stats.exact / stats.count) * 100).toFixed(0)}%` : "—" },
                { label: "Advertencias", value: String(stats.warnings) },
                { label: "Intervenciones Manuales", value: String(stats.manual) },
              ].map(item => (
                <div key={item.label} className="text-center p-2 bg-muted/30 rounded">
                  <div className="font-mono font-semibold text-sm">{item.value}</div>
                  <div className="text-[10px] text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-1 text-xs">
              {signoffSteps.filter(s => s.by).map(s => (
                <div key={s.key} className="flex items-center gap-2 text-muted-foreground">
                  <s.icon className="h-3 w-3" />
                  <span className="font-medium">{s.label}</span>
                  <span>{s.by?.slice(0, 8)}…</span>
                  <span>— {s.at ? new Date(s.at).toLocaleString() : ""}</span>
                </div>
              ))}
            </div>
            {p.outcome_label && (
              <div className="text-center">
                <Badge variant="secondary" className="text-sm px-4 py-1">
                  {OUTCOME_OPTIONS.find(o => o.value === p.outcome_label)?.label || p.outcome_label}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
