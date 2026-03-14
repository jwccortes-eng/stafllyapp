import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useEmployeeReputation, LEVEL_CONFIG, BADGE_DEFS } from "@/hooks/useEmployeeReputation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import {
  Star, Shield, TrendingUp, Target, MapPin, Briefcase,
  Clock, Building2, Globe, Lock, Award, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  address: string | null;
  skills: string[] | null;
  certifications: string[] | null;
  english_level: string | null;
  years_experience: number | null;
  professional_summary: string | null;
  employee_role: string | null;
  service_category_ids: string[] | null;
  passport_public: boolean;
}

interface WorkHistory {
  company_name: string;
  shift_title: string;
  date: string;
  hours: number;
}

interface PassportMetrics {
  totalShifts: number;
  totalHours: number;
  companiesWorked: number;
  avgRating: number;
}

/* ─── Score Card ─── */
function MetricCard({ icon: Icon, label, value, suffix, color }: {
  icon: any; label: string; value: number | string; suffix?: string; color?: string;
}) {
  return (
    <Card className="border-border/40">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center bg-primary/8", color)}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
          <p className="text-xl font-bold tracking-tight">
            {value}{suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Reputation Bar ─── */
function ReputationBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value.toFixed(1)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function WorkerPassport() {
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get("id");
  const { selectedCompanyId } = useCompany();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [metrics, setMetrics] = useState<PassportMetrics>({ totalShifts: 0, totalHours: 0, companiesWorked: 0, avgRating: 0 });
  const [history, setHistory] = useState<WorkHistory[]>([]);
  const [categories, setCategories] = useState<{ label: string; avg: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const rep = useEmployeeReputation(employeeId || undefined, selectedCompanyId || undefined);

  // Load employee
  useEffect(() => {
    if (!employeeId || !selectedCompanyId) return;
    (async () => {
      setLoading(true);

      // Employee data
      const { data: emp } = await supabase
        .from("employees")
        .select("id, first_name, last_name, avatar_url, address, skills, certifications, english_level, years_experience, professional_summary, employee_role, service_category_ids, passport_public")
        .eq("id", employeeId)
        .single();
      if (emp) setEmployee(emp as unknown as Employee);

      // Metrics: shifts & hours from shift_assignments + scheduled_shifts
      const { data: assignments } = await supabase
        .from("shift_assignments")
        .select("shift_id, scheduled_shifts!inner(date, start_time, end_time, company_id, client_id, title, deleted_at)")
        .eq("employee_id", employeeId)
        .eq("status", "confirmed");

      const validAssignments = (assignments || []).filter((a: any) => !a.scheduled_shifts?.deleted_at);
      const totalShifts = validAssignments.length;

      let totalHours = 0;
      const companySet = new Set<string>();
      const historyItems: WorkHistory[] = [];

      for (const a of validAssignments as any[]) {
        const s = a.scheduled_shifts;
        if (!s) continue;
        companySet.add(s.company_id);
        const start = s.start_time ? parseTime(s.start_time) : 0;
        const end = s.end_time ? parseTime(s.end_time) : 0;
        const hrs = end > start ? (end - start) / 60 : 0;
        totalHours += hrs;
        historyItems.push({
          company_name: s.company_id, // will resolve below
          shift_title: s.title || "Shift",
          date: s.date,
          hours: Math.round(hrs * 10) / 10,
        });
      }

      // Also count from time_entries
      const { data: timeEntries } = await supabase
        .from("time_entries")
        .select("clock_in, clock_out, company_id")
        .eq("employee_id", employeeId)
        .eq("status", "approved")
        .not("clock_out", "is", null);

      for (const te of (timeEntries || []) as any[]) {
        if (te.company_id) companySet.add(te.company_id);
      }

      // Reviews avg
      const { data: reviews } = await supabase
        .from("shift_reviews")
        .select("overall_rating, rating_punctuality, rating_service, rating_quality, rating_professionalism")
        .eq("reviewed_employee_id", employeeId)
        .eq("reviewer_type", "manager");

      const revArr = reviews || [];
      const avgRating = revArr.length > 0
        ? Math.round((revArr.reduce((s, r) => s + (r.overall_rating || 0), 0) / revArr.length) * 10) / 10
        : 0;

      // Reputation categories (scale to 10)
      const catKeys = ["rating_punctuality", "rating_service", "rating_quality", "rating_professionalism"] as const;
      const catLabels: Record<string, string> = {
        rating_punctuality: "Puntualidad",
        rating_service: "Actitud de servicio",
        rating_quality: "Cumplimiento",
        rating_professionalism: "Comunicación",
      };
      const cats = catKeys.map(k => {
        const vals = revArr.filter(r => (r as any)[k] != null).map(r => (r as any)[k] as number);
        return { label: catLabels[k], avg: vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) * 2 : 0 };
      });
      setCategories(cats);

      // Resolve company names
      const companyIds = Array.from(companySet);
      let companyNames: Record<string, string> = {};
      if (companyIds.length > 0) {
        const { data: companies } = await supabase
          .from("companies")
          .select("id, name")
          .in("id", companyIds);
        for (const c of (companies || [])) companyNames[c.id] = c.name;
      }

      const resolvedHistory = historyItems
        .map(h => ({ ...h, company_name: companyNames[h.company_name] || "—" }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 20);

      setMetrics({ totalShifts, totalHours: Math.round(totalHours), companiesWorked: companyIds.length, avgRating });
      setHistory(resolvedHistory);
      setLoading(false);
    })();
  }, [employeeId, selectedCompanyId]);

  const togglePublic = async () => {
    if (!employee) return;
    const newVal = !employee.passport_public;
    const { error } = await supabase
      .from("employees")
      .update({ passport_public: newVal } as any)
      .eq("id", employee.id);
    if (error) { toast.error("Error updating visibility"); return; }
    setEmployee({ ...employee, passport_public: newVal });
    toast.success(newVal ? "Passport is now public" : "Passport is now private");
  };

  if (!employeeId) {
    return (
      <div className="p-6">
        <PageHeader title="Worker Passport" subtitle="Select an employee to view their passport." />
      </div>
    );
  }

  if (loading || !employee) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const levelCfg = LEVEL_CONFIG[rep.level];
  const reputationScore10 = Math.round(rep.reputationScore / 10 * 10) / 10;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader title="Worker Passport" subtitle="Professional verified profile" />

      {/* ── Profile Header ── */}
      <Card className="border-border/40 overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent" />
        <CardContent className="p-6 -mt-12">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className="relative">
              <EmployeeAvatar
                avatarUrl={employee.avatar_url}
                firstName={employee.first_name}
                lastName={employee.last_name}
                size="lg"
                className="h-24 w-24 ring-4 ring-background"
              />
              <span className="absolute -bottom-1 -right-1 text-xl">{levelCfg.emoji}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">{employee.first_name} {employee.last_name}</h2>
                <Badge variant="secondary" className={cn("text-xs font-semibold", levelCfg.color)}>
                  {levelCfg.label}
                </Badge>
              </div>
              {employee.employee_role && (
                <p className="text-sm text-muted-foreground mt-0.5">{employee.employee_role}</p>
              )}
              {employee.address && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {employee.address}
                </p>
              )}

              {/* Skills */}
              {employee.skills && employee.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {employee.skills.map((s, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] px-2 py-0.5 font-medium">{s}</Badge>
                  ))}
                </div>
              )}

              {/* Quick info */}
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                {employee.years_experience != null && (
                  <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {employee.years_experience} yrs experience</span>
                )}
                {employee.english_level && (
                  <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> English: {employee.english_level}</span>
                )}
              </div>
            </div>

            {/* Public toggle */}
            <div className="flex items-center gap-2 mt-2 sm:mt-0">
              {employee.passport_public ? (
                <Globe className="h-4 w-4 text-primary" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
              <Switch checked={employee.passport_public} onCheckedChange={togglePublic} />
              <span className="text-xs text-muted-foreground">{employee.passport_public ? "Public" : "Private"}</span>
            </div>
          </div>

          {employee.professional_summary && (
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed border-t border-border/40 pt-4">
              {employee.professional_summary}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Metrics ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={Target} label="Total jobs" value={metrics.totalShifts} />
        <MetricCard icon={Clock} label="Total hours" value={metrics.totalHours} suffix="h" />
        <MetricCard icon={Building2} label="Companies" value={metrics.companiesWorked} />
        <MetricCard icon={Star} label="Avg rating" value={metrics.avgRating} suffix="/5" />
      </div>

      {/* ── Reputation Score ── */}
      <Card className="border-border/40">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Reputation Score</h3>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold">{reputationScore10.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">/10</span>
            </div>
          </div>

          <div className="space-y-4">
            {categories.map((cat, i) => (
              <ReputationBar key={i} label={cat.label} value={Math.round(cat.avg * 10) / 10} />
            ))}
          </div>

          {/* Badges */}
          {rep.badges.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border/40">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Award className="h-3.5 w-3.5" /> Badges earned
              </p>
              <div className="flex flex-wrap gap-2">
                {rep.badges.map(b => (
                  <Badge key={b.badge_key} variant="secondary" className="text-xs gap-1">
                    {b.badge_emoji} {b.badge_label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Work History ── */}
      <Card className="border-border/40">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Work history</h3>
          </div>

          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No work history yet.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {history.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.shift_title}</p>
                    <p className="text-xs text-muted-foreground">{item.company_name}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-medium">{item.hours}h</p>
                    <p className="text-xs text-muted-foreground">{item.date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Helper ── */
function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
