import { useState, useCallback, useEffect, useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useReconciliationPeriod } from "@/hooks/useReconciliationPeriod";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Upload, GitCompareArrows, AlertTriangle, CheckCircle2, FileText, BarChart3,
  Users, ArrowRight, Lock, Eye, Shield, ClipboardCheck, Settings2, Wrench, Rocket,
  ChevronRight, Zap, BookOpen, TrendingUp, Award, PenTool, Bug,
  StickyNote, ListChecks, Target, DollarSign, RefreshCw, Calendar, Hash, ShieldAlert,
} from "lucide-react";
import StagedImportWizard from "@/components/reconciliation/StagedImportWizard";
import ReconciliationReviewPanel from "@/components/reconciliation/ReconciliationReviewPanel";
import ExceptionQueue from "@/components/reconciliation/ExceptionQueue";
import ImportBatchHistory from "@/components/reconciliation/ImportBatchHistory";
import ReconciliationDashboard from "@/components/reconciliation/ReconciliationDashboard";
import EmployeePeriodReconciliation from "@/components/reconciliation/EmployeePeriodReconciliation";
import PrePublishReview from "@/components/reconciliation/PrePublishReview";
import VerificationReport from "@/components/reconciliation/VerificationReport";
import BusinessRuleTuningPanel from "@/components/reconciliation/BusinessRuleTuningPanel";
import VarianceWorkbench from "@/components/reconciliation/VarianceWorkbench";
import PilotComparisonReport from "@/components/reconciliation/PilotComparisonReport";
import CloseDesk from "@/components/reconciliation/CloseDesk";
import PeriodJournal from "@/components/reconciliation/PeriodJournal";
import PeriodComparison from "@/components/reconciliation/PeriodComparison";
import FormalSignoffPanel from "@/components/reconciliation/FormalSignoffPanel";
import RolloutReadiness from "@/components/reconciliation/RolloutReadiness";
import UATIssueTracker from "@/components/reconciliation/UATIssueTracker";
import PilotReviewReport from "@/components/reconciliation/PilotReviewReport";
import StabilizationDashboard from "@/components/reconciliation/StabilizationDashboard";
import PilotRunbook from "@/components/reconciliation/PilotRunbook";
import PeriodNotes from "@/components/reconciliation/PeriodNotes";
import StabilizationPriorities from "@/components/reconciliation/StabilizationPriorities";
import PayrollTruthValidation from "@/components/reconciliation/PayrollTruthValidation";
import DataIntegrityAudit from "@/components/reconciliation/DataIntegrityAudit";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

/* ── Status → workflow step mapping ── */
const WORKFLOW_STEPS = [
  { key: "importing", label: "Importar", tab: "import", icon: Upload },
  { key: "matching", label: "Match", tab: "review", icon: GitCompareArrows },
  { key: "reviewing", label: "Revisar", tab: "employees", icon: Users },
  { key: "approved", label: "Aprobar", tab: "approve", icon: CheckCircle2 },
  { key: "posted", label: "Publicar", tab: "publish", icon: Shield },
  { key: "locked", label: "Cerrado", tab: "publish", icon: Lock },
] as const;

const STATUS_ORDER = ["importing", "normalizing", "matching", "reviewing", "approved", "posted", "locked"];

/* Tab definitions with status-gating */
interface TabDef {
  value: string;
  label: string;
  icon: any;
  alwaysEnabled?: boolean;
  minStatus?: string | null;
}

/* Primary operational tabs */
const PRIMARY_TABS: TabDef[] = [
  { value: "dashboard", label: "Dashboard", icon: BarChart3, alwaysEnabled: true },
  { value: "closedesk", label: "Close Desk", icon: Shield, minStatus: null },
  { value: "import", label: "Importar", icon: Upload, minStatus: null },
  { value: "review", label: "Matching", icon: GitCompareArrows, minStatus: "importing" },
  { value: "exceptions", label: "Excepciones", icon: AlertTriangle, minStatus: "importing" },
  { value: "employees", label: "Empleados", icon: Users, minStatus: "matching" },
  { value: "workbench", label: "Workbench", icon: Wrench, minStatus: "reviewing" },
  { value: "validate", label: "Validar", icon: ClipboardCheck, minStatus: "reviewing" },
  { value: "approve", label: "Aprobar", icon: CheckCircle2, minStatus: "reviewing" },
  { value: "publish", label: "Publicar", icon: Shield, minStatus: "approved" },
];

/* Secondary / dev tabs — collapsed behind a toggle */
const SECONDARY_TABS: TabDef[] = [
  { value: "rules", label: "Reglas", icon: Settings2, alwaysEnabled: true },
  { value: "compare", label: "Comparar", icon: TrendingUp, alwaysEnabled: true },
  { value: "signoff", label: "Signoff", icon: PenTool, minStatus: "reviewing" },
  { value: "journal", label: "Diario", icon: BookOpen, minStatus: null },
  { value: "notes", label: "Notas", icon: StickyNote, minStatus: null },
  { value: "runbook", label: "Runbook", icon: ListChecks, minStatus: null },
  { value: "rollout", label: "Rollout", icon: Award, alwaysEnabled: true },
  { value: "pilot", label: "Piloto", icon: Rocket, minStatus: "reviewing" },
  { value: "uat", label: "UAT", icon: Bug, minStatus: null },
  { value: "stabilization", label: "Estabilización", icon: TrendingUp, alwaysEnabled: true },
  { value: "priorities", label: "Prioridades", icon: Target, alwaysEnabled: true },
  { value: "payroll-truth", label: "Payroll Truth", icon: DollarSign, alwaysEnabled: true },
  { value: "audit", label: "Auditoría", icon: ShieldAlert, alwaysEnabled: true },
  { value: "history", label: "Historial", icon: FileText, alwaysEnabled: true },
];

