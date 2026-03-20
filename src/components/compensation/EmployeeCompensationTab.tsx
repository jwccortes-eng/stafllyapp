import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CompensationHistoryDialog } from "@/components/compensation/CompensationHistoryDialog";
import { CompensationChangeForm } from "@/components/compensation/CompensationChangeForm";
import { useAuth } from "@/hooks/useAuth";
import { type CompensationProfile } from "@/hooks/useCompensation";
import {
  Wallet, History, Pencil, DollarSign, Clock, Car, Search,
  CheckCircle, AlertTriangle, ShieldAlert, Info,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

/* ── Constants ── */
const MODE_LABELS: Record<string, string> = { hourly: "Por hora", daily: "Por día", mixed: "Mixto" };
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  company_default: { label: "Default empresa", color: "bg-muted text-muted-foreground" },
  job_default: { label: "Default puesto", color: "bg-primary/10 text-primary" },
  employee_custom: { label: "Personalizado", color: "bg-earning/10 text-earning" },
  imported: { label: "Importado", color: "bg-accent/10 text-accent-foreground" },
  location_default: { label: "Default ubicación", color: "bg-warning/10 text-warning" },
};
const CONFIDENCE_BADGE: Record<string, { label: string; color: string }> = {
  high: { label: "Alta confianza", color: "bg-earning/10 text-earning" },
  medium: { label: "Confianza media", color: "bg-warning/10 text-warning" },
  low: { label: "Baja confianza", color: "bg-destructive/10 text-destructive" },
};

/* ── Hourly priority resolver ── */
function resolveHourlyRate(p: CompensationProfile): {
  rate: number | null;
  source: "manual" | "inferred" | "inherited" | "none";
  label: string;
} {
  // Priority 1: Manual confirmed override
  if (p.hourly_rate_override_manual && p.default_hourly_rate != null) {
    return { rate: p.default_hourly_rate, source: "manual", label: "Confirmado manual" };
  }
  // Priority 2: Inferred from historical data
  if (p.inferred_hourly_rate != null) {
    return { rate: p.inferred_hourly_rate, source: "inferred", label: `Inferido (${p.inferred_hourly_source ?? "histórico"})` };
  }
  // Priority 3: Inherited from table/role default
  if (p.default_hourly_rate != null) {
    return { rate: p.default_hourly_rate, source: "inherited", label: "Heredado de tabla" };
  }
  // Priority 4: No rate
  return { rate: null, source: "none", label: "Requiere revisión" };
}

/* ── Validation alerts ── */
interface ValidationAlert {
  severity: "warning" | "error";
  message: string;
}

function getValidationAlerts(p: CompensationProfile): ValidationAlert[] {
  const alerts: ValidationAlert[] = [];
  if (p.inferred_hourly_rate != null && !p.inferred_hourly_source) {
    alerts.push({ severity: "warning", message: "Hourly inferido sin evidencia de fuente registrada" });
  }
  if (p.hourly_rate_override_manual && (p.default_hourly_rate == null || p.default_hourly_rate === 0)) {
    alerts.push({ severity: "error", message: "Override manual activo pero tarifa es $0 o vacía" });
  }
  if (p.default_daily_rate != null && p.default_hourly_rate != null && p.payment_mode !== "mixed") {
    alerts.push({ severity: "warning", message: "Tiene tarifa fija por día y hourly activo sin modo 'Mixto'" });
  }
  if (p.inferred_hourly_confidence === "low") {
    alerts.push({ severity: "warning", message: "Confianza de inferencia baja — se recomienda revisión manual" });
  }
  return alerts;
}

