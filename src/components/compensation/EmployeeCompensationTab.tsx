import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CompensationHistoryDialog } from "@/components/compensation/CompensationHistoryDialog";
import { CompensationChangeForm } from "@/components/compensation/CompensationChangeForm";
import { type CompensationProfile } from "@/hooks/useCompensation";
import { Wallet, History, Pencil, DollarSign, Clock, Car } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const MODE_LABELS: Record<string, string> = { hourly: "Por hora", daily: "Por día", mixed: "Mixto" };
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  company_default: { label: "Default empresa", color: "bg-muted text-muted-foreground" },
  job_default: { label: "Default puesto", color: "bg-primary/10 text-primary" },
  employee_custom: { label: "Personalizado", color: "bg-earning/10 text-earning" },
  imported: { label: "Importado", color: "bg-accent/10 text-accent-foreground" },
  location_default: { label: "Default ubicación", color: "bg-warning/10 text-warning" },
};

export default function EmployeeCompensationTab({
  employeeId,
  employeeName,
  companyId,
}: {
  employeeId: string;
  employeeName: string;
  companyId: string;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);

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

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {profile.default_hourly_rate != null && (
              <RateCard icon={Clock} label="Hora" value={`$${profile.default_hourly_rate}`} />
            )}
            {profile.default_daily_rate != null && (
              <RateCard icon={DollarSign} label="Día completo" value={`$${profile.default_daily_rate}`} />
            )}
            {profile.default_half_day_rate != null && (
              <RateCard icon={DollarSign} label="Medio día" value={`$${profile.default_half_day_rate}`} />
            )}
            {profile.default_ride_rate_regular != null && (
              <RateCard icon={Car} label="Ride regular" value={`$${profile.default_ride_rate_regular}`} />
            )}
            {profile.default_ride_rate_special != null && (
              <RateCard icon={Car} label="Ride especial" value={`$${profile.default_ride_rate_special}`} />
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
