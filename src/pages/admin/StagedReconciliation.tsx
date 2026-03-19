import { useState, useCallback, useEffect, useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useReconciliationPeriod } from "@/hooks/useReconciliationPeriod";
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
import {
  Upload, GitCompareArrows, AlertTriangle, CheckCircle2, FileText, BarChart3,
  Users, ArrowRight, Lock, Eye, Shield, ClipboardCheck, Settings2, Wrench, Rocket,
  ChevronRight, Zap,
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
const TABS = [
  { value: "dashboard", label: "Dashboard", icon: BarChart3, alwaysEnabled: true },
  { value: "import", label: "Importar", icon: Upload, minStatus: null },
  { value: "review", label: "Matching", icon: GitCompareArrows, minStatus: "importing" },
  { value: "exceptions", label: "Excepciones", icon: AlertTriangle, minStatus: "importing" },
  { value: "employees", label: "Empleados", icon: Users, minStatus: "matching" },
  { value: "rules", label: "Reglas", icon: Settings2, alwaysEnabled: true },
  { value: "workbench", label: "Workbench", icon: Wrench, minStatus: "reviewing" },
  { value: "approve", label: "Aprobar", icon: CheckCircle2, minStatus: "reviewing" },
  { value: "validate", label: "Validar", icon: ClipboardCheck, minStatus: "reviewing" },
  { value: "publish", label: "Publicar", icon: Shield, minStatus: "approved" },
  { value: "pilot", label: "Piloto", icon: Rocket, minStatus: "reviewing" },
  { value: "history", label: "Historial", icon: FileText, alwaysEnabled: true },
] as const;

function isTabEnabled(tab: typeof TABS[number], periodStatus: string | null): boolean {
  if (tab.alwaysEnabled) return true;
  if (!periodStatus) return tab.value === "import";
  if (!tab.minStatus) return true;
  return STATUS_ORDER.indexOf(periodStatus) >= STATUS_ORDER.indexOf(tab.minStatus);
}

export default function StagedReconciliation() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const {
    periods, loading, activePeriod, setActivePeriod,
    finalRecords, closingReceipt, loadPeriods, createPeriod, updatePeriodStatus,
    loadFinalRecords, generateFinalRecords, postFinalRecords,
    saveMappingCorrection, reopenPeriod, loadClosingReceipt,
    validateBeforePublish, analyzeVariances, runValidation,
  } = useReconciliationPeriod(selectedCompanyId);

  const [tab, setTab] = useState("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [employeeMap, setEmployeeMap] = useState<Map<string, string>>(new Map());

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

  // ── Period creation ──
  const handleCreatePeriod = async () => {
    if (!newLabel || !newStart || !newEnd) {
      toast({ title: "Completa todos los campos", variant: "destructive" });
      return;
    }
    const p = await createPeriod(newLabel, newStart, newEnd);
    if (p) {
      setActivePeriod(p);
      setTab("import");
      setShowCreateDialog(false);
      setNewLabel(""); setNewStart(""); setNewEnd("");
    }
  };

  const handleSelectPeriod = (p: PeriodStatus) => {
    setActivePeriod(p);
    loadFinalRecords(p.id);
    loadClosingReceipt(p.id);
    // Navigate to the most relevant tab for this period's status
    const step = WORKFLOW_STEPS.find(s => s.key === p.status);
    setTab(step?.tab || "employees");
  };

  // ── Core actions ──
  const handleGenerateRecords = async () => {
    if (!activePeriod) return;
    await generateFinalRecords(activePeriod.id);
  };

  const handleApprovePeriod = async () => {
    if (!activePeriod) return;
    await updatePeriodStatus(activePeriod.id, "approved");
    toast({ title: "Periodo aprobado" });
  };

  const handlePostPeriod = async () => {
    if (!activePeriod) return;
    setPublishing(true);
    await postFinalRecords(activePeriod.id);
    setPublishing(false);
  };

  const handleLockPeriod = async () => {
    if (!activePeriod) return;
    await updatePeriodStatus(activePeriod.id, "locked");
    toast({ title: "Periodo cerrado y bloqueado" });
  };

  const handleReopen = async (reason: string) => {
    if (!activePeriod) return;
    await reopenPeriod(activePeriod.id, reason);
  };

  const handleRunValidation = async (isDryRun: boolean, uat: Record<string, boolean>, notes?: string) => {
    if (!activePeriod) return null;
    return runValidation(activePeriod.id, isDryRun, uat, employeeMap, notes);
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cierre Semanal"
        subtitle="Importar → Emparejar → Revisar → Aprobar → Publicar → Cerrar"
      />

      {/* ── Active Period Status Bar ── */}
      {activePeriod && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-muted/40 border">
          {/* Mini workflow progress */}
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

          {/* Period name + quick info */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-[11px] font-mono">
              {activePeriod.period_label}
            </Badge>
            {activePeriod.reopen_count > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                ↻{activePeriod.reopen_count}
              </Badge>
            )}
          </div>

          {/* Next action button */}
          {nextAction && activePeriod.status !== "locked" && (
            <Button size="sm" variant="default" className="gap-1 text-xs shrink-0" onClick={() => setTab(nextAction.tab)}>
              <Zap className="h-3 w-3" /> {nextAction.label}
            </Button>
          )}
        </div>
      )}

      {/* ── Warning bar for unresolved exceptions ── */}
      {activePeriod && activePeriod.total_exceptions > activePeriod.resolved_exceptions && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs flex items-center gap-2">
            {activePeriod.total_exceptions - activePeriod.resolved_exceptions} excepción(es) sin resolver
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setTab("exceptions")}>
              Ver excepciones
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-max">
            {TABS.map(t => {
              const enabled = isTabEnabled(t, activePeriod?.status || null);
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  disabled={!enabled}
                  className="gap-1 text-[11px]"
                >
                  <Icon className="h-3 w-3" /> {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="dashboard">
          <ReconciliationDashboard periods={periods} onSelectPeriod={handleSelectPeriod} onCreatePeriod={() => setShowCreateDialog(true)} />
        </TabsContent>

        <TabsContent value="import">
          {activePeriod && (
            <ActivePeriodBar period={activePeriod} isLocked={!!isLocked} />
          )}
          {isLocked ? (
            <NoPeriodPlaceholder icon={Lock} text="Este periodo está cerrado. No se permiten nuevas importaciones." />
          ) : (
            <StagedImportWizard
              companyId={selectedCompanyId}
              onComplete={refresh}
              activePeriodId={activePeriod?.id}
              onBatchLinked={() => loadPeriods()}
            />
          )}
        </TabsContent>

        <TabsContent value="review">
          <ReconciliationReviewPanel companyId={selectedCompanyId} onRefresh={refresh} key={refreshKey} />
        </TabsContent>

        <TabsContent value="exceptions">
          <ExceptionQueue companyId={selectedCompanyId} onRefresh={refresh} key={refreshKey} />
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
            <ApproveTab
              period={activePeriod}
              onUpdateStatus={updatePeriodStatus}
              onApprove={handleApprovePeriod}
              onGoToPublish={() => setTab("publish")}
            />
          ) : (
            <NoPeriodPlaceholder icon={CheckCircle2} />
          )}
        </TabsContent>

        <TabsContent value="validate">
          {activePeriod ? (
            <VerificationReport
              period={activePeriod}
              finalRecords={finalRecords}
              employees={employeeMap}
              onRunValidation={handleRunValidation}
              onPublish={handlePostPeriod}
              publishing={publishing}
            />
          ) : (
            <NoPeriodPlaceholder icon={ClipboardCheck} text="Selecciona un periodo desde el Dashboard para validar." />
          )}
        </TabsContent>

        <TabsContent value="publish">
          {activePeriod ? (
            <PrePublishReview
              period={activePeriod}
              finalRecords={finalRecords}
              closingReceipt={closingReceipt}
              employees={employeeMap}
              validation={validation}
              onPublish={handlePostPeriod}
              onLock={handleLockPeriod}
              onReopen={handleReopen}
              publishing={publishing}
            />
          ) : (
            <NoPeriodPlaceholder icon={Shield} />
          )}
        </TabsContent>

        <TabsContent value="pilot">
          {activePeriod ? (
            <PilotComparisonReport
              companyId={selectedCompanyId}
              period={activePeriod}
              finalRecords={finalRecords}
              employees={employeeMap}
              variances={variances}
            />
          ) : (
            <NoPeriodPlaceholder icon={Rocket} text="Selecciona un periodo para generar el reporte piloto." />
          )}
        </TabsContent>

        <TabsContent value="history">
          <ImportBatchHistory companyId={selectedCompanyId} key={refreshKey} />
        </TabsContent>
      </Tabs>

      {/* Create Period Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
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
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
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
