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
  StickyNote, ListChecks, Target, DollarSign, RefreshCw, Calendar, Hash, ShieldAlert, Database,
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
import { formatPeriodLabel } from "@/lib/format-helpers";

/* ── Status → workflow step mapping ── */
const WORKFLOW_STEPS_MATCHING = [
  { key: "importing", label: "Importar", tab: "import", icon: Upload },
  { key: "matching", label: "Match", tab: "review", icon: GitCompareArrows },
  { key: "reviewing", label: "Revisar", tab: "employees", icon: Users },
  { key: "approved", label: "Aprobar", tab: "approve", icon: CheckCircle2 },
  { key: "posted", label: "Publicar", tab: "publish", icon: Shield },
  { key: "locked", label: "Cerrado", tab: "publish", icon: Lock },
] as const;

const WORKFLOW_STEPS_TRUTH = [
  { key: "importing", label: "Truth File", tab: "payroll-truth", icon: DollarSign },
  { key: "reviewing", label: "Reconciliar", tab: "payroll-truth", icon: ClipboardCheck },
  { key: "approved", label: "Aprobar", tab: "approve", icon: CheckCircle2 },
  { key: "posted", label: "Publicar", tab: "publish", icon: Shield },
  { key: "locked", label: "Cerrado", tab: "publish", icon: Lock },
] as const;

const STATUS_ORDER = ["importing", "normalizing", "matching", "reviewing", "approved", "posted", "locked"];
const STATUS_ORDER_TRUTH = ["importing", "reviewing", "approved", "posted", "locked"];

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
  return formatPeriodLabel(pp.start_date, pp.end_date, pp.sequence_number);
}

