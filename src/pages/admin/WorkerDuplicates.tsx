/**
 * Worker Duplicates Detector
 * --------------------------
 * Admin tool to surface possible duplicate employees BEFORE they contaminate
 * shifts, payroll, or the worker portal.
 *
 * Detection strategies (conservative, deterministic):
 *   - Same normalized phone number
 *   - Same normalized email
 *   - Same normalized full name (first + last, lowercased, collapsed spaces)
 *   - Same employer_identification (operator-issued employee code)
 *
 * Scope guarantees:
 *   - READ-ONLY for employee data. No merge, no delete, no profile_status changes.
 *   - "Mark as reviewed" / "Flag pending consolidation" are recorded in activity_log
 *     (no schema changes required).
 *   - Already-merged duplicates (is_active=false) where an active master exists
 *     are excluded from the active list and shown only in the historical/audit tab.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  Users,
  AlertTriangle,
  Copy,
  ExternalLink,
  CheckCircle2,
  Flag,
  Loader2,
  Filter,
  Search,
  ShieldOff,
  History,
  Phone,
  Mail,
  IdCard,
  UserSearch,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import {
  PROFILE_STATUS_LABELS,
  PROFILE_STATUS_TONES,
  type ProfileStatus,
} from "@/lib/onboarding/profile-status";
import { normalizePhone } from "@/lib/phone";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type MatchKey = "phone" | "email" | "name" | "employer_id";

type GroupStrength = "strong" | "weak" | "shared_contact";

/**
 * Generic / shared email patterns. These are used by operators as placeholders
 * (or shared inboxes) and MUST NOT generate a duplicate group on their own.
 * Members are still surfaced with a "shared contact" badge for transparency.
 */
const SHARED_EMAIL_EXACT = new Set<string>([
  "qualitystaff@gmail.com",
  "noemail",
  "noemail@noemail.com",
  "test@test.com",
]);
const SHARED_EMAIL_PATTERNS: RegExp[] = [
  /^test/i,
  /^example/i,
  /@example\./i,
  /^admin@/i,
  /^info@/i,
  /^staffing@/i,
  /^office@/i,
  /^support@/i,
  /^noemail/i,
];

/** Threshold: any email used by >= N employees is treated as a shared contact. */
const SHARED_EMAIL_USAGE_THRESHOLD = 5;

function isSharedEmail(email: string, usageCount: number): boolean {
  if (!email) return true;
  if (SHARED_EMAIL_EXACT.has(email)) return true;
  if (SHARED_EMAIL_PATTERNS.some((re) => re.test(email))) return true;
  if (usageCount >= SHARED_EMAIL_USAGE_THRESHOLD) return true;
  return false;
}

interface EmployeeRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  email: string | null;
  employer_identification: string | null;
  user_id: string | null;
  is_active: boolean;
  profile_status: ProfileStatus;
  onboarding_status: string | null;
  created_at: string;
  updated_at: string;
  avatar_url: string | null;
}

interface EmployeeMetrics {
  assignments: number;
  time_entries: number;
  last_shift_date: string | null;
  last_clock_in: string | null;
  invitations: number;
  pending_invitations: number;
  documents: number;
}

interface DuplicateGroup {
  key: string;            // composite "matchKey:value" (or merged-by-id for multi-key)
  matchKeys: MatchKey[];  // which strategies hit
  matchValue: string;     // human-readable shared value
  members: EmployeeRecord[];
  suggestedMasterId: string;
  reviewState: ReviewState | null;
  strength: GroupStrength;          // strong / weak / shared_contact
  sharedEmails: string[];           // emails flagged as shared contact within the group
}

type ReviewState = "reviewed" | "flagged_pending_consolidation";

