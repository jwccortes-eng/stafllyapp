import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import {
  ChevronDown,
  Wallet,
  Loader2,
  Clock,
  MapPin,
  Coffee,
  Car,
  Receipt,
  CircleDollarSign,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";

// ============================================================================
// Types
// ============================================================================

type PeriodStatus = "open" | "closed" | "published" | "paid";

interface PeriodInfo {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  published_at: string | null;
  paid_at: string | null;
}

interface ShiftEntry {
  entry_id: string;
  shift_id: string | null;
  date: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  hours: number;
  shift_title: string | null;
  client_name: string | null;
  location_name: string | null;
  hourly_rate: number;
  shift_total: number;
  is_open: boolean;
}

interface MovementDetail {
  id: string;
  concept_name: string;
  category: "extra" | "deduction" | string;
  bucket: "base" | "tips" | "ride" | "reimbursement" | "other_extra" | "deduction";
  quantity: number | null;
  rate: number | null;
  total_value: number;
  note: string | null;
}

interface PaymentRow {
  period_id: string;
  start_date: string;
  end_date: string;
  status_label: PeriodStatus;
  base_total_pay: number;
  tips_total: number;
  ride_total: number;
  reimbursements_total: number;
  other_extras_total: number;
  deductions_total: number;
  total_final_pay: number;
}

// ============================================================================
// Helpers
// ============================================================================

function formatPeriodLabel(start: string, end: string): string {
  try {
    const s = parseISO(start);
    const e = parseISO(end);
    return `${format(s, "MMM d", { locale: enUS })} – ${format(e, "MMM d", { locale: enUS })}`;
  } catch {
    return `${start} – ${end}`;
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "h:mm a");
  } catch {
    return "—";
  }
}

function formatDay(iso: string): string {
  try {
    return format(parseISO(iso), "EEE, MMM d", { locale: enUS });
  } catch {
    return iso;
  }
}

/**
 * Classify a movement into a user-facing earnings bucket.
 *
 * The Connecteam-style payroll model means many "shift jobs" are recorded as
 * `extra` movements (e.g. "Weekend Job", "Daily Pay", "Half Day") instead of
 * coming from time_entries — those are the worker's *base pay* and must show
 * as such in the breakdown, not as "Other extras".
 *
 * See mem://business-logic/connecteam-payroll-model.
 */
function classifyMovement(name: string, category: string): MovementDetail["bucket"] {
  const n = (name || "").toLowerCase().trim();
  if (category === "deduction") return "deduction";

  // Tips
  if (n.includes("propina") || n.includes("tip")) return "tips";

  // Ride / transport — treat "horas de viaje" as ride compensation, not base.
  if (
    n.includes("transporte") ||
    n.includes("transport") ||
    n.includes("ride") ||
    n.includes("viaje")
  ) {
    return "ride";
  }

  // Reimbursements
  if (n.includes("reintegro") || n.includes("reimburs")) return "reimbursement";

  // Shift-pattern base pay (Connecteam model)
  if (
    n.includes("weekend job") ||
    n.includes("weekend") ||
    n.includes("daily pay") ||
    n.includes("daily") ||
    n.includes("half day") ||
    n.includes("media jornada") ||
    n.includes("jornada") ||
    n.includes("full day") ||
    n.includes("base pay") ||
    n.includes("regular hours") ||
    n.includes("horas regulares")
  ) {
    return "base";
  }

  return "other_extra";
}

function deriveStatus(p: PeriodInfo): PeriodStatus {
  if (p.paid_at) return "paid";
  if (p.published_at) return "published";
  if (p.status === "closed") return "closed";
  return "open";
}

function statusBadge(s: PeriodStatus) {
  switch (s) {
    case "paid":
      return { label: "Paid", cls: "bg-[hsl(var(--status-confirmed)/0.12)] text-[hsl(var(--status-confirmed))]" };
    case "published":
      return { label: "Published", cls: "bg-primary/10 text-primary" };
    case "closed":
      return { label: "Processing", cls: "bg-warning/15 text-warning" };
    default:
      return { label: "In progress", cls: "bg-muted text-muted-foreground" };
  }
}

