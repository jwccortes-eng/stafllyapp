import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useWorkerPassport } from "@/hooks/useWorkerPassport";
import { useReputation } from "@/hooks/useReputation";
import { useWorkerAvailability } from "@/hooks/useWorkerAvailability";
import { useEmployeeReputation, LEVEL_CONFIG, BADGE_DEFS } from "@/hooks/useEmployeeReputation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Star, Shield, TrendingUp, Target, MapPin, Briefcase,
  Clock, Building2, Globe, Lock, Award, Languages, Car, RefreshCw,
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
  passport_public: boolean;
}

interface PassportMetrics {
  totalShifts: number;
  totalHours: number;
  companiesWorked: number;
  avgRating: number;
}

interface WorkHistory {
  company_name: string;
  shift_title: string;
  date: string;
  hours: number;
}

/* ─── Components ─── */
function MetricCard({ icon: Icon, label, value, suffix }: {
  icon: any; label: string; value: number | string; suffix?: string;
}) {
  return (
    <Card className="border-border/40">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-primary/[0.08]">
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

function ReputationBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value.toFixed(1)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function WorkerPassport() {
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get("id");
  const { selectedCompanyId } = useCompany();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [metrics, setMetrics] = useState<PassportMetrics>({ totalShifts: 0, totalHours: 0, companiesWorked: 0, avgRating: 0 });
  const [history, setHistory] = useState<WorkHistory[]>([]);
  const [categories, setCategories] = useState<{ label: string; avg: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [consolidating, setConsolidating] = useState(false);

  // New hooks — connect to DB tables
  const wp = useWorkerProfile({ employeeId: employeeId ?? undefined });
  const passport = useWorkerPassport({ workerProfileId: wp.profile?.id });
  const reputation = useReputation({ workerProfileId: wp.profile?.id });
  const availability = useWorkerAvailability({ workerProfileId: wp.profile?.id });

  // Legacy reputation (from shift_reviews)
  const rep = useEmployeeReputation(employeeId || undefined, selectedCompanyId || undefined);

  // Load employee + legacy metrics
  useEffect(() => {
    if (!employeeId || !selectedCompanyId) return;
    (async () => {
      setLoading(true);

      const { data: emp } = await supabase
        .from("employees")
        .select("id, first_name, last_name, avatar_url, address, skills, certifications, english_level, years_experience, professional_summary, employee_role, passport_public")
        .eq("id", employeeId)
        .single();
      if (emp) setEmployee(emp as unknown as Employee);

      // Shift metrics
      const { data: assignments } = await supabase
        .from("shift_assignments")
        .select("shift_id, scheduled_shifts!inner(date, start_time, end_time, company_id, title, deleted_at)")
        .eq("employee_id", employeeId)
        .eq("status", "confirmed");

      const valid = (assignments || []).filter((a: any) => !a.scheduled_shifts?.deleted_at);
      let totalHours = 0;
      const companySet = new Set<string>();
      const historyItems: WorkHistory[] = [];

      for (const a of valid as any[]) {
        const s = a.scheduled_shifts;
        if (!s) continue;
        companySet.add(s.company_id);
        const start = s.start_time ? parseTime(s.start_time) : 0;
        const end = s.end_time ? parseTime(s.end_time) : 0;
        const hrs = end > start ? (end - start) / 60 : 0;
        totalHours += hrs;
        historyItems.push({ company_name: s.company_id, shift_title: s.title || "Shift", date: s.date, hours: Math.round(hrs * 10) / 10 });
      }

      // Time entries for additional companies
      const { data: timeEntries } = await supabase
        .from("time_entries")
        .select("company_id")
        .eq("employee_id", employeeId)
        .eq("status", "approved")
        .not("clock_out", "is", null);
      for (const te of (timeEntries || []) as any[]) {
        if (te.company_id) companySet.add(te.company_id);
      }

      // Reviews
      const { data: reviews } = await supabase
        .from("shift_reviews")
        .select("overall_rating, rating_punctuality, rating_service, rating_quality, rating_professionalism")
        .eq("reviewed_employee_id", employeeId)
        .eq("reviewer_type", "manager");

      const revArr = reviews || [];
      const avgRating = revArr.length > 0
        ? Math.round((revArr.reduce((s, r) => s + (r.overall_rating || 0), 0) / revArr.length) * 10) / 10 : 0;

      const catLabels: Record<string, string> = {
        rating_punctuality: "Puntualidad", rating_service: "Actitud de servicio",
        rating_quality: "Cumplimiento", rating_professionalism: "Comunicación",
      };
      const cats = Object.entries(catLabels).map(([k, label]) => {
        const vals = revArr.filter(r => (r as any)[k] != null).map(r => (r as any)[k] as number);
        return { label, avg: vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) * 2 : 0 };
      });
      setCategories(cats);

      // Resolve company names
      const companyIds = Array.from(companySet);
      let companyNames: Record<string, string> = {};
      if (companyIds.length > 0) {
        const { data: companies } = await supabase.from("companies").select("id, name").in("id", companyIds);
        for (const c of (companies || [])) companyNames[c.id] = c.name;
      }

      setHistory(historyItems.map(h => ({ ...h, company_name: companyNames[h.company_name] || "—" })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20));
      setMetrics({ totalShifts: valid.length, totalHours: Math.round(totalHours), companiesWorked: companyIds.length, avgRating });
      setLoading(false);
    })();
  }, [employeeId, selectedCompanyId]);

  const togglePublic = async () => {
    if (!employee) return;
    const newVal = !employee.passport_public;
    const { error } = await supabase.from("employees").update({ passport_public: newVal } as any).eq("id", employee.id);
    if (error) { toast.error("Error updating visibility"); return; }
    setEmployee({ ...employee, passport_public: newVal });
    // Also update worker_profiles if exists
    if (wp.profile) {
      await wp.updateProfile({ is_profile_public: newVal });
    }
    toast.success(newVal ? "Passport is now public" : "Passport is now private");
  };

  const handleConsolidate = async () => {
    if (!wp.profile?.id) { toast.error("No worker profile found"); return; }
    setConsolidating(true);
    const { error } = await supabase.rpc("consolidate_passport", { _worker_profile_id: wp.profile.id });
    if (error) {
      toast.error("Error consolidating passport");
    } else {
      toast.success("Passport consolidado con datos reales");
      passport.refetch();
    }
    setConsolidating(false);
  };

  if (!employeeId) {
    return <div className="p-6"><PageHeader title="Worker Passport" subtitle="Select an employee to view their passport." /></div>;
  }

  if (loading || !employee) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  }

  const levelCfg = LEVEL_CONFIG[rep.level];
  const reputationScore10 = Math.round(rep.reputationScore / 10 * 10) / 10;

  // Merge DB reputation if available
  const dbScore = reputation.score;
  const displayScore = dbScore?.overall_score != null
    ? Math.round((dbScore.overall_score / 10) * 10) / 10
    : reputationScore10;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Worker Passport" subtitle="Professional verified profile" />
        <Button variant="outline" size="sm" onClick={handleConsolidate} disabled={consolidating || !wp.profile?.id} className="gap-1.5 text-xs">
          <RefreshCw className={cn("h-3.5 w-3.5", consolidating && "animate-spin")} />
          {consolidating ? "Consolidando..." : "Consolidar"}
        </Button>
      </div>

      {/* ── Profile Header ── */}
      <Card className="border-border/40 overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent" />
        <CardContent className="p-6 -mt-12">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className="relative">
              <EmployeeAvatar avatarUrl={employee.avatar_url} firstName={employee.first_name} lastName={employee.last_name} size="lg" className="h-24 w-24 ring-4 ring-background" />
              <span className="absolute -bottom-1 -right-1 text-xl">{levelCfg.emoji}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">{employee.first_name} {employee.last_name}</h2>
                <Badge variant="secondary" className={cn("text-xs font-semibold", levelCfg.color)}>{levelCfg.label}</Badge>
                {wp.profile?.verification_status === "verified" && (
                  <Badge variant="outline" className="text-[10px] bg-earning/10 text-earning border-earning/20">
                    <Shield className="h-2.5 w-2.5 mr-0.5" /> Verificado
                  </Badge>
                )}
              </div>
              {(wp.profile?.headline || employee.employee_role) && (
                <p className="text-sm text-muted-foreground mt-0.5">{wp.profile?.headline || employee.employee_role}</p>
              )}
              {(wp.profile?.city || employee.address) && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {wp.profile?.city ? `${wp.profile.city}${wp.profile.state ? `, ${wp.profile.state}` : ""}` : employee.address}
                </p>
              )}

              {/* Skills from worker_profile or employee */}
              {(wp.skills.length > 0 || (employee.skills && employee.skills.length > 0)) && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {wp.skills.length > 0
                    ? wp.skills.map((s: any) => (
                        <Badge key={s.id} variant="outline" className="text-[10px] px-2 py-0.5 font-medium">{s.worker_skills?.name ?? "Skill"}</Badge>
                      ))
                    : employee.skills?.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] px-2 py-0.5 font-medium">{s}</Badge>
                      ))
                  }
                </div>
              )}

              {/* Languages from worker_profile */}
              {wp.languages.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {wp.languages.map((l: any) => (
                    <span key={l.id} className="text-xs text-muted-foreground flex items-center gap-1">
                      <Languages className="h-3 w-3" /> {l.language} ({l.proficiency})
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                {(wp.profile?.years_of_experience ?? employee.years_experience) != null && (
                  <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {wp.profile?.years_of_experience ?? employee.years_experience} yrs experience</span>
                )}
                {(wp.profile?.english_level || employee.english_level) && (
                  <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> English: {wp.profile?.english_level || employee.english_level}</span>
                )}
                {availability.travelPrefs?.has_own_transport && (
                  <span className="flex items-center gap-1"><Car className="h-3 w-3" /> Own transport</span>
                )}
              </div>
            </div>

            {/* Public toggle */}
            <div className="flex items-center gap-2 mt-2 sm:mt-0">
              {employee.passport_public ? <Globe className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
              <Switch checked={employee.passport_public} onCheckedChange={togglePublic} />
              <span className="text-xs text-muted-foreground">{employee.passport_public ? "Public" : "Private"}</span>
            </div>
          </div>

          {(wp.profile?.bio || employee.professional_summary) && (
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed border-t border-border/40 pt-4">
              {wp.profile?.bio || employee.professional_summary}
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

      {/* ── DB Passport Metrics ── */}
      {passport.metrics.length > 0 && (
        <Card className="border-border/40">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Award className="h-5 w-5 text-primary" /> Verified Metrics</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {passport.metrics.map((m: any) => (
                <div key={m.id}>
                  <p className="text-[11px] text-muted-foreground">{m.label}</p>
                  <p className="text-lg font-bold">{m.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Reputation Score ── */}
      <Card className="border-border/40">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Reputation Score</h3>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold">{displayScore.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">/10</span>
            </div>
          </div>

          <div className="space-y-4">
            {categories.map((cat, i) => (
              <ReputationBar key={i} label={cat.label} value={Math.round(cat.avg * 10) / 10} />
            ))}
          </div>

          {/* Badges — merge DB + legacy */}
          {(reputation.badges.length > 0 || rep.badges.length > 0) && (
            <div className="mt-5 pt-4 border-t border-border/40">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Award className="h-3.5 w-3.5" /> Badges earned
              </p>
              <div className="flex flex-wrap gap-2">
                {reputation.badges.map((b: any) => (
                  <Badge key={b.id} variant="secondary" className="text-xs gap-1">
                    {b.rep_badges?.emoji ?? "🏅"} {b.rep_badges?.label ?? b.badge_id}
                  </Badge>
                ))}
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

          {/* DB passport work history first */}
          {passport.workHistory.length > 0 && (
            <div className="divide-y divide-border/40 mb-4">
              {passport.workHistory.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between py-3 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.role || item.job_title || "Role"}</p>
                    <p className="text-xs text-muted-foreground">{item.company_name || "—"}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    {item.total_hours && <p className="text-sm font-medium">{item.total_hours}h</p>}
                    <p className="text-xs text-muted-foreground">{item.start_date} → {item.end_date || "Present"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Legacy shift history */}
          {history.length === 0 && passport.workHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No work history yet.</p>
          ) : history.length > 0 && (
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

      {/* ── Service Zones ── */}
      {availability.serviceZones.length > 0 && (
        <Card className="border-border/40">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Service zones</h3>
            <div className="space-y-2">
              {availability.serviceZones.map((z: any) => (
                <div key={z.id} className="flex items-center justify-between text-sm">
                  <span>{z.label || z.city || z.state || "Zone"}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {z.zone_type}{z.radius_km ? ` · ${z.radius_km}km` : ""}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
