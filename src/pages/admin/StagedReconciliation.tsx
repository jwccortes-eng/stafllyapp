import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Upload, GitCompareArrows, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import StagedImportWizard from "@/components/reconciliation/StagedImportWizard";
import ReconciliationReviewPanel from "@/components/reconciliation/ReconciliationReviewPanel";
import ExceptionQueue from "@/components/reconciliation/ExceptionQueue";
import ImportBatchHistory from "@/components/reconciliation/ImportBatchHistory";

export default function StagedReconciliation() {
  const { selectedCompanyId } = useCompany();
  const [tab, setTab] = useState("import");
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState({ batches: 0, exceptions: 0, matches: 0 });

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    Promise.all([
      supabase.from("import_batches").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId),
      supabase.from("reconciliation_exceptions").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId).eq("status", "open"),
      supabase.from("reconciliation_matches").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId).eq("match_status", "pending"),
    ]).then(([b, e, m]) => {
      setStats({
        batches: b.count || 0,
        exceptions: e.count || 0,
        matches: m.count || 0,
      });
    });
  }, [selectedCompanyId, refreshKey]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliación por Periodo"
        subtitle="Motor de conciliación staged: importar → normalizar → emparejar → revisar → publicar"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="import" className="gap-1.5">
            <Upload className="h-4 w-4" /> Importar
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-1.5">
            <GitCompareArrows className="h-4 w-4" /> Revisar
            {stats.matches > 0 && <Badge variant="secondary" className="ml-1 text-xs">{stats.matches}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Excepciones
            {stats.exceptions > 0 && <Badge variant="destructive" className="ml-1 text-xs">{stats.exceptions}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <FileText className="h-4 w-4" /> Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import">
          <StagedImportWizard companyId={selectedCompanyId} onComplete={refresh} />
        </TabsContent>
        <TabsContent value="review">
          <ReconciliationReviewPanel companyId={selectedCompanyId} onRefresh={refresh} key={refreshKey} />
        </TabsContent>
        <TabsContent value="exceptions">
          <ExceptionQueue companyId={selectedCompanyId} onRefresh={refresh} key={refreshKey} />
        </TabsContent>
        <TabsContent value="history">
          <ImportBatchHistory companyId={selectedCompanyId} key={refreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