export default function StagedReconciliation() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const { user } = useAuth();
  const {
    periods, loading, activePeriod, setActivePeriod,
    finalRecords, closingReceipt, loadPeriods, createPeriod, updatePeriodStatus,
    loadFinalRecords, generateFinalRecords, generateFinalRecordsFromTruth, postFinalRecords,
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
    const label = periodLabel(pp);
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

  // ── Sequence number lookup for reconciliation periods ──
  const seqMap = useMemo(() => {
    const m = new Map<string, number>();
    payPeriods.forEach(pp => { if (pp.sequence_number) m.set(pp.id, pp.sequence_number); });
    return m;
  }, [payPeriods]);

  /** Get unified label for a reconciliation period */
  const reconPeriodLabel = useCallback((p: PeriodStatus) => {
    const seq = p.period_id ? seqMap.get(p.period_id) : null;
    return formatPeriodLabel(p.period_start, p.period_end, seq, p.period_label);
  }, [seqMap]);

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
        const label = periodLabel(pp).toLowerCase();
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
    // Determine closure method: if no clocks, mark as truth_validation
    const closureMethod = activePeriod.total_clocks === 0 ? "truth_validation" : "matching";
    await updatePeriodStatus(activePeriod.id, "approved");
    // Set closure_method on the period
    await supabase.from("reconciliation_period_status" as any)
      .update({ closure_method: closureMethod } as any)
      .eq("id", activePeriod.id);
    await logJournal("approval", `Periodo aprobado (${closureMethod === "truth_validation" ? "cierre vía truth" : "cierre vía matching"})`);
    toast({ title: "Periodo aprobado", description: closureMethod === "truth_validation" ? "Cerrado mediante validación de Payroll Truth" : undefined });
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
  const isTruthBased = activePeriod && (activePeriod.closure_method === "truth_validation" || activePeriod.total_clocks === 0);
  const workflowSteps = isTruthBased ? WORKFLOW_STEPS_TRUTH : WORKFLOW_STEPS_MATCHING;
  const statusOrder = isTruthBased ? STATUS_ORDER_TRUTH : STATUS_ORDER;
  const currentStepIdx = activePeriod ? statusOrder.indexOf(activePeriod.status) : -1;

  // ── Next action guidance ──
  const nextAction = useMemo(() => {
    if (!activePeriod) return null;
    const s = activePeriod.status;
    if (isTruthBased) {
      if (s === "importing" || s === "normalizing") return { label: "Cargar Truth File", tab: "payroll-truth", icon: DollarSign };
      if (s === "matching" || s === "reviewing") return { label: "Reconciliar vía Truth", tab: "payroll-truth", icon: ClipboardCheck };
      if (s === "approved") return { label: "Publicar periodo", tab: "publish", icon: Shield };
      if (s === "posted") return { label: "Cerrar periodo", tab: "publish", icon: Lock };
      if (s === "locked") return { label: "Periodo cerrado ✓", tab: "publish", icon: CheckCircle2 };
      return { label: "Cargar Truth File", tab: "payroll-truth", icon: DollarSign };
    }
    if (s === "importing" || s === "normalizing") return { label: "Importar archivos", tab: "import", icon: Upload };
    if (s === "matching") return { label: "Revisar matches", tab: "review", icon: GitCompareArrows };
    if (s === "reviewing") return { label: "Generar y revisar empleados", tab: "employees", icon: Users };
    if (s === "approved") return { label: "Validar y publicar", tab: "validate", icon: ClipboardCheck };
    if (s === "posted") return { label: "Cerrar periodo", tab: "publish", icon: Lock };
    if (s === "locked") return { label: "Periodo cerrado ✓", tab: "publish", icon: CheckCircle2 };
    return null;
  }, [activePeriod, isTruthBased]);

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
            {(() => {
              // Build deduplicated, grouped options
              const q = periodSearch.trim().toLowerCase();
              const linkedPPIds = new Set(periods.map(p => p.period_id).filter(Boolean));

              // Active period (current execution)
              const activePeriodEntry = activePeriod;

              // Other reconciliation periods (exclude active)
              const otherRecon = periods
                .filter(p => p.id !== activePeriod?.id)
                .filter(p => !q || reconPeriodLabel(p).toLowerCase().includes(q));

              // Unlinked pay periods (no recon yet), exclude any whose date range matches an existing recon period
              const reconRanges = new Set(periods.map(p => `${p.period_start}|${p.period_end}`));
              const unlinked = payPeriods
                .filter(pp => !linkedPPIds.has(pp.id))
                .filter(pp => !reconRanges.has(`${pp.start_date}|${pp.end_date}`))
                .filter(pp => !q || periodLabel(pp).toLowerCase().includes(q))
                .sort((a, b) => b.start_date.localeCompare(a.start_date));

              // Split unlinked into recent (last 8 weeks) and historical
              const eightWeeksAgo = new Date();
              eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
              const cutoff = eightWeeksAgo.toISOString().slice(0, 10);
              const recentUnlinked = unlinked.filter(pp => pp.start_date >= cutoff);
              const historicalUnlinked = unlinked.filter(pp => pp.start_date < cutoff);

              return (
                <Select
                  value={activePeriod?.id || ""}
                  onValueChange={handlePeriodSelectorChange}
                >
                  <SelectTrigger className="w-full md:w-[380px]">
                    <SelectValue placeholder="Selecciona un periodo para operar">
                      {activePeriodEntry && (
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-primary shrink-0" />
                          {reconPeriodLabel(activePeriodEntry)}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[360px]">
                    {/* Search */}
                    <div className="px-2 py-1.5">
                      <Input
                        placeholder="Buscar por número o fecha..."
                        value={periodSearch}
                        onChange={e => setPeriodSearch(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* ── Active execution period ── */}
                    {activePeriodEntry && (!q || reconPeriodLabel(activePeriodEntry).toLowerCase().includes(q)) && (
                      <>
                        <div className="px-2 py-1.5 text-[11px] font-semibold text-primary flex items-center gap-1.5">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                          Periodo activo
                        </div>
                        <SelectItem value={activePeriodEntry.id} className="font-medium">
                          {reconPeriodLabel(activePeriodEntry)}
                        </SelectItem>
                      </>
                    )}

                    {/* ── Other reconciliation periods ── */}
                    {otherRecon.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">Otros periodos de reconciliación</div>
                        {otherRecon.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {reconPeriodLabel(p)}
                            <span className="ml-1.5 text-muted-foreground">· {p.status}</span>
                          </SelectItem>
                        ))}
                      </>
                    )}

                    {/* ── Recent unlinked pay periods ── */}
                    {recentUnlinked.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">Periodos sin reconciliar</div>
                        {recentUnlinked.map(pp => (
                          <SelectItem key={`pp:${pp.id}`} value={`pp:${pp.id}`} className="text-muted-foreground">
                            {periodLabel(pp)}
                          </SelectItem>
                        ))}
                      </>
                    )}

                    {/* ── Historical (collapsed) ── */}
                    {historicalUnlinked.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground/60">
                          Históricos ({historicalUnlinked.length})
                        </div>
                        {historicalUnlinked.slice(0, 5).map(pp => (
                          <SelectItem key={`pp:${pp.id}`} value={`pp:${pp.id}`} className="text-muted-foreground/60 text-xs">
                            {periodLabel(pp)}
                          </SelectItem>
                        ))}
                        {historicalUnlinked.length > 5 && (
                          <div className="px-2 py-1 text-[10px] text-muted-foreground/40 italic">
                            +{historicalUnlinked.length - 5} periodos anteriores (busca por fecha)
                          </div>
                        )}
                      </>
                    )}

                    {/* Create new */}
                    <SelectItem value="__create__" className="text-primary font-medium">
                      ➕ Crear nuevo periodo...
                    </SelectItem>
                  </SelectContent>
                </Select>
              );
            })()}

            {/* Exact truth period shortcut */}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0 border-primary/40 text-primary hover:bg-primary/10"
              onClick={handleOpenTruthPeriod}
            >
              <Target className="h-3.5 w-3.5" />
              Periodo 112 · 2025-12-24 → 2025-12-30
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
                <span className="font-mono">{reconPeriodLabel(activePeriod)}</span>
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
        <div className="flex flex-col gap-2">
          {/* Truth-based closure banner */}
          {isTruthBased && (
            <Alert className="py-2 border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
              <FileText className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs">
                <strong>Truth-based closure</strong> — Clock data unavailable for this period; closure based on paid payroll truth file.
                El flujo es: <span className="font-medium">Cargar Truth → Reconciliar → Aprobar → Publicar</span>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-muted/40 border">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {workflowSteps.map((step, i) => {
                const stepIdx = statusOrder.indexOf(step.key);
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
                    {i < workflowSteps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isTruthBased && (
                <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400">
                  📋 Truth-based closure
                </Badge>
              )}
              <Badge variant="outline" className="text-[11px] font-mono">{reconPeriodLabel(activePeriod)}</Badge>
              {activePeriod.reopen_count > 0 && <Badge variant="warning" className="text-[10px]">↻{activePeriod.reopen_count}</Badge>}
            </div>
            {nextAction && activePeriod.status !== "locked" && (
              <Button size="sm" variant="default" className="gap-1 text-xs shrink-0" onClick={() => setTab(nextAction.tab)}>
                <Zap className="h-3 w-3" /> {nextAction.label}
              </Button>
            )}
          </div>
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
          <ReconciliationDashboard periods={periods} onSelectPeriod={handleSelectPeriod} onCreatePeriod={() => setShowBatchDialog(true)} formatLabel={reconPeriodLabel} />
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
          {isTruthBased ? (
            <div className="space-y-4">
              <Alert className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
                <FileText className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm">
                  <strong>Matching no disponible para este periodo.</strong><br />
                  Clock data unavailable for {activePeriod?.period_start} → {activePeriod?.period_end}.
                  Usa <strong>Payroll Truth</strong> como método de cierre.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button size="sm" variant="default" className="gap-1.5" onClick={() => setTab("payroll-truth")}>
                  <DollarSign className="h-4 w-4" /> Ir a Payroll Truth
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTab("approve")}>
                  <CheckCircle2 className="h-4 w-4" /> Ir a Aprobar
                </Button>
              </div>
            </div>
          ) : (
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
          )}
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
            <ApproveTab period={activePeriod} onUpdateStatus={updatePeriodStatus} onApprove={handleApprovePeriod} onGoToPublish={() => setTab("publish")} isTruthBased={!!isTruthBased} />
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
          <div className="space-y-4">
            <PayrollTruthValidation companyId={selectedCompanyId} periodStatusId={activePeriod?.id} finalRecords={finalRecords} />
            {isTruthBased && activePeriod && (
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
                <Database className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Materializar registros para publicación</p>
                  <p className="text-xs text-muted-foreground">
                    {finalRecords.length > 0
                      ? `${finalRecords.length} registros ya generados — puedes regenerar si actualizaste la reconciliación.`
                      : "Genera registros finales desde los resultados de Truth Validation para habilitar la aprobación y publicación."}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={async () => {
                    await generateFinalRecordsFromTruth(activePeriod.id);
                    await logJournal("truth_materialize", "Registros finales generados desde Truth Validation");
                  }}
                >
                  <Database className="h-3.5 w-3.5" /> Generar Registros desde Truth
                </Button>
              </div>
            )}
          </div>
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
                Periodo 112 · 2025-12-24 → 2025-12-30
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
                        <span className="text-sm font-medium">{periodLabel(pp)}</span>
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
  const closureMethod = period.closure_method;
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
      <span>Periodo activo:</span>
      <Badge variant="secondary" className="text-xs">
        {period.period_label} — {period.status}
        {period.reopen_count > 0 && ` (↻${period.reopen_count})`}
      </Badge>
      {closureMethod === "truth_validation" && (
        <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 bg-amber-50">
          📋 Cierre vía Truth · Sin fichajes
        </Badge>
      )}
      {isLocked && <Badge variant="destructive" className="text-xs gap-1"><Lock className="h-3 w-3" /> Bloqueado</Badge>}
    </div>
  );
}

