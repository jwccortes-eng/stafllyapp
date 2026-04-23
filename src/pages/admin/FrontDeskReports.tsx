/**
 * Stafly Front Desk — Admin reports & dashboard for office visits.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Users, Star, Clock, AlertCircle, TrendingUp, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Link } from "react-router-dom";
import { getVisitTypeMeta, type VisitType } from "@/hooks/useFrontDesk";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

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
  employees: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    phone_number: string;
  } | null;
}

const RANGES = [
  { key: "today", label: "Hoy", days: 0 },
  { key: "7d", label: "Últimos 7 días", days: 7 },
  { key: "30d", label: "Últimos 30 días", days: 30 },
];

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  in_progress: { label: "En curso", tone: "bg-blue-100 text-blue-800 border-blue-200" },
  resolved: { label: "Resuelta", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  pending_followup: { label: "Pendiente seguimiento", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  requires_admin_review: { label: "Revisión admin", tone: "bg-rose-100 text-rose-800 border-rose-200" },
  cancelled: { label: "Cancelada", tone: "bg-neutral-100 text-neutral-700 border-neutral-200" },
};

const RATING_META: Record<string, { emoji: string; tone: string }> = {
  excellent: { emoji: "🤩", tone: "bg-emerald-50 text-emerald-700" },
  good: { emoji: "🙂", tone: "bg-blue-50 text-blue-700" },
  regular: { emoji: "😐", tone: "bg-amber-50 text-amber-700" },
  bad: { emoji: "😞", tone: "bg-rose-50 text-rose-700" },
};

export default function FrontDeskReports() {
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

    supabase
      .from("office_visits")
      .select(`
        id, employee_id, visit_type, visit_detail, status,
        rating, rating_score, rating_comment, pending_count,
        duration_seconds, checked_in_at, checked_out_at, attendant_name,
        employees:employee_id ( first_name, last_name, avatar_url, phone_number )
      `)
      .eq("company_id", selectedCompanyId)
      .gte("checked_in_at", since)
      .order("checked_in_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("[front-desk-reports]", error);
          setVisits([]);
        } else {
          setVisits((data ?? []) as any);
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
    const totalPending = visits.reduce((acc, v) => acc + (v.pending_count ?? 0), 0);

    // Top visit types
    const typeCount: Record<string, number> = {};
    visits.forEach((v) => {
      typeCount[v.visit_type] = (typeCount[v.visit_type] ?? 0) + 1;
    });
    const topTypes = Object.entries(typeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Repeat visitors
    const empCount: Record<string, { count: number; name: string }> = {};
    visits.forEach((v) => {
      const name = v.employees ? `${v.employees.first_name} ${v.employees.last_name}` : "—";
      if (!empCount[v.employee_id]) empCount[v.employee_id] = { count: 0, name };
      empCount[v.employee_id].count++;
    });
    const repeatVisitors = Object.values(empCount)
      .filter((e) => e.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { total, uniqueEmps, avgRating, lowRatings, followups, totalPending, topTypes, repeatVisitors };
  }, [visits]);

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Front Desk · Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Visitas presenciales en oficina, satisfacción y pendientes detectados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/front-desk" target="_blank">
              <ExternalLink className="h-4 w-4 mr-2" /> Abrir Front Desk
            </Link>
          </Button>
          <Tabs value={range} onValueChange={setRange}>
            <TabsList>
              {RANGES.map((r) => (
                <TabsTrigger key={r.key} value={r.key}>{r.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard icon={Users} label="Visitas" value={stats.total} />
        <KpiCard icon={Users} label="Empleados únicos" value={stats.uniqueEmps} />
        <KpiCard icon={Star} label="Satisfacción" value={stats.avgRating != null ? `${stats.avgRating}/5` : "—"} tone={stats.avgRating != null && stats.avgRating < 3 ? "warn" : "default"} />
        <KpiCard icon={AlertCircle} label="Ratings bajos" value={stats.lowRatings} tone={stats.lowRatings > 0 ? "warn" : "default"} />
        <KpiCard icon={Clock} label="Seguimientos" value={stats.followups} tone={stats.followups > 0 ? "warn" : "default"} />
        <KpiCard icon={TrendingUp} label="Pendientes detectados" value={stats.totalPending} />
      </div>

      {/* Top types & repeat */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top motivos de visita</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos en el periodo.</p>
            ) : (
              <ul className="space-y-2">
                {stats.topTypes.map(([key, count]) => {
                  const meta = getVisitTypeMeta(key as VisitType);
                  const pct = Math.round((count / stats.total) * 100);
                  return (
                    <li key={key} className="flex items-center gap-3">
                      <span className="text-2xl">{meta.icon}</span>
                      <span className="flex-1 text-sm font-medium">{meta.labelEs}</span>
                      <span className="text-xs text-muted-foreground">{count} · {pct}%</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Visitantes recurrentes</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.repeatVisitors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nadie con visitas múltiples en el periodo.</p>
            ) : (
              <ul className="space-y-2">
                {stats.repeatVisitors.map((v, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{v.name}</span>
                    <Badge variant="secondary">{v.count} visitas</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Visits list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Historial de visitas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : visits.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No hay visitas en el periodo seleccionado.
            </div>
          ) : (
            <ScrollArea className="h-[480px]">
              <ul className="divide-y">
                {visits.map((v) => {
                  const meta = getVisitTypeMeta(v.visit_type);
                  const status = STATUS_LABELS[v.status] ?? STATUS_LABELS.resolved;
                  const ratingMeta = v.rating ? RATING_META[v.rating] : null;
                  const initials = v.employees
                    ? `${v.employees.first_name?.[0] ?? ""}${v.employees.last_name?.[0] ?? ""}`.toUpperCase()
                    : "—";
                  const minutes = v.duration_seconds ? Math.round(v.duration_seconds / 60) : null;

                  return (
                    <li key={v.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          {v.employees?.avatar_url ? <AvatarImage src={v.employees.avatar_url} /> : null}
                          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">
                              {v.employees ? `${v.employees.first_name} ${v.employees.last_name}` : "—"}
                            </span>
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
                            {v.pending_count > 0 && <><span>·</span><span className="text-amber-700">{v.pending_count} pendientes</span></>}
                          </div>
                          {v.visit_detail && (
                            <p className="text-xs text-muted-foreground mt-1 italic">"{v.visit_detail}"</p>
                          )}
                          {v.rating_comment && (
                            <p className="text-xs text-muted-foreground mt-1">💬 {v.rating_comment}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone = "default" }: {
  icon: any; label: string; value: number | string; tone?: "default" | "warn";
}) {
  return (
    <Card className={cn(tone === "warn" && "border-amber-300 bg-amber-50/30")}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide font-medium">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
