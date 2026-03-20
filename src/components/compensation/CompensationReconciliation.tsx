import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { type CompensationProfile } from "@/hooks/useCompensation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { CompensationHistoryDialog } from "@/components/compensation/CompensationHistoryDialog";
import CompensationEditDialog from "@/components/compensation/CompensationEditDialog";
import { toast } from "sonner";
import {
  Search, CheckCircle, AlertTriangle, XCircle, ArrowRight,
  Filter, RefreshCw, User, FileText, Eye, DollarSign,
  ChevronDown, ChevronUp, MessageSquare, ShieldCheck, Pencil,
  Users, UserPlus,
} from "lucide-react";

/* ── Types ── */
interface ReconciliationRow {
  employee_id: string;
  employee_name: string;
  employee_role: string | null;
  profile: CompensationProfile | null;
  hourly: { rate: number | null; source: string; label: string };
  components: ComponentComparison[];
  totals: { configured: number; historical: number; variance: number; variancePct: number };
  status: ReconciliationStatus;
}

type ReconciliationStatus = "exact_match" | "close_match" | "mismatch" | "needs_review";

interface ComponentComparison {
  concept: string;
  label: string;
  configured: number;
  historical: number;
  variance: number;
  variancePct: number;
  reason: string;
}

/* ── Helpers ── */
function resolveHourly(p: CompensationProfile | null) {
  if (!p) return { rate: null, source: "none", label: "Sin perfil" };
  if (p.hourly_rate_override_manual && p.default_hourly_rate != null)
    return { rate: p.default_hourly_rate, source: "manual", label: "Confirmado" };
  if (p.inferred_hourly_rate != null)
    return { rate: p.inferred_hourly_rate, source: "inferred", label: "Inferido" };
  if (p.default_hourly_rate != null)
    return { rate: p.default_hourly_rate, source: "inherited", label: "Heredado" };
  return { rate: null, source: "none", label: "Sin tarifa" };
}

function classifyMovement(conceptName: string, note: string): string {
  const text = `${conceptName} ${note}`.toLowerCase();
  if (/full|completo|w\.?j\s*compl/i.test(text)) return "full_day";
  if (/half|medio|w\.?j\s*half/i.test(text)) return "half_day";
  if (/hourly|hora|waiter|kitchen/i.test(text)) return "hourly";
  if (/ride|ryde/i.test(text)) return "ride";
  if (/bonus|bono|transport/i.test(text)) return "bonus";
  if (/doble|double/i.test(text)) return "hourly_double";
  if (/manual|adjustment|ajuste/i.test(text)) return "manual";
  return "other";
}

const CONCEPT_LABELS: Record<string, string> = {
  full_day: "Día completo",
  half_day: "Medio día",
  hourly: "Hourly Pay",
  hourly_double: "Double Pay",
  ride: "Pay Ride",
  bonus: "Bono/Transport",
  manual: "Ajuste manual",
  other: "Otros",
};

function getStatus(variancePct: number, hasData: boolean): ReconciliationStatus {
  if (!hasData) return "needs_review";
  const abs = Math.abs(variancePct);
  if (abs === 0) return "exact_match";
  if (abs <= 5) return "close_match";
  return "mismatch";
}

const STATUS_CONFIG: Record<ReconciliationStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  exact_match: { label: "Match exacto", color: "bg-earning/10 text-earning", icon: CheckCircle },
  close_match: { label: "Match cercano", color: "bg-warning/10 text-warning", icon: AlertTriangle },
  mismatch: { label: "Mismatch", color: "bg-destructive/10 text-destructive", icon: XCircle },
  needs_review: { label: "Requiere revisión", color: "bg-muted text-muted-foreground", icon: Eye },
};

const FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "exact_match", label: "Match exacto" },
  { value: "close_match", label: "Match cercano" },
  { value: "mismatch", label: "Mismatch" },
  { value: "needs_review", label: "Requiere revisión" },
  { value: "has_ride", label: "Con pay ride" },
  { value: "has_manual", label: "Con ajustes manuales" },
  { value: "inferred", label: "Hourly inferido" },
  { value: "no_evidence", label: "Sin evidencia" },
];