function entryHours(clockIn: string, clockOut: string | null, breakMinutes: number): number {
  if (!clockOut) return 0;
  const inMs = new Date(clockIn).getTime();
  const outMs = new Date(clockOut).getTime();
  if (!isFinite(inMs) || !isFinite(outMs) || outMs <= inMs) return 0;
  const raw = (outMs - inMs) / 3600_000;
  const net = raw - (breakMinutes || 0) / 60;
  return Math.max(0, Math.round(net * 100) / 100);
}

// ============================================================================
// Component
// ============================================================================

export default function MyPayments() {
  const { employeeId } = useAuth();
  const { effectiveEmployeeId } = useEffectiveEmployee();

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<PeriodInfo | null>(null);
  const [currentShifts, setCurrentShifts] = useState<ShiftEntry[]>([]);
  const [currentMovements, setCurrentMovements] = useState<MovementDetail[]>([]);
  const [currentBasePay, setCurrentBasePay] = useState<number | null>(null);
  const [history, setHistory] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const [periodDetails, setPeriodDetails] = useState<Record<string, MovementDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  // ----- Load history details on demand -----
  const loadPeriodDetails = useCallback(
    async (periodId: string) => {
      if (periodDetails[periodId]) return;
      if (!effectiveEmployeeId) return;
      setLoadingDetails(periodId);
      const { data } = await supabase
        .from("movements")
        .select("id, total_value, quantity, rate, note, concepts(name, category)")
        .eq("employee_id", effectiveEmployeeId)
        .eq("period_id", periodId);
      const details: MovementDetail[] = (data ?? []).map((m: any) => {
        const name = m.concepts?.name ?? "";
        const category = m.concepts?.category ?? "extra";
        return {
          id: m.id,
          concept_name: name,
          category,
          bucket: classifyMovement(name, category),
          quantity: m.quantity,
          rate: m.rate,
          total_value: Number(m.total_value) || 0,
          note: m.note,
        };
      });
      setPeriodDetails((prev) => ({ ...prev, [periodId]: details }));
      setLoadingDetails(null);
    },
    [effectiveEmployeeId, periodDetails],
  );

  const toggleExpand = useCallback(
    (periodId: string) => {
      if (expandedPeriod === periodId) setExpandedPeriod(null);
      else {
        setExpandedPeriod(periodId);
        loadPeriodDetails(periodId);
      }
    },
    [expandedPeriod, loadPeriodDetails],
  );

  // ----- Initial load: company, current period, shifts, movements, history -----
  useEffect(() => {
    if (!effectiveEmployeeId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);

      // 1. Get employee's company
      const { data: empData } = await supabase
        .from("employees")
        .select("company_id")
        .eq("id", effectiveEmployeeId!)
        .maybeSingle();

      if (cancelled) return;
      if (!empData) {
        setLoading(false);
        return;
      }
      setCompanyId(empData.company_id);

      // 2. Find the most recent (current/open) period for this company
      const today = new Date().toISOString().slice(0, 10);
      const { data: openPeriod } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date, status, published_at, paid_at")
        .eq("company_id", empData.company_id)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fallback: most recent period if no period contains today
      let activePeriod: PeriodInfo | null = openPeriod
        ? (openPeriod as PeriodInfo)
        : null;

      if (!activePeriod) {
        const { data: latest } = await supabase
          .from("pay_periods")
          .select("id, start_date, end_date, status, published_at, paid_at")
          .eq("company_id", empData.company_id)
          .order("start_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        activePeriod = latest as PeriodInfo | null;
      }

      if (cancelled) return;
      setCurrentPeriod(activePeriod);

      // 3. Load real time_entries for the active period (REAL CLOCK HOURS ONLY)
      if (activePeriod) {
        const startISO = `${activePeriod.start_date}T00:00:00`;
        const endISO = `${activePeriod.end_date}T23:59:59`;

        const [entriesRes, basePayRes, currentMovRes] = await Promise.all([
          supabase
            .from("time_entries")
            .select(
              "id, shift_id, clock_in, clock_out, break_minutes, status, scheduled_shifts(title, client_id, location_id, clients(name), locations(name))",
            )
            .eq("employee_id", effectiveEmployeeId!)
            .eq("company_id", empData.company_id)
            .gte("clock_in", startISO)
            .lte("clock_in", endISO)
            .in("status", ["approved", "pending"])
            .order("clock_in", { ascending: false }),
          supabase
            .from("period_base_pay")
            .select("base_total_pay, total_paid_hours")
            .eq("employee_id", effectiveEmployeeId!)
            .eq("period_id", activePeriod.id)
            .maybeSingle(),
          supabase
            .from("movements")
            .select("id, total_value, quantity, rate, note, concepts(name, category)")
            .eq("employee_id", effectiveEmployeeId!)
            .eq("period_id", activePeriod.id),
        ]);

        // Get active hourly rate (compensation_profiles)
        const { data: compProfile } = await supabase
          .from("compensation_profiles")
          .select("default_hourly_rate, inferred_hourly_rate")
          .eq("employee_id", effectiveEmployeeId!)
          .eq("is_active", true)
          .maybeSingle();

        const hourlyRate =
          Number(compProfile?.default_hourly_rate) ||
          Number(compProfile?.inferred_hourly_rate) ||
          0;

        const shifts: ShiftEntry[] = (entriesRes.data ?? []).map((e: any) => {
          const hrs = entryHours(e.clock_in, e.clock_out, e.break_minutes ?? 0);
          const ss = e.scheduled_shifts ?? null;
          return {
            entry_id: e.id,
            shift_id: e.shift_id,
            date: e.clock_in,
            clock_in: e.clock_in,
            clock_out: e.clock_out,
            break_minutes: e.break_minutes ?? 0,
            hours: hrs,
            shift_title: ss?.title ?? null,
            client_name: ss?.clients?.name ?? null,
            location_name: ss?.locations?.name ?? null,
            hourly_rate: hourlyRate,
            shift_total: hrs * hourlyRate,
            is_open: !e.clock_out,
          };
        });

        const movements: MovementDetail[] = (currentMovRes.data ?? []).map((m: any) => {
          const name = m.concepts?.name ?? "";
          const category = m.concepts?.category ?? "extra";
          return {
            id: m.id,
            concept_name: name,
            category,
            bucket: classifyMovement(name, category),
            quantity: m.quantity,
            rate: m.rate,
            total_value: Number(m.total_value) || 0,
            note: m.note,
          };
        });

        if (cancelled) return;
        setCurrentShifts(shifts);
        setCurrentMovements(movements);
        setCurrentBasePay(basePayRes.data ? Number(basePayRes.data.base_total_pay) : null);
      }

      // 4. Load payment history (published / paid periods)
      const { data: historyPeriods } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date, status, published_at, paid_at")
        .eq("company_id", empData.company_id)
        .not("published_at", "is", null)
        .order("start_date", { ascending: false })
        .limit(24);

      if (cancelled) return;

      const ids = (historyPeriods ?? []).map((p: any) => p.id);
      if (ids.length === 0) {
        setHistory([]);
        setLoading(false);
        return;
      }

      const periodMap = new Map<string, PeriodInfo>();
      (historyPeriods ?? []).forEach((p: any) => periodMap.set(p.id, p as PeriodInfo));

      const [bpRes, movRes] = await Promise.all([
        supabase
          .from("period_base_pay")
          .select("period_id, base_total_pay")
          .eq("employee_id", effectiveEmployeeId!)
          .in("period_id", ids),
        supabase
          .from("movements")
          .select("period_id, total_value, concepts(name, category)")
          .eq("employee_id", effectiveEmployeeId!)
          .in("period_id", ids),
      ]);

      const rowMap = new Map<string, PaymentRow>();

      (bpRes.data ?? []).forEach((bp: any) => {
        const info = periodMap.get(bp.period_id);
        if (!info) return;
        rowMap.set(bp.period_id, {
          period_id: bp.period_id,
          start_date: info.start_date,
          end_date: info.end_date,
          status_label: deriveStatus(info),
          base_total_pay: Number(bp.base_total_pay) || 0,
          tips_total: 0,
          ride_total: 0,
          reimbursements_total: 0,
          other_extras_total: 0,
          deductions_total: 0,
          total_final_pay: 0,
        });
      });

      (movRes.data ?? []).forEach((m: any) => {
        if (!rowMap.has(m.period_id)) {
          const info = periodMap.get(m.period_id);
          if (!info) return;
          rowMap.set(m.period_id, {
            period_id: m.period_id,
            start_date: info.start_date,
            end_date: info.end_date,
            status_label: deriveStatus(info),
            base_total_pay: 0,
            tips_total: 0,
            ride_total: 0,
            reimbursements_total: 0,
            other_extras_total: 0,
            deductions_total: 0,
            total_final_pay: 0,
          });
        }
        const row = rowMap.get(m.period_id)!;
        const bucket = classifyMovement(m.concepts?.name ?? "", m.concepts?.category ?? "extra");
        const v = Number(m.total_value) || 0;
        if (bucket === "base") row.base_total_pay += v;
        else if (bucket === "tips") row.tips_total += v;
        else if (bucket === "ride") row.ride_total += v;
        else if (bucket === "reimbursement") row.reimbursements_total += v;
        else if (bucket === "deduction") row.deductions_total += v;
        else row.other_extras_total += v;
      });

      rowMap.forEach((r) => {
        r.total_final_pay =
          r.base_total_pay +
          r.tips_total +
          r.ride_total +
          r.reimbursements_total +
          r.other_extras_total -
          r.deductions_total;
      });

      if (cancelled) return;
      setHistory(
        Array.from(rowMap.values()).sort((a, b) => b.start_date.localeCompare(a.start_date)),
      );
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [effectiveEmployeeId]);

  // ----- Derived totals for current week -----
  const currentTotals = useMemo(() => {
    const realHours = currentShifts.reduce((s, sh) => s + sh.hours, 0);
    const completedShifts = currentShifts.filter((s) => !s.is_open).length;
    const openShifts = currentShifts.filter((s) => s.is_open).length;

    let baseFromMovements = 0;
    let tips = 0;
    let ride = 0;
    let reimbursements = 0;
    let otherExtras = 0;
    let deductions = 0;

    currentMovements.forEach((m) => {
      if (m.bucket === "base") baseFromMovements += m.total_value;
      else if (m.bucket === "tips") tips += m.total_value;
      else if (m.bucket === "ride") ride += m.total_value;
      else if (m.bucket === "reimbursement") reimbursements += m.total_value;
      else if (m.bucket === "deduction") deductions += m.total_value;
      else otherExtras += m.total_value;
    });

    // Base pay priority:
    //   1. Official `period_base_pay` (set when payroll closes).
    //   2. Real clocked hours × rate (live estimate).
    //   3. Movement-based base (Connecteam-style "Weekend Job", "Daily Pay", etc.).
    //
    // We add the movement base to the live estimate so that workers paid
    // *partly* by hours and *partly* by jornadas see the full picture.
    const estimatedBase = currentShifts.reduce((s, sh) => s + sh.shift_total, 0);
    const base =
      currentBasePay !== null
        ? currentBasePay
        : estimatedBase + baseFromMovements;

    const total = base + tips + ride + reimbursements + otherExtras - deductions;

    return {
      realHours: Math.round(realHours * 100) / 100,
      completedShifts,
      openShifts,
      base,
      baseFromMovements,
      baseFromHours: estimatedBase,
      tips,
      ride,
      reimbursements,
      otherExtras,
      deductions,
      total,
      basePayConfirmed: currentBasePay !== null,
      hasAnyEarnings:
        base > 0 || tips > 0 || ride > 0 || reimbursements > 0 || otherExtras > 0,
    };
  }, [currentShifts, currentMovements, currentBasePay]);

  const periodStatus: PeriodStatus | null = currentPeriod ? deriveStatus(currentPeriod) : null;

  // ----- Loading state -----
  if (loading) {
    return (
      <div className="space-y-3 pt-4 pb-24">
        <div className="h-40 animate-pulse bg-muted rounded-3xl" />
        <div className="h-24 animate-pulse bg-muted rounded-2xl" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse bg-muted rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      {/* ===================== Header ===================== */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold font-heading tracking-tight text-foreground">
          My Earnings
        </h1>
      </div>

      {/* ===================== Current Week Hero ===================== */}
      {currentPeriod && (
        <section className="rounded-3xl bg-gradient-to-br from-primary/[0.08] via-card to-card border border-primary/15 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                Current Period
              </p>
              <p className="text-[12px] text-foreground/80 mt-0.5 font-semibold tabular-nums">
                {formatPeriodLabel(currentPeriod.start_date, currentPeriod.end_date)}
              </p>
            </div>
            {periodStatus && (
              <span
                className={cn(
                  "text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wide",
                  statusBadge(periodStatus).cls,
                )}
              >
                {statusBadge(periodStatus).label}
              </span>
            )}
          </div>

          <p className="text-[44px] font-bold font-heading leading-none tracking-tight tabular-nums text-foreground">
            ${currentTotals.total.toFixed(2)}
          </p>

          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="rounded-xl bg-background/60 border border-border/30 px-3 py-2.5">
              <p className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground/70">
                Hours
              </p>
              <p className="text-[15px] font-bold font-heading tabular-nums text-foreground mt-0.5">
                {currentTotals.realHours.toFixed(1)}
              </p>
            </div>
            <div className="rounded-xl bg-background/60 border border-border/30 px-3 py-2.5">
              <p className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground/70">
                Shifts
              </p>
              <p className="text-[15px] font-bold font-heading tabular-nums text-foreground mt-0.5">
                {currentTotals.completedShifts}
                {currentTotals.openShifts > 0 && (
                  <span className="text-[10px] text-warning ml-1 font-semibold">
                    +{currentTotals.openShifts} open
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-xl bg-background/60 border border-border/30 px-3 py-2.5">
              <p className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground/70">
                Base
              </p>
              <p className="text-[15px] font-bold font-heading tabular-nums text-foreground mt-0.5">
                ${currentTotals.base.toFixed(0)}
              </p>
            </div>
          </div>

          {!currentTotals.basePayConfirmed && currentShifts.length > 0 && (
            <p className="text-[10px] text-muted-foreground/70 mt-3 flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" />
              Live estimate — final base pay confirmed when period closes.
            </p>
          )}
        </section>
      )}

      {/* ===================== Weekly Breakdown ===================== */}
      {currentPeriod &&
        (currentTotals.tips > 0 ||
          currentTotals.ride > 0 ||
          currentTotals.reimbursements > 0 ||
          currentTotals.otherExtras > 0 ||
          currentTotals.deductions > 0) && (
          <section className="rounded-2xl bg-card border border-border/30 p-4 space-y-2">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1">
              Breakdown
            </h2>

            <BreakdownRow
              icon={<Wallet className="h-3.5 w-3.5" />}
              label="Base pay"
              value={currentTotals.base}
            />
            {currentTotals.tips > 0 && (
              <BreakdownRow
                icon={<Coffee className="h-3.5 w-3.5" />}
                label="Tips"
                value={currentTotals.tips}
                accent
              />
            )}
            {currentTotals.ride > 0 && (
              <BreakdownRow
                icon={<Car className="h-3.5 w-3.5" />}
                label="Ride / transport"
                value={currentTotals.ride}
                accent
              />
            )}
            {currentTotals.reimbursements > 0 && (
              <BreakdownRow
                icon={<Receipt className="h-3.5 w-3.5" />}
                label="Reimbursements"
                value={currentTotals.reimbursements}
                accent
              />
            )}
            {currentTotals.otherExtras > 0 && (
              <BreakdownRow
                icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                label="Other extras"
                value={currentTotals.otherExtras}
                accent
              />
            )}
            {currentTotals.deductions > 0 && (
              <BreakdownRow
                icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                label="Deductions"
                value={currentTotals.deductions}
                negative
              />
            )}

            <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/40">
              <span className="text-[12px] font-bold text-foreground">Final total</span>
              <span className="text-[15px] font-bold font-heading tabular-nums text-foreground">
                ${currentTotals.total.toFixed(2)}
              </span>
            </div>
          </section>
        )}

      {/* ===================== Shift Breakdown ===================== */}
      {currentPeriod && (
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Shifts this period
            </h2>
            {currentShifts.length > 0 && (
              <span className="text-[10px] text-muted-foreground/60 font-semibold tabular-nums">
                {currentShifts.length} {currentShifts.length === 1 ? "shift" : "shifts"}
              </span>
            )}
          </div>

          {currentShifts.length === 0 ? (
            currentTotals.baseFromMovements > 0 ? (
              // Worker is paid by jornadas (movements), not by clock — show a friendlier note.
              <div className="rounded-2xl border border-border/30 bg-card px-4 py-5 text-center">
                <Wallet className="h-5 w-5 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-[12px] font-semibold text-foreground">
                  Paid by jornada this period
                </p>
                <p className="text-[10.5px] text-muted-foreground/70 mt-1 max-w-[260px] mx-auto leading-relaxed">
                  Your shifts are recorded as full-day pay items. See the breakdown above.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/40 bg-card/50 px-4 py-8 text-center">
                <Clock className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[12px] font-semibold text-foreground">
                  No clocked hours yet
                </p>
                <p className="text-[10.5px] text-muted-foreground/70 mt-1">
                  Shifts will appear here as you clock in.
                </p>
              </div>
            )
          ) : (
            <div className="space-y-1.5">
              {currentShifts.map((sh) => (
                <ShiftCard key={sh.entry_id} shift={sh} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ===================== Payment History ===================== */}
      {history.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2 px-1">
            Payment History
          </h2>
          <div className="space-y-1.5">
            {history.map((p) => {
              const isExpanded = expandedPeriod === p.period_id;
              const details = periodDetails[p.period_id];
              const isLoadingThis = loadingDetails === p.period_id;
              const badge = statusBadge(p.status_label);

              return (
                <div
                  key={p.period_id}
                  className={cn(
                    "rounded-2xl border bg-card overflow-hidden transition-all",
                    isExpanded ? "border-primary/20 shadow-sm" : "border-border/30",
                  )}
                >
                  <button
                    onClick={() => toggleExpand(p.period_id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-foreground">
                        {formatPeriodLabel(p.start_date, p.end_date)}
                      </p>
                      <span
                        className={cn(
                          "inline-block text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wide mt-1",
                          badge.cls,
                        )}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <span className="text-[14px] font-bold font-heading tabular-nums shrink-0 text-foreground">
                      ${p.total_final_pay.toFixed(2)}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-muted-foreground/40 transition-transform shrink-0",
                        isExpanded && "rotate-180",
                      )}
                    />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 animate-fade-in">
                      <div className="border-t border-border/30 pt-3 space-y-2">
                        {isLoadingThis ? (
                          <div className="flex items-center justify-center py-4 text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                            <span className="text-[11px]">Loading…</span>
                          </div>
                        ) : (
                          <HistoryDetails row={p} movements={details ?? []} />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state when no current period and no history */}
      {!currentPeriod && history.length === 0 && (
        <div className="text-center py-14 space-y-3">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/30 flex items-center justify-center">
            <Wallet className="h-7 w-7 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-bold text-foreground">No earnings yet</p>
          <p className="text-xs text-muted-foreground/60 max-w-[240px] mx-auto">
            Your earnings and payment history will appear here as you work shifts.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function BreakdownRow({
  icon,
  label,
  value,
  accent,
  negative,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={cn("opacity-70", accent && "text-[hsl(var(--status-confirmed))] opacity-100", negative && "text-destructive opacity-100")}>
          {icon}
        </span>
        <span className="font-medium">{label}</span>
      </div>
      <span
        className={cn(
          "font-semibold tabular-nums",
          negative ? "text-destructive" : accent ? "text-[hsl(var(--status-confirmed))]" : "text-foreground",
        )}
      >
        {negative ? "−" : accent ? "+" : ""}${value.toFixed(2)}
      </span>
    </div>
  );
}

function ShiftCard({ shift }: { shift: ShiftEntry }) {
  return (
    <div className="rounded-2xl border border-border/30 bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[12.5px] font-semibold text-foreground">
              {formatDay(shift.date)}
            </p>
            {shift.is_open && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-warning/15 text-warning font-bold uppercase tracking-wide">
                Open
              </span>
            )}
          </div>
          {(shift.shift_title || shift.client_name) && (
            <p className="text-[11.5px] text-foreground/80 font-medium mt-0.5 truncate">
              {shift.shift_title || shift.client_name}
            </p>
          )}
          {shift.location_name && (
            <p className="text-[10.5px] text-muted-foreground/70 mt-0.5 flex items-center gap-1 truncate">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              {shift.location_name}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[14px] font-bold font-heading tabular-nums text-foreground">
            {shift.is_open ? "—" : `$${shift.shift_total.toFixed(2)}`}
          </p>
          <p className="text-[10px] text-muted-foreground/70 tabular-nums mt-0.5">
            {shift.hours.toFixed(2)}h
            {shift.hourly_rate > 0 && (
              <span className="opacity-60"> · ${shift.hourly_rate.toFixed(2)}/h</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-border/20 text-[10.5px] text-muted-foreground/80 tabular-nums">
        <div className="flex items-center gap-1">
          <Clock className="h-2.5 w-2.5 opacity-60" />
          <span className="font-semibold">{formatTime(shift.clock_in)}</span>
          <span className="opacity-50">→</span>
          <span className="font-semibold">{formatTime(shift.clock_out)}</span>
        </div>
        {shift.break_minutes > 0 && (
          <span className="opacity-70">· {shift.break_minutes}m break</span>
        )}
      </div>
    </div>
  );
}

function HistoryDetails({ row, movements }: { row: PaymentRow; movements: MovementDetail[] }) {
  const baseItems = movements.filter((m) => m.bucket === "base");
  const tips = movements.filter((m) => m.bucket === "tips");
  const ride = movements.filter((m) => m.bucket === "ride");
  const reimb = movements.filter((m) => m.bucket === "reimbursement");
  const others = movements.filter((m) => m.bucket === "other_extra");
  const deductions = movements.filter((m) => m.bucket === "deduction");

  // Distinguish official base (period_base_pay) from movement-derived base, so
  // the worker sees the line item rather than just an opaque "$0" base pay.
  const baseFromMovements = baseItems.reduce((s, m) => s + m.total_value, 0);
  const officialBase = Math.max(0, row.base_total_pay - baseFromMovements);

  return (
    <div className="space-y-2 text-[11.5px]">
      {officialBase > 0 && <DetailLine label="Base pay (hours)" value={officialBase} />}
      {baseItems.length > 0 && <Group label="Base pay (jornadas)" items={baseItems} />}
      {tips.length > 0 && <Group label="Tips" items={tips} accent />}
      {ride.length > 0 && <Group label="Ride / transport" items={ride} accent />}
      {reimb.length > 0 && <Group label="Reimbursements" items={reimb} accent />}
      {others.length > 0 && <Group label="Other extras" items={others} accent />}
      {deductions.length > 0 && <Group label="Deductions" items={deductions} negative />}
      <div className="flex items-center justify-between pt-2 border-t border-border/30 text-[12px] tabular-nums">
        <span className="font-bold text-foreground">Total</span>
        <span className="font-bold text-foreground">${row.total_final_pay.toFixed(2)}</span>
      </div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">${value.toFixed(2)}</span>
    </div>
  );
}

function Group({
  label,
  items,
  accent,
  negative,
}: {
  label: string;
  items: MovementDetail[];
  accent?: boolean;
  negative?: boolean;
}) {
  const sign = negative ? "−" : accent ? "+" : "";
  const cls = negative
    ? "text-destructive"
    : accent
      ? "text-[hsl(var(--status-confirmed))]"
      : "text-foreground";
  return (
    <div className="space-y-1">
      <p className={cn("text-[9px] font-bold uppercase tracking-widest", cls)}>{label}</p>
      {items.map((m) => (
        <div
          key={m.id}
          className={cn(
            "flex items-center justify-between rounded-lg px-3 py-1.5",
            negative ? "bg-destructive/[0.04]" : accent ? "bg-[hsl(var(--status-confirmed)/0.05)]" : "bg-muted/30",
          )}
        >
          <span className="font-medium text-foreground truncate">{m.concept_name}</span>
          <span className={cn("font-bold tabular-nums shrink-0 ml-2", cls)}>
            {sign}${m.total_value.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}