/* ── Extracted: Approve Tab ── */
function ApproveTab({ period, onUpdateStatus, onApprove, onGoToPublish, isTruthBased }: {
  period: PeriodStatus;
  onUpdateStatus: (id: string, status: string) => Promise<void>;
  onApprove: () => Promise<void>;
  onGoToPublish: () => void;
  isTruthBased?: boolean;
}) {
  const truthSteps = [
    { step: "reviewing", label: "Truth Reconciliado", icon: ClipboardCheck, action: () => onUpdateStatus(period.id, "reviewing") },
    { step: "approved", label: "Aprobado", icon: CheckCircle2, action: onApprove },
    { step: "posted", label: "Publicado", icon: FileText, action: onGoToPublish },
    { step: "locked", label: "Cerrado", icon: Lock, action: onGoToPublish },
  ];

  const matchingSteps = [
    { step: "reviewing", label: "En Revisión", icon: Eye, action: () => onUpdateStatus(period.id, "reviewing") },
    { step: "approved", label: "Aprobado", icon: CheckCircle2, action: onApprove },
    { step: "posted", label: "Publicado", icon: FileText, action: onGoToPublish },
    { step: "locked", label: "Cerrado", icon: Lock, action: onGoToPublish },
  ];

  const steps = isTruthBased ? truthSteps : matchingSteps;
  const stepsOrder = isTruthBased
    ? ["importing", "reviewing", "approved", "posted", "locked"]
    : ["importing", "normalizing", "matching", "reviewing", "approved", "posted", "locked"];
  const currentIdx = stepsOrder.indexOf(period.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm">Periodo:</span>
        <Badge variant="secondary" className="text-xs">{period.period_label} — {period.status}</Badge>
        {isTruthBased && (
          <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400">
            📋 Truth-based closure
          </Badge>
        )}
      </div>
      {isTruthBased && (
        <Alert className="py-2 border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
          <FileText className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs">
            Clock data unavailable for this period. Approval is based on <strong>Payroll Truth validation</strong> results.
            No se requiere matching schedule↔clock para aprobar.
          </AlertDescription>
        </Alert>
      )}
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
          <div className="text-2xl font-bold">{isTruthBased ? "N/A" : period.total_matches}</div>
          <div className="text-xs text-muted-foreground">{isTruthBased ? "Matches (N/A)" : "Matches"}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{period.total_exceptions - period.resolved_exceptions}</div>
          <div className="text-xs text-muted-foreground">Excepciones</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{isTruthBased ? "Truth" : `${period.approved_matches}/${period.total_matches}`}</div>
          <div className="text-xs text-muted-foreground">{isTruthBased ? "Método de cierre" : "Aprobados"}</div>
        </div>
      </div>
    </div>
  );
}
