import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangle, RotateCcw, Users, Settings2, Target } from "lucide-react";

interface Props {
  companyId: string | null;
}

interface UATIssue {
  id: string;
  severity: string;
  status: string;
  category: string;
  title: string;
  period_status_id: string;
}

export default function StabilizationPriorities({ companyId }: Props) {
  const [issues, setIssues] = useState<UATIssue[]>([]);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("reconciliation_uat_issues" as any)
      .select("id, severity, status, category, title, period_status_id")
      .eq("company_id", companyId)
      .in("status", ["open", "fixed"])
      .order("reported_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setIssues((data || []) as any[]));
  }, [companyId]);

  const priorities = useMemo(() => {
    const criticalOpen = issues.filter(i => i.status === "open" && i.severity === "critical");
    const highOpen = issues.filter(i => i.status === "open" && i.severity === "high");
    const awaitingRetest = issues.filter(i => i.status === "fixed");

    // Repeated categories (same category appearing in multiple periods)
    const categoryCount = new Map<string, number>();
    issues.filter(i => i.status === "open").forEach(i => {
      categoryCount.set(i.category, (categoryCount.get(i.category) || 0) + 1);
    });
    const repeatedCategories = Array.from(categoryCount.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);

    return { criticalOpen, highOpen, awaitingRetest, repeatedCategories };
  }, [issues]);

  const CATEGORY_LABELS: Record<string, string> = {
    import_parsing: "Import / Parsing",
    employee_match: "Employee Match",
    payroll_classification: "Clasificación Payroll",
    variance_explanation: "Varianza",
    publish_behavior: "Publish",
    ux_friction: "UX / Fricción",
    duplicate_risk: "Duplicados",
    incorrect_totals: "Totales Incorrectos",
    signoff_confusion: "Signoff",
    post_publish_inconsistency: "Post-Publish",
    general: "General",
  };

  const totalOpen = priorities.criticalOpen.length + priorities.highOpen.length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Críticos Abiertos", value: priorities.criticalOpen.length, color: "text-destructive" },
          { label: "Altos Abiertos", value: priorities.highOpen.length, color: "text-warning" },
          { label: "Esperan Re-test", value: priorities.awaitingRetest.length, color: "text-primary" },
          { label: "Categorías Recurrentes", value: priorities.repeatedCategories.length, color: "text-muted-foreground" },
        ].map(k => (
          <div key={k.label} className="text-center p-3 bg-muted/30 rounded-lg">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Critical & High open issues */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Issues Críticos / Altos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totalOpen === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sin issues críticos o altos abiertos ✓</p>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-1.5">
                  {[...priorities.criticalOpen, ...priorities.highOpen].map(issue => (
                    <div key={issue.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                      <Badge variant={issue.severity === "critical" ? "destructive" : "warning"} className="text-[10px] shrink-0">
                        {issue.severity}
                      </Badge>
                      <span className="text-xs flex-1 truncate">{issue.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {CATEGORY_LABELS[issue.category] || issue.category}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Awaiting retest */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-primary" /> Esperan Re-test
            </CardTitle>
          </CardHeader>
          <CardContent>
            {priorities.awaitingRetest.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sin issues pendientes de re-test ✓</p>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-1.5">
                  {priorities.awaitingRetest.map(issue => (
                    <div key={issue.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                      <Badge variant="secondary" className="text-[10px] shrink-0">fixed</Badge>
                      <span className="text-xs flex-1 truncate">{issue.title}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Repeated categories */}
      {priorities.repeatedCategories.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4" /> Áreas con Issues Recurrentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {priorities.repeatedCategories.map(([cat, count]) => (
                <Badge key={cat} variant="outline" className="text-xs gap-1">
                  {CATEGORY_LABELS[cat] || cat} <span className="font-bold">×{count}</span>
                </Badge>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Estas categorías aparecen repetidamente. Considerar crear reglas aprendidas o ajustes de configuración para reducir su frecuencia.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