/* ── Main Component ── */
export default function CompensationReconciliation() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyEmp, setHistoryEmp] = useState<{ id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; profile: CompensationProfile | null } | null>(null);
  const [periodFilter, setPeriodFilter] = useState("last_30");

  // Fetch employees
  const { data: employees } = useQuery({
    queryKey: ["comp-recon-employees", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("employees")
        .select("id, first_name, last_name, employee_role, is_active")
        .eq("company_id", selectedCompanyId!).eq("is_active", true).order("first_name");
      return data ?? [];
    },
  });

  // Fetch profiles
  const { data: profiles } = useQuery({
    queryKey: ["comp-recon-profiles", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("compensation_profiles")
        .select("*").eq("company_id", selectedCompanyId!).eq("is_active", true);
      return (data ?? []) as CompensationProfile[];
    },
  });

  // Fetch historical movements
  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    switch (periodFilter) {
      case "last_7": start = new Date(now.getTime() - 7 * 86400000); break;
      case "last_14": start = new Date(now.getTime() - 14 * 86400000); break;
      case "last_60": start = new Date(now.getTime() - 60 * 86400000); break;
      default: start = new Date(now.getTime() - 30 * 86400000); break;
    }
    return { start: start.toISOString(), end: now.toISOString() };
  }, [periodFilter]);

  const { data: movements, isLoading } = useQuery({
    queryKey: ["comp-recon-movements", selectedCompanyId, dateRange],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("movements")
        .select("employee_id, quantity, rate, total_value, note, created_at, concepts(name)")
        .eq("company_id", selectedCompanyId!)
        .gte("created_at", dateRange.start)
        .lte("created_at", dateRange.end)
        .limit(1000);
      return data ?? [];
    },
  });

  // Build reconciliation rows
  const rows: ReconciliationRow[] = useMemo(() => {
    if (!employees) return [];
    const profileMap = new Map<string, CompensationProfile>();
    (profiles ?? []).forEach(p => profileMap.set(p.employee_id, p));

    // Group movements by employee + concept category
    const movMap = new Map<string, Map<string, number>>();
    (movements ?? []).forEach((m: any) => {
      const cn = m.concepts?.name ?? m.note ?? "";
      const cat = classifyMovement(cn, m.note ?? "");
      const total = m.total_value ?? (m.quantity ?? 0) * (m.rate ?? 0);
      if (!movMap.has(m.employee_id)) movMap.set(m.employee_id, new Map());
      const empMap = movMap.get(m.employee_id)!;
      empMap.set(cat, (empMap.get(cat) ?? 0) + total);
    });

    return employees.map(e => {
      const p = profileMap.get(e.id) ?? null;
      const hourly = resolveHourly(p);
      const empMovements = movMap.get(e.id) ?? new Map<string, number>();
      const hasHistorical = empMovements.size > 0;

      // Build component comparisons
      const components: ComponentComparison[] = [];
      const allCats = new Set([...empMovements.keys(), "full_day", "half_day", "hourly", "ride"]);

      let totalConfigured = 0;
      let totalHistorical = 0;

      for (const cat of allCats) {
        const hist = empMovements.get(cat) ?? 0;
        let configured = 0;
        let reason = "";

        switch (cat) {
          case "full_day":
            configured = p?.default_daily_rate ?? 0;
            if (hist > 0 && configured === 0) reason = "Sin tarifa diaria configurada";
            break;
          case "half_day":
            configured = p?.default_half_day_rate ?? 0;
            if (hist > 0 && configured === 0) reason = "Sin tarifa medio día";
            break;
          case "hourly":
            configured = hourly.rate ?? 0;
            if (hist > 0 && configured === 0) reason = "Hourly no confirmado";
            if (hist > 0 && configured > 0 && Math.abs(hist - configured) > 1) reason = "Tarifa distinta";
            break;
          case "hourly_double":
            configured = p?.double_pay_hourly_rate ?? 0;
            if (hist > 0 && configured === 0) reason = "Sin tarifa double pay";
            break;
          case "ride":
            configured = p?.default_ride_rate_regular ?? 0;
            if (hist > 0 && configured === 0) reason = "Ride faltante en perfil";
            break;
          case "bonus":
            configured = p?.bonus_transport_hourly_rate ?? 0;
            if (hist > 0 && configured === 0) reason = "Sin tarifa de bono configurada";
            break;
          case "manual":
            configured = 0;
            reason = hist > 0 ? "Ajuste manual" : "";
            break;
          default:
            reason = hist > 0 ? "Concepto no clasificado" : "";
        }

        // Only include if either side has data
        if (hist === 0 && configured === 0) continue;

        const variance = configured - hist;
        const variancePct = hist !== 0 ? (variance / Math.abs(hist)) * 100 : configured !== 0 ? 100 : 0;

        components.push({
          concept: cat,
          label: CONCEPT_LABELS[cat] ?? cat,
          configured,
          historical: hist,
          variance,
          variancePct,
          reason,
        });

        totalConfigured += configured;
        totalHistorical += hist;
      }

      const totalVariance = totalConfigured - totalHistorical;
      const totalVariancePct = totalHistorical !== 0
        ? (totalVariance / Math.abs(totalHistorical)) * 100 : 0;

      const status = getStatus(totalVariancePct, hasHistorical);

      return {
        employee_id: e.id,
        employee_name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
        employee_role: e.employee_role,
        profile: p,
        hourly,
        components,
        totals: { configured: totalConfigured, historical: totalHistorical, variance: totalVariance, variancePct: totalVariancePct },
        status,
      };
    });
  }, [employees, profiles, movements]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = rows;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r => r.employee_name.toLowerCase().includes(s));
    }
    switch (filter) {
      case "exact_match": result = result.filter(r => r.status === "exact_match"); break;
      case "close_match": result = result.filter(r => r.status === "close_match"); break;
      case "mismatch": result = result.filter(r => r.status === "mismatch"); break;
      case "needs_review": result = result.filter(r => r.status === "needs_review"); break;
      case "has_ride": result = result.filter(r => r.components.some(c => c.concept === "ride" && c.historical > 0)); break;
      case "has_manual": result = result.filter(r => r.components.some(c => c.concept === "manual" && c.historical > 0)); break;
      case "inferred": result = result.filter(r => r.hourly.source === "inferred"); break;
      case "no_evidence": result = result.filter(r => r.profile?.inferred_hourly_rate != null && !r.profile?.inferred_hourly_source); break;
    }
    return result;
  }, [rows, search, filter]);

  // KPI stats
  const stats = useMemo(() => {
    const total = rows.length;
    const exact = rows.filter(r => r.status === "exact_match").length;
    const close = rows.filter(r => r.status === "close_match").length;
    const mismatch = rows.filter(r => r.status === "mismatch").length;
    const review = rows.filter(r => r.status === "needs_review").length;
    const conciliated = total > 0 ? Math.round(((exact + close) / total) * 100) : 0;
    return { total, exact, close, mismatch, review, conciliated };
  }, [rows]);

  // Quick actions
  const confirmHourly = async (row: ReconciliationRow) => {
    if (!row.profile || !user) return;
    const rate = row.profile.inferred_hourly_rate ?? row.profile.default_hourly_rate;
    if (!rate) { toast.error("No hay tarifa para confirmar"); return; }
    await supabase.from("compensation_profiles").update({
      default_hourly_rate: rate,
      hourly_rate_override_manual: true,
      hourly_rate_last_verified_at: new Date().toISOString(),
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
      previous_inferred_rate: row.profile.inferred_hourly_rate,
    } as any).eq("id", row.profile.id);
    qc.invalidateQueries({ queryKey: ["comp-recon-profiles"] });
    toast.success(`$${rate}/h confirmado para ${row.employee_name}`);
  };

  const recalcInference = async (row: ReconciliationRow) => {
    if (!row.profile) return;
    if (row.profile.hourly_rate_override_manual) {
      toast.warning("Override manual activo. Desactive primero.");
      return;
    }
    const { data: mvs } = await supabase.from("movements")
      .select("rate, quantity, total_value, note, created_at, concepts(name)")
      .eq("company_id", selectedCompanyId!).eq("employee_id", row.employee_id)
      .order("created_at", { ascending: false }).limit(200);
    const pattern = /hourly|hora|waiter|kitchen|bonus tra|doble pay/i;
    const hits = (mvs ?? []).filter((m: any) => {
      const cn = m.concepts?.name ?? m.note ?? "";
      return pattern.test(cn) && m.rate > 0;
    });
    if (!hits.length) { toast.info("Sin datos hourly históricos"); return; }
    const latest = hits[0] as any;
    const rate = latest.rate;
    const confidence = hits.filter((m: any) => m.rate === rate).length >= 3 ? "high" : "medium";
    await supabase.from("compensation_profiles").update({
      inferred_hourly_rate: rate,
      inferred_hourly_source: latest.concepts?.name ?? latest.note ?? "payroll",
      inferred_hourly_confidence: confidence,
    } as any).eq("id", row.profile.id);
    qc.invalidateQueries({ queryKey: ["comp-recon-profiles"] });
    toast.success(`Inferido $${rate}/h (${confidence}) para ${row.employee_name}`);
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Empleados comparados" value={stats.total} icon={<User className="h-4 w-4" />} />
        <KpiCard label="Match exacto" value={stats.exact} icon={<CheckCircle className="h-4 w-4" />} accent="primary" />
        <KpiCard label="Match cercano" value={stats.close} icon={<AlertTriangle className="h-4 w-4" />} accent="warning" />
        <KpiCard label="Mismatch" value={stats.mismatch} icon={<XCircle className="h-4 w-4" />} accent="deduction" />
        <KpiCard label="Requiere revisión" value={stats.review} icon={<Eye className="h-4 w-4" />} accent="muted" />
        <KpiCard label="% Conciliado" value={`${stats.conciliated}%`} icon={<ShieldCheck className="h-4 w-4" />} accent={stats.conciliated >= 80 ? "primary" : "warning"} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last_7">Últimos 7 días</SelectItem>
            <SelectItem value="last_14">Últimos 14 días</SelectItem>
            <SelectItem value="last_30">Últimos 30 días</SelectItem>
            <SelectItem value="last_60">Últimos 60 días</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Cargando datos de reconciliación...</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={DollarSign} title="Sin resultados" description="No hay empleados que coincidan." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Empleado</TableHead>
                    <TableHead className="text-xs text-center">Estado</TableHead>
                    <TableHead className="text-xs text-right">Configurado</TableHead>
                    <TableHead className="text-xs text-right">Histórico</TableHead>
                    <TableHead className="text-xs text-right">Varianza</TableHead>
                    <TableHead className="text-xs text-right">%</TableHead>
                    <TableHead className="text-xs text-center">Hourly</TableHead>
                    <TableHead className="text-xs w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(row => {
                    const sc = STATUS_CONFIG[row.status];
                    const Icon = sc.icon;
                    const expanded = expandedId === row.employee_id;
                    return (
                      <>
                        <TableRow
                          key={row.employee_id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setExpandedId(expanded ? null : row.employee_id)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <div className="text-sm font-medium">{row.employee_name}</div>
                              {row.profile?.hourly_rate_override_manual && (
                                <Badge className="text-[9px] border-0 bg-warning/10 text-warning px-1 py-0">Override</Badge>
                              )}
                            </div>
                            {row.employee_role && <span className="text-[10px] text-muted-foreground">{row.employee_role}</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={`text-[10px] border-0 gap-1 ${sc.color}`}>
                              <Icon className="h-3 w-3" /> {sc.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.totals.configured)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(row.totals.historical)}</TableCell>
                          <TableCell className={`text-right font-mono text-xs font-bold ${
                            Math.abs(row.totals.variance) > 10 ? "text-destructive" : "text-primary"
                          }`}>
                            {row.totals.variance >= 0 ? "+" : ""}{fmt(row.totals.variance)}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-xs ${
                            Math.abs(row.totals.variancePct) > 5 ? "text-destructive" : "text-muted-foreground"
                          }`}>
                            {row.totals.variancePct.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs font-mono">
                              {row.hourly.rate != null ? `$${row.hourly.rate}` : "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                        </TableRow>

                        {expanded && (
                          <TableRow key={`${row.employee_id}-detail`}>
                            <TableCell colSpan={8} className="p-0 border-b-2 border-border/20">
                              <div className="bg-muted/10 p-4 space-y-4">
                                {/* Component breakdown */}
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Desglose por componente</h4>
                                  <div className="grid gap-2">
                                    {row.components.map(c => (
                                      <div key={c.concept} className="flex items-center gap-3 bg-background rounded-lg px-3 py-2 text-xs">
                                        <span className="w-28 font-medium truncate">{c.label}</span>
                                        <div className="flex-1 grid grid-cols-4 gap-2 text-right tabular-nums">
                                          <span>{fmt(c.configured)}</span>
                                          <span className="text-muted-foreground">{fmt(c.historical)}</span>
                                          <span className={Math.abs(c.variance) > 1 ? "text-destructive font-bold" : "text-primary"}>
                                            {c.variance >= 0 ? "+" : ""}{fmt(c.variance)}
                                          </span>
                                          <span className="text-muted-foreground">{c.variancePct.toFixed(1)}%</span>
                                        </div>
                                        {c.reason && (
                                          <Badge variant="outline" className="text-[9px] shrink-0">{c.reason}</Badge>
                                        )}
                                      </div>
                                    ))}
                                    {row.components.length === 0 && (
                                      <p className="text-xs text-muted-foreground">Sin datos históricos para comparar</p>
                                    )}
                                  </div>
                                </div>

                                {/* Quick actions */}
                                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/20">
                                  <Button size="sm" variant="default" className="h-7 text-[11px]"
                                    onClick={(e) => { e.stopPropagation(); setEditTarget({ id: row.employee_id, name: row.employee_name, profile: row.profile }); }}>
                                    <Pencil className="h-3 w-3 mr-1" /> Editar compensación
                                  </Button>
                                  {row.profile && !row.profile.hourly_rate_override_manual && (row.profile.inferred_hourly_rate || row.profile.default_hourly_rate) && (
                                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={(e) => { e.stopPropagation(); confirmHourly(row); }}>
                                      <CheckCircle className="h-3 w-3 mr-1" /> Confirmar hourly
                                    </Button>
                                  )}
                                  {row.profile && (
                                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={(e) => { e.stopPropagation(); recalcInference(row); }}>
                                      <RefreshCw className="h-3 w-3 mr-1" /> Recalcular inferencia
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                                    onClick={(e) => { e.stopPropagation(); setHistoryEmp({ id: row.employee_id, name: row.employee_name }); }}>
                                    <FileText className="h-3 w-3 mr-1" /> Historial
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                                    onClick={(e) => { e.stopPropagation(); window.open(`/app/employees?id=${row.employee_id}`, "_blank"); }}>
                                    <User className="h-3 w-3 mr-1" /> Perfil
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History dialog */}
      {historyEmp && (
        <CompensationHistoryDialog
          open={!!historyEmp}
          onOpenChange={() => setHistoryEmp(null)}
          employeeId={historyEmp.id}
          employeeName={historyEmp.name}
        />
      )}

      {editTarget && (
        <CompensationEditDialog
          open={!!editTarget}
          onOpenChange={() => setEditTarget(null)}
          employeeId={editTarget.id}
          employeeName={editTarget.name}
          profile={editTarget.profile}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["comp-recon-profiles"] });
            qc.invalidateQueries({ queryKey: ["comp-recon-movements"] });
          }}
        />
      )}
    </div>
  );
}
