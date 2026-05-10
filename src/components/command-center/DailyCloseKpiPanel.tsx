import { useEffect, useState } from "react";
import { ClipboardCheck, AlertTriangle, ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  companyId: string | null;
  className?: string;
}

interface Counts {
  missing: number;
  pendingReview: number;
  incidents: number;
}

/**
 * Phase 17C — Read-only Daily Close KPI panel for the Command Center.
 *
 * No mutations. No payroll/time/attendance reads. Pulls from:
 *   - scheduled_shifts (today/past published, last 14 days)
 *   - shift_closeout_reports
 */
export function DailyCloseKpiPanel({ companyId, className }: Props) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setCounts(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const today = new Date();
        const sinceDate = new Date(today.getTime() - 14 * 86400000);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);

        const { data: shiftsRaw } = await supabase
          .from("scheduled_shifts")
          .select("id, date, publication_status")
          .eq("company_id", companyId)
          .gte("date", fmt(sinceDate))
          .lte("date", fmt(today))
          .is("deleted_at", null)
          .limit(1000);

        const eligible = (shiftsRaw ?? []).filter(
          (s: any) => (s.publication_status ?? "published") === "published",
        );
        const eligibleIds = eligible.map((s: any) => s.id);

        let missing = 0;
        let pendingReview = 0;
        let incidents = 0;

        if (eligibleIds.length > 0) {
          const { data: closeouts } = await supabase
            .from("shift_closeout_reports")
            .select("shift_id, status, incident_count")
            .eq("company_id", companyId)
            .in("shift_id", eligibleIds);

          const byShift = new Map<string, any>();
          for (const c of closeouts ?? []) byShift.set((c as any).shift_id, c);

          for (const s of eligible) {
            const c = byShift.get(s.id);
            if (!c) missing++;
            else if (c.status === "submitted") pendingReview++;
            else if (c.status === "reviewed" && (c.incident_count ?? 0) > 0)
              incidents++;
          }
        }

        if (!cancelled) setCounts({ missing, pendingReview, incidents });
      } catch (e) {
        if (!cancelled) setCounts({ missing: 0, pendingReview: 0, incidents: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (!companyId) return null;

  return (
    <section
      aria-label="Daily close summary"
      className={cn(
        "rounded-2xl border border-border/50 bg-card p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">Daily close</h3>
        <span className="text-[11px] text-muted-foreground ml-auto">
          Last 14 days
        </span>
      </div>
      {loading || !counts ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Tile
            icon={ClipboardCheck}
            label="Missing"
            value={counts.missing}
            tone={counts.missing > 0 ? "warn" : "ok"}
          />
          <Tile
            icon={ShieldAlert}
            label="Pending review"
            value={counts.pendingReview}
            tone={counts.pendingReview > 0 ? "info" : "ok"}
          />
          <Tile
            icon={AlertTriangle}
            label="Incidents"
            value={counts.incidents}
            tone={counts.incidents > 0 ? "bad" : "ok"}
          />
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground leading-snug">
        Operational evidence only. Closeouts do not approve payroll.
      </p>
    </section>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "ok" | "warn" | "bad" | "info";
}) {
  const toneClass =
    tone === "bad"
      ? "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
        : tone === "info"
          ? "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300"
          : "border-border/50 bg-muted/20 text-foreground/80";
  return (
    <div className={cn("rounded-xl border p-3", toneClass)}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}