interface ReviewLogEntry {
  group_key: string;
  state: ReviewState;
  reviewed_by: string;
  reviewed_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization helpers
// ─────────────────────────────────────────────────────────────────────────────

function normName(first: string | null, last: string | null): string {
  const raw = `${first ?? ""} ${last ?? ""}`.trim().toLowerCase();
  return raw.replace(/\s+/g, " ");
}

function normEmail(raw: string | null): string {
  return (raw ?? "").trim().toLowerCase();
}

function normEmployerId(raw: string | null): string {
  return (raw ?? "").trim().toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Master selection — pick the best canonical record in a group.
// Priority: has portal user_id > is_active > more historical data > older record.
// ─────────────────────────────────────────────────────────────────────────────

function pickSuggestedMaster(members: EmployeeRecord[], metrics: Map<string, EmployeeMetrics>): string {
  const scored = members.map((m) => {
    const met = metrics.get(m.id);
    let score = 0;
    if (m.user_id) score += 1000;
    if (m.is_active) score += 500;
    if (m.profile_status === "active") score += 200;
    else if (m.profile_status === "ready") score += 100;
    score += (met?.assignments ?? 0) * 5;
    score += (met?.time_entries ?? 0) * 3;
    // Older record breaks ties (more history)
    score -= new Date(m.created_at).getTime() / 1e12;
    return { id: m.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function WorkerDuplicates() {
  const { role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();

  const isPrivileged =
    role === "developer" ||
    role === "owner" ||
    role === "company_owner" ||
    role === "admin";

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [metrics, setMetrics] = useState<Map<string, EmployeeMetrics>>(new Map());
  const [reviews, setReviews] = useState<Map<string, ReviewLogEntry>>(new Map());
  const [search, setSearch] = useState("");
  const [matchTypeFilter, setMatchTypeFilter] = useState<MatchKey | "all">("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | "open" | "reviewed" | "flagged">("open");
  const [strengthFilter, setStrengthFilter] = useState<"strong" | "with_weak" | "with_shared">("strong");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  async function load() {
    if (!selectedCompanyId) {
      setEmployees([]);
      setMetrics(new Map());
      setReviews(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);

    // 1. All employees in company (active + inactive)
    const { data: emps, error: empErr } = await supabase
      .from("employees")
      .select(
        "id, first_name, last_name, phone_number, email, employer_identification, user_id, is_active, profile_status, onboarding_status, created_at, updated_at, avatar_url",
      )
      .eq("company_id", selectedCompanyId);

    if (empErr) {
      toast({ title: "Failed to load employees", description: empErr.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const records = (emps ?? []) as EmployeeRecord[];
    setEmployees(records);

    if (records.length === 0) {
      setMetrics(new Map());
      setReviews(new Map());
      setLoading(false);
      return;
    }

    const ids = records.map((r) => r.id);

    // 2. Metrics — aggregated counts per employee.
    const [asgRes, teRes, invRes, docRes, reviewRes] = await Promise.all([
      supabase
        .from("shift_assignments")
        .select("employee_id, status, created_at, shift_id")
        .in("employee_id", ids),
      supabase
        .from("time_entries")
        .select("employee_id, clock_in")
        .in("employee_id", ids),
      supabase
        .from("employee_invitations")
        .select("employee_id, status")
        .in("employee_id", ids),
      supabase
        .from("employee_documents")
        .select("employee_id")
        .in("employee_id", ids),
      // Review state lives in activity_log to avoid schema changes.
      supabase
        .from("activity_log")
        .select("entity_id, action, details, user_id, created_at")
        .eq("company_id", selectedCompanyId)
        .in("action", [
          "duplicate_group_reviewed",
          "duplicate_group_flagged_pending_consolidation",
          "duplicate_group_reopened",
        ])
        .order("created_at", { ascending: true }),
    ]);

    // Need shift dates → fetch involved shifts in one shot for last_shift_date.
    const shiftIds = Array.from(
      new Set((asgRes.data ?? []).map((a: any) => a.shift_id).filter(Boolean)),
    );
    const shiftMap = new Map<string, string>();
    if (shiftIds.length > 0) {
      const { data: shifts } = await supabase
        .from("scheduled_shifts")
        .select("id, date")
        .in("id", shiftIds);
      for (const s of shifts ?? []) shiftMap.set(s.id, s.date);
    }

    const m = new Map<string, EmployeeMetrics>();
    for (const id of ids) {
      m.set(id, {
        assignments: 0,
        time_entries: 0,
        last_shift_date: null,
        last_clock_in: null,
        invitations: 0,
        pending_invitations: 0,
        documents: 0,
      });
    }
    for (const a of asgRes.data ?? []) {
      const cur = m.get(a.employee_id);
      if (!cur) continue;
      cur.assignments += 1;
      const d = shiftMap.get(a.shift_id);
      if (d && (!cur.last_shift_date || d > cur.last_shift_date)) cur.last_shift_date = d;
    }
    for (const t of teRes.data ?? []) {
      const cur = m.get(t.employee_id);
      if (!cur) continue;
      cur.time_entries += 1;
      if (t.clock_in && (!cur.last_clock_in || t.clock_in > cur.last_clock_in)) {
        cur.last_clock_in = t.clock_in;
      }
    }
    for (const i of invRes.data ?? []) {
      const cur = m.get(i.employee_id);
      if (!cur) continue;
      cur.invitations += 1;
      if (i.status === "pending" || i.status === "sent") cur.pending_invitations += 1;
    }
    for (const d of docRes.data ?? []) {
      const cur = m.get(d.employee_id);
      if (!cur) continue;
      cur.documents += 1;
    }
    setMetrics(m);

    // 3. Review states — latest entry per group_key wins.
    const r = new Map<string, ReviewLogEntry>();
    for (const log of reviewRes.data ?? []) {
      const groupKey = (log.details as any)?.group_key as string | undefined;
      if (!groupKey) continue;
      if (log.action === "duplicate_group_reopened") {
        r.delete(groupKey);
        continue;
      }
      const state: ReviewState =
        log.action === "duplicate_group_flagged_pending_consolidation"
          ? "flagged_pending_consolidation"
          : "reviewed";
      r.set(groupKey, {
        group_key: groupKey,
        state,
        reviewed_by: log.user_id,
        reviewed_at: log.created_at,
      });
    }
    setReviews(r);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  // ── Detection ────────────────────────────────────────────────────────────
  const groups: DuplicateGroup[] = useMemo(() => {
    if (employees.length === 0) return [];

    // Build buckets per strategy
    const buckets = new Map<string, EmployeeRecord[]>();
    // Pre-pass: how many employees use each email (active OR inactive — we want
    // to detect shared inboxes regardless of historical activity).
    const emailUsage = new Map<string, number>();
    for (const e of employees) {
      const email = normEmail(e.email);
      if (email) emailUsage.set(email, (emailUsage.get(email) ?? 0) + 1);
    }

    function add(key: string, e: EmployeeRecord) {
      const cur = buckets.get(key);
      if (cur) cur.push(e);
      else buckets.set(key, [e]);
    }

    for (const e of employees) {
      const phone = normalizePhone(e.phone_number);
      if (phone) add(`phone:${phone}`, e);

      const email = normEmail(e.email);
      // Skip shared/generic emails — they are never used to coalesce a group.
      if (email && !isSharedEmail(email, emailUsage.get(email) ?? 0)) {
        add(`email:${email}`, e);
      }

      const name = normName(e.first_name, e.last_name);
      if (name && name.includes(" ")) add(`name:${name}`, e);

      const eid = normEmployerId(e.employer_identification);
      if (eid) add(`employer_id:${eid}`, e);
    }

    // Coalesce buckets that share members → one logical group.
    const memberToGroup = new Map<string, Set<string>>();
    for (const [bucketKey, members] of buckets) {
      if (members.length < 2) continue;
      for (const m of members) {
        const cur = memberToGroup.get(m.id) ?? new Set<string>();
        cur.add(bucketKey);
        memberToGroup.set(m.id, cur);
      }
    }

    const visited = new Set<string>();
    const result: DuplicateGroup[] = [];

    for (const [bucketKey, members] of buckets) {
      if (members.length < 2) continue;
      if (visited.has(bucketKey)) continue;

      const queue = [bucketKey];
      const groupBuckets = new Set<string>();
      const groupMembers = new Map<string, EmployeeRecord>();
      while (queue.length) {
        const k = queue.shift()!;
        if (visited.has(k)) continue;
        visited.add(k);
        groupBuckets.add(k);
        for (const m of buckets.get(k) ?? []) {
          groupMembers.set(m.id, m);
          for (const otherKey of memberToGroup.get(m.id) ?? []) {
            if (!visited.has(otherKey)) queue.push(otherKey);
          }
        }
      }

      const memberArr = Array.from(groupMembers.values());
      if (memberArr.length < 2) continue;

      const matchKeys = new Set<MatchKey>();
      const sampleValues: string[] = [];
      for (const k of groupBuckets) {
        const [strategy, value] = k.split(":", 2);
        matchKeys.add(strategy as MatchKey);
        if (sampleValues.length < 3) sampleValues.push(value);
      }

      // Strength classification:
      //   strong       → at least one strong signal (phone / email / employer_id)
      //   weak         → only name-based match
      //   shared_contact → reserved for groups whose only signal would have been
      //                    a generic email (already filtered above, kept for
      //                    semantics in case future weak signals are added).
      const strongKeys: MatchKey[] = ["phone", "email", "employer_id"];
      const hasStrong = Array.from(matchKeys).some((k) => strongKeys.includes(k));
      const strength: GroupStrength = hasStrong ? "strong" : "weak";

      // Per-member shared-email annotations (for the badge in the row).
      const sharedEmails: string[] = [];
      for (const m of memberArr) {
        const em = normEmail(m.email);
        if (em && isSharedEmail(em, emailUsage.get(em) ?? 0)) {
          if (!sharedEmails.includes(em)) sharedEmails.push(em);
        }
      }

      const groupKey = `dup:${memberArr.map((x) => x.id).sort().join(",")}`;
      result.push({
        key: groupKey,
        matchKeys: Array.from(matchKeys),
        matchValue: sampleValues.join(" · "),
        members: memberArr,
        suggestedMasterId: pickSuggestedMaster(memberArr, metrics),
        reviewState: reviews.get(groupKey)?.state ?? null,
        strength,
        sharedEmails,
      });
    }

    result.sort((a, b) => {
      // Strong groups first, then open before reviewed, then more members first.
      const strengthRank = { strong: 0, weak: 1, shared_contact: 2 } as const;
      const sa = strengthRank[a.strength];
      const sb = strengthRank[b.strength];
      if (sa !== sb) return sa - sb;
      const aOpen = a.reviewState ? 1 : 0;
      const bOpen = b.reviewState ? 1 : 0;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return b.members.length - a.members.length;
    });
    return result;
  }, [employees, metrics, reviews]);

  // Already-resolved groups: the merged duplicate is inactive AND there is an
  // active master → still surfaced in the historical tab for audit only.
  const { activeGroups, historicalGroups } = useMemo(() => {
    const active: DuplicateGroup[] = [];
    const history: DuplicateGroup[] = [];
    for (const g of groups) {
      const activeMembers = g.members.filter((m) => m.is_active);
      const inactiveMembers = g.members.filter((m) => !m.is_active);
      // If only one active member remains and the rest are inactive → resolved.
      if (activeMembers.length <= 1 && inactiveMembers.length >= 1) {
        history.push(g);
      } else {
        active.push(g);
      }
    }
    return { activeGroups: active, historicalGroups: history };
  }, [groups]);

  // ── Filtering ────────────────────────────────────────────────────────────
  const filteredActive = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeGroups.filter((g) => {
      // Strength gating:
      //   strong       → only strong groups
      //   with_weak    → strong + weak (name-only)
      //   with_shared  → everything (also surfaces shared-contact-only members)
      if (strengthFilter === "strong" && g.strength !== "strong") return false;
      if (strengthFilter === "with_weak" && g.strength === "shared_contact") return false;
      // with_shared: no strength filter applied
      if (matchTypeFilter !== "all" && !g.matchKeys.includes(matchTypeFilter)) return false;
      if (reviewFilter === "open" && g.reviewState) return false;
      if (reviewFilter === "reviewed" && g.reviewState !== "reviewed") return false;
      if (reviewFilter === "flagged" && g.reviewState !== "flagged_pending_consolidation") return false;
      if (!term) return true;
      return g.members.some((m) => {
        const fields = [
          m.first_name,
          m.last_name,
          m.email,
          m.phone_number,
          m.employer_identification,
          m.id,
        ];
        return fields.some((f) => (f ?? "").toString().toLowerCase().includes(term));
      });
    });
  }, [activeGroups, matchTypeFilter, reviewFilter, strengthFilter, search]);

  const kpis = useMemo(() => {
    const strongActive = activeGroups.filter((g) => g.strength === "strong");
    const weakActive = activeGroups.filter((g) => g.strength === "weak");
    const open = strongActive.filter((g) => !g.reviewState).length;
    const flagged = strongActive.filter((g) => g.reviewState === "flagged_pending_consolidation").length;
    const reviewed = strongActive.filter((g) => g.reviewState === "reviewed").length;
    const employeesAffected = strongActive.reduce((acc, g) => acc + g.members.length, 0);
    return {
      open,
      flagged,
      reviewed,
      employeesAffected,
      historical: historicalGroups.length,
      strong: strongActive.length,
      weak: weakActive.length,
    };
  }, [activeGroups, historicalGroups]);

  // ── Actions ──────────────────────────────────────────────────────────────
  async function copyReport(g: DuplicateGroup) {
    const lines: string[] = [];
    lines.push(`Duplicate group: ${g.matchValue}`);
    lines.push(`Match strategies: ${g.matchKeys.join(", ")}`);
    lines.push(`Suggested master: ${g.suggestedMasterId}`);
    lines.push("");
    for (const m of g.members) {
      const met = metrics.get(m.id);
      lines.push(
        [
          m.id === g.suggestedMasterId ? "★ MASTER" : "  candidate",
          `id=${m.id}`,
          `name=${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
          `phone=${m.phone_number ?? ""}`,
          `email=${m.email ?? ""}`,
          `employer_id=${m.employer_identification ?? ""}`,
          `portal=${m.user_id ? "yes" : "no"}`,
          `active=${m.is_active}`,
          `profile_status=${m.profile_status}`,
          `assignments=${met?.assignments ?? 0}`,
          `time_entries=${met?.time_entries ?? 0}`,
          `created_at=${m.created_at}`,
        ].join(" | "),
      );
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast({ title: "Duplicate report copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  async function setReview(g: DuplicateGroup, state: ReviewState | null) {
    setSavingKey(g.key);
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid || !selectedCompanyId) {
      toast({ title: "Authentication missing", variant: "destructive" });
      setSavingKey(null);
      return;
    }

    const action =
      state === "reviewed"
        ? "duplicate_group_reviewed"
        : state === "flagged_pending_consolidation"
          ? "duplicate_group_flagged_pending_consolidation"
          : "duplicate_group_reopened";

    const { error } = await supabase.from("activity_log").insert({
      user_id: uid,
      company_id: selectedCompanyId,
      action,
      entity_type: "employee_duplicate_group",
      entity_id: g.key,
      details: {
        group_key: g.key,
        match_keys: g.matchKeys,
        match_value: g.matchValue,
        suggested_master: g.suggestedMasterId,
        member_ids: g.members.map((m) => m.id),
      },
    } as any);

    if (error) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title:
          state === "reviewed"
            ? "Marked as reviewed"
            : state === "flagged_pending_consolidation"
              ? "Flagged pending consolidation"
              : "Reopened",
      });
      load();
    }
    setSavingKey(null);
  }

  // ── Guards ───────────────────────────────────────────────────────────────
  if (!isPrivileged) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldOff className="h-5 w-5" /> Access restricted
            </CardTitle>
            <CardDescription>
              Duplicate detection is visible only to admin, owner and developer roles.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Worker Duplicates"
        subtitle="Detect possible duplicate employee records before they contaminate shifts, payroll or portal access. Detection only — no automatic merge."
        icon={UserSearch}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Open groups" value={kpis.open} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard label="Flagged" value={kpis.flagged} tone="deduction" icon={<Flag className="h-4 w-4" />} />
        <KpiCard label="Reviewed" value={kpis.reviewed} tone="earning" icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard label="Employees affected" value={kpis.employeesAffected} tone="muted" icon={<Users className="h-4 w-4" />} />
        <KpiCard label="Historical (resolved)" value={kpis.historical} tone="muted" icon={<History className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active duplicates ({activeGroups.length})</TabsTrigger>
          <TabsTrigger value="historical">Historical / merged ({historicalGroups.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="h-4 w-4" /> Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, phone, email, ID…"
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={strengthFilter} onValueChange={(v) => setStrengthFilter(v as typeof strengthFilter)}>
                <SelectTrigger><SelectValue placeholder="Signal strength" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="strong">Strong only (phone / email / employer ID)</SelectItem>
                  <SelectItem value="with_weak">Include weak (name-only)</SelectItem>
                  <SelectItem value="with_shared">Include shared contacts</SelectItem>
                </SelectContent>
              </Select>
              <Select value={matchTypeFilter} onValueChange={(v) => setMatchTypeFilter(v as MatchKey | "all")}>
                <SelectTrigger><SelectValue placeholder="Match type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All match types</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="employer_id">Employer ID</SelectItem>
                </SelectContent>
              </Select>
              <Select value={reviewFilter} onValueChange={(v) => setReviewFilter(v as typeof reviewFilter)}>
                <SelectTrigger><SelectValue placeholder="Review state" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open (needs review)</SelectItem>
                  <SelectItem value="flagged">Flagged for consolidation</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Groups */}
          {loading ? (
            <Card><CardContent className="p-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Scanning employees for duplicates…
            </CardContent></Card>
          ) : filteredActive.length === 0 ? (
            <Card><CardContent className="p-12 text-center text-muted-foreground text-sm">
              No duplicate groups match the current filters.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {filteredActive.map((g) => (
                <DuplicateGroupCard
                  key={g.key}
                  group={g}
                  metrics={metrics}
                  saving={savingKey === g.key}
                  onCopy={() => copyReport(g)}
                  onReviewed={() => setReview(g, "reviewed")}
                  onFlag={() => setReview(g, "flagged_pending_consolidation")}
                  onReopen={() => setReview(g, null)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historical" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resolved groups</CardTitle>
              <CardDescription className="text-xs">
                Groups where one record remains active and the rest were deactivated (e.g. after a merge).
                Kept here for audit and historical traceability — never re-opened automatically.
              </CardDescription>
            </CardHeader>
          </Card>
          {historicalGroups.length === 0 ? (
            <Card><CardContent className="p-12 text-center text-muted-foreground text-sm">
              No historical duplicate groups.
            </CardContent></Card>
          ) : (
            historicalGroups.map((g) => (
              <DuplicateGroupCard
                key={g.key}
                group={g}
                metrics={metrics}
                saving={savingKey === g.key}
                historical
                onCopy={() => copyReport(g)}
                onReviewed={() => setReview(g, "reviewed")}
                onFlag={() => setReview(g, "flagged_pending_consolidation")}
                onReopen={() => setReview(g, null)}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Group card
// ─────────────────────────────────────────────────────────────────────────────

const MATCH_ICON: Record<MatchKey, React.ReactNode> = {
  phone: <Phone className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
  name: <Users className="h-3 w-3" />,
  employer_id: <IdCard className="h-3 w-3" />,
};

const MATCH_LABEL: Record<MatchKey, string> = {
  phone: "Phone",
  email: "Email",
  name: "Name",
  employer_id: "Employer ID",
};

function DuplicateGroupCard({
  group,
  metrics,
  saving,
  historical,
  onCopy,
  onReviewed,
  onFlag,
  onReopen,
}: {
  group: DuplicateGroup;
  metrics: Map<string, EmployeeMetrics>;
  saving: boolean;
  historical?: boolean;
  onCopy: () => void;
  onReviewed: () => void;
  onFlag: () => void;
  onReopen: () => void;
}) {
  return (
    <Card className={historical ? "border-border/60 bg-muted/20" : ""}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {group.members.length} matching records
              </CardTitle>
              {group.strength === "strong" ? (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1">
                  Strong signal
                </Badge>
              ) : group.strength === "weak" ? (
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 gap-1">
                  Weak signal · name only
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1">
                  Shared contact only
                </Badge>
              )}
              {group.matchKeys.map((k) => (
                <Badge key={k} variant="outline" className="gap-1 font-normal">
                  {MATCH_ICON[k]} {MATCH_LABEL[k]}
                </Badge>
              ))}
              {group.sharedEmails.length > 0 && (
                <Badge
                  variant="outline"
                  className="gap-1 bg-muted text-muted-foreground border-border font-normal"
                  title={`Shared/generic email present: ${group.sharedEmails.join(", ")}`}
                >
                  <Mail className="h-3 w-3" /> Shared contact
                </Badge>
              )}
              {group.reviewState === "flagged_pending_consolidation" && (
                <Badge variant="outline" className="bg-deduction/10 text-deduction border-deduction/20 gap-1">
                  <Flag className="h-3 w-3" /> Pending consolidation
                </Badge>
              )}
              {group.reviewState === "reviewed" && (
                <Badge variant="outline" className="bg-earning/10 text-earning border-earning/20 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Reviewed
                </Badge>
              )}
              {historical && (
                <Badge variant="outline" className="gap-1">
                  <History className="h-3 w-3" /> Historical
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs font-mono">{group.matchValue}</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onCopy} className="gap-1">
              <Copy className="h-3.5 w-3.5" /> Copy report
            </Button>
            {!historical && (
              <>
                {group.reviewState !== "reviewed" && (
                  <Button size="sm" variant="ghost" onClick={onReviewed} disabled={saving} className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark reviewed
                  </Button>
                )}
                {group.reviewState !== "flagged_pending_consolidation" && (
                  <Button size="sm" variant="ghost" onClick={onFlag} disabled={saving} className="gap-1">
                    <Flag className="h-3.5 w-3.5 text-deduction" /> Flag pending
                  </Button>
                )}
                {group.reviewState && (
                  <Button size="sm" variant="ghost" onClick={onReopen} disabled={saving}>
                    Reopen
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Employee</th>
                <th className="text-left px-3 py-2">Contact</th>
                <th className="text-left px-3 py-2">Profile</th>
                <th className="text-right px-3 py-2">Assignments</th>
                <th className="text-right px-3 py-2">Time entries</th>
                <th className="text-left px-3 py-2">Last activity</th>
                <th className="text-left px-3 py-2">Created</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {group.members.map((m) => {
                const isMaster = m.id === group.suggestedMasterId;
                const met = metrics.get(m.id);
                const lastActivity = met?.last_clock_in ?? met?.last_shift_date ?? null;
                return (
                  <tr
                    key={m.id}
                    className={`border-t border-border ${
                      isMaster ? "bg-primary/[0.04]" : !m.is_active ? "opacity-70" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {isMaster && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                            ★ Suggested master
                          </Badge>
                        )}
                        <div>
                          <div className="font-medium">
                            {`${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "(unnamed)"}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {m.employer_identification ? `#${m.employer_identification} · ` : ""}
                            <span className="font-mono">{m.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-xs">{m.phone_number ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                        {m.email ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={PROFILE_STATUS_TONES[m.profile_status]}>
                        {PROFILE_STATUS_LABELS[m.profile_status]}
                      </Badge>
                      <div className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                        {m.onboarding_status ?? "—"}
                        {" · "}
                        {m.user_id ? "portal" : "no portal"}
                        {" · "}
                        {m.is_active ? "active" : "inactive"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{met?.assignments ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{met?.time_entries ?? 0}</td>
                    <td className="px-3 py-2 text-xs">
                      {lastActivity ? format(new Date(lastActivity), "MMM d, yyyy") : "—"}
                      {met?.pending_invitations ? (
                        <div className="text-[11px] text-warning">
                          {met.pending_invitations} pending invite{met.pending_invitations === 1 ? "" : "s"}
                        </div>
                      ) : null}
                      {met?.documents ? (
                        <div className="text-[11px] text-muted-foreground">
                          {met.documents} doc{met.documents === 1 ? "" : "s"}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {format(new Date(m.created_at), "MMM d, yyyy")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button asChild size="icon" variant="ghost" title="Open employee profile">
                        <Link to={`/app/employees/${m.id}`}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "earning" | "warning" | "muted" | "deduction";
  icon: React.ReactNode;
}) {
  const toneClasses: Record<typeof tone, string> = {
    earning: "border-earning/30 bg-earning/5",
    warning: "border-warning/30 bg-warning/5",
    muted: "border-border bg-muted/30",
    deduction: "border-deduction/30 bg-deduction/5",
  };
  const iconTone: Record<typeof tone, string> = {
    earning: "text-earning",
    warning: "text-warning",
    muted: "text-muted-foreground",
    deduction: "text-deduction",
  };
  return (
    <Card className={toneClasses[tone]}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={iconTone[tone]}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
