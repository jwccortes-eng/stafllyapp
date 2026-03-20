import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { type CompensationProfile } from "@/hooks/useCompensation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CompensationHistoryDialog } from "@/components/compensation/CompensationHistoryDialog";
import { toast } from "sonner";
import {
  Search, CheckCircle, AlertTriangle, ShieldAlert, Clock, DollarSign,
  Calculator, History, Pencil, Filter, ChevronDown, ChevronUp, Info, Wallet,
} from "lucide-react";

/* ── Types ── */
interface EmployeeComp {
  employee_id: string;
  first_name: string;
  last_name: string;
  employee_role: string | null;
  profile: CompensationProfile | null;
  alerts: ValidationAlert[];
  hourly: { rate: number | null; source: string; label: string };
}

interface ValidationAlert {
  severity: "warning" | "error";
  message: string;
}

/* ── Helpers ── */
function resolveHourly(p: CompensationProfile | null) {
  if (!p) return { rate: null, source: "none", label: "Sin perfil" };
  if (p.hourly_rate_override_manual && p.default_hourly_rate != null)
    return { rate: p.default_hourly_rate, source: "manual", label: "Confirmado manual" };
  if (p.inferred_hourly_rate != null)
    return { rate: p.inferred_hourly_rate, source: "inferred", label: `Inferido (${p.inferred_hourly_source ?? "histórico"})` };
  if (p.default_hourly_rate != null)
    return { rate: p.default_hourly_rate, source: "inherited", label: "Heredado" };
  return { rate: null, source: "none", label: "Requiere revisión" };
}

function getAlerts(p: CompensationProfile | null): ValidationAlert[] {
  if (!p) return [{ severity: "error", message: "Sin perfil de compensación" }];
  const a: ValidationAlert[] = [];
  if (p.inferred_hourly_rate != null && !p.inferred_hourly_source)
    a.push({ severity: "warning", message: "Inferido sin evidencia" });
  if (p.hourly_rate_override_manual && (p.default_hourly_rate == null || p.default_hourly_rate === 0))
    a.push({ severity: "error", message: "Override manual con valor $0" });
  if (p.default_daily_rate != null && p.default_hourly_rate != null && p.payment_mode !== "mixed")
    a.push({ severity: "warning", message: "Tiene day+hourly sin modo Mixto" });
  if (p.inferred_hourly_confidence === "low")
    a.push({ severity: "warning", message: "Confianza baja" });
  return a;
}

const SOURCE_COLOR: Record<string, string> = {
  manual: "bg-earning/10 text-earning",
  inferred: "bg-warning/10 text-warning",
  inherited: "bg-primary/10 text-primary",
  none: "bg-destructive/10 text-destructive",
};

const FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "no_profile", label: "Sin perfil" },
  { value: "inferred_unconfirmed", label: "Inferido sin confirmar" },
  { value: "manual_confirmed", label: "Confirmado manual" },
  { value: "low_confidence", label: "Confianza baja" },
  { value: "no_evidence", label: "Sin evidencia" },
  { value: "has_alerts", label: "Con alertas" },
  { value: "needs_review", label: "Requiere revisión" },
];

