/**
 * UnifiedPersonProfile (`/app/people/:id` and alias `/app/employees/:id`)
 *
 * Master page for a single person in the People OS layer.
 *
 * Architecture decision (Sub-entrega 2):
 *   - Canonical place to view a person's full operational identity.
 *   - REUSES the existing `EmployeeProfileTabs` (583 LoC of pay/compensation/
 *     advances/reviews/access logic) — no rewrite, no risk to business logic.
 *   - WRAPS that with: a premium Hero, a Snapshot strip (portal/docs/readiness/
 *     attendance/payroll/last activity), and an Actions bar.
 *   - Worker Hub Sheet still works for quick edits, but row clicks now route here.
 *
 * Scope: zero schema changes, zero contract changes, zero payroll math touched.
 */
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useEmployeeReadiness } from "@/hooks/useEmployeeReadiness";
import { useEmployeeInvitations } from "@/hooks/useEmployeeInvitations";
import { useToast } from "@/hooks/use-toast";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBlock } from "@/components/ui/error-block";
import { PremiumAvatar, type PremiumAvatarStatus } from "@/components/ui/premium-avatar";
import { PremiumStatusBadge } from "@/components/ui/premium-status-badge";
import {
  ReadinessBadge,
  deriveReadinessBand,
  type ReadinessBand,
} from "@/components/ui/readiness-badge";
import { EmployeeProfileTabs } from "@/components/employee/EmployeeProfileTabs";
import { EmployeeInviteDialog } from "@/components/employee/EmployeeInviteDialog";
import { ArchiveEmployeeDialog } from "@/components/employee/ArchiveEmployeeDialog";

import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Hash,
  Building2,
  Send,
  Pencil,
  Archive,
  UserCheck,
  Cake,
  Briefcase,
  CalendarDays,
  Wallet,
  ShieldCheck,
  ShieldOff,
  FileText,
  Activity as ActivityIcon,
  Clock,
  ExternalLink,
  ContactRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EmployeeRecord = Record<string, any>;

interface SnapshotMetric {
  key: string;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "destructive" | "muted";
}

const TONE_CLASS: Record<NonNullable<SnapshotMetric["tone"]>, string> = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

function safeDistance(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : "—";
  } catch { return "—"; }
}

