/**
 * Phase 22 — Payroll Review Queue v1 (READ-ONLY)
 *
 * Triage surface for payroll admins (María). Aggregates 12 buckets across
 * pay_periods / period_base_pay / historical_payroll_entries / movements /
 * payroll_adjustments / time_entries / shift_assignments / scheduled_shifts /
 * shift_closeout_reports / shift_rides / employees.
 *
 * STRICT GUARANTEES (per Phase 22 approval):
 *   - No writes (no create/update/delete on any payroll-related table)
 *   - No payroll calculations
 *   - No period locking, posting, or approval
 *   - No TimeClock source switch
 *   - Connecteam imports remain payroll authority
 *   - Tenant-scoped via canAccessAdminForCompany(selectedCompanyId)
 *   - Period selector NEVER auto-selects a future period just because it has
 *     the highest sequence_number
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { usePageView } from "@/hooks/useAuditLog";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageHeader } from "@/components/ui/page-header";
import { PayrollSourceGuardrailBanner } from "@/components/payroll/PayrollSourceGuardrailBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { MobileQueueRow, MobileQueueDrawer } from "@/components/admin/mobile";
import {
  Loader2, ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2,
  Users, Clock, CalendarX, Car, FileWarning, ScanEye, Lock,
  ExternalLink, Info, ClipboardList, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { REVIEW_COPY, REVIEW_REASON_LABELS, reviewReasonLabel } from "@/utils/reviewNavigationCopy";

// ── Types ─────────────────────────────────────────────────────────────────

type Severity = "info" | "warn" | "block";

interface BucketRow {
  key: string;
  primary: string;
  secondary?: string | null;
  link?: { to: string; label: string } | null;
  amount?: number | null;
  badge?: string | null;
  /** Optional worker id, used by S15 deep-link focus (?employee=/?explore=). */
  employeeId?: string | null;
}

// ── S15/S19 Root-Cause reason labels (sourced from reviewNavigationCopy) ──
const REASON_LABELS = REVIEW_REASON_LABELS;
const reasonLabel = reviewReasonLabel;

interface BucketDef {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  affectsPay: boolean;
  rows: BucketRow[];
}