/* ── Main Component ── */
export default function CompensationValidation() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [historyEmp, setHistoryEmp] = useState<{ id: string; name: string } | null>(null);

  // Fetch employees + compensation profiles
  const { data: employees, isLoading: loadingEmp } = useQuery({
    queryKey: ["comp-validation-employees", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name, employee_role, is_active")
        .eq("company_id", selectedCompanyId!)
        .eq("is_active", true)
        .order("first_name");
      return data ?? [];
    },
  });

  const { data: profiles, isLoading: loadingProf } = useQuery({
    queryKey: ["comp-validation-profiles", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("compensation_profiles")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("is_active", true);
      return (data ?? []) as CompensationProfile[];
    },
  });

  const rows: EmployeeComp[] = useMemo(() => {
    if (!employees) return [];
    const profileMap = new Map<string, CompensationProfile>();
    (profiles ?? []).forEach(p => profileMap.set(p.employee_id, p));
    return employees.map(e => {
      const p = profileMap.get(e.id) ?? null;
      return {
        employee_id: e.id,
        first_name: e.first_name ?? "",
        last_name: e.last_name ?? "",
        employee_role: e.employee_role,
        profile: p,
        alerts: getAlerts(p),
        hourly: resolveHourly(p),
      };
    });
  }, [employees, profiles]);

  const filtered = useMemo(() => {
    let result = rows;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r => `${r.first_name} ${r.last_name}`.toLowerCase().includes(s));
    }
    switch (filter) {
      case "no_profile": result = result.filter(r => !r.profile); break;
      case "inferred_unconfirmed": result = result.filter(r => r.profile?.inferred_hourly_rate != null && !r.profile?.hourly_rate_override_manual); break;
      case "manual_confirmed": result = result.filter(r => r.profile?.hourly_rate_override_manual); break;
      case "low_confidence": result = result.filter(r => r.profile?.inferred_hourly_confidence === "low"); break;
      case "no_evidence": result = result.filter(r => r.profile?.inferred_hourly_rate != null && !r.profile?.inferred_hourly_source); break;
      case "has_alerts": result = result.filter(r => r.alerts.length > 0); break;
      case "needs_review": result = result.filter(r => r.hourly.source === "none"); break;
    }
    return result;
  }, [rows, search, filter]);

  // Stats
  const stats = useMemo(() => {
    const total = rows.length;
    const withProfile = rows.filter(r => r.profile).length;
    const confirmed = rows.filter(r => r.profile?.hourly_rate_override_manual).length;
    const inferred = rows.filter(r => r.profile?.inferred_hourly_rate != null && !r.profile?.hourly_rate_override_manual).length;
    const needsReview = rows.filter(r => r.hourly.source === "none").length;
    const withAlerts = rows.filter(r => r.alerts.length > 0).length;
    return { total, withProfile, confirmed, inferred, needsReview, withAlerts };
  }, [rows]);

  /* ── Quick actions ── */
  const confirmHourly = async (emp: EmployeeComp) => {
    if (!emp.profile || !user) return;
    const rate = emp.profile.inferred_hourly_rate ?? emp.profile.default_hourly_rate;
    if (!rate) { toast.error("No hay tarifa para confirmar"); return; }
    await supabase.from("compensation_profiles").update({
      default_hourly_rate: rate,
      hourly_rate_override_manual: true,
      hourly_rate_last_verified_at: new Date().toISOString(),
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
      previous_inferred_rate: emp.profile.inferred_hourly_rate,
    } as any).eq("id", emp.profile.id);
    await supabase.from("compensation_change_log").insert({
      company_id: selectedCompanyId!,
      employee_id: emp.employee_id,
      compensation_profile_id: emp.profile.id,
      action_type: "updated",
      changed_field: "hourly_rate_manual_confirm",
      old_value: emp.profile.default_hourly_rate?.toString() ?? null,
      new_value: rate.toString(),
      reason: "Confirmación desde panel de validación",
      source_type: "admin_edit",
      changed_by: user.id,
    });
    qc.invalidateQueries({ queryKey: ["comp-validation-profiles"] });
    toast.success(`$${rate}/h confirmado para ${emp.first_name}`);
  };

  const recalcInference = async (emp: EmployeeComp) => {
    if (!emp.profile) return;
    if (emp.profile.hourly_rate_override_manual) {
      toast.warning("Override manual activo. Desactive primero.");
      return;
    }
    const { data: movements } = await supabase
      .from("movements")
      .select("rate, quantity, total_value, note, created_at, concepts(name)")
      .eq("company_id", selectedCompanyId!)
      .eq("employee_id", emp.employee_id)
      .order("created_at", { ascending: false })
      .limit(200);
    const hourlyPatterns = /hourly|hora|waiter|kitchen|bonus tra|doble pay/i;
    const hits = (movements ?? []).filter((m: any) => {
      const cn = m.concepts?.name ?? m.note ?? "";
      return hourlyPatterns.test(cn) && m.rate && m.rate > 0;
    });
    if (hits.length === 0) { toast.info("Sin datos hourly históricos"); return; }
    const latest = hits[0] as any;
    const rate = latest.rate;
    const conceptName = latest.concepts?.name ?? latest.note ?? "payroll";
    const matchCount = hits.filter((m: any) => m.rate === rate).length;
    const confidence = matchCount >= 3 ? "high" : matchCount >= 1 ? "medium" : "low";
    await supabase.from("compensation_profiles").update({
      inferred_hourly_rate: rate,
      inferred_hourly_source: conceptName,
      inferred_hourly_confidence: confidence,
    } as any).eq("id", emp.profile.id);
    await supabase.from("hourly_rate_inference_evidence" as any).insert({
      company_id: selectedCompanyId!, employee_id: emp.employee_id,
      compensation_profile_id: emp.profile.id, inferred_rate: rate,
      source_record_label: conceptName, source_qty: latest.quantity,
      source_rate: latest.rate, source_amount: latest.total_value,
      match_method: "concept_name_pattern", confidence,
    } as any);
    qc.invalidateQueries({ queryKey: ["comp-validation-profiles"] });
    toast.success(`Inferido $${rate}/h (${confidence}) para ${emp.first_name}`);
  };

  const isLoading = loadingEmp || loadingProf;

  return (
    <div className="space-y-6">
      <PageHeader title="Validación de Compensación" subtitle="Revisión operativa de tarifas por empleado" />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total empleados" value={stats.total} />
        <StatCard label="Con perfil" value={stats.withProfile} accent />
        <StatCard label="Hourly confirmado" value={stats.confirmed} accent />
        <StatCard label="Hourly inferido" value={stats.inferred} />
        <StatCard label="Requiere revisión" value={stats.needsReview} warning={stats.needsReview > 0} />
        <StatCard label="Con alertas" value={stats.withAlerts} warning={stats.withAlerts > 0} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[220px]">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setSimOpen(true)}>
          <Calculator className="h-4 w-4 mr-1.5" /> Simulador
        </Button>
      </div>

      {/* Employee list */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Cargando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Wallet} title="Sin resultados" description="No hay empleados que coincidan con los filtros." />
      ) : (
        <div className="space-y-2">
          {filtered.map(emp => {
            const expanded = expandedId === emp.employee_id;
            const p = emp.profile;
            return (
              <Card key={emp.employee_id} className="rounded-xl border-border/40">
                <CardContent className="p-0">
                  {/* Row */}
                  <button
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedId(expanded ? null : emp.employee_id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{emp.first_name} {emp.last_name}</span>
                        {emp.employee_role && <span className="text-[10px] text-muted-foreground">({emp.employee_role})</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge className={`text-[10px] border-0 ${SOURCE_COLOR[emp.hourly.source]}`}>{emp.hourly.label}</Badge>
                        {emp.alerts.length > 0 && (
                          <Badge className="text-[10px] border-0 bg-destructive/10 text-destructive">
                            {emp.alerts.length} alerta{emp.alerts.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs tabular-nums shrink-0">
                      <div className="text-center">
                        <p className="font-bold">{p?.default_daily_rate != null ? `$${p.default_daily_rate}` : "—"}</p>
                        <p className="text-[9px] text-muted-foreground">Día</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold">{p?.default_half_day_rate != null ? `$${p.default_half_day_rate}` : "—"}</p>
                        <p className="text-[9px] text-muted-foreground">½ Día</p>
                      </div>
                      <div className="text-center">
                        <p className={`font-bold ${emp.hourly.source === "none" ? "text-destructive" : ""}`}>
                          {emp.hourly.rate != null ? `$${emp.hourly.rate}` : "—"}
                        </p>
                        <p className="text-[9px] text-muted-foreground">Hora</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold">{p?.default_ride_rate_regular != null ? `$${p.default_ride_rate_regular}` : "—"}</p>
                        <p className="text-[9px] text-muted-foreground">Ride</p>
                      </div>
                    </div>
                    {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-3">
                      {/* Alerts */}
                      {emp.alerts.length > 0 && (
                        <div className="space-y-1">
                          {emp.alerts.map((a, i) => (
                            <div key={i} className={`flex items-center gap-2 p-2 rounded-lg text-[11px] ${
                              a.severity === "error" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                            }`}>
                              <ShieldAlert className="h-3 w-3 shrink-0" />
                              {a.message}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Detail grid */}
                      {p && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          <DetailItem label="Modo" value={p.payment_mode} />
                          <DetailItem label="Fuente" value={p.rate_source} />
                          <DetailItem label="OT Hourly" value={p.overtime_hourly_rate != null ? `$${p.overtime_hourly_rate}` : "—"} />
                          <DetailItem label="Kitchen" value={p.kitchen_hourly_rate != null ? `$${p.kitchen_hourly_rate}` : "—"} />
                          <DetailItem label="Transport" value={p.bonus_transport_hourly_rate != null ? `$${p.bonus_transport_hourly_rate}` : "—"} />
                          <DetailItem label="Double" value={p.double_pay_hourly_rate != null ? `$${p.double_pay_hourly_rate}` : "—"} />
                          <DetailItem label="Ride especial" value={p.default_ride_rate_special != null ? `$${p.default_ride_rate_special}` : "—"} />
                          <DetailItem label="Confianza" value={p.inferred_hourly_confidence ?? "—"} />
                          <DetailItem label="Verificado" value={p.hourly_rate_last_verified_at ? new Date(p.hourly_rate_last_verified_at).toLocaleDateString("es") : "Nunca"} />
                          <DetailItem label="Prev. inferido" value={p.previous_inferred_rate != null ? `$${p.previous_inferred_rate}` : "—"} />
                        </div>
                      )}

                      {/* Quick actions */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {p && !p.hourly_rate_override_manual && (p.inferred_hourly_rate || p.default_hourly_rate) && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => confirmHourly(emp)}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Confirmar hourly
                          </Button>
                        )}
                        {p && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => recalcInference(emp)}>
                            <Search className="h-3 w-3 mr-1" /> Recalcular inferencia
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-[11px]"
                          onClick={() => setHistoryEmp({ id: emp.employee_id, name: `${emp.first_name} ${emp.last_name}` })}>
                          <History className="h-3 w-3 mr-1" /> Historial
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
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

      {/* Simulator dialog */}
      <SimulatorDialog open={simOpen} onOpenChange={setSimOpen} employees={rows} />
    </div>
  );
}

/* ── Simulator ── */
function SimulatorDialog({
  open, onOpenChange, employees,
}: { open: boolean; onOpenChange: (o: boolean) => void; employees: EmployeeComp[] }) {
  const [empId, setEmpId] = useState("");
  const [shiftType, setShiftType] = useState("full_day");
  const [rideType, setRideType] = useState("none");
  const [manualAdj, setManualAdj] = useState("");

  const emp = employees.find(e => e.employee_id === empId);
  const p = emp?.profile;

  const breakdown = useMemo(() => {
    if (!p) return null;
    let base = 0;
    let label = "";
    switch (shiftType) {
      case "full_day": base = p.default_daily_rate ?? 0; label = "Día completo"; break;
      case "half_day": base = p.default_half_day_rate ?? 0; label = "Medio día"; break;
      case "hourly_8": base = (emp?.hourly.rate ?? 0) * 8; label = "8 horas"; break;
      case "hourly_4": base = (emp?.hourly.rate ?? 0) * 4; label = "4 horas"; break;
    }
    let ride = 0;
    let rideLabel = "";
    switch (rideType) {
      case "regular": ride = p.default_ride_rate_regular ?? 0; rideLabel = "Ride regular"; break;
      case "special": ride = p.default_ride_rate_special ?? 0; rideLabel = "Ride especial"; break;
    }
    const adj = Number(manualAdj) || 0;
    const total = base + ride + adj;
    return { base, label, ride, rideLabel, adj, total };
  }, [p, emp, shiftType, rideType, manualAdj]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Simulador de compensación
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Empleado</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent className="max-h-60">
                {employees.filter(e => e.profile).map(e => (
                  <SelectItem key={e.employee_id} value={e.employee_id}>
                    {e.first_name} {e.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo de turno</Label>
              <Select value={shiftType} onValueChange={setShiftType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_day">Día completo</SelectItem>
                  <SelectItem value="half_day">Medio día</SelectItem>
                  <SelectItem value="hourly_8">Hourly (8h)</SelectItem>
                  <SelectItem value="hourly_4">Hourly (4h)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Pay Ride</Label>
              <Select value={rideType} onValueChange={setRideType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguno</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="special">Especial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Ajuste manual ($)</Label>
            <Input type="number" value={manualAdj} onChange={e => setManualAdj(e.target.value)} placeholder="0" />
          </div>

          {breakdown && (
            <Card className="rounded-xl bg-muted/30 border-border/30">
              <CardContent className="p-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase">Desglose</h4>
                <div className="space-y-1 text-sm">
                  <Row label={breakdown.label} value={breakdown.base} />
                  {breakdown.ride > 0 && <Row label={breakdown.rideLabel} value={breakdown.ride} />}
                  {breakdown.adj !== 0 && <Row label="Ajuste manual" value={breakdown.adj} />}
                  <div className="border-t border-border/30 pt-1 mt-1 flex justify-between font-bold">
                    <span>Total</span>
                    <span className="tabular-nums">${breakdown.total.toFixed(2)}</span>
                  </div>
                </div>
                {emp && (
                  <div className="text-[10px] text-muted-foreground mt-2">
                    Hourly activo: ${emp.hourly.rate ?? "—"}/h ({emp.hourly.label})
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Small components ── */
function StatCard({ label, value, accent, warning }: { label: string; value: number; accent?: boolean; warning?: boolean }) {
  return (
    <Card className={`rounded-xl ${warning ? "border-destructive/30" : accent ? "border-primary/20" : "border-border/40"}`}>
      <CardContent className="p-3 text-center">
        <p className={`text-xl font-bold tabular-nums ${warning ? "text-destructive" : accent ? "text-primary" : "text-foreground"}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/20 rounded-lg px-2 py-1.5">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className="font-medium truncate">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">${value.toFixed(2)}</span>
    </div>
  );
}
