import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import {
  CheckCircle2, Circle, Users, CalendarDays, Clock,
  DollarSign, MapPin, ChevronRight, Rocket, X, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  icon: any;
  route: string;
  completed: boolean;
}

export function OnboardingChecklist() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const navigate = useNavigate();
  const [steps, setSteps] = useState<ChecklistStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!selectedCompanyId) return;

    // Check if user dismissed this checklist
    const dismissKey = `onboarding_dismissed_${selectedCompanyId}`;
    if (localStorage.getItem(dismissKey) === "true") {
      setDismissed(true);
      setLoading(false);
      return;
    }

    async function checkProgress() {
      const [empRes, shiftRes, periodRes, locationRes, conceptRes] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).eq("is_active", true),
        supabase.from("scheduled_shifts").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).is("deleted_at", null),
        supabase.from("pay_periods").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!),
        supabase.from("locations").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).is("deleted_at", null),
        supabase.from("concepts").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).eq("is_active", true),
      ]);

      const hasEmployees = (empRes.count ?? 0) > 0;
      const hasShifts = (shiftRes.count ?? 0) > 0;
      const hasPeriods = (periodRes.count ?? 0) > 0;
      const hasLocations = (locationRes.count ?? 0) > 0;
      const hasConcepts = (conceptRes.count ?? 0) > 0;

      setSteps([
        {
          id: "employees",
          label: "Agrega tu primer empleado",
          description: "Registra al menos un empleado para empezar",
          icon: Users,
          route: "/app/employees",
          completed: hasEmployees,
        },
        {
          id: "concepts",
          label: "Configura conceptos de pago",
          description: "Define tarifa por hora, bonos y deducciones",
          icon: DollarSign,
          route: "/app/concepts",
          completed: hasConcepts,
        },
        {
          id: "locations",
          label: "Crea una ubicación de trabajo",
          description: "Agrega las ubicaciones donde trabaja tu equipo",
          icon: MapPin,
          route: "/app/locations",
          completed: hasLocations,
        },
        {
          id: "shifts",
          label: "Programa tu primer turno",
          description: "Crea un turno y asigna empleados",
          icon: CalendarDays,
          route: "/app/shifts",
          completed: hasShifts,
        },
        {
          id: "periods",
          label: "Abre tu primer periodo de nómina",
          description: "Crea un periodo para registrar horas y pagos",
          icon: Clock,
          route: "/app/periods",
          completed: hasPeriods,
        },
      ]);
      setLoading(false);
    }

    checkProgress();
  }, [selectedCompanyId]);

  if (loading || dismissed) return null;

  const completedCount = steps.filter(s => s.completed).length;
  const allDone = completedCount === steps.length;
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  // Don't show if everything is done
  if (allDone) return null;

  const handleDismiss = () => {
    if (selectedCompanyId) {
      localStorage.setItem(`onboarding_dismissed_${selectedCompanyId}`, "true");
    }
    setDismissed(true);
  };

  return (
    <div className="bg-card rounded-2xl border border-primary/20 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
            <Rocket className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-heading text-foreground flex items-center gap-2">
              Configura {selectedCompany?.name ?? "tu empresa"}
              <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {completedCount}/{steps.length}
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Completa estos pasos para tener tu plataforma lista
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Ocultar checklist"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-3">
          <Progress
            value={progressPercent}
            className="h-2 flex-1 bg-muted/60 [&>div]:bg-gradient-to-r [&>div]:from-primary [&>div]:to-earning [&>div]:rounded-full rounded-full"
          />
          <span className="text-[11px] font-semibold text-primary tabular-nums">{progressPercent}%</span>
        </div>
      </div>

      {/* Steps */}
      <div className="px-3 pb-3">
        <div className="space-y-1">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                onClick={() => !step.completed && navigate(step.route)}
                disabled={step.completed}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group",
                  step.completed
                    ? "opacity-60"
                    : "hover:bg-primary/[0.04] hover:border-primary/10 cursor-pointer active:scale-[0.99]"
                )}
              >
                {step.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-earning shrink-0" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0 group-hover:border-primary transition-colors" />
                )}
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    step.completed ? "bg-earning/[0.08]" : "bg-primary/[0.08]"
                  )}>
                    <Icon className={cn("h-3.5 w-3.5", step.completed ? "text-earning" : "text-primary")} />
                  </div>
                  <div className="min-w-0">
                    <p className={cn(
                      "text-[13px] font-semibold",
                      step.completed ? "text-muted-foreground line-through" : "text-foreground"
                    )}>
                      {step.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 truncate">{step.description}</p>
                  </div>
                </div>
                {!step.completed && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
