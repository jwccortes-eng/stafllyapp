import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CompensationHistoryDialog } from "@/components/compensation/CompensationHistoryDialog";
import { CompensationChangeForm } from "@/components/compensation/CompensationChangeForm";
import { type CompensationProfile } from "@/hooks/useCompensation";
import { Wallet, History, Pencil, DollarSign, Clock, Car, Search, CheckCircle, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const MODE_LABELS: Record<string, string> = { hourly: "Por hora", daily: "Por día", mixed: "Mixto" };
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  company_default: { label: "Default empresa", color: "bg-muted text-muted-foreground" },
  job_default: { label: "Default puesto", color: "bg-primary/10 text-primary" },
  employee_custom: { label: "Personalizado", color: "bg-earning/10 text-earning" },
  imported: { label: "Importado", color: "bg-accent/10 text-accent-foreground" },
  location_default: { label: "Default ubicación", color: "bg-warning/10 text-warning" },
};

const CONFIDENCE_BADGE: Record<string, { label: string; color: string; icon: any }> = {
  high: { label: "Alta", color: "bg-earning/10 text-earning", icon: CheckCircle },
  medium: { label: "Media", color: "bg-warning/10 text-warning", icon: AlertTriangle },
  low: { label: "Baja", color: "bg-destructive/10 text-destructive", icon: AlertTriangle },
};

export default function EmployeeCompensationTab({
  employeeId, employeeName, companyId,
}: {
  employeeId: string;
  employeeName: string;
  companyId: string;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [inferring, setInferring] = useState(false);
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

  const inferHourlyRate = async () => {
    setInferring(true);
    try {
      // Look for historical payroll data in movements / shifts
      const { data: movements } = await supabase
        .from("movements")
        .select("concept_id, rate, quantity, total_value, note, created_at, concepts(name)")
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
        toast.info("No se encontraron registros históricos con tarifa por hora para este empleado");
        setInferring(false);
        return;
      }

      // Take most recent rate
      const latest = hourlyMovements[0] as any;
      const rate = latest.rate;
      const conceptName = latest.concepts?.name ?? latest.note ?? "payroll";
      const confidence = hourlyMovements.filter((m: any) => m.rate === rate).length >= 3 ? "high"
        : hourlyMovements.filter((m: any) => m.rate === rate).length >= 1 ? "medium" : "low";

      await supabase
        .from("compensation_profiles")
        .update({
          inferred_hourly_rate: rate,
          inferred_hourly_source: conceptName,
          inferred_hourly_confidence: confidence,
          hourly_rate_last_verified_at: null,
          hourly_rate_override_manual: false,
        } as any)
        .eq("company_id", companyId)
        .eq("employee_id", employeeId)
        .eq("is_active", true);

      qc.invalidateQueries({ queryKey: ["comp-profile-single", employeeId] });
      toast.success(`Hourly inferido: $${rate}/h (${confidence}) desde "${conceptName}"`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setInferring(false);
  };

  const confirmHourlyManual = async () => {
    if (!profile) return;
    const rate = profile.inferred_hourly_rate ?? profile.default_hourly_rate;
    if (!rate) { toast.error("No hay tarifa para confirmar"); return; }

    await supabase
      .from("compensation_profiles")
      .update({
        default_hourly_rate: rate,
        hourly_rate_override_manual: true,
        hourly_rate_last_verified_at: new Date().toISOString(),
      } as any)
      .eq("id", profile.id);

    qc.invalidateQueries({ queryKey: ["comp-profile-single", employeeId] });
    toast.success("Tarifa confirmada manualmente");
  };

  if (isLoading) return <div className="py-8 text-center text-xs text-muted-foreground">Cargando...</div>;

  if (!profile) {
    return (
      <div className="space-y-3">
        <EmptyState icon={Wallet} title="Sin perfil de compensación" description="Este empleado no tiene un perfil de compensación configurado." compact />
        <Button size="sm" onClick={() => setChangeOpen(true)}>
          <Pencil className="h-3 w-3 mr-1" /> Configurar compensación
        </Button>
        <CompensationChangeForm open={changeOpen} onOpenChange={setChangeOpen} employeeId={employeeId} employeeName={employeeName} currentProfile={null} />
      </div>
    );
  }

  const src = SOURCE_LABELS[profile.rate_source] ?? SOURCE_LABELS.company_default;
  const p = profile as any; // for new fields not yet in generated types
  const effectiveHourly = p.hourly_rate_override_manual ? profile.default_hourly_rate : (p.inferred_hourly_rate ?? profile.default_hourly_rate);
  const conf = CONFIDENCE_BADGE[p.inferred_hourly_confidence ?? ""] ?? null;

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="rounded-xl border-border/40">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Perfil de compensación</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge className={`text-[10px] border-0 ${src.color}`}>{src.label}</Badge>
                  <Badge variant="outline" className="text-[10px]">{MODE_LABELS[profile.payment_mode] ?? profile.payment_mode}</Badge>
                </div>
              </div>
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
                {(p.inferred_hourly_rate || profile.default_hourly_rate) && (
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={confirmHourlyManual}>
                    <CheckCircle className="h-3 w-3 mr-1" /> Confirmar
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {effectiveHourly != null && <RateCard icon={Clock} label="Hora regular" value={`$${effectiveHourly}`} />}
              {p.overtime_hourly_rate != null && <RateCard icon={Clock} label="Hora overtime" value={`$${p.overtime_hourly_rate}`} />}
              {p.kitchen_hourly_rate != null && <RateCard icon={Clock} label="Hora kitchen" value={`$${p.kitchen_hourly_rate}`} />}
              {p.bonus_transport_hourly_rate != null && <RateCard icon={Clock} label="Hora transporte" value={`$${p.bonus_transport_hourly_rate}`} />}
              {p.double_pay_hourly_rate != null && <RateCard icon={Clock} label="Hora doble" value={`$${p.double_pay_hourly_rate}`} />}
            </div>

            {/* Inference metadata */}
            {p.inferred_hourly_rate != null && (
              <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                <span>Inferido: ${p.inferred_hourly_rate}/h</span>
                <span>·</span>
                <span>Fuente: {p.inferred_hourly_source ?? "—"}</span>
                {conf && <Badge className={`text-[10px] border-0 ${conf.color}`}>{conf.label}</Badge>}
                {p.hourly_rate_override_manual && <Badge variant="outline" className="text-[10px]">Manual override ✓</Badge>}
                {p.hourly_rate_last_verified_at && (
                  <span>· Verificado: {format(parseISO(p.hourly_rate_last_verified_at), "dd MMM yyyy", { locale: es })}</span>
                )}
              </div>
            )}
          </div>

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
