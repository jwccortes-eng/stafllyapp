import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Sparkles,
  ChevronRight,
  FileWarning,
  Users,
  Clock,
  Upload,
  GitMerge,
  Hash,
  ClipboardList,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * SmartActionQueue
 *
 * Prioritized "what needs my attention today" list. Mixes hardcoded policy
 * items (PASSOVER, Review periods, next Connecteam upload) with live counts
 * (open time entries, unmatched historical rows, missing-docs workers,
 * duplicate workers).
 *
 * Read-only. No writes. No mutations.
 */

type Priority = "critical" | "high" | "medium" | "info";

interface ActionItem {
  id: string;
  priority: Priority;
  title: string;
  reason: string;
  cta: string;
  to: string;
  source: string;
  icon: typeof AlertTriangle;
}

const PRIORITY_META: Record<Priority, { label: string; tone: string; dot: string; order: number }> = {
  critical: { label: "Critical", tone: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20", dot: "bg-red-500", order: 0 },
  high:     { label: "High",     tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20", dot: "bg-amber-500", order: 1 },
  medium:   { label: "Medium",   tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20", dot: "bg-sky-500", order: 2 },
  info:     { label: "Info",     tone: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground/40", order: 3 },
};

interface Props {
  companyId: string | null;
}

export function SmartActionQueue({ companyId }: Props) {
  const [counts, setCounts] = useState({
    openTimeEntries: 0,
    unmatchedHistorical: 0,
    duplicates: 0,
    workersNoPortal: 0,
    workersMissingPin: 0,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const sb: any = supabase;
        const openQ = sb.from("time_entries").select("id", { count: "exact", head: true }).is("clock_out", null);
        const unmatchedQ = sb.from("historical_payroll_entries").select("id", { count: "exact", head: true }).is("matched_employee_id", null);
        const noPortalQ = sb.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true).is("user_id", null);
        
        if (companyId) {
          openQ.eq("company_id", companyId);
          unmatchedQ.eq("company_id", companyId);
          noPortalQ.eq("company_id", companyId);
        }
        
        const [openRes, unmatchedRes, noPortalRes] = await Promise.all([openQ, unmatchedQ, noPortalQ]);

        if (cancelled) return;
        setCounts({
          openTimeEntries: openRes?.count ?? 0,
          unmatchedHistorical: unmatchedRes?.count ?? 0,
          duplicates: 0,
          workersNoPortal: noPortalRes?.count ?? 0,
          workersMissingPin: 0,
        });
      } catch {
        // Silent fail — keep defaults.
      }
    }
    load();
    return () => { cancelled = true; };
  }, [companyId]);

  const items: ActionItem[] = [];

  // Policy items (always present)
  items.push({
    id: "passover-policy",
    priority: "critical",
    title: "Resolve PASSOVER #126 / #127 split policy",
    reason: "Raw row-date file required to safely split passover periods.",
    cta: "Open historical board",
    to: "/app/periods",
    source: "Historical Closeout",
    icon: AlertTriangle,
  });
  items.push({
    id: "review-periods",
    priority: "high",
    title: "Decide policy for Review periods #121/#122/#123/#125",
    reason: "Diff against Connecteam pending replace / merge / skip / document_only decision.",
    cta: "Open review board",
    to: "/app/periods",
    source: "Historical Closeout",
    icon: FileWarning,
  });
  items.push({
    id: "next-connecteam",
    priority: "medium",
    title: "Upload next Connecteam payroll final file",
    reason: "Pilot pipeline ready. Next file extends historical mirror past #129.",
    cta: "Open Pay Periods",
    to: "/app/periods",
    source: "Payroll",
    icon: Upload,
  });

  // Live items (only if count > 0)
  if (counts.openTimeEntries > 0) {
    items.push({
      id: "open-time-entries",
      priority: counts.openTimeEntries > 5 ? "high" : "medium",
      title: `Review ${counts.openTimeEntries} open time entr${counts.openTimeEntries === 1 ? "y" : "ies"}`,
      reason: "Time entries without clock_out can distort attendance and integrity.",
      cta: "Open Time Clock",
      to: "/app/timeclock",
      source: "Operations",
      icon: Clock,
    });
  }
  if (counts.unmatchedHistorical > 0) {
    items.push({
      id: "unmatched-historical",
      priority: "high",
      title: `Resolve ${counts.unmatchedHistorical} unmatched historical payroll row${counts.unmatchedHistorical === 1 ? "" : "s"}`,
      reason: "Connecteam payroll row could not be matched to any active employee record.",
      cta: "Open historical entries",
      to: "/app/periods",
      source: "Historical Closeout",
      icon: Hash,
    });
  }
  if (counts.workersNoPortal > 0) {
    items.push({
      id: "workers-no-portal",
      priority: "medium",
      title: `${counts.workersNoPortal} active worker${counts.workersNoPortal === 1 ? "" : "s"} without portal access`,
      reason: "Activate portal to share shifts, payments and announcements.",
      cta: "Open Workers",
      to: "/app/employees?status=pending",
      source: "Workers",
      icon: Users,
    });
  }
  items.push({
    id: "duplicates",
    priority: "info",
    title: "Run duplicate worker review",
    reason: "Detect duplicate identities before they contaminate payroll.",
    cta: "Open Duplicates",
    to: "/app/workers/duplicates",
    source: "Workers",
    icon: GitMerge,
  });

  items.sort((a, b) => PRIORITY_META[a.priority].order - PRIORITY_META[b.priority].order);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-primary/10 p-1.5 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Smart Action Queue</h2>
          <p className="text-xs text-muted-foreground">
            What needs your attention today.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-border/40">
          {items.map((item) => {
            const meta = PRIORITY_META[item.priority];
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                to={item.to}
                className="group flex items-start gap-3 p-3 hover:bg-accent/40 active:bg-accent/60 transition-colors"
              >
                <div className={cn("mt-0.5 rounded-md border p-1.5 shrink-0", meta.tone)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", meta.dot)} />
                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          {meta.label} · {item.source}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm font-semibold leading-tight">{item.title}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{item.reason}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5 group-hover:text-foreground transition-colors" />
                  </div>
                  <div className="mt-1.5">
                    <Badge variant="outline" className="text-[10px] h-5 font-semibold border-primary/20 bg-primary/5 text-primary">
                      {item.cta}
                    </Badge>
                  </div>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