interface PayPeriodLite {
  id: string;
  sequence_number: number | null;
  start_date: string;
  end_date: string;
  status: string | null;
  reconciliation_status: string | null;
  paid_at: string | null;
  closed_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<Severity, { icon: typeof Info; chip: string; dot: string; label: string }> = {
  info:  { icon: Info,           chip: "bg-muted text-foreground",                       dot: "bg-muted-foreground", label: "Info" },
  warn:  { icon: AlertTriangle,  chip: "bg-warning/15 text-warning border-warning/30",   dot: "bg-warning",          label: "Warn" },
  block: { icon: AlertCircle,    chip: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive", label: "Block" },
};

const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function pickDefaultPeriodId(periods: PayPeriodLite[], pbpCounts: Record<string, number>): string | null {
  if (periods.length === 0) return null;
  const today = new Date();
  // 1. period containing today
  const containsToday = periods.find(p => {
    const s = parseISO(p.start_date);
    const e = parseISO(p.end_date);
    return !isAfter(s, today) && !isBefore(e, today);
  });
  if (containsToday) return containsToday.id;
  // 2. most recent period with real period_base_pay rows
  const withData = [...periods]
    .filter(p => (pbpCounts[p.id] ?? 0) > 0)
    .sort((a, b) => (b.sequence_number ?? 0) - (a.sequence_number ?? 0))[0];
  if (withData) return withData.id;
  // 3. most recent period with end_date <= today
  const past = [...periods]
    .filter(p => !isAfter(parseISO(p.end_date), today))
    .sort((a, b) => (b.sequence_number ?? 0) - (a.sequence_number ?? 0))[0];
  if (past) return past.id;
  // 4. fallback: nothing
  return periods[0].id;
}

function isFuturePeriod(p: PayPeriodLite): boolean {
  return isAfter(parseISO(p.start_date), new Date());
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function PayrollReviewQueue() {
  usePageView("Payroll Review Queue");
  const { canAccessAdminForCompany } = useAuth();
  const { selectedCompanyId, selectedCompany, loading: companyLoading } = useCompany();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // S4 deep links — `?bucket=` focuses one bucket; `?period=` preselects period.
  const [searchParams] = useSearchParams();
  const focusedBucket = searchParams.get("bucket");
  const periodParam = searchParams.get("period");
  // S15 — Root-Cause deep link (read-only hints only).
  const focusEmployeeId = searchParams.get("employee") || searchParams.get("explore");
  const reasonKey = searchParams.get("reason");
  const reasonHuman = reasonLabel(reasonKey);

  // Mobile drawer-per-row state.
  const [drawerRow, setDrawerRow] = useState<{ row: BucketRow; bucket: BucketDef } | null>(null);

  // Hooks declared before any early return (Rules of Hooks).
  const canAccess = canAccessAdminForCompany(selectedCompanyId);

  // ── Periods (with pbp counts for default selection) ─────────────────────
  const periodsQ = useQuery({
    queryKey: ["prq", "periods", selectedCompanyId],
    enabled: !!selectedCompanyId && canAccess,
    queryFn: async () => {
      const { data: periods, error } = await supabase
        .from("pay_periods")
        .select("id, sequence_number, start_date, end_date, status, reconciliation_status, paid_at, closed_at")
        .eq("company_id", selectedCompanyId!)
        .order("sequence_number", { ascending: false })
        .limit(60);
      if (error) throw error;
      const list = (periods ?? []) as PayPeriodLite[];
      const ids = list.map(p => p.id);
      let pbpCounts: Record<string, number> = {};
      if (ids.length) {
        const { data: pbp } = await supabase
          .from("period_base_pay")
          .select("period_id")
          .in("period_id", ids);
        for (const r of pbp ?? []) {
          pbpCounts[r.period_id] = (pbpCounts[r.period_id] ?? 0) + 1;
        }
      }
      return { list, pbpCounts };
    },
  });

  // S16 — Period Resolver.
  // If `?period=` refers to a period outside the initially loaded window,
  // resolve it read-only, tenant-scoped (id + company_id) and merge it into
  // the local list so the selector shows it exactly once and Review Queue
  // can drill into it. Never creates or mutates periods.
  const baseList = periodsQ.data?.list;
  const paramInBase = !!periodParam && !!baseList && baseList.some(p => p.id === periodParam);
  const needsResolve = !!periodParam && !!baseList && !paramInBase;
  const resolvePeriodQ = useQuery({
    queryKey: ["prq", "resolve-period", selectedCompanyId, periodParam],
    enabled: !!selectedCompanyId && canAccess && needsResolve,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pay_periods")
        .select("id, sequence_number, start_date, end_date, status, reconciliation_status, paid_at, closed_at")
        .eq("company_id", selectedCompanyId!)
        .eq("id", periodParam!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PayPeriodLite | null;
    },
  });
  const resolvedPeriod = resolvePeriodQ.data ?? null;
  const resolveAttempted = needsResolve && !resolvePeriodQ.isLoading;
  const resolveNotFound = resolveAttempted && resolvedPeriod === null;
  const resolvedFromUrl = !!periodParam && !paramInBase && !!resolvedPeriod;

  // Merged periods list (base + resolved, dedup by id).
  const mergedPeriods = useMemo<PayPeriodLite[]>(() => {
    const base = baseList ?? [];
    if (resolvedPeriod && !base.some(p => p.id === resolvedPeriod.id)) {
      return [resolvedPeriod, ...base];
    }
    return base;
  }, [baseList, resolvedPeriod]);

  // Ref kept in sync for use inside dataQ.queryFn without changing its key.
  const periodsLookupRef = useRef<PayPeriodLite[]>([]);
  useEffect(() => { periodsLookupRef.current = mergedPeriods; }, [mergedPeriods]);

  // Apply default period once data loads. Never auto-picks the resolved
  // period — that only happens via explicit URL selection below.
  const effectivePeriodId = useMemo(() => {
    if (selectedPeriodId) return selectedPeriodId;
    if (!periodsQ.data) return null;
    return pickDefaultPeriodId(periodsQ.data.list, periodsQ.data.pbpCounts);
  }, [selectedPeriodId, periodsQ.data]);

  const selectedPeriod = useMemo(() => {
    if (!effectivePeriodId) return null;
    return mergedPeriods.find(p => p.id === effectivePeriodId) ?? null;
  }, [effectivePeriodId, mergedPeriods]);

  // S4/S16: honor `?period=` deep link once periods load (tenant-scoped).
  // Selects the period if it exists in the base list OR was resolved via S16.
  useEffect(() => {
    if (!periodParam || selectedPeriodId) return;
    if (paramInBase) { setSelectedPeriodId(periodParam); return; }
    if (resolvedFromUrl) { setSelectedPeriodId(periodParam); return; }
  }, [periodParam, paramInBase, resolvedFromUrl, selectedPeriodId]);



  // ── Bucket data aggregation ─────────────────────────────────────────────
  const dataQ = useQuery({
    queryKey: ["prq", "buckets", selectedCompanyId, effectivePeriodId],
    enabled: !!selectedCompanyId && !!effectivePeriodId && canAccess,
    queryFn: async () => {
      const cid = selectedCompanyId!;
      const pid = effectivePeriodId!;
      const period = periodsLookupRef.current.find(p => p.id === pid)
        ?? periodsQ.data?.list.find(p => p.id === pid);
      if (!period) throw new Error("Period not found");

      // 1) period_base_pay (Stafly-side finalized rows, current source of truth)
      const { data: pbp } = await supabase
        .from("period_base_pay")
        .select("id, employee_id, base_total_pay, total_paid_hours, total_work_hours, anomaly_flags, is_anomalous")
        .eq("company_id", cid)
        .eq("period_id", pid);

      // 2) historical_payroll_entries (raw imports / unmatched staging)
      const { data: hist } = await supabase
        .from("historical_payroll_entries")
        .select("id, matched_employee_id, worker_name_raw, base_total_pay, needs_identity_review")
        .eq("company_id", cid)
        .eq("period_id", pid);

      // 3) movements
      const { data: mvmts } = await supabase
        .from("movements")
        .select("id, employee_id, total_value, approval_status, note, concept_id")
        .eq("company_id", cid)
        .eq("period_id", pid);

      // 4) payroll_adjustments
      const { data: adj } = await supabase
        .from("payroll_adjustments")
        .select("id, shift_id, employee_id, type, amount, notes")
        .eq("company_id", cid)
        .eq("period_id", pid);

      // 5) reconciliation_final_records (variance/conflict signals)
      const { data: rfr } = await supabase
        .from("reconciliation_final_records")
        .select("id, employee_id, conflict_count, reconciliation_status, final_total_pay")
        .eq("company_id", cid);

      // 6) scheduled_shifts in period
      const { data: shifts } = await supabase
        .from("scheduled_shifts")
        .select("id, date, title, pay_type, day_type, shift_code")
        .eq("company_id", cid)
        .gte("date", period.start_date)
        .lte("date", period.end_date);
      const shiftIds = (shifts ?? []).map(s => s.id);

      // 7) shift_assignments for those shifts
      const { data: assigns } = shiftIds.length
        ? await supabase
            .from("shift_assignments")
            .select("id, shift_id, employee_id, response_status, attendance_status")
            .eq("company_id", cid)
            .in("shift_id", shiftIds)
        : { data: [] as any[] };

      // 8) time_entries in period (by clock_in date)
      // Read-only review tolerance: widen window by ±1 day to avoid missing
      // edge clock-ins due to NY timezone drift vs UTC. This is for review
      // surfacing only — payroll calculation is unaffected and still uses
      // period_base_pay / historical_payroll_entries as source of truth.
      const windowStart = new Date(`${period.start_date}T00:00:00Z`);
      windowStart.setUTCDate(windowStart.getUTCDate() - 1);
      const windowEnd = new Date(`${period.end_date}T00:00:00Z`);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 2); // end_date + 1 day, exclusive
      const { data: timeEntries } = await supabase
        .from("time_entries")
        .select("id, employee_id, shift_id, clock_in, clock_out, status")
        .eq("company_id", cid)
        .gte("clock_in", windowStart.toISOString())
        .lt("clock_in", windowEnd.toISOString());

      // 9) shift_closeout_reports for these shifts
      const { data: closeouts } = shiftIds.length
        ? await supabase
            .from("shift_closeout_reports")
            .select("id, shift_id, no_show_count, late_count, incident_count, status, review_status, final_approval_status, reviewed_at")
            .eq("company_id", cid)
            .in("shift_id", shiftIds)
        : { data: [] as any[] };

      // 10) shift_rides
      const { data: rides } = shiftIds.length
        ? await supabase
            .from("shift_rides")
            .select("id, shift_id, driver_id, ride_type, movement_id, passenger_count")
            .eq("company_id", cid)
            .in("shift_id", shiftIds)
        : { data: [] as any[] };

      // 11) employees lookup (for naming)
      const empIds = new Set<string>();
      for (const r of pbp ?? []) r.employee_id && empIds.add(r.employee_id);
      for (const r of hist ?? []) r.matched_employee_id && empIds.add(r.matched_employee_id);
      for (const r of mvmts ?? []) r.employee_id && empIds.add(r.employee_id);
      for (const r of adj ?? []) r.employee_id && empIds.add(r.employee_id);
      for (const r of assigns ?? []) r.employee_id && empIds.add(r.employee_id);
      for (const r of timeEntries ?? []) r.employee_id && empIds.add(r.employee_id);
      for (const r of rides ?? []) r.driver_id && empIds.add(r.driver_id);
      const { data: emps } = empIds.size
        ? await supabase
            .from("employees")
            .select("id, full_name, profile_status, employer_identification, worker_type, identity_status, requires_identity_resolution, payroll_approval_blocked, original_placeholder_name")
            .in("id", Array.from(empIds))
        : { data: [] as any[] };
      const empMap = new Map<string, any>();
      for (const e of emps ?? []) empMap.set(e.id, e);

      // Phase 2C-B — identity-flagged workers for this tenant. Scoped by
      // company_id, respects RLS. Read-only: we only surface these rows
      // visually; no writes, no payroll enforcement.
      const { data: idFlaggedRaw } = await supabase
        .from("employees")
        .select("id, first_name, last_name, worker_type, identity_status, requires_identity_resolution, payroll_approval_blocked, original_placeholder_name, portal_access_enabled")
        .eq("company_id", cid)
        .or([
          "payroll_approval_blocked.eq.true",
          "requires_identity_resolution.eq.true",
          "worker_type.in.(emergency_worker,legacy_placeholder,imported_placeholder)",
          "identity_status.neq.verified",
        ].join(","));
      const idFlagged = (idFlaggedRaw ?? []) as any[];
      for (const e of idFlagged) {
        if (!empMap.has(e.id)) empMap.set(e.id, e);
      }

      return {
        period,
        pbp: pbp ?? [],
        hist: hist ?? [],
        mvmts: mvmts ?? [],
        adj: adj ?? [],
        rfr: rfr ?? [],
        shifts: shifts ?? [],
        assigns: assigns ?? [],
        timeEntries: timeEntries ?? [],
        closeouts: closeouts ?? [],
        rides: rides ?? [],
        empMap,
        idFlagged,
      };
    },
  });

  // ── Compute buckets ─────────────────────────────────────────────────────
  const buckets: BucketDef[] = useMemo(() => {
    if (!dataQ.data) return [];
    const d = dataQ.data;
    const empName = (id: string | null | undefined) => {
      if (!id) return "(unknown employee)";
      return d.empMap.get(id)?.full_name ?? `Employee ${id.slice(0, 8)}`;
    };
    const empLink = (id: string | null | undefined) =>
      id ? { to: `/app/people/${id}`, label: "Open profile" } : null;

    // Sets for cross-checks
    const teEmpSet = new Set(d.timeEntries.map(t => t.employee_id));
    const teShiftEmpSet = new Set(d.timeEntries.filter(t => t.shift_id).map(t => `${t.shift_id}:${t.employee_id}`));
    const histEmpSet = new Set(d.hist.filter(h => h.matched_employee_id).map(h => h.matched_employee_id));
    const pbpEmpSet = new Set(d.pbp.map(p => p.employee_id));
    const assignEmpSet = new Set(d.assigns.map(a => a.employee_id));
    const closeoutMap = new Map(d.closeouts.map(c => [c.shift_id, c]));
    const shiftMap = new Map(d.shifts.map(s => [s.id, s]));
    const rfrMap = new Map(d.rfr.map(r => [r.employee_id, r]));

    // 1. Ready to review — pbp rows where employee matched + no recon conflict
    const ready: BucketRow[] = d.pbp
      .filter(r => {
        const rec = rfrMap.get(r.employee_id);
        const noConflict = !rec || (rec.conflict_count ?? 0) === 0;
        return r.employee_id && noConflict && !r.is_anomalous;
      })
      .map(r => ({
        key: r.id,
        primary: empName(r.employee_id),
        employeeId: r.employee_id,
        secondary: `${r.total_paid_hours ?? 0}h`,
        amount: Number(r.base_total_pay ?? 0),
        link: empLink(r.employee_id),
      }));

    // 2. Needs employee match
    const needsMatch: BucketRow[] = d.hist
      .filter(h => !h.matched_employee_id || h.needs_identity_review)
      .map(h => ({
        key: h.id,
        primary: h.worker_name_raw ?? "(unnamed)",
        employeeId: h.matched_employee_id ?? null,
        secondary: h.needs_identity_review ? "Identity review flagged" : "No employee match",
        amount: Number(h.base_total_pay ?? 0),
        link: { to: "/app/payroll-reconciliation", label: "Open reconciliation" },
      }));

    // 3. Time mismatch — recon conflict_count > 0, or pbp anomalous
    const timeMismatch: BucketRow[] = [
      ...d.rfr
        .filter(r => (r.conflict_count ?? 0) > 0)
        .map(r => ({
          key: `rfr-${r.id}`,
          primary: empName(r.employee_id),
          employeeId: r.employee_id,
          secondary: `${r.conflict_count} conflict${r.conflict_count === 1 ? "" : "s"} · ${r.reconciliation_status ?? "—"}`,
          amount: Number(r.final_total_pay ?? 0),
          link: empLink(r.employee_id),
        })),
      ...d.pbp
        .filter(r => r.is_anomalous)
        .map(r => ({
          key: `pbp-anom-${r.id}`,
          primary: empName(r.employee_id),
          employeeId: r.employee_id,
          secondary: `Anomaly: ${Object.keys((r.anomaly_flags as any) ?? {}).join(", ") || "flagged"}`,
          amount: Number(r.base_total_pay ?? 0),
          link: empLink(r.employee_id),
        })),
    ];

    // 4. Assignment without clock/pay evidence
    const assignNoEvidence: BucketRow[] = d.assigns
      .filter(a => a.response_status === "accepted")
      .filter(a => {
        const hasTE = teShiftEmpSet.has(`${a.shift_id}:${a.employee_id}`) || teEmpSet.has(a.employee_id);
        const hasPay = histEmpSet.has(a.employee_id) || pbpEmpSet.has(a.employee_id);
        return !hasTE && !hasPay;
      })
      .map(a => {
        const s = shiftMap.get(a.shift_id);
        return {
          key: a.id,
          primary: empName(a.employee_id),
          employeeId: a.employee_id,
          secondary: s ? `${s.shift_code ?? s.title ?? "Shift"} · ${s.date}` : "Shift",
          link: { to: `/app/shifts`, label: "Open shift" },
        };
      });

    // 5. Clock/pay without assignment — dedup by employee_id, combine signals
    const noAssignMap = new Map<string, { hasClock: boolean; hasPay: boolean; payAmount: number; firstClockIn?: string }>();
    for (const t of d.timeEntries) {
      if (assignEmpSet.has(t.employee_id)) continue;
      const cur = noAssignMap.get(t.employee_id) ?? { hasClock: false, hasPay: false, payAmount: 0 };
      cur.hasClock = true;
      if (!cur.firstClockIn && t.clock_in) cur.firstClockIn = t.clock_in;
      noAssignMap.set(t.employee_id, cur);
    }
    for (const r of d.pbp) {
      if (!r.employee_id || assignEmpSet.has(r.employee_id)) continue;
      const cur = noAssignMap.get(r.employee_id) ?? { hasClock: false, hasPay: false, payAmount: 0 };
      cur.hasPay = true;
      cur.payAmount += Number(r.base_total_pay ?? 0);
      noAssignMap.set(r.employee_id, cur);
    }
    const clockNoAssign: BucketRow[] = Array.from(noAssignMap.entries()).map(([empId, info]) => {
      const parts: string[] = [];
      if (info.hasClock) parts.push(`Clock-in ${info.firstClockIn ? format(parseISO(info.firstClockIn), "MMM d HH:mm") : "—"}`);
      if (info.hasPay) parts.push("Pay row exists");
      parts.push("no assignment in period");
      return {
        key: `noassign-${empId}`,
        primary: empName(empId),
        employeeId: empId,
        secondary: parts.join(" · "),
        amount: info.hasPay ? info.payAmount : undefined,
        link: info.hasPay ? empLink(empId) : { to: "/app/timeclock", label: "Open Time Clock" },
      };
    });

    // 6. Day-pay needs validation
    const dayPayShifts = d.shifts.filter(s => s.pay_type === "day_pay" || s.day_type);
    const dayPayValidation: BucketRow[] = dayPayShifts
      .filter(s => {
        const hasHourlyTE = d.timeEntries.some(t => t.shift_id === s.id);
        const noCloseout = !closeoutMap.has(s.id);
        return hasHourlyTE || noCloseout;
      })
      .map(s => {
        const issues: string[] = [];
        if (d.timeEntries.some(t => t.shift_id === s.id)) issues.push("Hourly time entries on day-pay shift");
        if (!closeoutMap.has(s.id)) issues.push("No closeout submitted");
        return {
          key: s.id,
          primary: s.title ?? s.shift_code ?? "Shift",
          secondary: `${s.date} · ${issues.join(" · ")}`,
          link: { to: `/app/shifts`, label: "Open shift" },
        };
      });

    // 7. Driver/transport payment review
    const transport: BucketRow[] = d.rides
      .filter(r => !r.movement_id)
      .map(r => {
        const s = shiftMap.get(r.shift_id);
        return {
          key: r.id,
          primary: empName(r.driver_id),
          employeeId: r.driver_id,
          secondary: `${r.ride_type ?? "ride"} · ${r.passenger_count ?? 0} passengers · no movement linked${s ? ` · ${s.date}` : ""}`,
          link: { to: `/app/movements`, label: "Open movements" },
        };
      });

    // 8. Manual adjustment pending approval
    const adjPending: BucketRow[] = [
      ...d.mvmts
        .filter(m => m.approval_status !== "approved")
        .map(m => ({
          key: `mv-${m.id}`,
          primary: empName(m.employee_id),
          employeeId: m.employee_id,
          secondary: `Movement · ${m.approval_status ?? "pending"}${m.note ? ` · ${m.note}` : ""}`,
          amount: Number(m.total_value ?? 0),
          link: { to: "/app/movements", label: "Open movements" },
          badge: m.approval_status ?? "pending",
        })),
    ];

    // 9. Worker dispute — placeholder via reconciliation_final_records with "dispute" status
    const disputes: BucketRow[] = d.rfr
      .filter(r => (r.reconciliation_status ?? "").toLowerCase().includes("dispute"))
      .map(r => ({
        key: `disp-${r.id}`,
        primary: empName(r.employee_id),
        employeeId: r.employee_id,
        secondary: `Disputed · ${r.reconciliation_status}`,
        amount: Number(r.final_total_pay ?? 0),
        link: empLink(r.employee_id),
      }));

    // 10. Missing docs/profile but payable rows
    const missingDocs: BucketRow[] = d.pbp
      .filter(r => {
        const e = d.empMap.get(r.employee_id);
        if (!e) return false;
        const incomplete = ["incomplete", "needs_review", "draft", "needs_attention"].includes((e.profile_status ?? "").toLowerCase());
        return incomplete && Number(r.base_total_pay ?? 0) > 0;
      })
      .map(r => ({
        key: `doc-${r.id}`,
        primary: empName(r.employee_id),
        employeeId: r.employee_id,
        secondary: `Profile: ${d.empMap.get(r.employee_id)?.profile_status ?? "—"} · has payable row`,
        amount: Number(r.base_total_pay ?? 0),
        link: empLink(r.employee_id),
      }));

    // 11. Closeout conflict
    const closeoutConflict: BucketRow[] = [
      ...d.closeouts
        .filter(c => (c.no_show_count ?? 0) > 0 && d.timeEntries.some(t => t.shift_id === c.shift_id))
        .map(c => {
          const s = shiftMap.get(c.shift_id);
          return {
            key: `co-noshow-${c.id}`,
            primary: s?.title ?? s?.shift_code ?? "Shift",
            secondary: `${s?.date ?? ""} · closeout reports ${c.no_show_count} no-show(s) but time entries exist`,
            link: { to: `/app/shifts`, label: "Open shift" },
          };
        }),
      ...d.shifts
        .filter(s => closeoutMap.has(s.id))
        .filter(s => {
          const c = closeoutMap.get(s.id);
          const expectedPresent = (c?.no_show_count ?? 0) === 0 && d.assigns.some(a => a.shift_id === s.id && a.response_status === "accepted");
          const noTE = !d.timeEntries.some(t => t.shift_id === s.id);
          return expectedPresent && noTE;
        })
        .map(s => ({
          key: `co-present-${s.id}`,
          primary: s.title ?? s.shift_code ?? "Shift",
          secondary: `${s.date} · closeout indicates present but no time entries logged`,
          link: { to: `/app/shifts`, label: "Open shift" },
        })),
    ];

    // 13. Pendiente aprobación final — closeouts approved by María but not
    // final-approved yet. Operational queue only; no payroll writes.
    const pendingFinalApproval: BucketRow[] = d.closeouts
      .filter((c: any) =>
        c.status === "reviewed"
        && c.review_status === "approved"
        && (c.final_approval_status == null || c.final_approval_status === "pending"),
      )
      .map((c: any) => {
        const s = shiftMap.get(c.shift_id);
        return {
          key: `final-${c.id}`,
          primary: s?.title ?? s?.shift_code ?? "Turno",
          secondary: `${s?.date ?? ""} · aprobado por María, pendiente aprobación final`,
          link: { to: `/app/shifts`, label: "Abrir turno" },
        };
      });

    // 12. High-risk / over-threshold
    const highRisk: BucketRow[] = [
      ...d.timeEntries
        .filter(t => t.clock_in && t.clock_out && (new Date(t.clock_out).getTime() - new Date(t.clock_in).getTime()) / 3600000 > 16)
        .map(t => ({
          key: `hr-te-${t.id}`,
          primary: empName(t.employee_id),
          employeeId: t.employee_id,
          secondary: `Duration > 16h (${t.clock_in ? format(parseISO(t.clock_in), "MMM d") : ""})`,
          link: { to: "/app/timeclock", label: "Open Time Clock" },
        })),
      ...d.pbp
        .filter(r => Number(r.base_total_pay ?? 0) > 3000 || Number(r.base_total_pay ?? 0) <= 0)
        .map(r => ({
          key: `hr-pbp-${r.id}`,
          primary: empName(r.employee_id),
          employeeId: r.employee_id,
          secondary: Number(r.base_total_pay ?? 0) <= 0 ? "Zero / negative pay" : "Pay > $3,000",
          amount: Number(r.base_total_pay ?? 0),
          link: empLink(r.employee_id),
        })),
      ...d.hist
        .filter(h => Number(h.base_total_pay ?? 0) > 3000 || Number(h.base_total_pay ?? 0) <= 0)
        .map(h => ({
          key: `hr-hist-${h.id}`,
          primary: h.worker_name_raw ?? "(unnamed)",
          employeeId: h.matched_employee_id ?? null,
          secondary: Number(h.base_total_pay ?? 0) <= 0 ? "Zero / negative imported pay" : "Imported pay > $3,000",
          amount: Number(h.base_total_pay ?? 0),
          link: { to: "/app/payroll-reconciliation", label: "Open reconciliation" },
        })),
    ];

    // ── Operational closeout buckets (read-only) ──────────────────────────
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const pendienteCierre: BucketRow[] = d.shifts
      .filter(s => s.date <= todayIso && !closeoutMap.has(s.id))
      .map(s => ({
        key: `pc-${s.id}`,
        primary: s.title ?? s.shift_code ?? "Turno",
        secondary: `${s.date} · sin cierre enviado por el capitán`,
        link: { to: `/app/shifts`, label: "Abrir bloque" },
      }));

    const enRevisionMaria: BucketRow[] = d.closeouts
      .filter((c: any) => c.status === "submitted")
      .map((c: any) => {
        const s = shiftMap.get(c.shift_id);
        return {
          key: `rm-${c.id}`,
          primary: s?.title ?? s?.shift_code ?? "Turno",
          secondary: `${s?.date ?? ""} · cierre enviado, esperando revisión de María`,
          link: { to: `/app/shifts`, label: "Abrir bloque" },
        };
      });

    const requiereCorreccion: BucketRow[] = d.closeouts
      .filter((c: any) =>
        c.status === "rejected"
        || ["needs_followup", "rejected"].includes((c.review_status ?? "") as string)
      )
      .map((c: any) => {
        const s = shiftMap.get(c.shift_id);
        return {
          key: `rc-${c.id}`,
          primary: s?.title ?? s?.shift_code ?? "Turno",
          secondary: `${s?.date ?? ""} · ${c.review_status === "needs_followup" ? "requiere seguimiento" : "rechazado · necesita corrección"}`,
          link: { to: `/app/shifts`, label: "Abrir bloque" },
        };
      });

    const listoParaPago: BucketRow[] = d.closeouts
      .filter((c: any) => c.final_approval_status === "approved")
      .map((c: any) => {
        const s = shiftMap.get(c.shift_id);
        return {
          key: `lp-${c.id}`,
          primary: s?.title ?? s?.shift_code ?? "Turno",
          secondary: `${s?.date ?? ""} · aprobación final completada`,
          link: { to: `/app/shifts`, label: "Ver bloque" },
        };
      });

    const fichajesAbiertos: BucketRow[] = d.timeEntries
      .filter(t => !!t.clock_in && !t.clock_out)
      .map(t => {
        const s = t.shift_id ? shiftMap.get(t.shift_id) : null;
        return {
          key: `fa-${t.id}`,
          primary: empName(t.employee_id),
          employeeId: t.employee_id,
          secondary: `${s ? `${s.title ?? s.shift_code ?? "Turno"} · ` : ""}entrada ${t.clock_in ? format(parseISO(t.clock_in), "MMM d HH:mm") : "—"} · falta salida`,
          link: { to: `/app/timeclock`, label: "Abrir reloj" },
        };
      });

    // Phase 2C-B — Bloqueado · Identidad pendiente (visual, read-only).
    // Surface identity-flagged workers with any period-related context.
    // Priority: payroll_approval_blocked > requires_identity_resolution >
    // worker_type placeholder > identity_status != verified.
    const identityBlocked: BucketRow[] = (d.idFlagged ?? []).map((e: any) => {
      const reasons: string[] = [];
      if (e.payroll_approval_blocked) reasons.push("Payroll bloqueado");
      const wt = e.worker_type as string | null;
      if (wt === "emergency_worker") reasons.push("Emergency worker");
      else if (wt === "legacy_placeholder") reasons.push("Legacy placeholder");
      else if (wt === "imported_placeholder") reasons.push("Imported placeholder");
      if (e.requires_identity_resolution) reasons.push("Identidad pendiente");
      else if (e.identity_status && e.identity_status !== "verified") reasons.push(`Estado: ${e.identity_status}`);

      // Period-linked evidence counts (visual only)
      const eid = e.id;
      const pbpN = d.pbp.filter(r => r.employee_id === eid).length;
      const histN = d.hist.filter(r => r.matched_employee_id === eid).length;
      const teN = d.timeEntries.filter(t => t.employee_id === eid).length;
      const asgN = d.assigns.filter(a => a.employee_id === eid).length;
      const adjN = d.adj.filter(r => r.employee_id === eid).length;
      const evidence: string[] = [];
      if (pbpN) evidence.push(`${pbpN} fila(s) de pago`);
      if (histN) evidence.push(`${histN} import`);
      if (teN) evidence.push(`${teN} fichaje(s)`);
      if (asgN) evidence.push(`${asgN} asignación(es)`);
      if (adjN) evidence.push(`${adjN} ajuste(s)`);
      const evLabel = evidence.length ? evidence.join(" · ") : "Sin items de payroll en este periodo";

      const composedName = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
      const displayName = composedName || e.original_placeholder_name || `Worker ${eid.slice(0, 8)}`;
      return {
        key: `idblock-${eid}`,
        primary: displayName,
        employeeId: eid,
        secondary: `${reasons.join(" · ") || "Identidad no verificada"} · ${evLabel}`,
        badge: e.payroll_approval_blocked ? "Payroll bloqueado" : "Identidad pendiente",
        link: { to: `/app/employees/${eid}`, label: "Ver / resolver identidad" },
      };
    })
    // Priority: payroll_approval_blocked first, then pending resolution, then placeholders.
    .sort((a, b) => {
      const rank = (r: BucketRow) =>
        r.badge === "Payroll bloqueado" ? 0 : r.badge === "Identidad pendiente" ? 1 : 2;
      return rank(a) - rank(b);
    });

    return [
      // ── Identity blocker (Phase 2C-B) ──
      { id: "identity-blocked", title: "Bloqueado · Identidad pendiente", description: "Workers con identidad no verificada o payroll bloqueado. Revisa o resuelve la identidad antes de aprobar payroll. Solo visual — no modifica pagos ni fichajes.", severity: "block", affectsPay: false, rows: identityBlocked },
      { id: "requiere-correccion", title: "Requiere corrección",        description: "Cierres rechazados o que requieren seguimiento del capitán o María.", severity: "block", affectsPay: false, rows: requiereCorreccion },
      { id: "fichajes-abiertos",   title: "Con fichajes abiertos",      description: "Hay entradas sin salida registrada. Cerrar o validar antes del pago.", severity: "block", affectsPay: false, rows: fichajesAbiertos },
      { id: "pendiente-cierre",    title: "Pendiente cierre del turno", description: "Turnos ya ocurridos sin cierre enviado por el capitán.",               severity: "warn",  affectsPay: false, rows: pendienteCierre },
      { id: "en-revision-maria",   title: "En revisión de María",       description: "Cierres enviados, esperando revisión operativa de María.",            severity: "warn",  affectsPay: false, rows: enRevisionMaria },
      { id: "pending-final",       title: "Pendiente aprobación final", description: "Cierres aprobados por María, esperando aprobación final (Keury). No representa pago.", severity: "info", affectsPay: false, rows: pendingFinalApproval },
      { id: "listo-pago",          title: "Listo para proceso de pago", description: "Aprobación final completada. Pasa al flujo de payroll y reconciliación.", severity: "info", affectsPay: false, rows: listoParaPago },
      // ── Payroll-evidence buckets (existing) ──
      { id: "ready",          title: "Listas para revisar",              description: "Filas con empleado verificado, sin conflictos ni anomalías.",                severity: "info",  affectsPay: true,  rows: ready },
      { id: "needs-match",    title: "Falta vincular empleado",          description: "Filas sin match desde imports históricos (Connecteam).",                     severity: "block", affectsPay: true,  rows: needsMatch },
      { id: "time-mismatch",  title: "Diferencia de horas",              description: "Variación detectada por reconciliación o anomalía en la fila de pago.",      severity: "warn",  affectsPay: true,  rows: timeMismatch },
      { id: "assign-no-ev",   title: "Asignación sin fichaje ni pago",   description: "Worker aceptó el turno pero no hay fichaje ni fila de pago.",                severity: "warn",  affectsPay: true,  rows: assignNoEvidence },
      { id: "ev-no-assign",   title: "Fichaje o pago sin asignación",    description: "Hay fichaje o fila de pago pero el worker no estaba asignado en el periodo.",severity: "warn",  affectsPay: true,  rows: clockNoAssign },
      { id: "day-pay",        title: "Pago por día — falta validación",  description: "Turno de pago por día con entradas por hora o sin cierre.",                  severity: "warn",  affectsPay: true,  rows: dayPayValidation },
      { id: "transport",      title: "Transporte sin movimiento",        description: "Viaje registrado sin movimiento vinculado.",                                 severity: "warn",  affectsPay: true,  rows: transport },
      { id: "adj-pending",    title: "Ajuste manual pendiente",          description: "Movimientos esperando aprobación.",                                          severity: "block", affectsPay: true,  rows: adjPending },
      { id: "dispute",        title: "Disputa de worker",                description: "Filas marcadas como disputadas en reconciliación.",                          severity: "warn",  affectsPay: true,  rows: disputes },
      { id: "missing-docs",   title: "Falta documentación / perfil",     description: "Worker con fila pagable pero perfil incompleto (advertencia de gobierno).", severity: "info",  affectsPay: false, rows: missingDocs },
      { id: "closeout",       title: "Conflicto de cierre",              description: "La evidencia del cierre diario no coincide con la evidencia de payroll.",    severity: "warn",  affectsPay: false, rows: closeoutConflict },
      { id: "high-risk",      title: "Alto riesgo / fuera de umbral",    description: "Duración > 16h, pago > $3,000, o pago en cero/negativo.",                    severity: "block", affectsPay: true,  rows: highRisk },
    ];
  }, [dataQ.data]);

  // S15 — which buckets contain the focused employee (if any), and whether
  // that employee is present anywhere in the loaded review queue.
  const focusedBucketIds = useMemo(() => {
    if (!focusEmployeeId) return [] as string[];
    return buckets
      .filter(b => b.rows.some(r => r.employeeId === focusEmployeeId))
      .map(b => b.id);
  }, [buckets, focusEmployeeId]);
  const focusedEmployeePresent = focusedBucketIds.length > 0;
  const [focusScrolled, setFocusScrolled] = useState<string | null>(null);
  useEffect(() => {
    if (!focusEmployeeId || !focusedEmployeePresent) return;
    if (focusScrolled === focusEmployeeId) return;
    const timers: number[] = [];
    const attempt = () => {
      const el = document.querySelector(
        `[data-employee-id="${CSS.escape(focusEmployeeId)}"]`,
      );
      if (el) {
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
        setFocusScrolled(focusEmployeeId);
        return true;
      }
      return false;
    };
    [80, 300, 700, 1400].forEach(d => {
      timers.push(window.setTimeout(() => {
        if (focusScrolled === focusEmployeeId) return;
        attempt();
      }, d));
    });
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [focusEmployeeId, focusedEmployeePresent, focusScrolled]);


  // ── Early returns AFTER all hooks ───────────────────────────────────────
  if (companyLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!selectedCompanyId) {
    return (
      <Card className="max-w-xl mx-auto mt-12">
        <CardHeader><CardTitle>Selecciona una empresa</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Elige un tenant en el selector de empresa para cargar el Centro de Validación.</CardContent>
      </Card>
    );
  }
  if (!canAccess) {
    return <Navigate to="/app" replace />;
  }

  const periods = mergedPeriods;
  const pbpCounts = periodsQ.data?.pbpCounts ?? {};
  const totalsBySeverity = buckets.reduce((acc, b) => {
    acc[b.severity] = (acc[b.severity] ?? 0) + b.rows.length;
    return acc;
  }, {} as Record<Severity, number>);
  const pendienteCierreCount = buckets.find(b => b.id === "pendiente-cierre")?.rows.length ?? 0;
  const enRevisionMariaCount = buckets.find(b => b.id === "en-revision-maria")?.rows.length ?? 0;
  const pendingFinalCount = buckets.find(b => b.id === "pending-final")?.rows.length ?? 0;
  const listoPagoCount = buckets.find(b => b.id === "listo-pago")?.rows.length ?? 0;
  const alertasCount = (totalsBySeverity.warn ?? 0) + (totalsBySeverity.block ?? 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          variant="3"
          title="Centro de Validación"
          subtitle={`${selectedCompany?.name ?? "Empresa"} · revisa cierres, horas y aprobaciones antes del proceso de pago`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-primary/30 text-primary">
            <ShieldCheck className="h-3 w-3" /> Evidencia operativa
          </Badge>
          <Badge variant="outline" className="gap-1.5 border-muted-foreground/30 text-muted-foreground">
            <Lock className="h-3 w-3" /> Solo lectura
          </Badge>
        </div>
      </div>

      <PayrollSourceGuardrailBanner />

      {/* S16 — Period resolver banners (read-only, tenant-scoped). */}
      {resolvedFromUrl && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-2.5 px-4 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary">
              <ScanEye className="h-3 w-3" /> {REVIEW_COPY.bannerFromReview}
            </Badge>
            <span className="text-muted-foreground">
              Período cargado por deep-link · {REVIEW_COPY.readOnlyNote.toLowerCase()}.
            </span>
          </CardContent>
        </Card>
      )}
      {resolveNotFound && (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="py-2.5 px-4 flex flex-wrap items-center gap-2 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{REVIEW_COPY.notFoundInRange} · mostrando período por defecto.</span>
          </CardContent>
        </Card>
      )}


      {/* S15/S19 — Root-Cause context banner (read-only hint). */}
      {(reasonHuman || focusEmployeeId) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3 px-4 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary">
              <ScanEye className="h-3 w-3" /> {REVIEW_COPY.bannerFromReview}
            </Badge>
            {reasonHuman && (
              <span className="text-foreground">
                {REVIEW_COPY.bannerRootCausePrefix}: <span className="font-semibold">{reasonHuman}</span>
              </span>
            )}
            {focusEmployeeId && focusedEmployeePresent && (
              <span className="text-muted-foreground">
                · Enfocando worker en la cola
              </span>
            )}
            {focusEmployeeId && !focusedEmployeePresent && (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-warning">
                <AlertTriangle className="h-3 w-3" />
                Empleado {REVIEW_COPY.notFoundInRange.toLowerCase()}
              </span>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {REVIEW_COPY.readOnlyNote}
            </span>
          </CardContent>
        </Card>
      )}





      {/* Period selector */}
      <Card>
        <CardContent className="py-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Periodo</div>
          <Select
            value={effectivePeriodId ?? ""}
            onValueChange={(v) => setSelectedPeriodId(v)}
            disabled={periodsQ.isLoading || periods.length === 0}
          >
            <SelectTrigger className="md:w-[460px]"><SelectValue placeholder="Selecciona un periodo…" /></SelectTrigger>
            <SelectContent>
              {periods.map(p => {
                const future = isFuturePeriod(p);
                const pbp = pbpCounts[p.id] ?? 0;
                return (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{p.sequence_number ?? "—"}</span>
                      <span>{format(parseISO(p.start_date), "MMM d")} – {format(parseISO(p.end_date), "MMM d, yyyy")}</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 capitalize">{p.status ?? "—"}</Badge>
                      {future && <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-warning/40 text-warning">futuro</Badge>}
                      {pbp > 0 && <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-earning/40 text-earning">{pbp} filas</Badge>}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {selectedPeriod && isFuturePeriod(selectedPeriod) && (
            <Badge variant="outline" className="gap-1.5 border-warning/40 text-warning">
              <CalendarX className="h-3 w-3" /> Periodo futuro — puede no haber datos
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Link to="/app/payroll-reconciliation"><ExternalLink className="h-3.5 w-3.5" /> Reconciliación</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Link to="/app/periods"><ExternalLink className="h-3.5 w-3.5" /> Periodos</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard icon={ClipboardList} label="Pendiente cierre"        value={pendienteCierreCount} tone="warning" />
        <SummaryCard icon={ScanEye}        label="En revisión de María"    value={enRevisionMariaCount} tone="warning" />
        <SummaryCard icon={ShieldCheck}    label="Pendiente aprob. final"  value={pendingFinalCount}    tone="warning" />
        <SummaryCard icon={CheckCircle2}   label="Listos para proc. de pago" value={listoPagoCount}     tone="earning" />
        <SummaryCard icon={AlertTriangle}  label="Con alertas"             value={alertasCount}         tone="destructive" />
      </div>


      {/* Empty / loading states */}
      {(periodsQ.isLoading || dataQ.isLoading) && (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Cargando bloques de validación…</p>
        </div>
      )}
      {!periodsQ.isLoading && periods.length === 0 && (
        <EmptyState icon={CalendarX} title="Sin periodos configurados" description="Esta empresa todavía no tiene periodos de pago." />
      )}
      {!dataQ.isLoading && dataQ.data && (
        <>
          {selectedPeriod && isFuturePeriod(selectedPeriod) && buckets.every(b => b.rows.length === 0) && (
            <EmptyState
              icon={CalendarX}
              title="Periodo futuro — aún no hay datos"
              description="Cambia a un periodo actual o pasado para ver bloques reales. El selector marca los periodos futuros."
            />
          )}
          {selectedPeriod && !isFuturePeriod(selectedPeriod) && (pbpCounts[selectedPeriod.id] ?? 0) === 0 &&
            (dataQ.data.hist.length === 0) && (dataQ.data.mvmts.length === 0) && (dataQ.data.adj.length === 0) && (
              <EmptyState
                icon={Info}
                title="Sin datos de payroll en este periodo"
                description="No hay filas importadas, movimientos ni ajustes. El periodo existe pero todavía no se cargó nada."
              />
            )}


          {/* Bucket accordion.
              S4: if `?bucket=` is present and valid, only that bucket opens
              by default; otherwise all non-empty buckets open as before.
              Mobile: each row is a tappable card that opens a drawer-per-row
              with the full row detail (drawer-per-row pattern). */}
          {buckets.some(b => b.rows.length > 0) && (() => {
            const validFocus = focusedBucket && buckets.some(b => b.id === focusedBucket) ? focusedBucket : null;
            const baseOpen = validFocus
              ? [validFocus]
              : buckets.filter(b => b.rows.length > 0).map(b => b.id);
            // S15 — also expand any bucket that contains the focused worker.
            const defaultOpen = Array.from(new Set([...baseOpen, ...focusedBucketIds]));
            return (
              <Accordion type="multiple" defaultValue={defaultOpen} className="space-y-2">
                {buckets.map(b => {
                  const sev = SEVERITY_STYLE[b.severity];
                  const SevIcon = sev.icon;
                  const isFocused = validFocus === b.id || focusedBucketIds.includes(b.id);
                  return (
                    <AccordionItem
                      key={b.id}
                      value={b.id}
                      className={cn(
                        "border rounded-lg px-3 bg-card",
                        isFocused && "ring-2 ring-primary/40",
                      )}
                    >
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3 w-full">
                          <span className={cn("h-2 w-2 rounded-full shrink-0", sev.dot)} />
                          <SevIcon className={cn("h-4 w-4 shrink-0",
                            b.severity === "block" ? "text-destructive" : b.severity === "warn" ? "text-warning" : "text-muted-foreground"
                          )} />
                          <span className="text-sm font-semibold text-left">{b.title}</span>
                          <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 hidden sm:inline-flex", sev.chip)}>{sev.label}</Badge>
                          {b.affectsPay && <Badge variant="outline" className="text-[10px] py-0 px-1.5 hidden sm:inline-flex">Afecta pago</Badge>}
                          <span className="ml-auto text-sm font-mono tabular-nums text-muted-foreground">{b.rows.length}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3">
                        <p className="text-xs text-muted-foreground mb-3">{b.description}</p>
                        {b.rows.length === 0 ? (
                          <div className="text-xs text-muted-foreground py-2 flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-earning" /> No hay bloques pendientes en esta etapa.
                          </div>
                        ) : isMobile ? (
                          <div className="space-y-2">
                            {b.rows.slice(0, 100).map(r => {
                              const rowFocused = !!focusEmployeeId && r.employeeId === focusEmployeeId;
                              return (
                              <MobileQueueRow
                                key={r.key}
                                onClick={() => setDrawerRow({ row: r, bucket: b })}
                                primary={r.primary}
                                secondary={r.secondary}
                                data-employee-id={r.employeeId ?? undefined}
                                className={cn(
                                  "scroll-mt-24",
                                  rowFocused && "ring-2 ring-primary/60 bg-primary/5 border-primary/40",
                                )}
                                topMeta={rowFocused ? (
                                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-primary/50 text-primary">foco</Badge>
                                ) : undefined}
                                rightSlot={typeof r.amount === "number" ? (
                                  <div className="text-sm font-mono tabular-nums">
                                    {moneyFmt.format(r.amount)}
                                  </div>
                                ) : undefined}
                              />
                              );
                            })}
                            {b.rows.length > 100 && (
                              <div className="pt-2 text-xs text-muted-foreground">
                                Mostrando los primeros 100 de {b.rows.length} bloques.
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="divide-y divide-border/50">
                            {b.rows.slice(0, 100).map(r => {
                              const rowFocused = !!focusEmployeeId && r.employeeId === focusEmployeeId;
                              return (
                              <div
                                key={r.key}
                                data-employee-id={r.employeeId ?? undefined}
                                className={cn(
                                  "flex items-center gap-3 py-2 scroll-mt-24 rounded-md px-2 -mx-2",
                                  rowFocused && "ring-2 ring-primary/60 bg-primary/5",
                                )}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium truncate flex items-center gap-2">
                                    {rowFocused && (
                                      <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-primary/50 text-primary shrink-0">foco</Badge>
                                    )}
                                    <span className="truncate">{r.primary}</span>
                                  </div>
                                  {r.secondary && <div className="text-xs text-muted-foreground truncate">{r.secondary}</div>}
                                </div>
                                {typeof r.amount === "number" && (
                                  <div className="text-sm font-mono tabular-nums text-right shrink-0 w-24">
                                    {moneyFmt.format(r.amount)}
                                  </div>
                                )}
                                {r.link && (
                                  <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1 shrink-0">
                                    <Link to={r.link.to}>{r.link.label}<ExternalLink className="h-3 w-3" /></Link>
                                  </Button>
                                )}
                              </div>
                              );
                            })}
                            {b.rows.length > 100 && (
                              <div className="pt-2 text-xs text-muted-foreground">
                                Mostrando los primeros 100 de {b.rows.length} bloques.
                              </div>
                            )}
                          </div>
                        )}

                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            );
          })()}

          {/* Mobile drawer-per-row (read-only detail + existing CTA if any) */}
          {(() => {
            const dr = drawerRow;
            if (!dr) {
              return (
                <MobileQueueDrawer
                  open={false}
                  onOpenChange={(o) => !o && setDrawerRow(null)}
                  maxHeightClassName="max-h-[85dvh]"
                />
              );
            }
            const { row, bucket } = dr;
            const sev = SEVERITY_STYLE[bucket.severity];
            const SevIcon = sev.icon;
            return (
              <MobileQueueDrawer
                open={!!drawerRow}
                onOpenChange={(o) => !o && setDrawerRow(null)}
                maxHeightClassName="max-h-[85dvh]"
                headerMeta={
                  <>
                    <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 gap-1", sev.chip)}>
                      <SevIcon className="h-3 w-3" /> {bucket.title}
                    </Badge>
                    {bucket.affectsPay && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">Afecta pago</Badge>
                    )}
                    {row.badge && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 capitalize">{row.badge}</Badge>
                    )}
                  </>
                }
                title={row.primary}
                description={row.secondary}
                footer={row.link ? (
                  <Button asChild className="w-full gap-2" onClick={() => setDrawerRow(null)}>
                    <Link to={row.link.to}>
                      {row.link.label}
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : undefined}
              >
                {typeof row.amount === "number" && (
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Monto</span>
                    <span className="text-base font-mono tabular-nums">{moneyFmt.format(row.amount)}</span>
                  </div>
                )}
                <div className="rounded-lg border bg-background px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
                  {bucket.description}
                </div>
                <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                  Solo lectura. Payroll real sigue basado en Connecteam y reconciliación. No se modifican fichajes ni periodos desde este detalle.
                </p>
              </MobileQueueDrawer>
            );
          })()}
        </>
      )}

      {/* Footer safety copy */}
      <p className="text-[11px] text-muted-foreground text-center pt-2 border-t border-border/30">
        Este centro valida evidencia operativa. El pago final se procesa desde payroll y reconciliación. Connecteam sigue siendo la autoridad de payroll.
      </p>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon, label, value, tone,
}: { icon: typeof Info; label: string; value: number; tone: "earning" | "warning" | "destructive" | "muted" }) {
  const toneCls =
    tone === "earning" ? "text-earning" :
    tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" :
    "text-muted-foreground";
  return (
    <Card>
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <Icon className={cn("h-4 w-4 shrink-0", toneCls)} />
        <div className="min-w-0">
          <div className={cn("text-2xl font-semibold tabular-nums leading-none", toneCls)}>{value}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 truncate">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Info; title: string; description: string }) {
  return (
    <Card>
      <CardContent className="py-12 flex flex-col items-center text-center gap-2">
        <Icon className="h-8 w-8 text-muted-foreground/40" />
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground max-w-md">{description}</div>
      </CardContent>
    </Card>
  );
}
