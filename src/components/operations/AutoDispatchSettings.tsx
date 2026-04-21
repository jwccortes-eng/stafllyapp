/**
 * AutoDispatchSettings
 *
 * Modal that lets the admin pick the autonomy level for the Smart Dispatch
 * engine. Persisted via `useCompanyConfig` under the `auto_dispatch` key.
 *
 * Levels and what they do:
 *   • off       → engine doesn't even compute suggestions
 *   • assist    → suggestions visible, but admin must click Execute
 *   • semi_auto → same as assist (reserved for future pre-fill flows)
 *   • full_auto → engine executes safe actions on its own (rate-limited)
 *
 * Hard safety rules apply to full_auto regardless of toggles below.
 * They are listed in `AUTO_SAFETY` (auto-dispatch.ts) and can NOT be
 * loosened from the UI.
 */
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Sparkles, Zap, Hand, PowerOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import {
  AUTO_DISPATCH_DEFAULTS,
  AUTO_DISPATCH_SETTINGS_KEY,
  AUTO_SAFETY,
  type AutoDispatchConfig,
  type AutoDispatchLevel,
} from "@/lib/auto-dispatch";

interface AutoDispatchSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LEVEL_OPTIONS: Array<{
  value: AutoDispatchLevel;
  label: string;
  hint: string;
  icon: typeof PowerOff;
  toneClass: string;
}> = [
  {
    value: "off",
    label: "Off",
    hint: "No genera sugerencias ni acciones.",
    icon: PowerOff,
    toneClass: "border-border text-muted-foreground",
  },
  {
    value: "assist",
    label: "Assist",
    hint: "Sugiere acciones — el admin decide y ejecuta.",
    icon: Hand,
    toneClass: "border-info/40 text-info",
  },
  {
    value: "semi_auto",
    label: "Semi-auto",
    hint: "Pre-rellena la acción para 1-click — admin confirma.",
    icon: Sparkles,
    toneClass: "border-warning/40 text-warning",
  },
  {
    value: "full_auto",
    label: "Full auto",
    hint: "Ejecuta acciones seguras sin intervención.",
    icon: Zap,
    toneClass: "border-earning/40 text-earning",
  },
];

export function AutoDispatchSettings({ open, onOpenChange }: AutoDispatchSettingsProps) {
  const { config, updateConfig, loading } = useCompanyConfig<AutoDispatchConfig>(
    AUTO_DISPATCH_SETTINGS_KEY, AUTO_DISPATCH_DEFAULTS,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Smart Dispatch
          </DialogTitle>
          <DialogDescription className="text-xs">
            Define cuánta autonomía le das al motor. Las reglas de seguridad
            siempre se aplican en modo Full auto.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-4 space-y-4">
          {/* Level grid */}
          <div className="grid grid-cols-2 gap-2">
            {LEVEL_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = config.level === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={loading}
                  onClick={() => updateConfig({ level: opt.value })}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    active
                      ? `bg-primary/5 ring-2 ring-primary/40 ${opt.toneClass}`
                      : `bg-card hover:bg-muted/30 ${opt.toneClass}`,
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="text-xs font-bold">{opt.label}</span>
                    {active && (
                      <Badge variant="outline" className="ml-auto h-4 text-[8px] px-1 border-primary/40 text-primary">
                        actual
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
                    {opt.hint}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Full auto granular toggles */}
          {config.level === "full_auto" && (
            <div className="rounded-xl border border-earning/20 bg-earning/[0.04] p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-earning" />
                <p className="text-[11px] font-bold text-earning">Acciones permitidas</p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="auto-assign" className="flex-1 cursor-pointer">
                  <p className="text-xs font-medium">Auto-asignar al top candidato</p>
                  <p className="text-[10px] text-muted-foreground">
                    Asigna 1 worker (score ≥ {AUTO_SAFETY.minTopCandidateScore}, disponible).
                  </p>
                </Label>
                <Switch
                  id="auto-assign"
                  checked={config.allowAutoAssign}
                  onCheckedChange={v => updateConfig({ allowAutoAssign: v })}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="auto-broadcast" className="flex-1 cursor-pointer">
                  <p className="text-xs font-medium">Auto-broadcast</p>
                  <p className="text-[10px] text-muted-foreground">
                    Notifica a 3+ workers cuando no hay candidatos libres.
                  </p>
                </Label>
                <Switch
                  id="auto-broadcast"
                  checked={config.allowAutoBroadcast}
                  onCheckedChange={v => updateConfig({ allowAutoBroadcast: v })}
                />
              </div>
            </div>
          )}

          {/* Safety rules — always visible, non-editable */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Reglas de seguridad
              </p>
            </div>
            <ul className="text-[10px] text-muted-foreground space-y-0.5 leading-relaxed">
              <li>• Confianza mínima: {Math.round(AUTO_SAFETY.minConfidence * 100)}%</li>
              <li>• Turnos que inician en ≤ {AUTO_SAFETY.maxStartsInMinutes} min</li>
              <li>• Faltan ≤ {AUTO_SAFETY.maxMissingPerShift} workers</li>
              <li>• Máx. {AUTO_SAFETY.maxAutoActionsPerHour} acciones/hora · {AUTO_SAFETY.maxAutoActionsPerShift}/turno</li>
              <li>• Nunca toca payroll ni asistencia</li>
            </ul>
          </div>

          <div className="flex justify-end pt-1">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              Listo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
