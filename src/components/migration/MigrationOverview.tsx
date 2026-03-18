import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { RefreshCw, ArrowRight, CheckCircle2, AlertTriangle, Clock, Shield } from "lucide-react";
import type { MigrationStats } from "@/pages/admin/MigrationCommandCenter";

const PHASE_LABELS: Record<string, string> = {
  historical_import: "📥 Historical Import",
  historical_reconciliation: "🔄 Historical Reconciliation",
  weekly_close_validation: "📋 Weekly Close Validation",
  live_sync_bridge: "🔗 Live Sync Bridge",
  operational_cutover: "🚀 Operational Cutover",
  connecteam_retired: "✅ Connecteam Retired",
};

const READINESS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  not_ready: "destructive",
  partially_ready: "outline",
  pilot_ready: "secondary",
  ready_for_cutover: "default",
  connecteam_read_only: "default",
  connecteam_retired: "default",
};

interface Props {
  stats: MigrationStats;
  loading: boolean;
  onRefresh: () => void;
}

export default function MigrationOverview({ stats, loading, onRefresh }: Props) {
  const ps = stats.pilotStatus;

  const totalMatched = stats.employeeCounts.matched + stats.shiftCounts.matched + stats.clockCounts.matched;
  const totalRecords = stats.employeeCounts.total + stats.shiftCounts.total + stats.clockCounts.total;
  const matchPct = totalRecords > 0 ? Math.round((totalMatched / totalRecords) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Pilot Company Header */}
      <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="py-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-semibold text-lg">Quality Staff by Keury LLC</span>
                <Badge variant="secondary" className="text-xs">PILOT</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Connecteam → StaflyApps Migration &amp; Reconciliation
              </p>
            </div>
            <div className="flex items-center gap-3">
              {ps && (
                <>
                  <div className="text-right text-sm">
                    <div className="text-muted-foreground">Phase</div>
                    <div className="font-medium">{PHASE_LABELS[ps.phase] || ps.phase}</div>
                  </div>
                  <Badge variant={READINESS_COLORS[ps.readiness] || "outline"}>
                    {ps.readiness?.replace(/_/g, " ")}
                  </Badge>
                </>
              )}
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>
          {ps && (
            <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
              <span>📅 {ps.date_range_start} → {ps.date_range_end}</span>
              <span>📦 {ps.total_weeks_imported || 0} weeks imported</span>
              <span>✅ {ps.total_weeks_reconciled || 0} reconciled</span>
              <span>⚠️ {ps.total_unresolved_issues || 0} unresolved</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Overall Match Rate" value={`${matchPct}%`} subtitle={`${totalMatched} / ${totalRecords} records`} />
        <KpiCard title="Employees Matched" value={stats.employeeCounts.matched} subtitle={`${stats.employeeCounts.unresolved} unresolved`} />
        <KpiCard title="Periods Reconciled" value={stats.periodCounts.reconciled} subtitle={`${stats.periodCounts.locked} locked`} />
        <KpiCard title="Open Exceptions" value={stats.exceptionCounts.open} subtitle={`${stats.exceptionCounts.critical} critical`} />
      </div>

      {/* Reconciliation Summary Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Shift Matching
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Total</span><span className="font-medium">{stats.shiftCounts.total}</span></div>
            <div className="flex justify-between"><span>Matched</span><span className="text-primary font-medium">{stats.shiftCounts.matched}</span></div>
            <div className="flex justify-between"><span>Missing in Stafly</span><span className="text-amber-600">{stats.shiftCounts.missing}</span></div>
            <div className="flex justify-between"><span>Conflicts</span><span className="text-destructive">{stats.shiftCounts.conflicts}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Clock Matching
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Total</span><span className="font-medium">{stats.clockCounts.total}</span></div>
            <div className="flex justify-between"><span>Matched</span><span className="text-primary font-medium">{stats.clockCounts.matched}</span></div>
            <div className="flex justify-between"><span>Orphan Clocks</span><span className="text-amber-600">{stats.clockCounts.orphan}</span></div>
            <div className="flex justify-between"><span>Duration Mismatch</span><span className="text-destructive">{stats.clockCounts.mismatch}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Exceptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Total</span><span className="font-medium">{stats.exceptionCounts.total}</span></div>
            <div className="flex justify-between"><span>Open</span><span className="text-amber-600">{stats.exceptionCounts.open}</span></div>
            <div className="flex justify-between"><span>Critical</span><span className="text-destructive font-medium">{stats.exceptionCounts.critical}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Cutover Readiness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Cutover Readiness Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {[
              { label: "Employee mapping complete", ok: stats.employeeCounts.unresolved === 0 && stats.employeeCounts.total > 0 },
              { label: "Shift matching quality ≥ 95%", ok: stats.shiftCounts.total > 0 && (stats.shiftCounts.matched / stats.shiftCounts.total) >= 0.95 },
              { label: "Clock reconciliation quality ≥ 90%", ok: stats.clockCounts.total > 0 && (stats.clockCounts.matched / stats.clockCounts.total) >= 0.9 },
              { label: "No critical exceptions", ok: stats.exceptionCounts.critical === 0 },
              { label: "All periods reconciled or locked", ok: stats.periodCounts.total > 0 && stats.periodCounts.draft === 0 },
              { label: "Sync bridge active", ok: ps?.sync_active === true },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${item.ok ? "bg-primary" : "bg-muted-foreground/30"}`} />
                <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
