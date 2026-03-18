import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { usePageView } from "@/hooks/useAuditLog";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import MigrationOverview from "@/components/migration/MigrationOverview";
import EmployeeMatchingTab from "@/components/migration/EmployeeMatchingTab";
import ShiftMatchingTab from "@/components/migration/ShiftMatchingTab";
import ClockMatchingTab from "@/components/migration/ClockMatchingTab";
import PayrollReconciliationTab from "@/components/migration/PayrollReconciliationTab";
import WeeklyCloseTab from "@/components/migration/WeeklyCloseTab";
import ExceptionsTab from "@/components/migration/ExceptionsTab";
import { ArrowLeftRight, Users, CalendarDays, Clock, DollarSign, CalendarCheck, AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MigrationStats {
  pilotStatus: any;
  employeeCounts: { total: number; matched: number; unresolved: number };
  shiftCounts: { total: number; matched: number; missing: number; conflicts: number };
  clockCounts: { total: number; matched: number; orphan: number; mismatch: number };
  periodCounts: { total: number; reconciled: number; locked: number; draft: number };
  exceptionCounts: { total: number; open: number; critical: number };
}

const EMPTY_STATS: MigrationStats = {
  pilotStatus: null,
  employeeCounts: { total: 0, matched: 0, unresolved: 0 },
  shiftCounts: { total: 0, matched: 0, missing: 0, conflicts: 0 },
  clockCounts: { total: 0, matched: 0, orphan: 0, mismatch: 0 },
  periodCounts: { total: 0, reconciled: 0, locked: 0, draft: 0 },
  exceptionCounts: { total: 0, open: 0, critical: 0 },
};

export default function MigrationCommandCenter() {
  usePageView("Migration Command Center");
  const navigate = useNavigate();
  const { selectedCompanyId: companyId } = useCompany();
  const [stats, setStats] = useState<MigrationStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    const [pilotRes, empRes, shiftRes, clockRes, periodRes, excRes] = await Promise.all([
      supabase.from("migration_pilot_status").select("*").eq("company_id", companyId).maybeSingle(),
      supabase.from("migration_employee_mapping").select("match_status").eq("company_id", companyId),
      supabase.from("migration_shift_mapping").select("match_status").eq("company_id", companyId),
      supabase.from("migration_clock_mapping").select("match_status").eq("company_id", companyId),
      supabase.from("migration_period_reconciliation").select("status").eq("company_id", companyId),
      supabase.from("migration_exceptions").select("status, severity").eq("company_id", companyId),
    ]);

    const empData = empRes.data || [];
    const shiftData = shiftRes.data || [];
    const clockData = clockRes.data || [];
    const periodData = periodRes.data || [];
    const excData = excRes.data || [];

    setStats({
      pilotStatus: pilotRes.data,
      employeeCounts: {
        total: empData.length,
        matched: empData.filter(e => ["exact_match", "probable_match", "manually_resolved"].includes(e.match_status)).length,
        unresolved: empData.filter(e => e.match_status === "unresolved" || e.match_status === "pending").length,
      },
      shiftCounts: {
        total: shiftData.length,
        matched: shiftData.filter(s => ["exact_match", "probable_match", "manually_resolved"].includes(s.match_status)).length,
        missing: shiftData.filter(s => s.match_status === "missing_in_staflyapps").length,
        conflicts: shiftData.filter(s => s.match_status === "conflict").length,
      },
      clockCounts: {
        total: clockData.length,
        matched: clockData.filter(c => ["exact_match", "within_tolerance", "manually_resolved"].includes(c.match_status)).length,
        orphan: clockData.filter(c => c.match_status === "orphan_clock").length,
        mismatch: clockData.filter(c => c.match_status === "duration_mismatch").length,
      },
      periodCounts: {
        total: periodData.length,
        reconciled: periodData.filter(p => p.status === "reconciled").length,
        locked: periodData.filter(p => p.status === "locked").length,
        draft: periodData.filter(p => p.status === "draft_imported").length,
      },
      exceptionCounts: {
        total: excData.length,
        open: excData.filter(e => e.status === "open" || e.status === "in_progress").length,
        critical: excData.filter(e => e.severity === "critical" && e.status !== "resolved" && e.status !== "ignored").length,
      },
    });
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const tabBadge = (count: number, variant: "default" | "secondary" | "destructive" | "outline" = "secondary") =>
    count > 0 ? <Badge variant={variant} className="ml-1.5 text-xs">{count}</Badge> : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          title="Migration Command Center"
          subtitle="Connecteam → StaflyApps • Pilot Migration & Reconciliation"
        />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/app/reconciliation-report")}>
          <FileText className="h-4 w-4" /> Reconciliation Report
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <ArrowLeftRight className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-1.5">
            <Users className="h-4 w-4" /> Employees
            {tabBadge(stats.employeeCounts.unresolved, "destructive")}
          </TabsTrigger>
          <TabsTrigger value="shifts" className="gap-1.5">
            <CalendarDays className="h-4 w-4" /> Shifts
            {tabBadge(stats.shiftCounts.conflicts, "destructive")}
          </TabsTrigger>
          <TabsTrigger value="clock" className="gap-1.5">
            <Clock className="h-4 w-4" /> Clock
            {tabBadge(stats.clockCounts.orphan + stats.clockCounts.mismatch, "destructive")}
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1.5">
            <DollarSign className="h-4 w-4" /> Payroll
          </TabsTrigger>
          <TabsTrigger value="weekly-close" className="gap-1.5">
            <CalendarCheck className="h-4 w-4" /> Weekly Close
            {tabBadge(stats.periodCounts.draft, "outline")}
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Exceptions
            {tabBadge(stats.exceptionCounts.open, "destructive")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <MigrationOverview stats={stats} loading={loading} onRefresh={fetchStats} />
        </TabsContent>
        <TabsContent value="employees">
          <EmployeeMatchingTab companyId={companyId} onRefresh={fetchStats} />
        </TabsContent>
        <TabsContent value="shifts">
          <ShiftMatchingTab companyId={companyId} onRefresh={fetchStats} />
        </TabsContent>
        <TabsContent value="clock">
          <ClockMatchingTab companyId={companyId} onRefresh={fetchStats} />
        </TabsContent>
        <TabsContent value="payroll">
          <PayrollReconciliationTab companyId={companyId} onRefresh={fetchStats} />
        </TabsContent>
        <TabsContent value="weekly-close">
          <WeeklyCloseTab companyId={companyId} onRefresh={fetchStats} />
        </TabsContent>
        <TabsContent value="exceptions">
          <ExceptionsTab companyId={companyId} onRefresh={fetchStats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
