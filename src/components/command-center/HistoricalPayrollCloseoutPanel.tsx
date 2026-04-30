import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, FileWarning, ExternalLink, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * HistoricalPayrollCloseoutPanel
 *
 * Read-only Phase 1 panel that surfaces the Connecteam → Stafly historical
 * closeout state. Mixes hardcoded policy (which periods are validated /
 * blocked / under review) with live counts from the database.
 *
 * No writes. No mutations. Safe to drop anywhere inside the Command Center.
 */

type PolicyStatus = "validated" | "blocked" | "review";

interface PeriodPolicy {
  sequence: number;
  status: PolicyStatus;
  label: string;
  expectedRows?: number;
  expectedTotal?: number;
  note?: string;
}

// Frozen policy from approved committed pilots and decision board.
const PERIOD_POLICY: PeriodPolicy[] = [
  { sequence: 124, status: "validated", label: "Pilot #124", expectedRows: 81, expectedTotal: 49477.10 },
  { sequence: 128, status: "validated", label: "Pilot #128", expectedRows: 44, expectedTotal: 27946.05 },
  { sequence: 129, status: "validated", label: "Pilot #129", expectedRows: 51, expectedTotal: 19433.83 },
  { sequence: 126, status: "blocked", label: "PASSOVER #126", note: "Raw row-date file required to split" },
  { sequence: 127, status: "blocked", label: "PASSOVER #127", note: "Raw row-date file required to split" },
  { sequence: 121, status: "review", label: "Review #121", note: "Diff vs Connecteam pending decision" },
  { sequence: 122, status: "review", label: "Review #122", note: "Amount mismatches — merge candidate" },
  { sequence: 123, status: "review", label: "Review #123", note: "Diff vs Connecteam pending decision" },
  { sequence: 125, status: "review", label: "Review #125", note: "Placeholder data — replace candidate" },
];

const STATUS_META: Record<PolicyStatus, { tone: string; icon: typeof CheckCircle2; label: string }> = {
  validated: { tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20", icon: CheckCircle2, label: "Validated" },
  blocked:   { tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20", icon: AlertTriangle, label: "Blocked" },
  review:    { tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20", icon: FileWarning, label: "Review" },
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

interface Props {
  companyId: string | null; // null = global
}

export function HistoricalPayrollCloseoutPanel({ companyId }: Props) {
  const [unmatchedCount, setUnmatchedCount] = useState<number | null>(null);
  const [completedImports, setCompletedImports] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const sb: any = supabase;

        const unmatchedQ = sb
          .from("historical_payroll_entries")
          .select("id", { count: "exact", head: true });
        const importsQ = sb
          .from("imports")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed");
        if (companyId) {
          unmatchedQ.eq("company_id", companyId);
          importsQ.eq("company_id", companyId);
        }
        const [unmatchedRes, importsRes] = await Promise.all([unmatchedQ, importsQ]);
        if (cancelled) return;
        setUnmatchedCount(unmatchedRes?.count ?? 0);
        setCompletedImports(importsRes?.count ?? 0);
      } catch {
        if (!cancelled) {
          setUnmatchedCount(0);
          setCompletedImports(0);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const validatedCount = PERIOD_POLICY.filter((p) => p.status === "validated").length;
  const blockedCount = PERIOD_POLICY.filter((p) => p.status === "blocked").length;
  const reviewCount = PERIOD_POLICY.filter((p) => p.status === "review").length;

  const validatedTotal = PERIOD_POLICY
    .filter((p) => p.status === "validated")
    .reduce((s, p) => s + (p.expectedTotal ?? 0), 0);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-1.5 text-primary">
            <History className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Historical Payroll Closeout</h2>
            <p className="text-xs text-muted-foreground">
              Connecteam final files migrated into Stafly. Read-only.
            </p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <Link to="/app/periods">
            Open board <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label="Validated periods" value={validatedCount} tone="emerald" />
        <KpiTile label="Blocked (PASSOVER)" value={blockedCount} tone="amber" />
        <KpiTile label="Under review" value={reviewCount} tone="sky" />
        <KpiTile
          label="Imported total"
          value={fmtMoney(validatedTotal)}
          tone="neutral"
          mono
        />
      </div>

      {/* Period chips */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_POLICY.map((p) => {
              const meta = STATUS_META[p.status];
              const Icon = meta.icon;
              return (
                <Badge
                  key={p.sequence}
                  variant="outline"
                  className={cn("gap-1 px-2 py-0.5 text-[10px] font-semibold border", meta.tone)}
                  title={p.note ?? p.label}
                >
                  <Icon className="h-2.5 w-2.5" />
                  #{p.sequence}
                </Badge>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-1.5 text-[11px] text-muted-foreground sm:grid-cols-3 pt-1.5 border-t border-border/40">
            <div>
              Completed imports:{" "}
              <span className="font-mono text-foreground">{completedImports ?? "…"}</span>
            </div>
            <div>
              Unmatched historical rows:{" "}
              <span className="font-mono text-foreground">{unmatchedCount ?? "…"}</span>
            </div>
            <div>
              Validated rows:{" "}
              <span className="font-mono text-foreground">
                {PERIOD_POLICY
                  .filter((p) => p.status === "validated")
                  .reduce((s, p) => s + (p.expectedRows ?? 0), 0)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function KpiTile({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: number | string;
  tone: "emerald" | "amber" | "sky" | "neutral";
  mono?: boolean;
}) {
  const toneCls =
    tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "amber" ? "text-amber-600 dark:text-amber-400" :
    tone === "sky" ? "text-sky-600 dark:text-sky-400" :
    "text-foreground";
  return (
    <div className="rounded-lg border border-border/50 bg-card p-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", toneCls, mono && "font-mono text-base")}>
        {value}
      </div>
    </div>
  );
}
