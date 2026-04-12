import { useState, useEffect, useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Star, AlertTriangle, TrendingUp, TrendingDown, Minus, CheckCircle2, Clock, MessageSquare, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { enUS } from "date-fns/locale";
import { ReviewFormDialog } from "@/components/reviews/ReviewFormDialog";
import { toast } from "sonner";

interface ReviewSubmission {
  id: string;
  overall_rating: number;
  comment: string | null;
  review_form_type: string;
  evaluated_entity_type: string;
  evaluated_entity_id: string;
  evaluated_role: string | null;
  evaluator_user_id: string;
  low_rating_reasons: string[] | null;
  submitted_at: string;
}

interface ReviewFlag {
  id: string;
  flag_type: string;
  severity: string;
  status: string;
  created_at: string;
  submission_id: string;
  note: string | null;
}

interface EntityScore {
  entity_type: string;
  entity_id: string;
  score_type: string;
  score_value: number;
  score_count: number;
  weighted_score: number | null;
  trend: string | null;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  captain_to_employee: "Lead → Worker",
  employee_to_captain: "Worker → Lead",
  employee_to_shift: "Shift Experience",
  admin_to_employee: "Admin → Worker",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-800/30",
  medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800/30",
  low: "bg-muted text-muted-foreground border-border",
};

const TrendIcon = ({ trend }: { trend: string | null }) => {
  if (trend === "improving") return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (trend === "declining") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground/40" />;
};

export default function QualityDashboard() {
  const { selectedCompanyId } = useCompany();
  const [submissions, setSubmissions] = useState<ReviewSubmission[]>([]);
  const [flags, setFlags] = useState<ReviewFlag[]>([]);
  const [scores, setScores] = useState<EntityScore[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    Promise.all([
      supabase.from("review_submissions").select("*").eq("company_id", selectedCompanyId).order("submitted_at", { ascending: false }).limit(100),
      supabase.from("review_flags").select("*").eq("company_id", selectedCompanyId).order("created_at", { ascending: false }).limit(50),
      supabase.from("review_scores").select("*").eq("company_id", selectedCompanyId).eq("score_type", "overall").order("weighted_score", { ascending: true }),
      supabase.from("review_requests").select("id", { count: "exact" }).eq("company_id", selectedCompanyId).eq("status", "pending").gt("deadline_at", new Date().toISOString()),
    ]).then(([subRes, flagRes, scoreRes, pendRes]) => {
      setSubmissions((subRes.data as any[]) ?? []);
      setFlags((flagRes.data as any[]) ?? []);
      setScores((scoreRes.data as any[]) ?? []);
      setPendingCount(pendRes.count ?? 0);
      setLoading(false);

      const entityIds = [...new Set([
        ...((subRes.data ?? []) as any[]).map((s: any) => s.evaluated_entity_id),
        ...((scoreRes.data ?? []) as any[]).map((s: any) => s.entity_id),
      ])];
      if (entityIds.length > 0) {
        supabase.from("employees").select("id, first_name, last_name").in("id", entityIds.slice(0, 100))
          .then(({ data }) => {
            const map: Record<string, string> = {};
            (data ?? []).forEach((e: any) => { map[e.id] = `${e.first_name} ${e.last_name}`; });
            setEmployeeNames(map);
          });
      }
    });
  }, [selectedCompanyId]);

  const stats = useMemo(() => {
    const total = submissions.length;
    const avgRating = total > 0 ? submissions.reduce((a, s) => a + s.overall_rating, 0) / total : 0;
    const lowCount = submissions.filter(s => s.overall_rating <= 2).length;
    const last7 = submissions.filter(s => new Date(s.submitted_at) > subDays(new Date(), 7));
    const openFlags = flags.filter(f => f.status === "open").length;
    return { total, avgRating: avgRating.toFixed(1), lowCount, last7Days: last7.length, openFlags };
  }, [submissions, flags]);

  const handleResolveFlag = async (flagId: string) => {
    const { error } = await supabase
      .from("review_flags")
      .update({ status: "resolved", resolved_at: new Date().toISOString() } as any)
      .eq("id", flagId);
    if (!error) {
      setFlags(prev => prev.map(f => f.id === flagId ? { ...f, status: "resolved" } : f));
      toast.success("Alert resolved");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reviews" subtitle="Bidirectional review engine with smart sampling" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" subtitle="Bidirectional review engine with smart sampling" />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Total Reviews" value={stats.total} icon={<Star className="h-4 w-4" />} />
        <KpiCard label="Average Rating" value={stats.avgRating} icon={<Star className="h-4 w-4" />} />
        <KpiCard label="Last 7 Days" value={stats.last7Days} icon={<Clock className="h-4 w-4" />} />
        <KpiCard label="Low Ratings" value={stats.lowCount} icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard label="Open Alerts" value={stats.openFlags} icon={<Flag className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="flags" className="space-y-4">
        <TabsList>
          <TabsTrigger value="flags" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Alerts
            {stats.openFlags > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">{stats.openFlags}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="recent" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Recent
          </TabsTrigger>
          <TabsTrigger value="scores" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Rankings
          </TabsTrigger>
        </TabsList>

        {/* Flags Tab */}
        <TabsContent value="flags">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Review Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {flags.filter(f => f.status === "open").length === 0 ? (
                <p className="text-sm text-muted-foreground/50 text-center py-8">No open alerts 🎉</p>
              ) : (
                flags.filter(f => f.status === "open").map(flag => {
                  const sub = submissions.find(s => s.id === flag.submission_id);
                  const name = sub ? employeeNames[sub.evaluated_entity_id] : "";
                  return (
                    <div key={flag.id} className={cn("flex items-center gap-3 rounded-lg border p-3", SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.low)}>
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">{flag.flag_type.replace(/_/g, " ")} — {name || "Entity"}</p>
                        {sub && (
                          <p className="text-[11px] opacity-70 mt-0.5">
                            Rating: {sub.overall_rating}/5 · {FORM_TYPE_LABELS[sub.review_form_type] || sub.review_form_type}
                            {sub.comment && ` · "${sub.comment.slice(0, 60)}${sub.comment.length > 60 ? "..." : ""}"`}
                          </p>
                        )}
                        <p className="text-[10px] opacity-50 mt-0.5">{format(new Date(flag.created_at), "dd MMM yyyy HH:mm", { locale: enUS })}</p>
                      </div>
                      <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => handleResolveFlag(flag.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Resolve
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Reviews Tab */}
        <TabsContent value="recent">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent Reviews</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {submissions.length === 0 ? (
                <p className="text-sm text-muted-foreground/50 text-center py-8">No reviews yet</p>
              ) : (
                submissions.slice(0, 20).map(sub => (
                  <div key={sub.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-3 hover:bg-accent/20 transition-colors">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} className={cn("h-3.5 w-3.5", s <= sub.overall_rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/15")} />
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {employeeNames[sub.evaluated_entity_id] || "—"}{" "}
                        <span className="text-muted-foreground/50 font-normal">· {FORM_TYPE_LABELS[sub.review_form_type] || sub.review_form_type}</span>
                      </p>
                      {sub.comment && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">"{sub.comment}"</p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground/40 shrink-0">
                      {format(new Date(sub.submitted_at), "dd MMM", { locale: enUS })}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rankings Tab */}
        <TabsContent value="scores">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Score Rankings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {scores.length === 0 ? (
                <p className="text-sm text-muted-foreground/50 text-center py-8">Not enough data yet</p>
              ) : (
                scores.map((score, i) => (
                  <div key={score.entity_id + score.score_type} className="flex items-center gap-3 rounded-lg border border-border/40 p-3">
                    <span className="text-xs font-bold text-muted-foreground w-6 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{employeeNames[score.entity_id] || score.entity_id.slice(0, 8)}</p>
                      <p className="text-[10px] text-muted-foreground/50">{score.score_count} reviews</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendIcon trend={score.trend} />
                      <div className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        <span className="text-sm font-bold">{(score.weighted_score ?? score.score_value).toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
