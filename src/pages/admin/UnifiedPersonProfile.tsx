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
import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { EMPLOYEE_COLUMNS_NO_FISCAL } from "@/lib/employee-columns";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { ProfileSummaryGrid } from "@/components/employee/ProfileSummaryGrid";
import { EmployeeInviteDialog } from "@/components/employee/EmployeeInviteDialog";
import { ArchiveEmployeeDialog } from "@/components/employee/ArchiveEmployeeDialog";
import { NextActionCard } from "@/components/employee/NextActionCard";
import IdentityResolutionDrawer from "@/components/employee/IdentityResolutionDrawer";
import { isPendingIdentity, isPlaceholderWorker } from "@/lib/employee-identity";
import { ShieldAlert } from "lucide-react";
import { selectWorkerNextAction, type WorkerNextAction } from "@/lib/worker-next-action";
import { canInviteWorker, canActivateWorker, canArchiveWorker } from "@/lib/worker-actions";
import { WorkerPhotoStatusChip } from "@/components/employee/WorkerPhotoStatusChip";
import { PhotoReviewActions } from "@/components/employee/PhotoReviewActions";

import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Building2,
  Send,
  Pencil,
  Archive,
  UserCheck,
  Briefcase,
  CalendarDays,
  ShieldCheck,
  ShieldOff,
  FileText,
  Activity as ActivityIcon,
  Clock,
  ExternalLink,
  ContactRound,
  Link2,
  AlertTriangle,
  CheckCircle2,
  RotateCw,
  ChevronDown,
  Code2,
} from "lucide-react";
import { isInviteStatusFailure } from "@/lib/invitation-status";
import { cn } from "@/lib/utils";
import { isDocDialogOpen, subscribeDocDialog } from "@/lib/document-dialog-suspend";

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
  const { selectedCompanyId, selectedCompany, loading: companyLoading } = useCompany();
  const lastCompanyIdRef = useRef<string | null>(selectedCompanyId);
  if (selectedCompanyId) lastCompanyIdRef.current = selectedCompanyId;
  const stableCompanyId = selectedCompanyId ?? (companyLoading ? lastCompanyIdRef.current : null);
  const isPrivileged = role === "developer" || role === "owner" || role === "admin";

  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [companyRoster, setCompanyRoster] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>("info");
  // Deep tabs panel is collapsed by default. Every card CTA that targets a tab
  // MUST open it, otherwise the click has no visible effect (dead button).
  const [detailsOpen, setDetailsOpen] = useState(false);
  const deepTabsRef = useRef<HTMLDivElement | null>(null);

  /**
   * Single canonical entry point for every "go to tab X" CTA in this page.
   * Opens the collapsed deep-tabs panel, normalizes legacy tab ids and scrolls
   * to the panel. Without this, card CTAs silently did nothing.
   */
  const TAB_ALIASES: Record<string, string> = { log: "activity", activity_log: "activity" };
  const openDeepTab = (tab: string, opts?: { edit?: boolean }) => {
    const target = TAB_ALIASES[tab] ?? tab;
    setActiveTab(target);
    setDetailsOpen(true);
    if (opts?.edit) setIsEditing(true);
    requestAnimationFrame(() => {
      deepTabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };



  // Snapshot data
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [recentShifts, setRecentShifts] = useState<any[]>([]);
  const [docsCount, setDocsCount] = useState<{ approved: number; pending: number; rejected: number }>({
    approved: 0, pending: 0, rejected: 0,
  });
  // Onboarding-doc compliance counts (read-only). employee_onboarding_documents is
  // the only doc table that exposes a real "expired" status today; admin
  // employee_documents has no expires_at column. Used exclusively to enrich the
  // NextActionCard's doc signal — UI cards that already cite docsCount remain unchanged.
  const [onboardingDocsCount, setOnboardingDocsCount] = useState<{
    pending: number; rejected: number; expired: number;
  }>({ pending: 0, rejected: 0, expired: 0 });
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
        .select(EMPLOYEE_COLUMNS_NO_FISCAL)
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

    // Reusable refetch for documents only — invoked from realtime subscription
    // so admin sees worker portal uploads/status changes without a hard reload.
    const refetchDocs = async () => {
      const [adminRes, onbRes] = await Promise.all([
        sb.from("employee_documents").select("review_status").eq("employee_id", id),
        sb.from("employee_onboarding_documents").select("status").eq("employee_id", id),
      ]);
      if (cancelled) return;
      const docs = (adminRes.data ?? []) as any[];
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
      const onb = (onbRes.data ?? []) as any[];
      const onbAgg = onb.reduce(
        (acc: { pending: number; rejected: number; expired: number }, d: any) => {
          const s = String(d.status ?? "").toLowerCase();
          if (s === "pending") acc.pending++;
          else if (s === "rejected") acc.rejected++;
          else if (s === "expired") acc.expired++;
          return acc;
        },
        { pending: 0, rejected: 0, expired: 0 },
      );
      setOnboardingDocsCount(onbAgg);
    };

    (async () => {
      const [docsRes, activityRes, shiftsRes, payrollRes, visitsRes, onbDocsRes] = await Promise.all([
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
        sb
          .from("office_visits")
          .select("id, visit_type, status, rating, rating_score, checked_in_at, case_code, pending_count, visit_detail")
          .eq("employee_id", id)
          .order("checked_in_at", { ascending: false })
          .limit(8),
        sb.from("employee_onboarding_documents").select("status").eq("employee_id", id),
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

      const onb = (onbDocsRes?.data ?? []) as any[];
      const onbAgg = onb.reduce(
        (acc: { pending: number; rejected: number; expired: number }, d: any) => {
          const s = String(d.status ?? "").toLowerCase();
          if (s === "pending") acc.pending++;
          else if (s === "rejected") acc.rejected++;
          else if (s === "expired") acc.expired++;
          return acc;
        },
        { pending: 0, rejected: 0, expired: 0 },
      );
      setOnboardingDocsCount(onbAgg);

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
      setFrontDeskVisits((visitsRes.data ?? []) as any[]);
    })();

    // Realtime: keep documents snapshot fresh across portal/admin uploads
    // and review status changes. Scoped to this employee_id only.
    // Also refresh readiness so the hero/snapshot bands stay in sync.
    //
    // IMPORTANT: while a document edit dialog is open (Reject / Request
    // replacement / Upload) we DEFER the refresh. Otherwise re-rendering the
    // documents list / readiness band on each realtime tick remounts inputs
    // inside the dialog and the textarea loses focus on every keystroke.
    let pendingRefresh = false;
    const runRefresh = () => {
      pendingRefresh = false;
      refetchDocs();
      readiness.refresh?.();
    };
    const channel = supabase
      .channel(`profile-docs-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "employee_documents",
          filter: `employee_id=eq.${id}`,
        },
        () => {
          if (isDocDialogOpen()) {
            pendingRefresh = true;
            return;
          }
          runRefresh();
        },
      )
      .subscribe();

    // When all dialogs close, flush any deferred refresh once.
    const unsubSuspend = subscribeDocDialog((suspended) => {
      if (!suspended && pendingRefresh) runRefresh();
    });

    return () => {
      cancelled = true;
      unsubSuspend();
      supabase.removeChannel(channel);
    };
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
  // Fields that must NEVER be updated through the inline hero edit.
  // Keeps PostgREST from rejecting payloads that include identifiers /
  // server-managed columns and protects against accidental tenant moves.
  const PROTECTED_FIELDS = new Set([
    "id", "company_id", "user_id", "created_at", "updated_at",
    "deleted_at", "auth_user_id", "employer_identification",
  ]);

  const handleSave = async () => {
    if (!employee || saving) return;
    setSaving(true);
    try {
      // Build a safe diff: only fields that exist on the original record,
      // excluding protected ones, and only sending the changed values.
      const updates: Record<string, any> = {};
      for (const [key, value] of Object.entries(form)) {
        if (PROTECTED_FIELDS.has(key)) continue;
        if (!(key in employee)) continue;
        const original = employee[key];
        const normalized = value === "" ? null : value;
        const originalNormalized = original == null ? null : String(original);
        const nextNormalized = normalized == null ? null : String(normalized);
        if (originalNormalized !== nextNormalized) {
          updates[key] = normalized;
        }
      }

      if (Object.keys(updates).length === 0) {
        setIsEditing(false);
        toast({ title: "No changes to save" });
        return;
      }

      const { error } = await (supabase as any)
        .from("employees")
        .update(updates)
        .eq("id", employee.id);
      if (error) throw error;
      setEmployee((prev) => (prev ? { ...prev, ...updates } : prev));
      setIsEditing(false);
      toast({ title: "Changes saved" });
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcuts: Cmd/Ctrl+S to save, Esc to cancel — only while editing.
  useEffect(() => {
    if (!isEditing) return;
    const onKey = (ev: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const meta = isMac ? ev.metaKey : ev.ctrlKey;
      if (meta && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        handleSave();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        if (employee) {
          setForm(Object.fromEntries(
            Object.entries(employee).map(([k, v]) => [k, v == null ? "" : String(v)])
          ));
        }
        setIsEditing(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, employee, form, saving]);

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

  // ── Lazy same-company roster for Identity Resolution drawer (Link/Merge) ──
  const openIdentityDrawer = async () => {
    if (!employee?.company_id) return;
    if (companyRoster.length === 0) {
      const { data } = await (supabase as any)
        .from("employees")
        .select("id, company_id, first_name, last_name, is_active, worker_type, identity_status")
        .eq("company_id", employee.company_id)
        .limit(2000);
      setCompanyRoster(data ?? []);
    }
    setIdentityOpen(true);
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
        value: portalActive ? "Active" : invitation ? "Invited" : "Not invited",
        hint: portalActive
          ? (invitation?.accepted_at ? `Accepted ${safeDistance(invitation.accepted_at)}` : "Worker has access")
          : invitation?.sent_at
            ? `Invited ${safeDistance(invitation.sent_at)}`
            : "Send portal invite",
        tone: portalActive ? "success" : invitation ? "warning" : "muted",
      },
      {
        key: "documents",
        label: "Documents",
        icon: FileText,
        // Primary value reflects REQUIRED-doc readiness only (drives onboarding).
        // Hint shows TOTAL employee_documents counts so admins can see new
        // worker-portal uploads (pending) without misreading "Complete".
        value: readiness.missingDocuments.length === 0
          ? "Required complete"
          : `${readiness.missingDocuments.length} required missing`,
        hint: docsCount.approved + docsCount.pending + docsCount.rejected > 0
          ? `${docsCount.approved} approved · ${docsCount.pending} pending`
          : "No documents uploaded yet",
        tone: readiness.missingDocuments.length === 0
          ? (docsCount.pending > 0 ? "warning" : "success")
          : "destructive",
      },
      {
        key: "readiness",
        label: "Readiness",
        icon: ShieldCheck,
        value: `${readiness.progressPct}%`,
        hint: `${readiness.completedRequirements}/${readiness.totalRequirements} items complete`,
        tone: band === "ready" ? "success" : band === "needs-attention" ? "warning" : "destructive",
      },
      {
        key: "attendance",
        label: "Attendance · 30d",
        icon: Clock,
        value: attendance30d.shifts > 0
          ? `${attendance30d.shifts} shift${attendance30d.shifts === 1 ? "" : "s"}`
          : "No shifts",
        hint: attendance30d.shifts === 0
          ? "Nothing scheduled in last 30 days"
          : attendance30d.lateCount + attendance30d.noShowCount > 0
            ? `${attendance30d.lateCount} late · ${attendance30d.noShowCount} no-show`
            : "On track",
        tone: attendance30d.noShowCount > 0
          ? "destructive"
          : attendance30d.lateCount > 0
            ? "warning"
            : attendance30d.shifts > 0 ? "success" : "muted",
      },
      {
        key: "last-clock-in",
        label: "Last clock-in",
        icon: Clock,
        value: lastPayrollDate ? safeDistance(lastPayrollDate) : "Never",
        hint: lastPayrollDate ? "From time entries" : "No clock-ins on record",
        tone: lastPayrollDate ? "default" : "muted",
      },
      {
        key: "activity",
        label: "Last activity",
        icon: ActivityIcon,
        value: recentActivity[0]?.created_at ? safeDistance(recentActivity[0].created_at) : "Quiet",
        hint: recentActivity[0]?.action ?? "No recent activity logged",
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
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Workers
          </Button>
        </div>
      </div>
    );
  }

  const fullName = formatPersonName(`${employee.first_name ?? ""} ${employee.last_name ?? ""}`);
  const invitation = invitations[employee.id];

  return (
    <div className="space-y-4 pb-28 sm:pb-10">
      {/* ─── Breadcrumb / Back ─── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1.5"
          onClick={() => navigate("/app/employees")}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Workers
        </Button>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-medium text-foreground truncate">{fullName}</span>
        {isEditing && (
          <Badge variant="outline" className="ml-2 gap-1.5 border-warning/40 bg-warning/10 text-warning text-[10px]">
            <Pencil className="h-2.5 w-2.5" />
            Editing
            <span className="opacity-60 hidden sm:inline">· ⌘S to save · Esc to cancel</span>
          </Badge>
        )}
      </div>

      {/* ─── HERO ─── */}
      <Card className="overflow-hidden border-border/50">
        <div className="bg-gradient-to-br from-primary/[0.05] via-transparent to-transparent">
          <CardContent className="p-3 sm:p-5">
            <div className="flex items-start gap-3 sm:gap-5 flex-wrap">

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
                {employee.preferred_name && String(employee.preferred_name).trim() !== "" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    También conocido/a como{" "}
                    <span className="font-medium text-foreground/80">
                      {String(employee.preferred_name).trim()}
                    </span>
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
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
                    <span className="hidden sm:inline-flex">
                      <PremiumStatusBadge status="driver" />
                    </span>
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
                  {employee.is_active !== false && (
                    <span className="hidden sm:inline-flex">
                      <PhotoReviewActions
                        employeeId={employee.id}
                        avatarUrl={employee.avatar_url}
                        reviewStatus={employee.photo_review_status ?? null}
                        rejectionReason={employee.photo_rejection_reason ?? null}
                        reviewedAt={employee.photo_reviewed_at ?? null}
                        onChanged={({ status, reason }) =>
                          setEmployee((prev: any) =>
                            prev ? { ...prev, photo_review_status: status, photo_rejection_reason: reason } : prev
                          )
                        }
                      />
                    </span>
                  )}
                </div>

                {/* Contact row — desktop only. On mobile these live in Datos principales. */}
                <div className="mt-3 hidden sm:flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground">
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
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(employee.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <MapPin className="h-3.5 w-3.5" /> {employee.address}
                    </a>
                  )}
                  {employee.start_date && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" /> Started {safeDistance(employee.start_date)}
                    </span>
                  )}
                </div>
              </div>

              {/* Hero quick actions */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {isEditing ? (
                  <>
                    <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => {
                        // Reset form to original employee values on cancel
                        if (employee) {
                          setForm(Object.fromEntries(
                            Object.entries(employee).map(([k, v]) => [k, v == null ? "" : String(v)])
                          ));
                        }
                        setIsEditing(false);
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="hidden sm:inline-flex h-8 text-xs"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                )}

                {employee && isPrivileged && (isPendingIdentity(employee as any) || isPlaceholderWorker(employee as any)) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    onClick={openIdentityDrawer}
                  >
                    <ShieldAlert className="h-3.5 w-3.5 mr-1.5" /> Resolver identidad
                  </Button>
                )}


                {/* Invite / Resend — label and tone reflect current state.
                    NOTE: We intentionally do NOT show a "Sending…" loading state here.
                    Statuses like "queued"/"sent" are persisted email-provider states,
                    not UI loading flags — using them here would lock the button
                    indefinitely. The actual sending UX lives inside the invite dialog. */}
                {(() => {
                  const failed = invitation && isInviteStatusFailure(invitation.status);
                  const accepted = invitation?.accepted_at || portalActive;
                  const everSent = !!invitation?.sent_at;
                  const inviteDecision = canInviteWorker(employee, invitation);

                  // Primary CTA when worker has no portal access yet and either:
                  //  • never invited, or
                  //  • last attempt failed/bounced.
                  const isPrimaryAction = !portalActive && (!everSent || failed);

                  let label = "Invite";
                  let Icon = Send;
                  if (employee.is_active === false) { label = "Reactivate first"; }
                  else if (failed) { label = "Retry invite"; Icon = RotateCw; }
                  else if (accepted) { label = "Resend invite"; Icon = Send; }
                  else if (everSent) { label = "Resend invite"; Icon = RotateCw; }

                  return (
                    <Button
                      size="sm"
                      variant={isPrimaryAction ? "default" : "outline"}
                      className={cn(
                        "h-8 text-xs",
                        failed && "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
                      )}
                      onClick={() => setInviteOpen(true)}
                      disabled={!inviteDecision.allowed}
                      title={
                        !inviteDecision.allowed ? inviteDecision.reason :
                        failed ? `Last attempt failed${invitation?.bounce_reason ? ` — ${invitation.bounce_reason}` : ""}` :
                        accepted ? "Worker is already active — send a fresh invite if needed" :
                        everSent ? `Last invite sent ${invitation?.sent_at ? safeDistance(invitation.sent_at) : ""}` :
                        "Send portal invitation"
                      }
                    >
                      <Icon className="h-3.5 w-3.5 mr-1.5" />
                      {label}
                    </Button>
                  );
                })()}

                {/* Copy invite link & Open activation — only when an active token exists and not yet accepted */}
                {invitation?.invite_token && !invitation.accepted_at && !portalActive && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hidden sm:inline-flex h-8 text-xs"
                      onClick={async () => {
                        try {
                          const { inviteUrl } = await import("@/lib/app-url");
                          await navigator.clipboard.writeText(inviteUrl(invitation.invite_token!));
                          toast({ title: "Invite link copied", description: "This is the only active link. Resending will invalidate it." });
                        } catch {
                          toast({ title: "Could not copy link", variant: "destructive" });
                        }
                      }}
                      title="Copy the current activation link"
                    >
                      <Link2 className="h-3.5 w-3.5 mr-1.5" /> Copy link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hidden sm:inline-flex h-8 text-xs"
                      onClick={async () => {
                        try {
                          const { inviteUrl } = await import("@/lib/app-url");
                          window.open(inviteUrl(invitation.invite_token!), "_blank", "noopener,noreferrer");
                        } catch {
                          toast({ title: "Could not open link", variant: "destructive" });
                        }
                      }}
                      title="Open the activation page in a new tab"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open
                    </Button>
                  </>
                )}

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
                {(() => {
                  const isInactive = employee.is_active === false;
                  const decision = isInactive ? canActivateWorker(employee) : canArchiveWorker(employee);
                  return (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hidden sm:inline-flex h-8 text-xs"
                      onClick={() => {
                        if (isInactive) {
                          toggleActive();
                        } else {
                          setArchiveOpen(true);
                        }
                      }}
                      title={isInactive ? "Reactivate to enable invites and shifts" : decision.reason ?? "Archive worker"}
                    >
                      {isInactive ? (
                        <><UserCheck className="h-3.5 w-3.5 mr-1.5" /> Activate</>
                      ) : (
                        <><Archive className="h-3.5 w-3.5 mr-1.5" /> Archive</>
                      )}
                    </Button>
                  );
                })()}

                {/* Inline invitation status hint — discreet, single line */}
                {invitation && !isEditing && (
                  <span className={cn(
                    "inline-flex items-center gap-1 text-[10.5px] ml-0.5 pl-2 border-l border-border/40",
                    isInviteStatusFailure(invitation.status) ? "text-destructive" :
                    invitation.accepted_at ? "text-earning" :
                    invitation.opened_at ? "text-primary" :
                    "text-muted-foreground/80",
                  )}>
                    {isInviteStatusFailure(invitation.status)
                      ? <AlertTriangle className="h-3 w-3" />
                      : invitation.accepted_at
                        ? <CheckCircle2 className="h-3 w-3" />
                        : <Clock className="h-3 w-3" />}
                    {isInviteStatusFailure(invitation.status)
                      ? "Invite failed"
                      : invitation.accepted_at
                        ? `Accepted ${safeDistance(invitation.accepted_at)}`
                        : invitation.opened_at
                          ? `Opened ${safeDistance(invitation.opened_at)}`
                          : invitation.delivered_at
                            ? `Delivered ${safeDistance(invitation.delivered_at)}`
                            : invitation.sent_at
                              ? `Sent ${safeDistance(invitation.sent_at)}`
                              : "Pending"}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* IA Cleanup v3: legacy/import section moved to the very bottom
          (after tabs and recent shifts) so the main experience leads with
          operational truth. Single collapsed audit block, admin/dev only. */}



      {/* ─── PRÓXIMA ACCIÓN RECOMENDADA (Phase 1C 2026-06-18: moved above
           snapshot on mobile so the next operational action is the first
           thing operators see after the compact hero) ─── */}
      {(() => {
        const nextAction = selectWorkerNextAction(
          employee,
          { missingPersonal: readiness.missingPersonal, missingDocuments: readiness.missingDocuments },
          invitation ?? null,
          {
            docs: {
              missingRequiredCount: readiness.missingDocuments.length,
              expiredCount: onboardingDocsCount.expired,
              rejectedCount: docsCount.rejected + onboardingDocsCount.rejected,
              pendingCount: docsCount.pending + onboardingDocsCount.pending,
            },
            portalActive,
          },
        );

        const handleAction = (a: WorkerNextAction) => {
          switch (a.cta) {
            case "open_invite":
              setInviteOpen(true);
              return;
            case "edit_contact":
              openDeepTab(a.targetTab ?? "info", { edit: true });
              return;
            case "open_access":
              openDeepTab("access");
              return;
            case "open_documents":
              openDeepTab("docs");
              return;
            case "none":
            default:
              return;
          }
        };


        return <NextActionCard action={nextAction} onAction={handleAction} />;
      })()}

      {/* ─── SNAPSHOT STRIP ───
           Phase 1C 2026-06-18: on mobile, only the 3 most actionable KPIs
           (portal, documents, readiness) render. Attendance/last clock-in/
           last activity are visible from sm: upward. Desktop layout intact. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {snapshotMetrics.map((m) => {
          const Icon = m.icon;
          const secondaryOnMobile = m.key === "attendance" || m.key === "last-clock-in" || m.key === "activity";
          return (
            <Card key={m.key} className={cn("border-border/50", secondaryOnMobile && "hidden sm:block")}>
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


      {/* ─── ONE-SCREEN PROFILE SUMMARY GRID (Phase: One-Screen Optimization v1) ───
          Presentational, read-only 2-column card grid: Datos principales,
          Cumplimiento, Acceso, Operación, Actividad reciente, Avanzado.
          All actions deep-link into the existing tabs / handlers — no new
          mutations, no schema changes, no payroll math. */}
      <ProfileSummaryGrid
        employee={employee}
        portalActive={portalActive}
        invitation={invitation ?? null}
        readiness={{
          missingDocuments: readiness.missingDocuments,
          missingPersonal: readiness.missingPersonal,
          progressPct: readiness.progressPct,
          completedRequirements: readiness.completedRequirements,
          totalRequirements: readiness.totalRequirements,
        }}
        docsCount={docsCount}
        onboardingDocsCount={onboardingDocsCount}
        lastClockIn={lastPayrollDate}
        recentActivity={recentActivity}
        recentShifts={recentShifts}
        frontDeskVisits={frontDeskVisits}
        onOpenTab={(tab) => openDeepTab(tab)}
        onEdit={() => openDeepTab("info", { edit: true })}
        onInvite={() => setInviteOpen(true)}
        onArchive={() => setArchiveOpen(true)}
        isPrivileged={isPrivileged}
      />


      {/* ─── ESTADO OPERACIONAL ───
          Calm executive status card. Replaces the legacy red "Readiness &
          action items" wall. Shows the worker's operational status, completion
          %, the 3 most important blockers, and a collapsible "Ver todos los
          pendientes" for the rest. The recommended next action lives in
          NextActionCard above — we do not duplicate the CTA here. */}
      {(() => {
        const personalCount = readiness.missingPersonal.length;
        const missingDocsCount = readiness.missingDocuments.length;
        const pendingDocs = docsCount.pending;
        const rejectedDocs = docsCount.rejected;
        const portalNotActive = !portalActive;
        const hasInvitation = !!invitations[employee.id];

        // Status label — calm, executive phrasing tied to existing readiness band.
        let statusLabel = "Listo para oportunidades";
        let statusTone: "ready" | "attention" | "critical" | "muted" = "ready";
        if (employee.is_active === false) {
          statusLabel = "Inactivo";
          statusTone = "muted";
        } else if (missingDocsCount > 0 || rejectedDocs > 0) {
          statusLabel = "No listo para payroll";
          statusTone = "critical";
        } else if (personalCount > 0 || pendingDocs > 0) {
          statusLabel = "Necesita actualización";
          statusTone = "attention";
        } else if (portalNotActive) {
          statusLabel = "Pendiente de activación";
          statusTone = "attention";
        }

        type Item = { key: string; tone: "warning" | "destructive" | "muted"; text: string };
        const items: Item[] = [];
        readiness.missingDocuments.forEach((d) => items.push({
          key: `m-${d.category}`, tone: "destructive",
          text: `Falta documento requerido: ${d.label}`,
        }));
        if (rejectedDocs > 0) items.push({
          key: "rej", tone: "destructive",
          text: `${rejectedDocs} documento${rejectedDocs === 1 ? "" : "s"} rechazado${rejectedDocs === 1 ? "" : "s"} · requiere reemplazo`,
        });
        if (pendingDocs > 0) items.push({
          key: "pen", tone: "warning",
          text: `${pendingDocs} documento${pendingDocs === 1 ? "" : "s"} en revisión`,
        });
        readiness.missingPersonal.forEach((field) => items.push({
          key: `p-${field}`, tone: "warning",
          text: `Falta dato personal: ${field.replace(/_/g, " ")}`,
        }));
        if (!hasPhoto && employee.is_active !== false) items.push({
          key: "photo", tone: "warning",
          text: "Falta foto profesional",
        });
        if (portalNotActive) items.push({
          key: "portal", tone: "muted",
          text: `Portal ${hasInvitation ? "invitado, aún no activado" : "sin invitar"}`,
        });

        const top = items.slice(0, 3);
        const rest = items.slice(3);

        const dotClass = (t: Item["tone"]) =>
          t === "destructive" ? "bg-destructive" : t === "warning" ? "bg-warning" : "bg-muted-foreground/40";

        const statusBadgeClass =
          statusTone === "ready"     ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" :
          statusTone === "attention" ? "bg-warning/10 text-warning border-warning/30" :
          statusTone === "critical"  ? "bg-destructive/10 text-destructive border-destructive/30" :
                                       "bg-muted/40 text-muted-foreground border-border/50";

        const barFill =
          statusTone === "ready"     ? "bg-emerald-500" :
          statusTone === "attention" ? "bg-warning" :
          statusTone === "critical"  ? "bg-destructive" :
                                       "bg-muted-foreground/40";

        return (
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Estado operacional
                </span>
                <Badge variant="outline" className={cn("text-[10px] px-2 py-0 h-5 font-semibold", statusBadgeClass)}>
                  {statusLabel}
                </Badge>
                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                  {readiness.completedRequirements}/{readiness.totalRequirements} · {readiness.progressPct}%
                </span>
              </div>

              <div className="mt-2 h-1 w-full rounded-full overflow-hidden bg-muted/60">
                <div
                  className={cn("h-full rounded-full transition-all duration-500 ease-out", barFill)}
                  style={{ width: `${readiness.progressPct}%` }}
                />
              </div>

              {items.length === 0 ? (
                <p className="mt-3 text-[11.5px] text-muted-foreground">
                  Sin pendientes. El trabajador está listo para operar.
                </p>
              ) : (
                <>
                  <div className="mt-3 space-y-1.5">
                    {top.map((it) => (
                      <div key={it.key} className="flex items-center gap-2 text-[12px] text-foreground/90">
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClass(it.tone))} />
                        <span className="truncate">{it.text}</span>
                      </div>
                    ))}
                  </div>
                  {rest.length > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger className="group mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                        Ver todos los pendientes ({rest.length})
                        <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1.5 space-y-1.5">
                          {rest.map((it) => (
                            <div key={it.key} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClass(it.tone))} />
                              <span className="truncate">{it.text}</span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Pending-docs bridge — clarifies that documents "en revisión"
                      do NOT yet resolve missing requirements, and deep-links to
                      Documents Center scoped to this worker. Read-only. */}
                  {pendingDocs > 0 && (
                    <div className="mt-3 rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] text-amber-900 leading-snug">
                          {missingDocsCount > 0 ? (
                            <>
                              Hay <strong>{pendingDocs}</strong> documento{pendingDocs === 1 ? "" : "s"} en revisión que podría{pendingDocs === 1 ? "" : "n"} resolver <strong>{missingDocsCount}</strong> requisito{missingDocsCount === 1 ? "" : "s"} faltante{missingDocsCount === 1 ? "" : "s"}.
                            </>
                          ) : (
                            <>
                              Hay <strong>{pendingDocs}</strong> documento{pendingDocs === 1 ? "" : "s"} en revisión. Aún no cuentan como aprobados.
                            </>
                          )}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-2 h-7 text-[11px] border-amber-300 text-amber-800 hover:bg-amber-100/60"
                          onClick={() => navigate(`/app/documents?status=pending&employee=${employee.id}`)}
                        >
                          Revisar documentos pendientes
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })()}


      {/* ─── DEEP TABS (existing logic, unchanged — secondary navigation) ───
          Phase 1B 2026-06-18: collapsed by default to reduce profile
          saturation. All tabs/handlers preserved; no data hidden, just
          tucked behind one click. */}
      {stableCompanyId && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="group inline-flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 hover:text-foreground transition-colors">
            <span className="inline-flex items-center gap-1.5">
              <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
              Más detalles · navegación secundaria
            </span>
            <span className="text-[10px] text-muted-foreground/60 font-normal normal-case tracking-normal">
              Pestañas de pago, documentos, acceso y más
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="border-border/50 mt-2">
              <CardContent className="p-4">
                <EmployeeProfileTabs
                  employee={employee}
                  companyId={stableCompanyId}
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
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
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

      {/* ─── HISTORIAL DE FRONT DESK (collapsed by default) ─── */}
      {frontDeskVisits.length > 0 && (
        <Collapsible>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <CollapsibleTrigger className="group inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  <ContactRound className="h-3.5 w-3.5" />
                  Ver historial de Front Desk
                  <Badge variant="outline" className="text-[9px] ml-1">{frontDeskVisits.length}</Badge>
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <Link
                  to="/app/front-desk"
                  className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                >
                  Abrir Front Desk <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <CollapsibleContent>
                <div className="mt-2 divide-y divide-border/40">
                  {frontDeskVisits.slice(0, 6).map((v: any) => (
                    <div key={v.id} className="flex items-center gap-2 py-2 text-xs">
                      {v.case_code && (
                        <Badge variant="outline" className="text-[9px] font-mono">{v.case_code}</Badge>
                      )}
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {new Date(v.checked_in_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="text-muted-foreground truncate">
                        {String(v.visit_type ?? "").replace(/_/g, " ")}
                      </span>
                      {v.pending_count > 0 && (
                        <Badge variant="outline" className="text-[9px] border-warning/30 bg-warning/10 text-warning">
                          {v.pending_count} pendiente{v.pending_count === 1 ? "" : "s"}
                        </Badge>
                      )}
                      <Badge variant="outline" className="ml-auto text-[9px] capitalize">
                        {String(v.status ?? "").replace(/_/g, " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </CardContent>
          </Card>
        </Collapsible>
      )}


      {/* ─── DATOS IMPORTADOS Y AUDITORÍA (admin/dev only, collapsed) ───
          Single legacy/audit block. Holds Connecteam IDs, direct_manager,
          recommended_by, groups/tags, added_via/added_by, source/import
          metadata, profile_status, reconciliation flag and timestamps.
          Hidden for non-privileged operators. Not used for payroll or
          readiness. */}
      {isPrivileged && (
        <Collapsible>
          <CollapsibleTrigger className="group inline-flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors">
            <Code2 className="h-3 w-3" />
            Datos importados y auditoría
            <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2 border-dashed border-border/60 bg-muted/20">
              <CardContent className="p-3 space-y-2">
                <p className="text-[10.5px] text-muted-foreground/80">
                  Datos heredados de importaciones o integraciones. No afectan payroll ni preparación operativa.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] font-mono">
                  {[
                    ["employee_id", employee.id],
                    ["employer_identification", employee.employer_identification],
                    ["user_id", employee.user_id ?? employee.auth_user_id],
                    ["company_id", employee.company_id],
                    ["profile_status", employee.profile_status],
                    ["is_active", String(employee.is_active)],
                    ["source", employee.source ?? employee.import_source],
                    ["person_type_guess", employee.person_type_guess],
                    ["payroll_safe", employee.payroll_safe == null ? null : String(employee.payroll_safe)],
                    ["connecteam_employee_id", employee.connecteam_employee_id],
                    ["connecteam_manager", employee.connecteam_manager],
                    ["direct_manager", employee.direct_manager],
                    ["recommended_by", employee.recommended_by],
                    ["groups", Array.isArray(employee.groups) ? employee.groups.join(", ") : employee.groups],
                    ["tags", Array.isArray(employee.tags) ? employee.tags.join(", ") : employee.tags],
                    ["added_via", employee.added_via],
                    ["added_by", employee.added_by],
                    ["date_added", employee.date_added],
                    ["created_from_reconciliation", employee.created_from_reconciliation == null ? null : String(employee.created_from_reconciliation)],
                    ["english_level", employee.english_level],
                    ["qualify", employee.qualify],
                    ["country_code", employee.country_code],
                    ["county", employee.county],
                    ["created_at", employee.created_at],
                    ["updated_at", employee.updated_at],
                  ].filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                    <div key={String(k)} className="flex items-start gap-2 min-w-0">
                      <span className="text-muted-foreground shrink-0 w-44 truncate">{k}</span>
                      <span className="text-foreground truncate" title={String(v)}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
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

      {employee && (
        <IdentityResolutionDrawer
          open={identityOpen}
          onOpenChange={setIdentityOpen}
          employee={employee as any}
          companyName={selectedCompany?.name}
          companyEmployees={companyRoster}
          onResolved={async () => {
            // Re-fetch employee row to reflect updated identity fields.
            const { data } = await (supabase as any)
              .from("employees")
              .select(EMPLOYEE_COLUMNS_NO_FISCAL)
              .eq("id", employee.id)
              .maybeSingle();
            if (data) setEmployee(data);
          }}
        />
      )}
    </div>
  );
}