export default function UnifiedPersonProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role } = useAuth();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const isPrivileged = role === "developer" || role === "owner" || role === "admin";

  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Snapshot data
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [recentShifts, setRecentShifts] = useState<any[]>([]);
  const [docsCount, setDocsCount] = useState<{ approved: number; pending: number; rejected: number }>({
    approved: 0, pending: 0, rejected: 0,
  });
  const [attendance30d, setAttendance30d] = useState<{ shifts: number; lateCount: number; noShowCount: number }>({
    shifts: 0, lateCount: 0, noShowCount: 0,
  });
  const [lastPayrollDate, setLastPayrollDate] = useState<string | null>(null);
  const [frontDeskVisits, setFrontDeskVisits] = useState<any[]>([]);

  const { invitations, refetch: refetchInvitations, logInvitation } = useEmployeeInvitations(selectedCompanyId ?? null);
  const readiness = useEmployeeReadiness(id ?? null);

  // ── Fetch core employee record ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (!data) {
        setError("Person not found in this company.");
        setLoading(false);
        return;
      }
      setEmployee(data);
      setForm(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v == null ? "" : String(v)])));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ── Snapshot data fetch (parallel, low-cost) ────────────────────────────
  // Column names match the live schema:
  //   scheduled_shifts.date, time_entries.clock_in
  // We cast supabase to `any` for the parallel fetch to dodge TS deep-instantiation
  // on the very large generated types.
  useEffect(() => {
    if (!id || !employee) return;
    let cancelled = false;
    const sb = supabase as any;
    (async () => {
      const [docsRes, activityRes, shiftsRes, payrollRes] = await Promise.all([
        sb.from("employee_documents").select("review_status").eq("employee_id", id),
        sb
          .from("activity_log")
          .select("id, action, entity_type, created_at, details")
          .eq("entity_id", id)
          .eq("entity_type", "employee")
          .order("created_at", { ascending: false })
          .limit(8),
        sb
          .from("scheduled_shifts")
          .select("id, date, start_time, end_time, status, title")
          .eq("employee_id", id)
          .order("date", { ascending: false })
          .limit(6),
        sb
          .from("time_entries")
          .select("clock_in")
          .eq("employee_id", id)
          .order("clock_in", { ascending: false })
          .limit(1),
      ]);
      if (cancelled) return;

      const docs = (docsRes.data ?? []) as any[];
      const docAgg = docs.reduce(
        (acc: { approved: number; pending: number; rejected: number }, d: any) => {
          if (d.review_status === "approved") acc.approved++;
          else if (d.review_status === "pending") acc.pending++;
          else if (d.review_status === "rejected") acc.rejected++;
          return acc;
        },
        { approved: 0, pending: 0, rejected: 0 },
      );
      setDocsCount(docAgg);

      setRecentActivity((activityRes.data ?? []) as any[]);
      const shifts = (shiftsRes.data ?? []) as any[];
      setRecentShifts(shifts);

      const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      const recent = shifts.filter((s: any) => {
        const d = s.date ? new Date(s.date).getTime() : 0;
        return d >= cutoff;
      });
      setAttendance30d({
        shifts: recent.length,
        lateCount: recent.filter((s: any) => String(s.status).toLowerCase() === "late").length,
        noShowCount: recent.filter((s: any) => String(s.status).toLowerCase() === "no_show").length,
      });

      const lastPay = (payrollRes.data ?? [])[0] as any;
      setLastPayrollDate(lastPay?.clock_in ?? null);
    })();
    return () => { cancelled = true; };
  }, [id, employee]);

  // ── Derived: readiness band ─────────────────────────────────────────────
  const portalActive = !!employee?.portal_active || !!employee?.has_portal_access || employee?.profile_status === "active";
  const hasPhoto = !!employee?.avatar_url;
  const band: ReadinessBand = readiness.loading
    ? "unknown"
    : deriveReadinessBand({
        progressPct: readiness.progressPct,
        missingDocsCount: readiness.missingDocuments.length,
        missingPersonalCount: readiness.missingPersonal.length,
        portalActive,
        hasPhoto,
      });

  const avatarStatus: PremiumAvatarStatus = useMemo(() => {
    if (!employee) return null;
    if (employee.is_active === false) return "inactive";
    if (readiness.missingDocuments.length > 0) return "missing-docs";
    if (band === "ready") return "active";
    if (band === "needs-attention") return "pending";
    return null;
  }, [employee, readiness, band]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!employee) return;
    try {
      const { error } = await (supabase as any)
        .from("employees")
        .update(form)
        .eq("id", employee.id);
      if (error) throw error;
      setEmployee((prev) => (prev ? { ...prev, ...form } : prev));
      setIsEditing(false);
      toast({ title: "Saved" });
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message, variant: "destructive" });
    }
  };

  const toggleActive = async () => {
    if (!employee) return;
    const next = !employee.is_active;
    const { error } = await (supabase as any)
      .from("employees")
      .update({ is_active: next })
      .eq("id", employee.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setEmployee((prev) => (prev ? { ...prev, is_active: next } : prev));
    toast({ title: next ? "Activated" : "Archived" });
  };

  // ── Snapshot strip metrics ──────────────────────────────────────────────
  const snapshotMetrics: SnapshotMetric[] = useMemo(() => {
    if (!employee) return [];
    const invitation = invitations[employee.id];
    return [
      {
        key: "portal",
        label: "Portal",
        icon: portalActive ? ShieldCheck : ShieldOff,
        value: portalActive ? "Active" : "Inactive",
        hint: invitation?.sent_at ? `Invited ${safeDistance(invitation.sent_at)}` : undefined,
        tone: portalActive ? "success" : "muted",
      },
      {
        key: "documents",
        label: "Documents",
        icon: FileText,
        value: readiness.missingDocuments.length === 0
          ? "Complete"
          : `${readiness.missingDocuments.length} missing`,
        hint: docsCount.approved + docsCount.pending + docsCount.rejected > 0
          ? `${docsCount.approved} approved · ${docsCount.pending} pending`
          : undefined,
        tone: readiness.missingDocuments.length === 0 ? "success" : "destructive",
      },
      {
        key: "readiness",
        label: "Readiness",
        icon: ShieldCheck,
        value: `${readiness.progressPct}%`,
        hint: `${readiness.completedRequirements}/${readiness.totalRequirements} items`,
        tone: band === "ready" ? "success" : band === "needs-attention" ? "warning" : "destructive",
      },
      {
        key: "attendance",
        label: "Attendance · 30d",
        icon: Clock,
        value: `${attendance30d.shifts} shifts`,
        hint: attendance30d.lateCount + attendance30d.noShowCount > 0
          ? `${attendance30d.lateCount} late · ${attendance30d.noShowCount} no-show`
          : "On track",
        tone: attendance30d.noShowCount > 0
          ? "destructive"
          : attendance30d.lateCount > 0
          ? "warning"
          : "success",
      },
      {
        key: "payroll",
        label: "Last clock-in",
        icon: Wallet,
        value: lastPayrollDate ? safeDistance(lastPayrollDate) : "—",
        hint: lastPayrollDate ? "From time-entries" : "No time-entries yet",
        tone: lastPayrollDate ? "default" : "muted",
      },
      {
        key: "activity",
        label: "Last activity",
        icon: ActivityIcon,
        value: recentActivity[0]?.created_at ? safeDistance(recentActivity[0].created_at) : "—",
        hint: recentActivity[0]?.action ?? undefined,
        tone: recentActivity.length > 0 ? "default" : "muted",
      },
    ];
  }, [
    employee, invitations, portalActive, readiness, docsCount, attendance30d,
    lastPayrollDate, recentActivity, band,
  ]);

  // ── Loading / Error states ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="p-4 space-y-3">
        <ErrorBlock
          title="Unable to load person"
          message={error ?? "Unknown error"}
        />
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => navigate("/app/employees")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Worker Hub
          </Button>
        </div>
      </div>
    );
  }

  const fullName = formatPersonName(`${employee.first_name ?? ""} ${employee.last_name ?? ""}`);
  const invitation = invitations[employee.id];

  return (
    <div className="space-y-4 pb-10">
      {/* ─── Breadcrumb / Back ─── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1.5"
          onClick={() => navigate("/app/employees")}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Worker Hub
        </Button>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-medium text-foreground truncate">{fullName}</span>
      </div>

      {/* ─── HERO ─── */}
      <Card className="overflow-hidden border-border/50">
        <div className="bg-gradient-to-br from-primary/[0.05] via-transparent to-transparent">
          <CardContent className="p-5">
            <div className="flex items-start gap-5 flex-wrap">
              <PremiumAvatar
                firstName={employee.first_name}
                lastName={employee.last_name}
                avatarUrl={employee.avatar_url}
                size="xl"
                status={avatarStatus}
                cornerBadge={
                  band !== "unknown" ? (
                    <ReadinessBadge band={band} variant="dot" size="md" />
                  ) : undefined
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground leading-tight">
                    {fullName || "Unnamed"}
                  </h1>
                  <ReadinessBadge band={band} loading={readiness.loading} />
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {employee.employer_identification && (
                    <Badge variant="outline" className="font-mono text-[10px] gap-1">
                      <Hash className="h-2.5 w-2.5" />
                      {employee.employer_identification}
                    </Badge>
                  )}
                  {employee.employee_role && (
                    <Badge variant="secondary" className="text-[10px]">
                      {formatDisplayText(employee.employee_role, "label")}
                    </Badge>
                  )}
                  {employee.is_active === false && <PremiumStatusBadge status="inactive" />}
                  {employee.is_active !== false && portalActive && (
                    <PremiumStatusBadge status="active" />
                  )}
                  {employee.is_active !== false && !portalActive && invitation && (
                    <PremiumStatusBadge status="invited" />
                  )}
                  {employee.is_active !== false && !portalActive && !invitation && (
                    <PremiumStatusBadge status="pending" />
                  )}
                  {readiness.missingDocuments.length > 0 && (
                    <PremiumStatusBadge status="missing-docs" />
                  )}
                  {(employee.has_car === "Yes" || employee.has_car === true) && (
                    <PremiumStatusBadge status="driver" />
                  )}
                  {selectedCompany && (
                    <Badge
                      variant="outline"
                      className="text-[10px] gap-1 bg-muted/40 text-muted-foreground"
                    >
                      <Building2 className="h-2.5 w-2.5" />
                      {selectedCompany.name}
                    </Badge>
                  )}
                </div>

                {/* Contact row */}
                <div className="mt-3 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground">
                  {employee.phone_number && (
                    <a
                      href={`tel:${employee.phone_number}`}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <Phone className="h-3.5 w-3.5" /> {employee.phone_number}
                    </a>
                  )}
                  {employee.email && (
                    <a
                      href={`mailto:${employee.email}`}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <Mail className="h-3.5 w-3.5" /> {employee.email}
                    </a>
                  )}
                  {employee.address && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {employee.address}
                    </span>
                  )}
                  {employee.start_date && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" /> Started {safeDistance(employee.start_date)}
                    </span>
                  )}
                  {employee.birthday && (
                    <span className="inline-flex items-center gap-1">
                      <Cake className="h-3.5 w-3.5" /> {employee.birthday}
                    </span>
                  )}
                </div>
              </div>

              {/* Hero quick actions */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {isEditing ? (
                  <>
                    <Button size="sm" className="h-8 text-xs" onClick={handleSave}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setInviteOpen(true)}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" /> Invite
                </Button>
                {employee.phone_number && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    asChild
                  >
                    <a href={`https://wa.me/${String(employee.phone_number).replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer">
                      <Phone className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={toggleActive}
                >
                  {employee.is_active === false ? (
                    <><UserCheck className="h-3.5 w-3.5 mr-1.5" /> Activate</>
                  ) : (
                    <><Archive className="h-3.5 w-3.5 mr-1.5" /> Archive</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* ─── SNAPSHOT STRIP ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {snapshotMetrics.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.key} className="border-border/50">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Icon className="h-3 w-3" />
                  {m.label}
                </div>
                <div className={cn("mt-1 text-base font-bold tabular-nums leading-none", TONE_CLASS[m.tone ?? "default"])}>
                  {m.value}
                </div>
                {m.hint && (
                  <div className="mt-1 text-[10px] text-muted-foreground/80 truncate">{m.hint}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ─── READINESS GAPS ─── */}
      {(readiness.missingPersonal.length > 0 || readiness.missingDocuments.length > 0) && (
        <Card className="border-amber-500/30 bg-amber-500/[0.03]">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <ShieldOff className="h-3.5 w-3.5" />
              Readiness gaps
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                {readiness.completedRequirements}/{readiness.totalRequirements} complete
              </span>
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {readiness.missingPersonal.slice(0, 6).map((field) => (
                <div key={`p-${field}`} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-amber-500" />
                  <span className="capitalize">Personal: {field.replace(/_/g, " ")}</span>
                </div>
              ))}
              {readiness.missingDocuments.slice(0, 6).map((d) => (
                <div key={`d-${d.category}`} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-destructive" />
                  <span>Document: {d.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── DEEP TABS (existing logic, unchanged) ─── */}
      {selectedCompanyId && (
        <Card className="border-border/50">
          <CardContent className="p-4">
            <EmployeeProfileTabs
              employee={employee}
              companyId={selectedCompanyId}
              isEditing={isEditing}
              form={form}
              setForm={setForm}
              isPrivileged={isPrivileged}
              onEmployeeUpdate={(updates) =>
                setEmployee((prev) => (prev ? { ...prev, ...updates } : prev))
              }
              companyName={selectedCompany?.name}
              onInvite={() => setInviteOpen(true)}
              invitation={invitation ?? null}
            />
          </CardContent>
        </Card>
      )}

      {/* ─── RECENT SHIFTS ─── */}
      {recentShifts.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent shifts
              </div>
              <Link
                to={`/app/shifts?employee=${employee.id}`}
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                Open in Shifts <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border/40">
              {recentShifts.slice(0, 5).map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 py-2 text-xs">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium tabular-nums">{s.date}</span>
                  <span className="text-muted-foreground">{s.start_time}–{s.end_time}</span>
                  {s.title && (
                    <span className="text-muted-foreground truncate">· {s.title}</span>
                  )}
                  <Badge variant="outline" className="ml-auto text-[9px] capitalize">
                    {s.status ?? "scheduled"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Dialogs ─── */}
      {employee && (
        <EmployeeInviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          employee={employee}
          inviteToken={invitation?.invite_token ?? null}
          onInviteSent={(channel) => {
            logInvitation(employee.id, channel);
            refetchInvitations();
          }}
        />
      )}
      {employee && (
        <ArchiveEmployeeDialog
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          employee={{
            id: employee.id,
            first_name: employee.first_name ?? "",
            last_name: employee.last_name ?? "",
            company_id: employee.company_id,
          }}
          onArchived={() => {
            setArchiveOpen(false);
            navigate("/app/employees");
          }}
        />
      )}
    </div>
  );
}
