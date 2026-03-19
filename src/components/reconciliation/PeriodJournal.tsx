import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Upload, GitCompareArrows, AlertTriangle, CheckCircle2, Lock, FileText,
  Shield, RotateCcw, ClipboardCheck, Settings2, BookOpen,
} from "lucide-react";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

interface Props {
  period: PeriodStatus;
  companyId: string | null;
}

interface JournalEntry {
  id: string;
  event_type: string;
  event_label: string;
  detail: string | null;
  performed_by: string | null;
  created_at: string;
  metadata: any;
}

const EVENT_ICONS: Record<string, any> = {
  import: Upload,
  matching: GitCompareArrows,
  exception_resolved: AlertTriangle,
  rule_created: Settings2,
  approval: CheckCircle2,
  validation: ClipboardCheck,
  publish: Shield,
  receipt: FileText,
  reopen: RotateCcw,
  lock: Lock,
};

const EVENT_COLORS: Record<string, string> = {
  import: "text-blue-600",
  matching: "text-violet-600",
  exception_resolved: "text-amber-600",
  rule_created: "text-teal-600",
  approval: "text-emerald-600",
  validation: "text-indigo-600",
  publish: "text-primary",
  receipt: "text-primary",
  reopen: "text-destructive",
  lock: "text-destructive",
};

export default function PeriodJournal({ period, companyId }: Props) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("reconciliation_period_journal" as any)
      .select("*")
      .eq("period_status_id", period.id)
      .order("created_at", { ascending: false })
      .limit(200);
    setEntries((data || []) as any[]);
    setLoading(false);
  }, [companyId, period.id]);

  useEffect(() => { load(); }, [load]);

  // Group by date
  const grouped = entries.reduce<Record<string, JournalEntry[]>>((acc, e) => {
    const day = new Date(e.created_at).toLocaleDateString("es", { weekday: "short", day: "2-digit", month: "short" });
    (acc[day] = acc[day] || []).push(e);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> Diario de Cierre — {period.period_label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <EmptyState icon={BookOpen} title="Sin actividad" description="Las acciones sobre este periodo se registrarán aquí automáticamente." />
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-4">
              {Object.entries(grouped).map(([day, dayEntries]) => (
                <div key={day}>
                  <div className="text-xs font-medium text-muted-foreground mb-2 sticky top-0 bg-background py-1">{day}</div>
                  <div className="space-y-1 pl-4 border-l-2 border-muted">
                    {dayEntries.map(e => {
                      const Icon = EVENT_ICONS[e.event_type] || FileText;
                      const color = EVENT_COLORS[e.event_type] || "text-muted-foreground";
                      return (
                        <div key={e.id} className="flex items-start gap-2 py-1.5">
                          <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium">{e.event_label}</span>
                            {e.detail && <span className="text-xs text-muted-foreground ml-1">— {e.detail}</span>}
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {new Date(e.created_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
