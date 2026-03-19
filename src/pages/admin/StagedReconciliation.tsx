import { useState, useCallback, useEffect } from "react";
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
import {
  Upload, GitCompareArrows, AlertTriangle, CheckCircle2, FileText, BarChart3,
  Users, ArrowRight, Lock, Eye, Shield, ClipboardCheck,
} from "lucide-react";
import StagedImportWizard from "@/components/reconciliation/StagedImportWizard";
import ReconciliationReviewPanel from "@/components/reconciliation/ReconciliationReviewPanel";
import ExceptionQueue from "@/components/reconciliation/ExceptionQueue";
import ImportBatchHistory from "@/components/reconciliation/ImportBatchHistory";
import ReconciliationDashboard from "@/components/reconciliation/ReconciliationDashboard";
import EmployeePeriodReconciliation from "@/components/reconciliation/EmployeePeriodReconciliation";
import PrePublishReview from "@/components/reconciliation/PrePublishReview";
import VerificationReport from "@/components/reconciliation/VerificationReport";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

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

  // Load employee names
  useEffect(() => {
    if (!selectedCompanyId) return;
    supabase.from("employees").select("id, first_name, last_name").eq("company_id", selectedCompanyId)
      .then(({ data }) => {
        const map = new Map<string, string>();
        (data || []).forEach(e => map.set(e.id, `${e.first_name} ${e.last_name}`));
        setEmployeeMap(map);
      });
  }, [selectedCompanyId]);

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    loadPeriods();
  }, [loadPeriods]);

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
    if (["approved", "posted", "locked"].includes(p.status)) setTab("publish");
    else if (p.status === "reviewing") setTab("employees");
    else if (["importing", "normalizing"].includes(p.status)) setTab("import");
    else if (p.status === "matching") setTab("review");
    else setTab("employees");
  };

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

  const validation = validateBeforePublish(finalRecords);

  const periodStatusLabel = activePeriod ? (
    <Badge variant="secondary" className="ml-2 text-xs">
      {activePeriod.period_label} — {activePeriod.status}
      {activePeriod.reopen_count > 0 && ` (reabierto ×${activePeriod.reopen_count})`}
    </Badge>
  ) : null;

  const isLocked = activePeriod && ["posted", "locked"].includes(activePeriod.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliación por Periodo"
        subtitle="Motor de conciliación operacional: importar → normalizar → emparejar → revisar → aprobar → publicar → cerrar"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" /> Importar
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-1.5 text-xs">
            <GitCompareArrows className="h-3.5 w-3.5" /> Matching
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="gap-1.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" /> Excepciones
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" /> Empleados
          </TabsTrigger>
          <TabsTrigger value="approve" className="gap-1.5 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar
          </TabsTrigger>
          <TabsTrigger value="publish" className="gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" /> Publicar
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" /> Historial
          </TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard">
          <ReconciliationDashboard
            periods={periods}
            onSelectPeriod={handleSelectPeriod}
            onCreatePeriod={() => setShowCreateDialog(true)}
          />
        </TabsContent>

        {/* Import */}
        <TabsContent value="import">
          {activePeriod && (
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              Periodo activo: {periodStatusLabel}
              {isLocked && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <Lock className="h-3 w-3" /> Bloqueado
                </Badge>
              )}
            </div>
          )}
          {isLocked ? (
            <div className="text-center py-12 text-muted-foreground">
              <Lock className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Este periodo está cerrado. No se permiten nuevas importaciones.</p>
              <p className="text-xs mt-1">Reabre el periodo desde la pestaña "Publicar" si necesitas importar datos.</p>
            </div>
          ) : (
            <StagedImportWizard
              companyId={selectedCompanyId}
              onComplete={refresh}
              activePeriodId={activePeriod?.id}
              onBatchLinked={() => loadPeriods()}
            />
          )}
        </TabsContent>

        {/* Matching */}
        <TabsContent value="review">
          <ReconciliationReviewPanel companyId={selectedCompanyId} onRefresh={refresh} key={refreshKey} />
        </TabsContent>

        {/* Exceptions */}
        <TabsContent value="exceptions">
          <ExceptionQueue companyId={selectedCompanyId} onRefresh={refresh} key={refreshKey} />
        </TabsContent>

        {/* Employee-by-Employee */}
        <TabsContent value="employees">
          {activePeriod ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Periodo:</span>
                  {periodStatusLabel}
                </div>
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
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Selecciona un periodo desde el Dashboard.</p>
            </div>
          )}
        </TabsContent>

        {/* Approve */}
        <TabsContent value="approve">
          {activePeriod ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="text-sm">Periodo:</span> {periodStatusLabel}
              </div>

              <div className="grid grid-cols-4 gap-4">
                {[
                  { step: "reviewing", label: "En Revisión", icon: Eye, action: () => updatePeriodStatus(activePeriod.id, "reviewing") },
                  { step: "approved", label: "Aprobado", icon: CheckCircle2, action: handleApprovePeriod },
                  { step: "posted", label: "Publicado", icon: FileText, action: () => setTab("publish") },
                  { step: "locked", label: "Cerrado", icon: Lock, action: () => setTab("publish") },
                ].map(({ step, label, icon: Icon, action }) => {
                  const steps = ["importing", "normalizing", "matching", "reviewing", "approved", "posted", "locked"];
                  const currentIdx = steps.indexOf(activePeriod.status);
                  const stepIdx = steps.indexOf(step);
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
                  <div className="text-2xl font-bold">{activePeriod.total_employees}</div>
                  <div className="text-xs text-muted-foreground">Empleados</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{activePeriod.total_matches}</div>
                  <div className="text-xs text-muted-foreground">Matches</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{activePeriod.total_exceptions - activePeriod.resolved_exceptions}</div>
                  <div className="text-xs text-muted-foreground">Excepciones</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{activePeriod.approved_matches}/{activePeriod.total_matches}</div>
                  <div className="text-xs text-muted-foreground">Aprobados</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Selecciona un periodo desde el Dashboard.</p>
            </div>
          )}
        </TabsContent>

        {/* Publish — Pre-publish review + Receipt */}
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
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Selecciona un periodo desde el Dashboard.</p>
            </div>
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <ImportBatchHistory companyId={selectedCompanyId} key={refreshKey} />
        </TabsContent>
      </Tabs>

      {/* Create Period Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Periodo de Reconciliación</DialogTitle>
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
