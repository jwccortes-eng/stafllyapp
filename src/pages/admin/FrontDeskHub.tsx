/**
 * Front Desk Hub Gold (`/app/front-desk`) — People OS layer.
 *
 * Purpose:
 *   Promote the previous "Front Desk Reports" page into a real operational hub:
 *     - Hero with launch CTA to `/front-desk` public tablet flow
 *     - KPIs (visits, ratings, follow-ups, pending detected)
 *     - Tabs: Today queue · Pending follow-ups · Recent visits
 *     - Per-row link into `UnifiedPersonProfile`
 *
 * Reuses:
 *   - office_visits + getVisitTypeMeta from `useFrontDesk`
 *   - existing public `/front-desk` tablet flow (no changes)
 *
 * Zero schema changes.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { getVisitTypeMeta, type VisitType } from "@/hooks/useFrontDesk";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ContactRound, ExternalLink, Loader2, Users, Star, AlertCircle,
  Clock, TrendingUp, Inbox, ChevronRight,
} from "lucide-react";

interface VisitRow {
  id: string;
  employee_id: string;
  visit_type: VisitType;
  visit_detail: string | null;
  status: string;
  rating: string | null;
  rating_score: number | null;
  rating_comment: string | null;
  pending_count: number;
  duration_seconds: number | null;
  checked_in_at: string;
  checked_out_at: string | null;
  attendant_name: string | null;
  case_code: string | null;
  intake_reason: string | null;
  final_resolution: string | null;
  employees: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    phone_number: string;
  } | null;
}

const RANGES = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
];

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  in_progress: { label: "In progress", tone: "border-blue-300 bg-blue-50 text-blue-800" },
  resolved: { label: "Resolved", tone: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  pending_followup: { label: "Pending follow-up", tone: "border-amber-300 bg-amber-50 text-amber-800" },
  requires_admin_review: { label: "Admin review", tone: "border-rose-300 bg-rose-50 text-rose-800" },
  cancelled: { label: "Cancelled", tone: "border-neutral-300 bg-neutral-50 text-neutral-700" },
};

const RATING_META: Record<string, { emoji: string; tone: string }> = {
  excellent: { emoji: "🤩", tone: "bg-emerald-50 text-emerald-700" },
  good: { emoji: "🙂", tone: "bg-blue-50 text-blue-700" },
  regular: { emoji: "😐", tone: "bg-amber-50 text-amber-700" },
  bad: { emoji: "😞", tone: "bg-rose-50 text-rose-700" },
};

export default function FrontDeskHub() {
  const { selectedCompanyId } = useCompany();
  const [range, setRange] = useState<string>("7d");
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<VisitRow[]>([]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const days = RANGES.find((r) => r.key === range)?.days ?? 7;
    const since = days === 0
      ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      : subDays(new Date(), days).toISOString();

    (supabase as any)
      .from("office_visits")
      .select(`
        id, employee_id, visit_type, visit_detail, status,
        rating, rating_score, rating_comment, pending_count,
        duration_seconds, checked_in_at, checked_out_at, attendant_name,
        case_code, intake_reason, final_resolution,
        employees:employee_id ( first_name, last_name, avatar_url, phone_number )
      `)
      .eq("company_id", selectedCompanyId)
      .gte("checked_in_at", since)
      .order("checked_in_at", { ascending: false })
      .then(({ data, error }: any) => {
        if (error) {
          console.error("[front-desk-hub]", error);
          setVisits([]);
        } else {
          setVisits((data ?? []) as VisitRow[]);
        }
        setLoading(false);
      });
  }, [selectedCompanyId, range]);

  const stats = useMemo(() => {
    const total = visits.length;
    const uniqueEmps = new Set(visits.map((v) => v.employee_id)).size;
    const rated = visits.filter((v) => v.rating_score != null);
    const avgRating = rated.length
      ? Math.round((rated.reduce((acc, v) => acc + (v.rating_score ?? 0), 0) / rated.length) * 10) / 10
      : null;
    const lowRatings = visits.filter((v) => v.rating === "regular" || v.rating === "bad").length;
    const followups = visits.filter((v) => v.status === "pending_followup").length;
    const inProgress = visits.filter((v) => v.status === "in_progress").length;
    const totalPending = visits.reduce((acc, v) => acc + (v.pending_count ?? 0), 0);
    return { total, uniqueEmps, avgRating, lowRatings, followups, inProgress, totalPending };
  }, [visits]);

  const queueVisits = useMemo(
    () => visits.filter((v) => v.status === "in_progress" || v.status === "requires_admin_review"),
    [visits],
  );
  const followupVisits = useMemo(
    () => visits.filter((v) => v.status === "pending_followup"),
    [visits],
  );

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ─── HERO ─── */}
      <Card className="overflow-hidden border-border/50">
        <div className="bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent">
          <CardContent className="p-5">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="rounded-2xl bg-primary/10 p-3 ring-1 ring-primary/20">
                <ContactRound className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold font-heading tracking-tight">Front Desk</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Office visits, intake, ratings and per-person traceability.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Tabs value={range} onValueChange={setRange}>
                  <TabsList>
                    {RANGES.map((r) => (
                      <TabsTrigger key={r.key} value={r.key}>{r.label}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Button variant="outline" size="sm" asChild>
                  <a href="/front-desk" target="_blank" rel="noopener">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open Front Desk
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi icon={Users} label="Visits" value={stats.total} />
        <Kpi icon={Users} label="Unique workers" value={stats.uniqueEmps} />
        <Kpi
          icon={Star}
          label="Satisfaction"
          value={stats.avgRating != null ? `${stats.avgRating}/5` : "—"}
          tone={stats.avgRating != null && stats.avgRating < 3 ? "warn" : "default"}
        />
        <Kpi icon={Inbox} label="In progress" value={stats.inProgress} />
        <Kpi icon={Clock} label="Follow-ups" value={stats.followups} tone={stats.followups > 0 ? "warn" : "default"} />
        <Kpi icon={TrendingUp} label="Items pending" value={stats.totalPending} />
      </div>

      {/* ─── TABS ─── */}
      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Queue ({queueVisits.length})</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups ({followupVisits.length})</TabsTrigger>
          <TabsTrigger value="all">All visits ({visits.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          <VisitsList visits={queueVisits} loading={loading} emptyText="Queue is clear — no active visits." />
        </TabsContent>
        <TabsContent value="followups" className="mt-4">
          <VisitsList visits={followupVisits} loading={loading} emptyText="No pending follow-ups." />
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <VisitsList visits={visits} loading={loading} emptyText="No visits in this period." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VisitsList({
  visits, loading, emptyText,
}: { visits: VisitRow[]; loading: boolean; emptyText: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Visits</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : visits.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          <ScrollArea className="h-[520px]">
            <ul className="divide-y divide-border/40">
              {visits.map((v) => {
                const meta = getVisitTypeMeta(v.visit_type);
                const status = STATUS_LABELS[v.status] ?? STATUS_LABELS.resolved;
                const ratingMeta = v.rating ? RATING_META[v.rating] : null;
                const initials = v.employees
                  ? `${v.employees.first_name?.[0] ?? ""}${v.employees.last_name?.[0] ?? ""}`.toUpperCase()
                  : "—";
                const minutes = v.duration_seconds ? Math.round(v.duration_seconds / 60) : null;
                return (
                  <li key={v.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9">
                        {v.employees?.avatar_url ? <AvatarImage src={v.employees.avatar_url} /> : null}
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/app/employees/${v.employee_id}`}
                            className="font-semibold text-sm truncate hover:underline"
                          >
                            {v.employees ? `${v.employees.first_name} ${v.employees.last_name}` : "—"}
                          </Link>
                          {v.case_code && (
                            <Badge variant="outline" className="text-[9px] font-mono">{v.case_code}</Badge>
                          )}
                          <Badge variant="outline" className={cn("text-[10px] font-medium border", status.tone)}>
                            {status.label}
                          </Badge>
                          {ratingMeta && (
                            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", ratingMeta.tone)}>
                              {ratingMeta.emoji} {v.rating_score}/5
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span>{meta.icon} {meta.labelEs}</span>
                          <span>·</span>
                          <span>{format(new Date(v.checked_in_at), "d MMM HH:mm", { locale: es })}</span>
                          {minutes != null && <><span>·</span><span>{minutes} min</span></>}
                          {v.pending_count > 0 && <><span>·</span><span className="text-amber-700">{v.pending_count} pending</span></>}
                          {v.attendant_name && <><span>·</span><span>by {v.attendant_name}</span></>}
                        </div>
                        {v.visit_detail && (
                          <p className="text-xs text-muted-foreground mt-1 italic line-clamp-1">"{v.visit_detail}"</p>
                        )}
                      </div>
                      <Link
                        to={`/app/employees/${v.employee_id}`}
                        className="text-muted-foreground hover:text-primary transition-colors self-center"
                        aria-label="Open worker profile"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({
  icon: Icon, label, value, tone = "default",
}: { icon: any; label: string; value: number | string; tone?: "default" | "warn" }) {
  return (
    <Card className={cn(tone === "warn" && "border-amber-300 bg-amber-50/30")}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums leading-none">{value}</div>
      </CardContent>
    </Card>
  );
}