/* ── Component ── */
export default function EmployeeCompensationTab({
  employeeId, employeeName, companyId,
}: {
  employeeId: string;
  employeeName: string;
  companyId: string;
}) {
  const { user } = useAuth();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["comp-profile-single", employeeId, companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("compensation_profiles")
        .select("*")
        .eq("company_id", companyId)
        .eq("employee_id", employeeId)
        .eq("is_active", true)
        .maybeSingle();
      return data as CompensationProfile | null;
    },
  });

  const { data: changeCount } = useQuery({
    queryKey: ["comp-change-count", employeeId, companyId],
    queryFn: async () => {
      const { count } = await supabase
        .from("compensation_change_log")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("employee_id", employeeId);
      return count ?? 0;
    },
  });

  const { data: evidenceList } = useQuery({
    queryKey: ["comp-evidence", employeeId, companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hourly_rate_inference_evidence" as any)
        .select("*")
        .eq("company_id", companyId)
        .eq("employee_id", employeeId)
        .eq("is_active", true)
        .order("imported_at", { ascending: false })
        .limit(20);
      return (data ?? []) as any[];
    },
  });

  /* ── Inference logic ── */
  const inferHourlyRate = async () => {
    if (!profile) return;
    // Block if manual override is active
    if (profile.hourly_rate_override_manual) {
      toast.warning("Este empleado tiene un override manual activo. Desactive primero para re-inferir.");
      return;
    }
    setInferring(true);
    try {
      const { data: movements } = await supabase
        .from("movements")
        .select("id, concept_id, rate, quantity, total_value, note, created_at, concepts(name)")
        .eq("company_id", companyId)
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(200);

      const hourlyPatterns = /hourly|hora|waiter|kitchen|bonus tra|doble pay/i;
      const hourlyMovements = (movements ?? []).filter((m: any) => {
        const conceptName = m.concepts?.name ?? m.note ?? "";
        return hourlyPatterns.test(conceptName) && m.rate && m.rate > 0;
      });

      if (hourlyMovements.length === 0) {
        toast.info("No se encontraron registros históricos con tarifa por hora");
        setInferring(false);
        return;
      }

      const latest = hourlyMovements[0] as any;
      const rate = latest.rate;
      const conceptName = latest.concepts?.name ?? latest.note ?? "payroll";
      const matchCount = hourlyMovements.filter((m: any) => m.rate === rate).length;
      const confidence = matchCount >= 3 ? "high" : matchCount >= 1 ? "medium" : "low";

      // Save evidence record
      await supabase.from("hourly_rate_inference_evidence" as any).insert({
        company_id: companyId,
        employee_id: employeeId,
        compensation_profile_id: profile.id,
        inferred_rate: rate,
        source_record_label: conceptName,
        source_qty: latest.quantity,
        source_rate: latest.rate,
        source_amount: latest.total_value,
        match_method: "concept_name_pattern",
        confidence,
      } as any);

      // Update profile
      await supabase
        .from("compensation_profiles")
        .update({
          inferred_hourly_rate: rate,
          inferred_hourly_source: conceptName,
          inferred_hourly_confidence: confidence,
          hourly_rate_last_verified_at: null,
          hourly_rate_override_manual: false,
        } as any)
        .eq("id", profile.id);

      // Log change
      await supabase.from("compensation_change_log").insert({
        company_id: companyId,
        employee_id: employeeId,
        compensation_profile_id: profile.id,
        action_type: "system_detected",
        changed_field: "inferred_hourly_rate",
        old_value: profile.inferred_hourly_rate?.toString() ?? null,
        new_value: rate.toString(),
        reason: `Inferido desde ${matchCount} movimientos tipo "${conceptName}"`,
        source_type: "sync",
        changed_by: user?.id ?? "system",
      });

      qc.invalidateQueries({ queryKey: ["comp-profile-single", employeeId] });
      qc.invalidateQueries({ queryKey: ["comp-change-count", employeeId] });
      qc.invalidateQueries({ queryKey: ["comp-evidence", employeeId] });
      toast.success(`Hourly inferido: $${rate}/h (${confidence}) desde "${conceptName}"`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setInferring(false);
  };

  /* ── Confirm manual ── */
  const confirmHourlyManual = async () => {
    if (!profile || !user) return;
    const rate = profile.inferred_hourly_rate ?? profile.default_hourly_rate;
    if (!rate) { toast.error("No hay tarifa para confirmar"); return; }

    const prevInferred = profile.inferred_hourly_rate;

    await supabase
      .from("compensation_profiles")
      .update({
        default_hourly_rate: rate,
        hourly_rate_override_manual: true,
        hourly_rate_last_verified_at: new Date().toISOString(),
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        previous_inferred_rate: prevInferred,
      } as any)
      .eq("id", profile.id);

    await supabase.from("compensation_change_log").insert({
      company_id: companyId,
      employee_id: employeeId,
      compensation_profile_id: profile.id,
      action_type: "updated",
      changed_field: "hourly_rate_manual_confirm",
      old_value: profile.default_hourly_rate?.toString() ?? null,
      new_value: rate.toString(),
      reason: "Confirmación manual por admin",
      source_type: "admin_edit",
      changed_by: user.id,
    });

    qc.invalidateQueries({ queryKey: ["comp-profile-single", employeeId] });
    qc.invalidateQueries({ queryKey: ["comp-change-count", employeeId] });
    toast.success(`Tarifa $${rate}/h confirmada manualmente`);
  };

  const initializeProfile = async () => {
    if (!user) return;
    setInitializing(true);
    try {
      const { data: rates } = await supabase.from("concept_employee_rates")
        .select("rate, concepts(name)").eq("employee_id", employeeId);
      const hr = (rates ?? []).find((r: any) => r.concepts?.name === "Hourly Rate")?.rate ?? null;
      const dr = (rates ?? []).find((r: any) => r.concepts?.name === "Daily Pay")?.rate ?? null;
      const { error } = await supabase.from("compensation_profiles").insert({
        company_id: companyId,
        employee_id: employeeId,
        payment_mode: (hr && dr ? "mixed" : dr ? "daily" : "hourly") as any,
        default_hourly_rate: hr,
        default_daily_rate: dr,
        default_half_day_rate: dr ? Math.round(dr * 0.625 * 100) / 100 : null,
        is_active: true,
        effective_from: new Date().toISOString().split("T")[0],
        rate_source: (hr || dr ? "imported" : "company_default") as any,
        created_by: user.id,
        updated_by: user.id,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["comp-profile-single", employeeId] });
      toast.success(hr || dr ? `Perfil creado con hourly: $${hr ?? "—"}, daily: $${dr ?? "—"}` : "Perfil creado — configure las tarifas");
    } catch (e: any) {
      toast.error(e.message);
    }
    setInitializing(false);
  };

  const seedFromRates = async () => {
    if (!profile || !user) return;
    setInitializing(true);
    try {
      const { data: rates } = await supabase.from("concept_employee_rates")
        .select("rate, concepts(name)").eq("employee_id", employeeId);
      const hr = (rates ?? []).find((r: any) => r.concepts?.name === "Hourly Rate")?.rate ?? null;
      const dr = (rates ?? []).find((r: any) => r.concepts?.name === "Daily Pay")?.rate ?? null;
      if (!hr && !dr) { toast.info("No se encontraron tarifas en datos existentes"); setInitializing(false); return; }
      await supabase.from("compensation_profiles").update({
        default_hourly_rate: hr ?? profile.default_hourly_rate,
        default_daily_rate: dr ?? profile.default_daily_rate,
        default_half_day_rate: dr ? Math.round(dr * 0.625 * 100) / 100 : profile.default_half_day_rate,
        payment_mode: (hr && dr ? "mixed" : dr ? "daily" : "hourly") as any,
        rate_source: "imported" as any,
        updated_by: user.id,
      }).eq("id", profile.id);
      qc.invalidateQueries({ queryKey: ["comp-profile-single", employeeId] });
      toast.success(`Tarifas actualizadas: hourly $${hr ?? "—"}, daily $${dr ?? "—"}`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setInitializing(false);
  };

  if (isLoading) return <div className="py-8 text-center text-xs text-muted-foreground">Cargando...</div>;

  if (!profile) {
    return (
      <div className="space-y-3">
        <EmptyState icon={Wallet} title="Sin perfil de compensación" description="Este empleado no tiene un perfil de compensación configurado." compact />
        <div className="flex gap-2">
          <Button size="sm" onClick={initializeProfile} disabled={initializing}>
            <DollarSign className="h-3 w-3 mr-1" /> {initializing ? "Inicializando..." : "Inicializar compensación"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setChangeOpen(true)}>
            <Pencil className="h-3 w-3 mr-1" /> Configurar manual
          </Button>
        </div>
        <CompensationChangeForm open={changeOpen} onOpenChange={setChangeOpen} employeeId={employeeId} employeeName={employeeName} currentProfile={null} />
      </div>
    );
  }

  const profileIsEmpty = profile.default_hourly_rate == null && profile.default_daily_rate == null;

  const src = SOURCE_LABELS[profile.rate_source] ?? SOURCE_LABELS.company_default;
  const hourly = resolveHourlyRate(profile);
  const conf = CONFIDENCE_BADGE[profile.inferred_hourly_confidence ?? ""] ?? null;
  const alerts = getValidationAlerts(profile);

  const SOURCE_COLOR: Record<string, string> = {
    manual: "bg-earning/10 text-earning",
    inferred: "bg-warning/10 text-warning",
    inherited: "bg-primary/10 text-primary",
    none: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-4">
      {/* ── Validation Alerts ── */}
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
              a.severity === "error" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
            }`}>
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              {a.message}
            </div>
          ))}
        </div>
      )}

      {/* ── Executive Summary ── */}
      <Card className="rounded-xl border-primary/20 bg-primary/[0.02]">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Compensación actual</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryItem label="Día completo" value={profile.default_daily_rate != null ? `$${profile.default_daily_rate}` : "—"} />
            <SummaryItem label="Medio día" value={profile.default_half_day_rate != null ? `$${profile.default_half_day_rate}` : "—"} />
            <SummaryItem label="Hourly activo" value={hourly.rate != null ? `$${hourly.rate}/h` : "—"} highlight={hourly.source === "none"} />
            <SummaryItem label="Pay ride" value={profile.default_ride_rate_regular != null ? `$${profile.default_ride_rate_regular}` : "—"} />
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
            <Badge className={`text-[10px] border-0 ${SOURCE_COLOR[hourly.source]}`}>{hourly.label}</Badge>
            <Badge className={`text-[10px] border-0 ${src.color}`}>{src.label}</Badge>
            <Badge variant="outline" className="text-[10px]">{MODE_LABELS[profile.payment_mode] ?? profile.payment_mode}</Badge>
            {profile.hourly_rate_last_verified_at && (
              <span>Verificado: {format(parseISO(profile.hourly_rate_last_verified_at), "dd MMM yyyy", { locale: es })}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Detail Card ── */}
      <Card className="rounded-xl border-border/40">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold">Detalle de tarifas</h3>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
                <History className="h-3 w-3 mr-1" /> Historial {changeCount ? `(${changeCount})` : ""}
              </Button>
              <Button size="sm" onClick={() => setChangeOpen(true)}>
                <Pencil className="h-3 w-3 mr-1" /> Cambiar
              </Button>
            </div>
          </div>

          {/* Day / Piece rates */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {profile.default_daily_rate != null && <RateCard icon={DollarSign} label="Día completo" value={`$${profile.default_daily_rate}`} />}
            {profile.default_half_day_rate != null && <RateCard icon={DollarSign} label="Medio día" value={`$${profile.default_half_day_rate}`} />}
            {profile.default_ride_rate_regular != null && <RateCard icon={Car} label="Ride regular" value={`$${profile.default_ride_rate_regular}`} />}
            {profile.default_ride_rate_special != null && <RateCard icon={Car} label="Ride especial" value={`$${profile.default_ride_rate_special}`} />}
          </div>

          {/* Hourly rates section */}
          <div className="mt-4 pt-3 border-t border-border/30">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tarifas por hora</h4>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={inferHourlyRate} disabled={inferring}>
                  <Search className="h-3 w-3 mr-1" /> {inferring ? "Buscando…" : "Inferir desde histórico"}
                </Button>
                {(profile.inferred_hourly_rate || profile.default_hourly_rate) && !profile.hourly_rate_override_manual && (
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={confirmHourlyManual}>
                    <CheckCircle className="h-3 w-3 mr-1" /> Confirmar
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {hourly.rate != null && <RateCard icon={Clock} label="Hora regular" value={`$${hourly.rate}`} />}
              {profile.overtime_hourly_rate != null && <RateCard icon={Clock} label="Hora overtime" value={`$${profile.overtime_hourly_rate}`} />}
              {profile.kitchen_hourly_rate != null && <RateCard icon={Clock} label="Hora kitchen" value={`$${profile.kitchen_hourly_rate}`} />}
              {profile.bonus_transport_hourly_rate != null && <RateCard icon={Clock} label="Hora transporte" value={`$${profile.bonus_transport_hourly_rate}`} />}
              {profile.double_pay_hourly_rate != null && <RateCard icon={Clock} label="Hora doble" value={`$${profile.double_pay_hourly_rate}`} />}
            </div>

            {/* Inference metadata */}
            {profile.inferred_hourly_rate != null && (
              <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                <span>Inferido: ${profile.inferred_hourly_rate}/h</span>
                <span>·</span>
                <span>Fuente: {profile.inferred_hourly_source ?? "—"}</span>
                {conf && <Badge className={`text-[10px] border-0 ${conf.color}`}>{conf.label}</Badge>}
                {profile.hourly_rate_override_manual && <Badge variant="outline" className="text-[10px]">Manual override ✓</Badge>}
                {profile.confirmed_at && (
                  <span>· Confirmado: {format(parseISO(profile.confirmed_at), "dd MMM yyyy", { locale: es })}</span>
                )}
                {profile.previous_inferred_rate != null && (
                  <span className="text-muted-foreground/50">· Prev: ${profile.previous_inferred_rate}/h</span>
                )}
              </div>
            )}
          </div>

          {/* Evidence table */}
          {(evidenceList ?? []).length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/30">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Info className="h-3 w-3" /> Evidencia de inferencia
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border/30 text-muted-foreground">
                      <th className="text-left py-1 pr-2">Concepto</th>
                      <th className="text-right py-1 px-2">Qty</th>
                      <th className="text-right py-1 px-2">Rate</th>
                      <th className="text-right py-1 px-2">Amount</th>
                      <th className="text-left py-1 px-2">Método</th>
                      <th className="text-left py-1 px-2">Confianza</th>
                      <th className="text-left py-1 pl-2">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(evidenceList ?? []).map((ev: any) => (
                      <tr key={ev.id} className="border-b border-border/10">
                        <td className="py-1.5 pr-2 font-medium">{ev.source_record_label ?? "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{ev.source_qty ?? "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold">${ev.source_rate ?? ev.inferred_rate}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{ev.source_amount ? `$${ev.source_amount}` : "—"}</td>
                        <td className="py-1.5 px-2">{ev.match_method}</td>
                        <td className="py-1.5 px-2">
                          <Badge className={`text-[9px] border-0 ${CONFIDENCE_BADGE[ev.confidence]?.color ?? "bg-muted text-muted-foreground"}`}>
                            {ev.confidence}
                          </Badge>
                        </td>
                        <td className="py-1.5 pl-2">{format(parseISO(ev.imported_at), "dd MMM yy", { locale: es })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Vigente desde: {format(parseISO(profile.effective_from + "T00:00:00"), "dd MMM yyyy", { locale: es })}</span>
            {profile.effective_to && <span>Hasta: {format(parseISO(profile.effective_to + "T00:00:00"), "dd MMM yyyy", { locale: es })}</span>}
          </div>
        </CardContent>
      </Card>

      <CompensationHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} employeeId={employeeId} employeeName={employeeName} />
      <CompensationChangeForm open={changeOpen} onOpenChange={setChangeOpen} employeeId={employeeId} employeeName={employeeName} currentProfile={profile} />
    </div>
  );
}

/* ── Sub-components ── */

function SummaryItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`text-center p-2.5 rounded-lg ${highlight ? "bg-destructive/5 border border-destructive/20" : "bg-muted/30"}`}>
      <p className={`text-base font-bold tabular-nums leading-none ${highlight ? "text-destructive" : "text-foreground"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function RateCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
      <Icon className="h-4 w-4 text-primary/60 shrink-0" />
      <div>
        <p className="text-lg font-bold tabular-nums text-foreground leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}
