/**
 * OpsWorkforcePanel — compact workforce intelligence summary for the
 * Operations Command Center. Shows top performers, at-risk workers and
 * bonus-eligible candidates derived from `workforce-score.ts`.
 *
 * Read-only. Clicking a row deep-links to /app/workforce or /app/leaderboard.
 * NEVER writes to payroll.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  computeWorkforceScoresBatch, type WorkforceScore,
} from "@/lib/workforce-score";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Button } from "@/components/ui/button";
import { Star, Trophy, AlertTriangle, Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPersonName } from "@/lib/format-helpers";

interface EmployeeLite {
  id: string; first_name: string; last_name: string; avatar_url: string | null;
}

interface OpsWorkforcePanelProps {
  companyId: string | null;
  /** Max rows per column. */
  limit?: number;
}

export function OpsWorkforcePanel({ companyId, limit = 4 }: OpsWorkforcePanelProps) {
  const [rows, setRows] = useState<{ score: WorkforceScore; employee: EmployeeLite }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: emps } = await supabase
          .from("employees")
          .select("id, first_name, last_name, avatar_url")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .limit(80);
        if (!emps?.length || cancelled) { setRows([]); return; }
        const scores = await computeWorkforceScoresBatch(companyId, emps.map(e => e.id));
        if (cancelled) return;
        const byId = new Map(emps.map(e => [e.id, e]));
        const merged = scores
          .map(s => ({ score: s, employee: byId.get(s.employeeId)! }))
          .filter(r => !!r.employee);
        setRows(merged);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (loading && !rows.length) {
    return (
      <div className="rounded-xl border bg-card p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  // Filter buckets — only show workers with at least 1 signal to avoid noise
  const withSignal = rows.filter(r => r.score.shiftsCompleted > 0 || r.score.ratingCount > 0);
  const top = [...withSignal].sort((a, b) => b.score.composite - a.score.composite).slice(0, limit);
  const atRisk = withSignal
    .filter(r => r.score.shiftsNoShow > 0 || r.score.composite < 60)
    .sort((a, b) => a.score.composite - b.score.composite)
    .slice(0, limit);
  const bonus = withSignal.filter(r => r.score.bonusEligible).slice(0, limit);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Workforce Intelligence</h3>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-7 text-[11px] gap-1">
          <Link to="/app/workforce">
            Ver todos <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
        <Bucket
          icon={<Trophy className="h-3.5 w-3.5 text-earning" />}
          label="Top performers"
          rows={top}
          tone="earning"
          emptyHint="Sin datos suficientes"
        />
        <Bucket
          icon={<AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
          label="En riesgo"
          rows={atRisk}
          tone="destructive"
          emptyHint="Sin alertas de score"
        />
        <Bucket
          icon={<Star className="h-3.5 w-3.5 text-primary" />}
          label="Elegibles para bonus"
          rows={bonus}
          tone="primary"
          emptyHint="Nadie califica esta semana"
          subtitle="score > 90 · 0 no-shows"
        />
      </div>
    </div>
  );
}

interface BucketProps {
  icon: React.ReactNode;
  label: string;
  rows: { score: WorkforceScore; employee: EmployeeLite }[];
  tone: "earning" | "destructive" | "primary";
  emptyHint: string;
  subtitle?: string;
}

function Bucket({ icon, label, rows, tone, emptyHint, subtitle }: BucketProps) {
  const toneClasses: Record<typeof tone, string> = {
    earning: "text-earning",
    destructive: "text-destructive",
    primary: "text-primary",
  };
  return (
    <div className="p-3">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      {subtitle && <p className="text-[9px] text-muted-foreground mb-2">{subtitle}</p>}
      {!rows.length ? (
        <p className="text-[11px] text-muted-foreground italic py-3 text-center">{emptyHint}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(({ score, employee }) => (
            <Link
              key={score.employeeId}
              to={`/app/workforce?focus=${score.employeeId}`}
              className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <EmployeeAvatar
                firstName={employee.first_name}
                lastName={employee.last_name}
                avatarUrl={employee.avatar_url}
                size="xs"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate">
                  {formatPersonName(`${employee.first_name} ${employee.last_name}`)}
                </p>
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                  {score.ratingCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Star className="h-2.5 w-2.5 fill-current" />
                      {score.rating.toFixed(1)}
                    </span>
                  )}
                  <span>·</span>
                  <span>{score.shiftsCompleted} turnos</span>
                  {score.shiftsNoShow > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-destructive font-medium">{score.shiftsNoShow} no-show</span>
                    </>
                  )}
                </div>
              </div>
              <span className={cn("text-xs font-bold tabular-nums", toneClasses[tone])}>
                {score.composite}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
