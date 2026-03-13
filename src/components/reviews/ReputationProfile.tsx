import { Shield, Star, TrendingUp, Award, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useEmployeeReputation, LEVEL_CONFIG, BADGE_DEFS } from "@/hooks/useEmployeeReputation";

interface Props {
  employeeId: string;
  companyId: string;
  compact?: boolean;
}

export function ReputationProfile({ employeeId, companyId, compact = false }: Props) {
  const rep = useEmployeeReputation(employeeId, companyId);

  if (rep.loading) return null;

  const levelCfg = LEVEL_CONFIG[rep.level];

  if (compact) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span className={cn("text-sm font-bold", levelCfg.color)}>{levelCfg.emoji} {levelCfg.label}</span>
        <div className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          <span className="text-sm font-semibold">{rep.reviewAvg || "—"}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          Trust {rep.trustScore}%
        </div>
        {rep.badges.slice(0, 3).map(b => (
          <span key={b.badge_key} className="text-sm" title={b.badge_label}>{b.badge_emoji}</span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scores row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ScoreCard
          icon={TrendingUp}
          label="Reputation"
          value={rep.reputationScore}
          suffix="/100"
          color={rep.reputationScore >= 85 ? "text-emerald-500" : rep.reputationScore >= 60 ? "text-amber-500" : "text-destructive"}
        />
        <ScoreCard
          icon={Star}
          label="Rating"
          value={rep.reviewAvg || 0}
          suffix="/5"
          color="text-amber-400"
        />
        <ScoreCard
          icon={Shield}
          label="Trust Score"
          value={rep.trustScore}
          suffix="%"
          color={rep.trustScore >= 90 ? "text-emerald-500" : "text-amber-500"}
        />
        <ScoreCard
          icon={Target}
          label="Turnos"
          value={rep.shiftsCompleted}
          suffix=""
          color="text-primary"
        />
      </div>

      {/* Level */}
      <div className="flex items-center gap-3 bg-muted/30 rounded-xl px-4 py-3">
        <span className="text-2xl">{levelCfg.emoji}</span>
        <div>
          <p className={cn("text-sm font-bold", levelCfg.color)}>{levelCfg.label}</p>
          <p className="text-[10px] text-muted-foreground">Nivel basado en reputation score y turnos completados</p>
        </div>
      </div>

      {/* Badges */}
      {rep.badges.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Insignias</h4>
          <TooltipProvider>
            <div className="flex flex-wrap gap-2">
              {rep.badges.map(b => {
                const def = BADGE_DEFS[b.badge_key];
                return (
                  <Tooltip key={b.badge_key}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 rounded-full bg-muted/50 border px-3 py-1.5 text-xs font-medium hover:bg-accent/50 transition-colors cursor-default">
                        <span className="text-base">{b.badge_emoji}</span>
                        <span>{b.badge_label}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{def?.desc ?? b.badge_label}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </div>
      )}

      {rep.badges.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Aún no tiene insignias. Se otorgan automáticamente según desempeño.</p>
      )}
    </div>
  );
}

function ScoreCard({ icon: Icon, label, value, suffix, color }: {
  icon: any; label: string; value: number; suffix: string; color: string;
}) {
  return (
    <Card className="rounded-xl border-border/40">
      <CardContent className="p-3 text-center">
        <Icon className={cn("h-4 w-4 mx-auto mb-1", color)} />
        <p className={cn("text-lg font-bold tabular-nums", color)}>{value}<span className="text-[10px] text-muted-foreground font-normal">{suffix}</span></p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