const TABS: TabDef[] = [...PRIMARY_TABS, ...SECONDARY_TABS];

function isTabEnabled(tab: TabDef, periodStatus: string | null): boolean {
  if (tab.alwaysEnabled) return true;
  if (!periodStatus) return tab.value === "import" || tab.value === "checklist" || tab.value === "journal";
  if (!tab.minStatus) return true;
  return STATUS_ORDER.indexOf(periodStatus) >= STATUS_ORDER.indexOf(tab.minStatus);
}

interface PayPeriodOption {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  sequence_number: number | null;
}

function periodLabel(pp: PayPeriodOption): string {
  const seq = pp.sequence_number ? `Periodo ${pp.sequence_number} · ` : "";
  return `${seq}${pp.start_date} → ${pp.end_date}`;
}

export default function StagedReconciliation() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const { user } = useAuth();
  const {
    periods, loading, activePeriod, setActivePeriod,
    finalRecords, closingReceipt, loadPeriods, createPeriod, updatePeriodStatus,
    loadFinalRecords, generateFinalRecords, postFinalRecords,
    saveMappingCorrection, reopenPeriod, loadClosingReceipt,
    validateBeforePublish, analyzeVariances, runValidation,
  } = useReconciliationPeriod(selectedCompanyId);

  const [tab, setTab] = useState("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [showWeeklyCreateDialog, setShowWeeklyCreateDialog] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [employeeMap, setEmployeeMap] = useState<Map<string, string>>(new Map());
  const [payPeriods, setPayPeriods] = useState<PayPeriodOption[]>([]);
  const [reprocessing, setReprocessing] = useState(false);
  const [showSecondaryTabs, setShowSecondaryTabs] = useState(false);
  const [periodSearch, setPeriodSearch] = useState("");
  const [batchSearch, setBatchSearch] = useState("");
  const [selectedBatchPayPeriodId, setSelectedBatchPayPeriodId] = useState("");

  // ── Load employees ──
  useEffect(() => {
    if (!selectedCompanyId) return;
    supabase.from("employees").select("id, first_name, last_name").eq("company_id", selectedCompanyId)
      .then(({ data }) => {
        const map = new Map<string, string>();
        (data || []).forEach(e => map.set(e.id, `${e.first_name} ${e.last_name}`));
        setEmployeeMap(map);
      });
  }, [selectedCompanyId]);

  // ── Load pay periods for selector (including exact truth target) ──
  useEffect(() => {
    if (!selectedCompanyId) return;
    Promise.all([
      supabase.from("pay_periods")
        .select("id, start_date, end_date, status, sequence_number")
        .eq("company_id", selectedCompanyId)
        .order("start_date", { ascending: false })
        .limit(200),
      supabase.from("pay_periods")
        .select("id, start_date, end_date, status, sequence_number")
        .eq("company_id", selectedCompanyId)
        .eq("start_date", "2025-12-24")
        .eq("end_date", "2025-12-30")
        .limit(1),
    ]).then(([listRes, exactRes]) => {
      const list = (listRes.data || []) as PayPeriodOption[];
      const exact = (exactRes.data || []) as PayPeriodOption[];
      // Merge exact target if not already in list
      const ids = new Set(list.map(p => p.id));
      for (const e of exact) {
        if (!ids.has(e.id)) list.push(e);
      }
      setPayPeriods(list);
    });
  }, [selectedCompanyId]);

  // ── Auto-select latest active (non-locked) period on load ──
  useEffect(() => {
    if (activePeriod || periods.length === 0) return;
    const active = periods.find(p => !["locked"].includes(p.status)) || periods[0];
    if (active) {
      setActivePeriod(active);
      loadFinalRecords(active.id);
      loadClosingReceipt(active.id);
    }
  }, [periods, activePeriod, setActivePeriod, loadFinalRecords, loadClosingReceipt]);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    loadPeriods();
  }, [loadPeriods]);

  // ── Journal logging helper ──
  const logJournal = useCallback(async (eventType: string, eventLabel: string, detail?: string) => {
    if (!selectedCompanyId || !activePeriod) return;
    await supabase.from("reconciliation_period_journal" as any).insert({
      company_id: selectedCompanyId,
      period_status_id: activePeriod.id,
      event_type: eventType,
      event_label: eventLabel,
      detail: detail || null,
    } as any);
  }, [selectedCompanyId, activePeriod]);

  // ── Period creation ──
  const handleCreatePeriod = async () => {
    if (!newLabel || !newStart || !newEnd) {
      toast({ title: "Completa todos los campos", variant: "destructive" });
      return;
    }
    const p = await createPeriod(newLabel, newStart, newEnd);
    if (p) {
      setActivePeriod(p);
      setTab("closedesk");
      setShowWeeklyCreateDialog(false);
      setNewLabel(""); setNewStart(""); setNewEnd("");
    }
  };

  // ── Create from pay_period ──
  const handleCreateFromPayPeriod = async (ppId: string) => {
    const pp = payPeriods.find(p => p.id === ppId);
    if (!pp) return;
    // Check if reconciliation period already exists for this pay_period
    const existing = periods.find(p => p.period_id === ppId);
    if (existing) {
      setActivePeriod(existing);
      loadFinalRecords(existing.id);
      loadClosingReceipt(existing.id);
      setTab("closedesk");
      setShowBatchDialog(false);
      toast({ title: "Periodo existente seleccionado" });
      return;
    }
    const label = `${pp.start_date} → ${pp.end_date}`;
    const p = await createPeriod(label, pp.start_date, pp.end_date, ppId);
    if (p) {
      setActivePeriod(p);
      setTab("closedesk");
      setShowBatchDialog(false);
    }
  };

  const handleSelectPeriod = (p: PeriodStatus) => {
    setActivePeriod(p);
    loadFinalRecords(p.id);
    loadClosingReceipt(p.id);
    setTab("closedesk");
  };

  // ── Selector change (reconciliation period) ──
  const handlePeriodSelectorChange = (periodId: string) => {
    if (periodId === "__create__") {
      setShowBatchDialog(true);
      return;
    }
    if (periodId.startsWith("pp:")) {
      handleCreateFromPayPeriod(periodId.replace("pp:", ""));
      return;
    }
    const p = periods.find(pr => pr.id === periodId);
    if (p) handleSelectPeriod(p);
  };

  // ── Open exact truth period shortcut ──
  const handleOpenTruthPeriod = () => {
    const targetPP = payPeriods.find(pp => pp.start_date === "2025-12-24" && pp.end_date === "2025-12-30");
    if (!targetPP) {
      toast({ title: "Periodo 2025-12-24 → 2025-12-30 no encontrado", variant: "destructive" });
      return;
    }
    handleCreateFromPayPeriod(targetPP.id);
  };

  const batchCandidates = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    return [...payPeriods]
      .sort((a, b) => {
        const aTruth = a.start_date === "2025-12-24" && a.end_date === "2025-12-30" ? 1 : 0;
        const bTruth = b.start_date === "2025-12-24" && b.end_date === "2025-12-30" ? 1 : 0;
        if (aTruth !== bTruth) return bTruth - aTruth;
        return b.start_date.localeCompare(a.start_date);
      })
      .filter(pp => {
        if (!q) return true;
        const label = `${pp.start_date} ${pp.end_date} ${pp.status} ${pp.start_date} → ${pp.end_date}`.toLowerCase();
        return label.includes(q);
      });
  }, [payPeriods, batchSearch]);

  useEffect(() => {
    if (!showBatchDialog) return;
    if (selectedBatchPayPeriodId) return;
    const truthTarget = payPeriods.find(pp => pp.start_date === "2025-12-24" && pp.end_date === "2025-12-30");
    setSelectedBatchPayPeriodId(truthTarget?.id || payPeriods[0]?.id || "");
  }, [showBatchDialog, payPeriods, selectedBatchPayPeriodId]);

  // ── Reprocess period ──
  const handleReprocessPeriod = async () => {
    if (!activePeriod) return;
    setReprocessing(true);
    await generateFinalRecords(activePeriod.id);
    await logJournal("reprocess", "Periodo reprocesado", `Clasificación y mappings reaplicados`);
    toast({ title: "Periodo reprocesado", description: "Clasificación, mappings y varianzas recalculados." });
    setReprocessing(false);
  };

  // ── Core actions with journal logging ──
  const handleGenerateRecords = async () => {
    if (!activePeriod) return;
    await generateFinalRecords(activePeriod.id);
    await logJournal("matching", "Registros finales generados", `${finalRecords.length} empleados`);
  };

  const handleApprovePeriod = async () => {
    if (!activePeriod) return;
    await updatePeriodStatus(activePeriod.id, "approved");
    await logJournal("approval", "Periodo aprobado");
    toast({ title: "Periodo aprobado" });
  };

  const handlePostPeriod = async () => {
    if (!activePeriod) return;
    setPublishing(true);
    const success = await postFinalRecords(activePeriod.id);
    if (success) await logJournal("publish", "Periodo publicado a producción");
    setPublishing(false);
  };

  const handleLockPeriod = async () => {
    if (!activePeriod) return;
    await updatePeriodStatus(activePeriod.id, "locked");
    await logJournal("lock", "Periodo cerrado y bloqueado");
    toast({ title: "Periodo cerrado y bloqueado" });
  };

  const handleReopen = async (reason: string) => {
    if (!activePeriod) return;
    await reopenPeriod(activePeriod.id, reason);
    await logJournal("reopen", "Periodo reabierto", reason);
  };

  const handleRunValidation = async (isDryRun: boolean, uat: Record<string, boolean>, notes?: string) => {
    if (!activePeriod) return null;
    const result = await runValidation(activePeriod.id, isDryRun, uat, employeeMap, notes);
    await logJournal("validation", isDryRun ? "Dry-run ejecutado" : "Validación ejecutada", `Confianza: ${result?.confidence_score}%`);
    return result;
  };

  // ── Signoff handlers ──
  const handleSignoff = async (step: string, note: string) => {
    if (!activePeriod || !user?.id) return;
    const update: any = {};
    update[`${step}_by`] = user.id;
    update[`${step}_at`] = new Date().toISOString();
    if (note) update[`${step}_note`] = note;
    await supabase.from("reconciliation_period_status" as any).update(update).eq("id", activePeriod.id);
    await logJournal("signoff", `Signoff: ${step}`, note || undefined);
    toast({ title: `Signoff registrado: ${step}` });
    loadPeriods();
  };

  const handleSetOutcome = async (outcome: string) => {
    if (!activePeriod) return;
    await supabase.from("reconciliation_period_status" as any).update({ outcome_label: outcome } as any).eq("id", activePeriod.id);
    await logJournal("outcome", `Resultado: ${outcome}`);
    toast({ title: `Resultado del periodo: ${outcome}` });
    loadPeriods();
  };

  const handleSaveChecklist = async (checklist: Record<string, boolean>) => {
    if (!activePeriod) return;
    await supabase.from("reconciliation_period_status" as any).update({ golive_checklist: checklist } as any).eq("id", activePeriod.id);
  };

  const validation = validateBeforePublish(finalRecords);
  const variances = useMemo(() => analyzeVariances(finalRecords, employeeMap), [finalRecords, employeeMap, analyzeVariances]);

  const isLocked = activePeriod && ["posted", "locked"].includes(activePeriod.status);
  const currentStepIdx = activePeriod ? STATUS_ORDER.indexOf(activePeriod.status) : -1;

  // ── Next action guidance ──
  const nextAction = useMemo(() => {
    if (!activePeriod) return null;
    const s = activePeriod.status;
    if (s === "importing" || s === "normalizing") return { label: "Importar archivos", tab: "import", icon: Upload };
    if (s === "matching") return { label: "Revisar matches", tab: "review", icon: GitCompareArrows };
    if (s === "reviewing") return { label: "Generar y revisar empleados", tab: "employees", icon: Users };
    if (s === "approved") return { label: "Validar y publicar", tab: "validate", icon: ClipboardCheck };
    if (s === "posted") return { label: "Cerrar periodo", tab: "publish", icon: Lock };
    if (s === "locked") return { label: "Periodo cerrado ✓", tab: "publish", icon: CheckCircle2 };
    return null;
  }, [activePeriod]);

  const NoPeriodPlaceholder = ({ icon: Icon, text }: { icon: any; text?: string }) => (
    <div className="text-center py-12 text-muted-foreground">
      <Icon className="h-10 w-10 mx-auto mb-3 opacity-50" />
      <p>{text || "Selecciona un periodo desde el Dashboard."}</p>
    </div>
  );

  // ── Tabs that require a period ──
  const periodRequiredTabs = ["closedesk", "import", "review", "exceptions", "employees", "workbench", "approve", "validate", "publish", "signoff", "journal", "notes", "pilot"];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cierre Semanal"
        subtitle="Importar → Emparejar → Revisar → Aprobar → Publicar → Cerrar"
      />

      {/* ── Period Selector Bar ── */}
      <Card className="border-primary/20">
        <CardContent className="py-3 px-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Periodo:</span>
            </div>
            <Select
              value={activePeriod?.id || ""}
              onValueChange={handlePeriodSelectorChange}
            >
              <SelectTrigger className="w-full md:w-[340px]">
                <SelectValue placeholder="Selecciona un periodo para operar" />
              </SelectTrigger>
              <SelectContent>
                {/* Search input */}
                <div className="px-2 py-1.5">
                  <Input
                    placeholder="Buscar periodo... (ej: 2025-12-24)"
                    value={periodSearch}
                    onChange={e => setPeriodSearch(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <SelectItem value="__create__">➕ Crear nuevo periodo...</SelectItem>
                {/* Reconciliation periods */}
                {periods.filter(p => !periodSearch || p.period_label.toLowerCase().includes(periodSearch.toLowerCase())).length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Periodos de reconciliación</div>
                    {periods
                      .filter(p => !periodSearch || p.period_label.toLowerCase().includes(periodSearch.toLowerCase()))
                      .map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.period_label} ({p.status})
                        </SelectItem>
                      ))}
                  </>
                )}
                {/* Pay periods not yet linked — filtered */}
                {(() => {
                  const unlinked = payPeriods
                    .filter(pp => !periods.some(p => p.period_id === pp.id))
                    .filter(pp => !periodSearch || `${pp.start_date} ${pp.end_date}`.includes(periodSearch.toLowerCase()));
                  // Sort: truth target first
                  const sorted = [...unlinked].sort((a, b) => {
                    const aTarget = a.start_date === "2025-12-24" && a.end_date === "2025-12-30" ? 1 : 0;
                    const bTarget = b.start_date === "2025-12-24" && b.end_date === "2025-12-30" ? 1 : 0;
                    return bTarget - aTarget;
                  });
                  if (sorted.length === 0) return null;
                  return (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Periodos de nómina (sin reconciliar)</div>
                      {sorted.map(pp => {
                        const isTruth = pp.start_date === "2025-12-24" && pp.end_date === "2025-12-30";
                        return (
                          <SelectItem key={`pp:${pp.id}`} value={`pp:${pp.id}`}>
                            {pp.start_date} → {pp.end_date} ({pp.status})
                            {isTruth && " ⭐ Truth target"}
                          </SelectItem>
                        );
                      })}
                    </>
                  );
                })()}
              </SelectContent>
            </Select>

            {/* Exact truth period shortcut */}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0 border-primary/40 text-primary hover:bg-primary/10"
              onClick={handleOpenTruthPeriod}
            >
              <Target className="h-3.5 w-3.5" />
              Open exact period 2025-12-24 → 2025-12-30
            </Button>

            <Badge variant="outline" className="text-[11px]">
              Reconciliation Batch Mode
            </Badge>

            {/* Reprocess button */}
            {activePeriod && !isLocked && (
              <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={handleReprocessPeriod} disabled={reprocessing}>
                <RefreshCw className={`h-3.5 w-3.5 ${reprocessing ? "animate-spin" : ""}`} />
                {reprocessing ? "Reprocesando..." : "Reprocesar período"}
              </Button>
            )}

            {/* Period stats */}
            {activePeriod && (
              <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{finalRecords.length} registros</span>
                <span className="font-mono">{activePeriod.period_start} → {activePeriod.period_end}</span>
                {activePeriod.total_schedules > 0 && <Badge variant="secondary" className="text-[10px]">{activePeriod.total_schedules} turnos</Badge>}
                {activePeriod.total_clocks > 0 && <Badge variant="secondary" className="text-[10px]">{activePeriod.total_clocks} fichajes</Badge>}
                {activePeriod.total_payroll_rows > 0 && <Badge variant="secondary" className="text-[10px]">{activePeriod.total_payroll_rows} nómina</Badge>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── No Period Warning ── */}
      {!activePeriod && tab !== "dashboard" && periodRequiredTabs.includes(tab) && (
        <Alert className="border-warning bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-sm">
            <strong>Selecciona un período para operar.</strong> La reconciliación requiere un período activo para procesar datos.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Active Period Workflow Bar ── */}
      {activePeriod && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-muted/40 border">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {WORKFLOW_STEPS.map((step, i) => {
              const stepIdx = STATUS_ORDER.indexOf(step.key);
              const done = currentStepIdx >= stepIdx;
              const current = activePeriod.status === step.key;
              const Icon = step.icon;
              return (
                <div key={step.key} className="flex items-center gap-0.5">
                  <button
                    onClick={() => { const t = TABS.find(tb => tb.value === step.tab); if (t && isTabEnabled(t, activePeriod.status)) setTab(step.tab); }}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors
                      ${current ? "bg-primary text-primary-foreground" : done ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="hidden md:inline">{step.label}</span>
                  </button>
                  {i < WORKFLOW_STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-[11px] font-mono">{activePeriod.period_label}</Badge>
            {activePeriod.reopen_count > 0 && <Badge variant="warning" className="text-[10px]">↻{activePeriod.reopen_count}</Badge>}
          </div>
          {nextAction && activePeriod.status !== "locked" && (
            <Button size="sm" variant="default" className="gap-1 text-xs shrink-0" onClick={() => setTab(nextAction.tab)}>
              <Zap className="h-3 w-3" /> {nextAction.label}
            </Button>
          )}
        </div>
      )}

      {/* ── Warning bar for unresolved exceptions ── */}
      {activePeriod && activePeriod.total_exceptions > activePeriod.resolved_exceptions && (
        <Alert className="py-2 border-warning bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs flex items-center gap-2">
            {activePeriod.total_exceptions - activePeriod.resolved_exceptions} excepción(es) pendiente(s)
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setTab("exceptions")}>Ver excepciones</Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-max">
            {PRIMARY_TABS.map(t => {
              const enabled = isTabEnabled(t, activePeriod?.status || null);
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.value} value={t.value} disabled={!enabled} className="gap-1 text-[11px]">
                  <Icon className="h-3 w-3" /> {t.label}
                </TabsTrigger>
              );
            })}
            <button
              onClick={() => setShowSecondaryTabs(!showSecondaryTabs)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings2 className="h-3 w-3" />
              {showSecondaryTabs ? "Menos" : "Más"}
              <ChevronRight className={`h-3 w-3 transition-transform ${showSecondaryTabs ? "rotate-90" : ""}`} />
            </button>
            {showSecondaryTabs && SECONDARY_TABS.map(t => {
              const enabled = isTabEnabled(t, activePeriod?.status || null);
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.value} value={t.value} disabled={!enabled} className="gap-1 text-[11px] text-muted-foreground">
                  <Icon className="h-3 w-3" /> {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="dashboard">
          <ReconciliationDashboard periods={periods} onSelectPeriod={handleSelectPeriod} onCreatePeriod={() => setShowBatchDialog(true)} />
        </TabsContent>

        <TabsContent value="closedesk">
          {activePeriod ? (
            <CloseDesk
              period={activePeriod}
              finalRecords={finalRecords}
              variances={variances}
              employeeMap={employeeMap}
              onNavigate={setTab}
              onApproveRecord={async (recordId) => {
                await supabase.from("reconciliation_final_records" as any)
                  .update({ reconciliation_status: "approved", approved_at: new Date().toISOString() } as any)
                  .eq("id", recordId);
                if (activePeriod) loadFinalRecords(activePeriod.id);
              }}
              onBulkApprove={async (recordIds) => {
                for (const id of recordIds) {
                  await supabase.from("reconciliation_final_records" as any)
                    .update({ reconciliation_status: "approved", approved_at: new Date().toISOString() } as any)
                    .eq("id", id);
                }
                if (activePeriod) loadFinalRecords(activePeriod.id);
                await logJournal("approval", `${recordIds.length} empleados aprobados en bulk`);
                toast({ title: `${recordIds.length} empleados aprobados` });
              }}
              onClassifyRecords={async (recordIds, classification) => {
                for (const id of recordIds) {
                  await supabase.from("reconciliation_final_records" as any)
                    .update({ pay_classification: classification } as any)
                    .eq("id", id);
                }
                if (activePeriod) loadFinalRecords(activePeriod.id);
                await logJournal("classify", `${recordIds.length} registros clasificados como ${classification}`);
                toast({ title: `${recordIds.length} registros clasificados como ${classification}` });
              }}
              onMarkReviewed={async (recordIds) => {
                for (const id of recordIds) {
                  await supabase.from("reconciliation_final_records" as any)
                    .update({ reconciliation_status: "resolved" } as any)
                    .eq("id", id);
                }
                if (activePeriod) loadFinalRecords(activePeriod.id);
                await logJournal("review", `${recordIds.length} registros marcados como revisados`);
                toast({ title: `${recordIds.length} registros marcados como revisados` });
              }}
            />
          ) : (
            <NoPeriodPlaceholder icon={Shield} text="Selecciona un periodo para abrir el Close Desk." />
          )}
        </TabsContent>

        <TabsContent value="import">
          {activePeriod && <ActivePeriodBar period={activePeriod} isLocked={!!isLocked} />}
          {isLocked ? (
            <NoPeriodPlaceholder icon={Lock} text="Este periodo está cerrado. No se permiten nuevas importaciones." />
          ) : (
            <StagedImportWizard
              companyId={selectedCompanyId}
              onComplete={() => { refresh(); logJournal("import", "Archivos importados"); }}
              activePeriodId={activePeriod?.id}
              onBatchLinked={() => { loadPeriods(); logJournal("import", "Batch vinculado al periodo"); }}
            />
          )}
        </TabsContent>

        <TabsContent value="review">
          <ReconciliationReviewPanel
            companyId={selectedCompanyId}
            onRefresh={refresh}
            key={refreshKey}
            periodScope={activePeriod ? {
              schedule_batch_id: activePeriod.schedule_batch_id,
              clock_batch_id: activePeriod.clock_batch_id,
              payroll_batch_id: activePeriod.payroll_batch_id,
              period_start: activePeriod.period_start,
              period_end: activePeriod.period_end,
              period_label: activePeriod.period_label,
            } : null}
          />
        </TabsContent>

        <TabsContent value="exceptions">
          <ExceptionQueue companyId={selectedCompanyId} onRefresh={() => { refresh(); logJournal("exception_resolved", "Excepciones actualizadas"); }} key={refreshKey} />
        </TabsContent>

        <TabsContent value="employees">
          {activePeriod ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <ActivePeriodBar period={activePeriod} isLocked={!!isLocked} />
                {!isLocked && (
                  <Button size="sm" onClick={handleGenerateRecords}>
                    <ArrowRight className="h-4 w-4 mr-1" /> Generar Registros Finales
                  </Button>
                )}
              </div>
              <EmployeePeriodReconciliation
                companyId={selectedCompanyId}
                periodStatusId={activePeriod.id}
                finalRecords={finalRecords}
                onRefresh={() => loadFinalRecords(activePeriod.id)}
                onSaveMapping={saveMappingCorrection}
              />
            </div>
          ) : (
            <NoPeriodPlaceholder icon={Users} />
          )}
        </TabsContent>

        <TabsContent value="rules">
          <BusinessRuleTuningPanel companyId={selectedCompanyId} employees={employeeMap} />
        </TabsContent>

        <TabsContent value="workbench">
          {activePeriod ? (
            <VarianceWorkbench
              companyId={selectedCompanyId}
              periodStatusId={activePeriod.id}
              finalRecords={finalRecords}
              employees={employeeMap}
              onRefresh={() => { if (activePeriod) loadFinalRecords(activePeriod.id); }}
            />
          ) : (
            <NoPeriodPlaceholder icon={Wrench} text="Selecciona un periodo y genera registros finales para usar el Workbench." />
          )}
        </TabsContent>

        <TabsContent value="approve">
          {activePeriod ? (
            <ApproveTab period={activePeriod} onUpdateStatus={updatePeriodStatus} onApprove={handleApprovePeriod} onGoToPublish={() => setTab("publish")} />
          ) : (
            <NoPeriodPlaceholder icon={CheckCircle2} />
          )}
        </TabsContent>

        <TabsContent value="validate">
          {activePeriod ? (
            <VerificationReport period={activePeriod} finalRecords={finalRecords} employees={employeeMap} onRunValidation={handleRunValidation} onPublish={handlePostPeriod} publishing={publishing} />
          ) : (
            <NoPeriodPlaceholder icon={ClipboardCheck} text="Selecciona un periodo desde el Dashboard para validar." />
          )}
        </TabsContent>

        <TabsContent value="publish">
          {activePeriod ? (
            <PrePublishReview period={activePeriod} finalRecords={finalRecords} closingReceipt={closingReceipt} employees={employeeMap} validation={validation} variances={variances} onPublish={handlePostPeriod} onLock={handleLockPeriod} onReopen={handleReopen} publishing={publishing} isPilotMode={true} />
          ) : (
            <NoPeriodPlaceholder icon={Shield} />
          )}
        </TabsContent>

        <TabsContent value="compare">
          {activePeriod ? (
            <PeriodComparison periods={periods} activePeriodId={activePeriod.id} />
          ) : (
            <PeriodComparison periods={periods} activePeriodId="" />
          )}
        </TabsContent>

        <TabsContent value="signoff">
          {activePeriod ? (
            <FormalSignoffPanel
              period={activePeriod}
              finalRecords={finalRecords}
              closingReceipt={closingReceipt}
              variances={variances}
              employees={employeeMap}
              onSignoff={handleSignoff}
              onSetOutcome={handleSetOutcome}
              onSaveChecklist={handleSaveChecklist}
            />
          ) : (
            <NoPeriodPlaceholder icon={PenTool} text="Selecciona un periodo para ver el signoff formal." />
          )}
        </TabsContent>

        <TabsContent value="journal">
          {activePeriod ? (
            <PeriodJournal period={activePeriod} companyId={selectedCompanyId} />
          ) : (
            <NoPeriodPlaceholder icon={BookOpen} text="Selecciona un periodo para ver su diario de actividad." />
          )}
        </TabsContent>

        <TabsContent value="notes">
          {activePeriod ? (
            <PeriodNotes period={activePeriod} companyId={selectedCompanyId} />
          ) : (
            <NoPeriodPlaceholder icon={StickyNote} text="Selecciona un periodo para agregar notas." />
          )}
        </TabsContent>

        <TabsContent value="runbook">
          {activePeriod ? (
            <PilotRunbook period={activePeriod} onNavigate={setTab} />
          ) : (
            <NoPeriodPlaceholder icon={ListChecks} text="Selecciona un periodo para ver el runbook operativo." />
          )}
        </TabsContent>

        <TabsContent value="rollout">
          <RolloutReadiness periods={periods} />
        </TabsContent>

        <TabsContent value="pilot">
          {activePeriod ? (
            <PilotReviewReport companyId={selectedCompanyId} period={activePeriod} finalRecords={finalRecords} employees={employeeMap} variances={variances} />
          ) : (
            <NoPeriodPlaceholder icon={Rocket} text="Selecciona un periodo para generar el reporte piloto." />
          )}
        </TabsContent>

        <TabsContent value="uat">
          {activePeriod ? (
            <UATIssueTracker companyId={selectedCompanyId} period={activePeriod} employees={employeeMap} />
          ) : (
            <NoPeriodPlaceholder icon={Bug} text="Selecciona un periodo para gestionar issues UAT." />
          )}
        </TabsContent>

        <TabsContent value="stabilization">
          <StabilizationDashboard periods={periods} companyId={selectedCompanyId} />
        </TabsContent>

        <TabsContent value="priorities">
          <StabilizationPriorities companyId={selectedCompanyId} />
        </TabsContent>

        <TabsContent value="payroll-truth">
          <PayrollTruthValidation companyId={selectedCompanyId} periodStatusId={activePeriod?.id} finalRecords={finalRecords} />
        </TabsContent>

        <TabsContent value="history">
          <ImportBatchHistory companyId={selectedCompanyId} key={refreshKey} />
        </TabsContent>

        <TabsContent value="audit">
          <DataIntegrityAudit companyId={selectedCompanyId} />
        </TabsContent>
      </Tabs>

      {/* Reconciliation Batch Dialog */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reconciliation Batch Mode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Using existing pay period for truth validation</p>

            <div className="space-y-2">
              <Label>Buscar periodo existente</Label>
              <Input
                value={batchSearch}
                onChange={e => setBatchSearch(e.target.value)}
                placeholder="Search by start date, end date or label"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 border-primary/40 text-primary"
                onClick={() => {
                  const target = payPeriods.find(pp => pp.start_date === "2025-12-24" && pp.end_date === "2025-12-30");
                  if (!target) {
                    toast({ title: "Periodo 2025-12-24 → 2025-12-30 no encontrado", variant: "destructive" });
                    return;
                  }
                  setSelectedBatchPayPeriodId(target.id);
                  setBatchSearch("2025-12-24 2025-12-30");
                }}
              >
                <Target className="h-3.5 w-3.5" />
                Open exact period 2025-12-24 → 2025-12-30
              </Button>
            </div>

            <ScrollArea className="h-64 rounded-md border">
              <div className="space-y-1 p-2">
                {batchCandidates.map(pp => {
                  const isTruth = pp.start_date === "2025-12-24" && pp.end_date === "2025-12-30";
                  const linked = periods.find(p => p.period_id === pp.id);
                  const isSelected = selectedBatchPayPeriodId === pp.id;
                  return (
                    <button
                      key={pp.id}
                      type="button"
                      onClick={() => setSelectedBatchPayPeriodId(pp.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{pp.start_date} → {pp.end_date}</span>
                        <div className="flex items-center gap-1.5">
                          {isTruth && <Badge variant="default" className="text-[10px]">Truth target</Badge>}
                          {linked && <Badge variant="secondary" className="text-[10px]">Batch existente</Badge>}
                        </div>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">Estado periodo: {pp.status}</p>
                    </button>
                  );
                })}
                {batchCandidates.length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">No hay periodos que coincidan con la búsqueda.</p>
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDialog(false)}>Cancelar</Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowBatchDialog(false);
                setShowWeeklyCreateDialog(true);
              }}
            >
              Crear nuevo periodo semanal
            </Button>
            <Button
              onClick={() => {
                if (!selectedBatchPayPeriodId) {
                  toast({ title: "Selecciona un periodo", variant: "destructive" });
                  return;
                }
                handleCreateFromPayPeriod(selectedBatchPayPeriodId);
              }}
            >
              Crear/Reusar batch de reconciliación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Weekly Period Dialog (manual) */}
      <Dialog open={showWeeklyCreateDialog} onOpenChange={setShowWeeklyCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Periodo Semanal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre del Periodo</Label>
              <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Ej: Semana 12 - Mar 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha Inicio</Label>
                <Input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} />
              </div>
              <div>
                <Label>Fecha Fin</Label>
                <Input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWeeklyCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreatePeriod}>Crear Periodo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Extracted: Active Period Info Bar ── */
function ActivePeriodBar({ period, isLocked }: { period: PeriodStatus; isLocked: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>Periodo activo:</span>
      <Badge variant="secondary" className="text-xs">
        {period.period_label} — {period.status}
        {period.reopen_count > 0 && ` (↻${period.reopen_count})`}
      </Badge>
      {isLocked && <Badge variant="destructive" className="text-xs gap-1"><Lock className="h-3 w-3" /> Bloqueado</Badge>}
    </div>
  );
}

/* ── Extracted: Approve Tab ── */
function ApproveTab({ period, onUpdateStatus, onApprove, onGoToPublish }: {
  period: PeriodStatus;
  onUpdateStatus: (id: string, status: string) => Promise<void>;
  onApprove: () => Promise<void>;
  onGoToPublish: () => void;
}) {
  const steps = [
    { step: "reviewing", label: "En Revisión", icon: Eye, action: () => onUpdateStatus(period.id, "reviewing") },
    { step: "approved", label: "Aprobado", icon: CheckCircle2, action: onApprove },
    { step: "posted", label: "Publicado", icon: FileText, action: onGoToPublish },
    { step: "locked", label: "Cerrado", icon: Lock, action: onGoToPublish },
  ];

  const stepsOrder = ["importing", "normalizing", "matching", "reviewing", "approved", "posted", "locked"];
  const currentIdx = stepsOrder.indexOf(period.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm">Periodo:</span>
        <Badge variant="secondary" className="text-xs">{period.period_label} — {period.status}</Badge>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {steps.map(({ step, label, icon: Icon, action }) => {
          const stepIdx = stepsOrder.indexOf(step);
          const isDone = currentIdx >= stepIdx;
          const isNext = currentIdx === stepIdx - 1;
          return (
            <div key={step} className={`p-4 rounded-lg border-2 text-center space-y-2 ${isDone ? "border-primary bg-primary/5" : isNext ? "border-dashed border-primary/50" : "border-border opacity-50"}`}>
              <Icon className={`h-6 w-6 mx-auto ${isDone ? "text-primary" : "text-muted-foreground"}`} />
              <p className="text-sm font-medium">{label}</p>
              {isDone && <Badge variant="default" className="text-xs">✓</Badge>}
              {isNext && <Button size="sm" onClick={action} className="mt-2">{label}</Button>}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
        <div className="text-center">
          <div className="text-2xl font-bold">{period.total_employees}</div>
          <div className="text-xs text-muted-foreground">Empleados</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{period.total_matches}</div>
          <div className="text-xs text-muted-foreground">Matches</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{period.total_exceptions - period.resolved_exceptions}</div>
          <div className="text-xs text-muted-foreground">Excepciones</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{period.approved_matches}/{period.total_matches}</div>
          <div className="text-xs text-muted-foreground">Aprobados</div>
        </div>
      </div>
    </div>
  );
}
