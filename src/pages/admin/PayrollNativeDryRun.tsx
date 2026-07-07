/**
 * PayrollNativeDryRun — /app/payroll-native-dry-run
 *
 * READ-ONLY diagnostic utility. Compares native `time_entries` hours vs the
 * current official payroll source (Connecteam / reconciliación, surfaced via
 * `period_base_pay.total_work_hours`) per worker for a selected pay period,
 * AND surfaces the reasons behind each delta (open entries, missing shift
 * links, anomalous durations, midnight-crossing entries, missing reconciliación
 * rows, missing native clocks).
 *
 * HARD RULES — do NOT change without explicit sprint approval:
 *  - No writes anywhere (no upserts, no RPC mutations, no inserts).
 *  - No payroll calculation — only comparison of already-persisted hours.
 *  - Does NOT change the official payroll source. Connecteam / reconciliación
 *    remains authoritative.
 *  - Does NOT use `scheduled_shifts` as source of truth for pay.
 *  - Read-only queries only: pay_periods, period_base_pay, time_entries,
 *    employees (name lookup). No new RPC, no migration, no RLS/auth/edge
 *    changes.
 *  - Rows lacking data on either side are marked "No comparable" — never
 *    fabricated. Connecteam has no daily breakdown surfaced here; only totals.
 *  - Anomaly detection is VISUAL ONLY: never edits, closes, or corrects
 *    entries.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { PayrollSourceGuardrailBanner } from "@/components/payroll/PayrollSourceGuardrailBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, ShieldAlert, ArrowLeft, Info, ChevronRight, ChevronDown, Download, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  detectTimeEntryOverlaps,
} from "@/utils/detectTimeEntryOverlaps";
import {
  downloadDryRunCsv,
  type DryRunCsvRow,
} from "@/utils/exportDryRunCsv";
import { BatchTrendPanel } from "@/components/payroll/BatchTrendPanel";
import { RootCauseExplorer } from "@/components/payroll/RootCauseExplorer";

interface Period {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  sequence_number: number | null;
}

interface PBP {
  employee_id: string;
  total_work_hours: number | null;
  base_total_pay: number | null;
}

interface TE {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number | null;
}

interface EmpLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

type ReasonKey =
  | "missing_pbp"
  | "no_native_entries"
  | "open_entries"
  | "no_shift_link"
  | "abnormal_duration"
  | "midnight_cross"
  | "overlap_entries"
  | "delta_minor"
  | "delta_critical"
  | "not_comparable";

interface DayBucket {
  date: string; // YYYY-MM-DD (clock_in local calendar day)
  hours: number;
  closed: number;
  open: number;
  noShift: number;
  midnight: number;
  abnormal: number;
}

interface NativeAgg {
  hours: number;
  entries: number;
  open: number;
  noShiftLink: number;
  midnight: number;
  abnormal: number;
  days: Map<string, DayBucket>;
}

interface RowResult {
  employee_id: string;
  name: string;
  connecteamHours: number | null;
  nativeHours: number | null;
  entries: number;
  openEntries: number;
  noShiftLink: number;
  midnight: number;
  abnormal: number;
  overlap: number;
  deltaHours: number | null;
  status: "match" | "minor" | "critical" | "not_comparable";
  reasons: ReasonKey[];
}

const MINOR_DELTA_HOURS = 0.5;
const CRITICAL_DELTA_HOURS = 2;
const ABNORMAL_MAX_HOURS = 16;

type FilterKey =
  | "all"
  | "critical"
  | "not_comparable"
  | "open"
  | "no_shift"
  | "abnormal"
  | "midnight"
  | "overlap";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "critical", label: "Solo delta crítico" },
  { key: "not_comparable", label: "Solo no comparables" },
  { key: "open", label: "Con fichajes abiertos" },
  { key: "no_shift", label: "Entries sin shift" },
  { key: "abnormal", label: "Duración anormal" },
  { key: "midnight", label: "Cruzan medianoche" },
  { key: "overlap", label: "Con overlaps" },
];

const FILTER_KEYS: readonly FilterKey[] = FILTERS.map((f) => f.key);

function localDay(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function PayrollNativeDryRun() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [searchParams, setSearchParams] = useSearchParams();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [pbp, setPbp] = useState<PBP[]>([]);
  const [entries, setEntries] = useState<TE[]>([]);
  const [emps, setEmps] = useState<EmpLite[]>([]);

  const urlFilter = searchParams.get("filter") as FilterKey | null;
  const filter: FilterKey =
    urlFilter && FILTER_KEYS.includes(urlFilter) ? urlFilter : "all";
  const urlView = searchParams.get("view");
  const view: "single" | "batch" = urlView === "batch" ? "batch" : "single";
  const setView = useCallback(
    (next: "single" | "batch") => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === "batch") p.set("view", "batch");
          else p.delete("view");
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const setFilter = useCallback(
    (next: FilterKey) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === "all") p.delete("filter");
          else p.set("filter", next);
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPeriodIdSafe = useCallback(
    (id: string) => {
      setPeriodId(id);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (id) p.set("period", id);
          else p.delete("period");
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    let cancelled = false;
    if (!selectedCompanyId) {
      setPeriods([]);
      setPeriodId("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date, status, sequence_number")
        .eq("company_id", selectedCompanyId)
        .order("start_date", { ascending: false })
        .limit(24);
      if (cancelled) return;
      const list = (data ?? []) as Period[];
      setPeriods(list);
      if (list.length) {
        // Prefer URL-provided period if it belongs to this company's list;
        // otherwise fall back to the most recent period.
        const urlPeriod = searchParams.get("period");
        const found = urlPeriod && list.some((p) => p.id === urlPeriod)
          ? urlPeriod
          : list[0].id;
        setPeriodId((cur) => cur || found);
        if (urlPeriod && !list.some((p) => p.id === urlPeriod)) {
          // Invalid URL — clear silently, keep safe fallback.
          setSearchParams(
            (prev) => {
              const p = new URLSearchParams(prev);
              p.delete("period");
              return p;
            },
            { replace: true },
          );
        }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === periodId) ?? null,
    [periods, periodId],
  );

  useEffect(() => {
    let cancelled = false;
    if (!selectedCompanyId || !selectedPeriod) {
      setPbp([]); setEntries([]); setEmps([]);
      return;
    }
    setLoading(true);
    setExpanded(new Set());
    (async () => {
      const startIso = `${selectedPeriod.start_date}T00:00:00`;
      const endIso = `${selectedPeriod.end_date}T23:59:59`;

      const [pbpRes, teRes, empsRes] = await Promise.all([
        supabase
          .from("period_base_pay")
          .select("employee_id, total_work_hours, base_total_pay")
          .eq("company_id", selectedCompanyId)
          .eq("period_id", selectedPeriod.id),
        supabase
          .from("time_entries")
          .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes")
          .eq("company_id", selectedCompanyId)
          .gte("clock_in", startIso)
          .lte("clock_in", endIso)
          .limit(5000),
        supabase
          .from("employees")
          .select("id, first_name, last_name")
          .eq("company_id", selectedCompanyId)
          .limit(3000),
      ]);
      if (cancelled) return;
      setPbp((pbpRes.data ?? []) as PBP[]);
      setEntries((teRes.data ?? []) as TE[]);
      setEmps((empsRes.data ?? []) as EmpLite[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedCompanyId, selectedPeriod]);

  const empMap = useMemo(
    () => new Map(emps.map((e) => [e.id, e])),
    [emps],
  );

  const overlaps = useMemo(
    () => detectTimeEntryOverlaps(entries),
    [entries],
  );

  // Per-employee aggregation of native time_entries, with per-day breakdown
  // and read-only anomaly detection. Open entries never contribute hours.
  const nativeAgg = useMemo(() => {
    const map = new Map<string, NativeAgg>();
    for (const e of entries) {
      const agg = map.get(e.employee_id) ?? {
        hours: 0, entries: 0, open: 0, noShiftLink: 0,
        midnight: 0, abnormal: 0, days: new Map<string, DayBucket>(),
      };
      agg.entries += 1;

      const day = localDay(e.clock_in);
      const bucket = agg.days.get(day) ?? {
        date: day, hours: 0, closed: 0, open: 0,
        noShift: 0, midnight: 0, abnormal: 0,
      };

      if (!e.shift_id) { agg.noShiftLink += 1; bucket.noShift += 1; }

      if (!e.clock_out) {
        agg.open += 1;
        bucket.open += 1;
      } else {
        const outDay = localDay(e.clock_out);
        const crossesMidnight = outDay !== day;
        if (crossesMidnight) { agg.midnight += 1; bucket.midnight += 1; }
        const ms = new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime();
        const rawMin = Math.round(ms / 60000) - (e.break_minutes ?? 0);
        const hours = rawMin / 60;
        const abnormal = hours <= 0 || hours > ABNORMAL_MAX_HOURS;
        if (abnormal) { agg.abnormal += 1; bucket.abnormal += 1; }
        const safeHours = Math.max(0, hours);
        agg.hours += safeHours;
        bucket.hours += safeHours;
        bucket.closed += 1;
      }
      agg.days.set(day, bucket);
      map.set(e.employee_id, agg);
    }
    return map;
  }, [entries]);

  const pbpMap = useMemo(
    () => new Map(pbp.map((r) => [r.employee_id, r])),
    [pbp],
  );

  const rows: RowResult[] = useMemo(() => {
    const ids = new Set<string>([...pbpMap.keys(), ...nativeAgg.keys()]);
    const out: RowResult[] = [];
    ids.forEach((id) => {
      const emp = empMap.get(id);
      const name = emp
        ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || "Sin nombre"
        : "Empleado desconocido";
      const p = pbpMap.get(id);
      const n = nativeAgg.get(id);
      const connecteamHours = p?.total_work_hours ?? null;
      const nativeHours = n ? Number(n.hours.toFixed(2)) : null;
      const entriesCount = n?.entries ?? 0;
      const openEntries = n?.open ?? 0;
      const noShiftLink = n?.noShiftLink ?? 0;
      const midnight = n?.midnight ?? 0;
      const abnormal = n?.abnormal ?? 0;
      const overlap = overlaps.get(id)?.total ?? 0;
      const reasons: ReasonKey[] = [];

      if (openEntries > 0) reasons.push("open_entries");
      if (noShiftLink > 0) reasons.push("no_shift_link");
      if (abnormal > 0) reasons.push("abnormal_duration");
      if (midnight > 0) reasons.push("midnight_cross");
      if (overlap > 0) reasons.push("overlap_entries");

      const base = {
        employee_id: id, name, connecteamHours, nativeHours,
        entries: entriesCount, openEntries, noShiftLink, midnight, abnormal, overlap,
      };

      if (connecteamHours == null && nativeHours == null) {
        reasons.unshift("not_comparable");
        out.push({ ...base, deltaHours: null, status: "not_comparable", reasons });
        return;
      }
      if (connecteamHours == null) {
        reasons.unshift("missing_pbp");
        out.push({ ...base, deltaHours: null, status: "not_comparable", reasons });
        return;
      }
      if (nativeHours == null) {
        reasons.unshift("no_native_entries");
        out.push({ ...base, deltaHours: null, status: "not_comparable", reasons });
        return;
      }
      const delta = Number((nativeHours - connecteamHours).toFixed(2));
      const abs = Math.abs(delta);
      let status: RowResult["status"] = "match";
      if (abs >= CRITICAL_DELTA_HOURS) { status = "critical"; reasons.unshift("delta_critical"); }
      else if (abs >= MINOR_DELTA_HOURS) { status = "minor"; reasons.unshift("delta_minor"); }

      out.push({ ...base, deltaHours: delta, status, reasons });
    });
    const order = { critical: 0, minor: 1, not_comparable: 2, match: 3 } as const;
    out.sort((a, b) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return Math.abs(b.deltaHours ?? 0) - Math.abs(a.deltaHours ?? 0);
    });
    return out;
  }, [empMap, pbpMap, nativeAgg, overlaps]);

  const filteredRows = useMemo(() => {
    switch (filter) {
      case "critical": return rows.filter((r) => r.status === "critical");
      case "not_comparable": return rows.filter((r) => r.status === "not_comparable");
      case "open": return rows.filter((r) => r.openEntries > 0);
      case "no_shift": return rows.filter((r) => r.noShiftLink > 0);
      case "abnormal": return rows.filter((r) => r.abnormal > 0);
      case "midnight": return rows.filter((r) => r.midnight > 0);
      case "overlap": return rows.filter((r) => r.overlap > 0);
      default: return rows;
    }
  }, [rows, filter]);

  const totals = useMemo(() => {
    let connecteam = 0, native = 0, comparable = 0, notCmp = 0, critical = 0;
    let openTotal = 0, noShiftLinkTotal = 0;
    let closedEntries = 0, abnormalTotal = 0, midnightTotal = 0;
    let missingPbp = 0, missingNative = 0, overlapTotal = 0, workersWithOverlap = 0;
    for (const r of rows) {
      if (r.status === "not_comparable") {
        notCmp += 1;
        if (r.reasons.includes("missing_pbp")) missingPbp += 1;
        if (r.reasons.includes("no_native_entries")) missingNative += 1;
      } else {
        comparable += 1;
        connecteam += r.connecteamHours ?? 0;
        native += r.nativeHours ?? 0;
        if (r.status === "critical") critical += 1;
      }
      openTotal += r.openEntries;
      overlapTotal += r.overlap;
      if (r.overlap > 0) workersWithOverlap += 1;
    }
    for (const [, v] of nativeAgg) {
      noShiftLinkTotal += v.noShiftLink;
      closedEntries += v.entries - v.open;
      abnormalTotal += v.abnormal;
      midnightTotal += v.midnight;
    }
    const delta = Number((native - connecteam).toFixed(2));
    const pct = connecteam > 0 ? (delta / connecteam) * 100 : null;
    const comparablePct = rows.length > 0
      ? Math.round((comparable / rows.length) * 100)
      : null;
    return {
      workers: rows.length, comparable, notCmp, critical,
      connecteam: Number(connecteam.toFixed(2)),
      native: Number(native.toFixed(2)),
      delta, pct, comparablePct,
      openTotal, noShiftLinkTotal,
      closedEntries, abnormalTotal, midnightTotal,
      missingPbp, missingNative,
      overlapTotal, workersWithOverlap,
    };
  }, [rows, nativeAgg]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const periodLabel = selectedPeriod
    ? `${selectedPeriod.sequence_number ? `#${selectedPeriod.sequence_number} · ` : ""}${selectedPeriod.start_date}_${selectedPeriod.end_date}`
    : "";

  const handleExportCsv = useCallback(() => {
    if (!selectedCompanyId || !selectedPeriod) return;
    const csvRows: DryRunCsvRow[] = rows.map((r) => {
      const stats = overlaps.get(r.employee_id);
      const days = nativeAgg.get(r.employee_id)?.days;
      let largestDaily: number | null = null;
      let firstIssue: string | null = stats?.firstIssueDate ?? null;
      if (days) {
        for (const [date, b] of days) {
          if (largestDaily == null || b.hours > largestDaily) largestDaily = b.hours;
          if ((b.open > 0 || b.abnormal > 0 || b.noShift > 0 || b.midnight > 0) &&
              (firstIssue == null || date < firstIssue)) {
            firstIssue = date;
          }
        }
      }
      const pct = r.connecteamHours && r.connecteamHours > 0 && r.deltaHours != null
        ? (r.deltaHours / r.connecteamHours) * 100
        : null;
      return {
        employee_id: r.employee_id,
        worker_name: r.name,
        connecteam_period_hours: r.connecteamHours,
        native_time_entries_hours: r.nativeHours,
        delta_hours: r.deltaHours,
        delta_percent: pct,
        status: r.status,
        reasons: r.reasons,
        closed_entries_count: (nativeAgg.get(r.employee_id)?.entries ?? 0) - r.openEntries,
        open_entries_count: r.openEntries,
        entries_without_shift_id: r.noShiftLink,
        abnormal_duration_count: r.abnormal,
        midnight_cross_count: r.midnight,
        overlap_count: r.overlap,
        comparable: r.status !== "not_comparable",
        first_issue_date: firstIssue,
        largest_daily_native_hours: largestDaily,
      };
    });
    downloadDryRunCsv(
      {
        company_id: selectedCompanyId,
        company_name: selectedCompany?.name ?? "",
        period_id: selectedPeriod.id,
        period_label: periodLabel,
        generated_at: new Date().toISOString(),
      },
      csvRows,
    );
  }, [selectedCompanyId, selectedCompany, selectedPeriod, rows, overlaps, nativeAgg, periodLabel]);

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <PageHeader
            title="Payroll nativo · Dry-run"
            subtitle="Diagnóstico read-only: time_entries nativos vs Connecteam / reconciliación."
          />
          <p className="text-[11px] text-muted-foreground/80 max-w-2xl leading-relaxed">
            Dry-run read-only. Este análisis compara <code>time_entries</code> nativos contra
            Connecteam / reconciliación. No calcula payroll oficial, no escribe pagos y no
            cambia la fuente actual de pago.
          </p>
          <p className="text-[11px] text-muted-foreground/80 max-w-2xl leading-relaxed">
            Referencia Connecteam / reconciliación usada:
            {" "}<code>period_base_pay.total_work_hours</code>. Este dry-run
            <strong> no lee <code>scheduled_shifts</code> como fuente de pago</strong> y
            no calcula dinero.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5"
            onClick={handleExportCsv}
            disabled={!selectedPeriod || rows.length === 0}
            title="Export local para revisión. No usar como archivo final de pago."
          >
            <Download className="h-4 w-4" /> Exportar CSV dry-run
          </Button>
          <Button asChild variant="outline" size="sm" className="rounded-xl gap-1.5">
            <Link to="/app/payroll-reconciliation">
              <ArrowLeft className="h-4 w-4" /> Reconciliación
            </Link>
          </Button>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground -mt-3">
        Export local para revisión interna. No usar como archivo final de pago.
      </p>


      {/* Permanent guardrail */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2.5">
        <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold text-destructive">
            Dry-run read-only. No calcula payroll oficial. No escribe pagos.
          </p>
          <p className="text-muted-foreground mt-0.5">
            Fuente oficial actual: Connecteam / Reconciliación externa. Los time entries
            nativos aún no son fuente final de pago. Modo seguro: no calcular payroll
            nativo desde <code>time_entries</code>. Fuente de referencia usada:
            {" "}<code>period_base_pay.total_work_hours</code>.
          </p>
        </div>
      </div>

      <PayrollSourceGuardrailBanner />

      {!selectedCompanyId ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Selecciona una compañía para ejecutar el dry-run.
        </CardContent></Card>
      ) : view === "batch" ? (
        <>
          <div className="flex gap-1.5 border-b border-border/60">
            <TabBtn active={false} onClick={() => setView("single")}>Período único</TabBtn>
            <TabBtn active={true} onClick={() => setView("batch")}>Comparar períodos</TabBtn>
          </div>
          <BatchTrendPanel
            companyId={selectedCompanyId}
            companyName={selectedCompany?.name ?? ""}
          />
        </>
      ) : (
        <>
          <div className="flex gap-1.5 border-b border-border/60">
            <TabBtn active={true} onClick={() => setView("single")}>Período único</TabBtn>
            <TabBtn active={false} onClick={() => setView("batch")}>Comparar períodos</TabBtn>
          </div>
          <Card>
            <CardContent className="py-4 flex flex-wrap items-center gap-3">
              <div className="text-xs text-muted-foreground">Compañía</div>
              <Badge variant="outline" className="text-xs">
                {selectedCompany?.name ?? "—"}
              </Badge>
              <div className="text-xs text-muted-foreground ml-2">Período</div>
              <div className="min-w-[260px]">
                <Select value={periodId} onValueChange={setPeriodIdSafe}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecciona un período" />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.sequence_number ? `#${p.sequence_number} · ` : ""}
                        {p.start_date} → {p.end_date} · {p.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardContent>
          </Card>

          {selectedPeriod && (
            <>
              {/* Review Summary — auditoría interna */}
              <Card className="border-border/60">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs font-semibold text-foreground">
                      Resumen para revisión ·{" "}
                      <span className="text-muted-foreground font-normal">
                        {selectedPeriod.sequence_number ? `#${selectedPeriod.sequence_number} · ` : ""}
                        {selectedPeriod.start_date} → {selectedPeriod.end_date}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      Auditoría interna · No es payroll oficial
                    </Badge>
                  </div>
                  <div className="grid gap-x-4 gap-y-1 text-[11px] grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    <SumLine label="Workers comparables" value={`${totals.comparable} / ${totals.workers}`} />
                    <SumLine label="% comparable" value={totals.comparablePct != null ? `${totals.comparablePct}%` : "—"} />
                    <SumLine label="Δ total horas" value={`${totals.delta >= 0 ? "+" : ""}${totals.delta.toFixed(2)}`} />
                    <SumLine label="Δ %" value={totals.pct != null ? `${totals.pct >= 0 ? "+" : ""}${totals.pct.toFixed(1)}%` : "—"} />
                    <SumLine label="Workers Δ crítico" value={totals.critical} tone={totals.critical > 0 ? "danger" : "muted"} />
                    <SumLine label="Workers no comparables" value={totals.notCmp} tone={totals.notCmp > 0 ? "warn" : "muted"} />
                    <SumLine label="Entries abiertas" value={totals.openTotal} tone={totals.openTotal > 0 ? "warn" : "muted"} />
                    <SumLine label="Entries sin shift" value={totals.noShiftLinkTotal} tone={totals.noShiftLinkTotal > 0 ? "warn" : "muted"} />
                    <SumLine label="Duraciones anormales" value={totals.abnormalTotal} tone={totals.abnormalTotal > 0 ? "danger" : "muted"} />
                    <SumLine label="Cruces de medianoche" value={totals.midnightTotal} />
                    <SumLine label="Overlaps detectados" value={totals.overlapTotal} tone={totals.overlapTotal > 0 ? "danger" : "muted"} />
                    <SumLine label="Workers con overlap" value={totals.workersWithOverlap} tone={totals.workersWithOverlap > 0 ? "warn" : "muted"} />
                  </div>
                </CardContent>
              </Card>

              {/* KPI strip — comparación */}
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                <Kpi label="Workers" value={totals.workers} />
                <Kpi label="Comparables" value={totals.comparable} tone="ok"
                  hint={totals.comparablePct != null ? `${totals.comparablePct}%` : undefined} />
                <Kpi label="No comparables" value={totals.notCmp}
                  tone={totals.notCmp > 0 ? "warn" : "muted"} />
                <Kpi label="Horas Connecteam" value={totals.connecteam.toFixed(2)} />
                <Kpi label="Horas nativas (TE)" value={totals.native.toFixed(2)} />
                <Kpi
                  label="Δ horas"
                  value={`${totals.delta >= 0 ? "+" : ""}${totals.delta.toFixed(2)}`}
                  hint={totals.pct != null ? `${totals.pct >= 0 ? "+" : ""}${totals.pct.toFixed(1)}%` : undefined}
                  tone={Math.abs(totals.delta) >= CRITICAL_DELTA_HOURS * 5 ? "danger" : Math.abs(totals.delta) >= MINOR_DELTA_HOURS * 5 ? "warn" : "ok"}
                />
              </div>

              {/* KPI strip — calidad de datos nativos */}
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Calidad de datos nativos (solo lectura)
                </div>
                <div className="grid gap-2 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
                  <MiniKpi label="TE cerradas usadas" value={totals.closedEntries} />
                  <MiniKpi label="TE abiertas excluidas" value={totals.openTotal}
                    tone={totals.openTotal > 0 ? "warn" : "muted"} />
                  <MiniKpi label="Sin shift link" value={totals.noShiftLinkTotal}
                    tone={totals.noShiftLinkTotal > 0 ? "warn" : "muted"} />
                  <MiniKpi label="Duración anormal" value={totals.abnormalTotal}
                    tone={totals.abnormalTotal > 0 ? "danger" : "muted"} />
                  <MiniKpi label="Cruzan medianoche" value={totals.midnightTotal} />
                  <MiniKpi label="Overlaps" value={totals.overlapTotal}
                    tone={totals.overlapTotal > 0 ? "danger" : "muted"} />
                  <MiniKpi label="Sin reconciliación" value={totals.missingPbp}
                    tone={totals.missingPbp > 0 ? "warn" : "muted"} />
                  <MiniKpi label="Sin fichajes nativos" value={totals.missingNative}
                    tone={totals.missingNative > 0 ? "warn" : "muted"} />
                </div>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Anomalías: duración ≤ 0 o &gt; {ABNORMAL_MAX_HOURS}h. Overlaps:
                  entries del mismo worker cuyo <code>clock_in</code> es anterior al
                  <code> clock_out</code> previo. Detección visual — no modifica entries.
                </p>
              </div>

              {/* Filtros de diagnóstico */}
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "h-8 px-3 rounded-full text-xs font-medium border transition-colors",
                      filter === f.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground/80 border-border/60 hover:bg-accent/40",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
                <div className="ml-auto text-[11px] text-muted-foreground self-center">
                  Mostrando {filteredRows.length} de {rows.length}
                </div>
              </div>

              {/* Tabla comparación */}
              <Card>
                <CardContent className="p-0">
                  {loading && rows.length === 0 ? (
                    <div className="py-12 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredRows.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      Sin filas para este filtro.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-8"></TableHead>
                            <TableHead className="text-xs">Worker</TableHead>
                            <TableHead className="text-xs text-right">Horas Connecteam</TableHead>
                            <TableHead className="text-xs text-right">Horas nativas</TableHead>
                            <TableHead className="text-xs text-right">Δ horas</TableHead>
                            <TableHead className="text-xs text-center">Fichajes</TableHead>
                            <TableHead className="text-xs">Estado y razones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRows.map((r) => {
                            const isOpen = expanded.has(r.employee_id);
                            const days = nativeAgg.get(r.employee_id)?.days;
                            const hasDays = !!days && days.size > 0;
                            return (
                              <Fragment key={r.employee_id}>

                                <TableRow
                                  key={r.employee_id}
                                  className={hasDays ? "cursor-pointer" : ""}
                                  onClick={() => hasDays && toggleExpand(r.employee_id)}
                                >
                                  <TableCell className="text-xs">
                                    {hasDays ? (
                                      isOpen
                                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                    ) : null}
                                  </TableCell>
                                  <TableCell className="text-xs font-medium">{r.name}</TableCell>
                                  <TableCell className="text-xs text-right tabular-nums">
                                    {r.connecteamHours != null ? r.connecteamHours.toFixed(2) : "—"}
                                  </TableCell>
                                  <TableCell className="text-xs text-right tabular-nums">
                                    {r.nativeHours != null ? r.nativeHours.toFixed(2) : "—"}
                                  </TableCell>
                                  <TableCell className="text-xs text-right tabular-nums">
                                    {r.deltaHours != null
                                      ? `${r.deltaHours >= 0 ? "+" : ""}${r.deltaHours.toFixed(2)}`
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="text-xs text-center tabular-nums">
                                    {r.entries}
                                    {r.openEntries > 0 && (
                                      <span className="text-amber-700 font-semibold"> · {r.openEntries} abiertos</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <div className="flex flex-wrap items-center gap-1">
                                      <StatusBadge status={r.status} />
                                      {r.reasons
                                        .filter((k) => !isStatusReason(k))
                                        .map((k) => (
                                          <ReasonChip key={k} reason={k} />
                                        ))}
                                    </div>
                                  </TableCell>
                                </TableRow>
                                {isOpen && hasDays && (
                                  <TableRow key={`${r.employee_id}-days`}>
                                    <TableCell colSpan={7} className="bg-muted/30 p-0">
                                      <DayBreakdown days={days!} overlapDays={overlaps.get(r.employee_id)?.days} />
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Fragment>

                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <p className="text-[10px] text-muted-foreground text-center">
                Solo lectura · Este dry-run no escribe en <code>period_base_pay</code>,
                <code> pay_periods</code>, <code>reconciliation_*</code>,
                <code> payroll_adjustments</code>, <code>movements</code>,
                <code> time_entries</code>, <code>scheduled_shifts</code> ni
                <code> shift_assignments</code>. Connecteam / reconciliación está
                disponible como total de período, no como breakdown diario en esta vista.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function isStatusReason(k: ReasonKey): boolean {
  return k === "delta_minor" || k === "delta_critical" || k === "not_comparable";
}

function DayBreakdown({
  days,
  overlapDays,
}: {
  days: Map<string, DayBucket>;
  overlapDays?: Map<string, number>;
}) {
  const sorted = Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Detalle diario · time_entries nativos
      </div>
      <p className="text-[10px] text-muted-foreground">
        Connecteam / reconciliación está disponible como total de período, no como
        breakdown diario en esta vista.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px]">Fecha</TableHead>
              <TableHead className="text-[10px] text-right">Horas nativas</TableHead>
              <TableHead className="text-[10px] text-right">Cerradas</TableHead>
              <TableHead className="text-[10px] text-right">Abiertas</TableHead>
              <TableHead className="text-[10px] text-right">Sin shift</TableHead>
              <TableHead className="text-[10px] text-right">Anormales</TableHead>
              <TableHead className="text-[10px] text-right">Medianoche</TableHead>
              <TableHead className="text-[10px] text-right">Overlaps</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((d) => {
              const overlap = overlapDays?.get(d.date) ?? 0;
              return (
                <TableRow key={d.date}>
                  <TableCell className="text-[11px] tabular-nums">{d.date}</TableCell>
                  <TableCell className="text-[11px] text-right tabular-nums">{d.hours.toFixed(2)}</TableCell>
                  <TableCell className="text-[11px] text-right tabular-nums">{d.closed}</TableCell>
                  <TableCell className={cn("text-[11px] text-right tabular-nums", d.open > 0 && "text-amber-700 font-semibold")}>{d.open}</TableCell>
                  <TableCell className={cn("text-[11px] text-right tabular-nums", d.noShift > 0 && "text-amber-700")}>{d.noShift}</TableCell>
                  <TableCell className={cn("text-[11px] text-right tabular-nums", d.abnormal > 0 && "text-destructive font-semibold")}>{d.abnormal}</TableCell>
                  <TableCell className="text-[11px] text-right tabular-nums">{d.midnight}</TableCell>
                  <TableCell className={cn("text-[11px] text-right tabular-nums", overlap > 0 && "text-destructive font-semibold")}>{overlap}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SumLine({ label, value, tone = "muted" }: {
  label: string;
  value: string | number;
  tone?: "ok" | "warn" | "danger" | "muted";
}) {
  const toneCls =
    tone === "ok" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "warn" ? "text-amber-700 dark:text-amber-200"
    : tone === "danger" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/30 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", toneCls)}>{value}</span>
    </div>
  );
}

function Kpi({ label, value, hint, tone = "muted" }: {
  label: string; value: string | number; hint?: string;
  tone?: "ok" | "warn" | "danger" | "muted";
}) {
  const toneCls =
    tone === "ok" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "warn" ? "text-amber-700 dark:text-amber-200"
    : tone === "danger" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-lg font-bold tabular-nums leading-tight ${toneCls}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function MiniKpi({ label, value, tone = "muted" }: {
  label: string; value: string | number;
  tone?: "ok" | "warn" | "danger" | "muted";
}) {
  const toneCls =
    tone === "ok" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "warn" ? "text-amber-700 dark:text-amber-200"
    : tone === "danger" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-border/50 bg-card px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: RowResult["status"] }) {
  switch (status) {
    case "match":
      return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">Match</Badge>;
    case "minor":
      return <Badge className="bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/30 text-[10px]">Delta menor</Badge>;
    case "critical":
      return <Badge className="bg-destructive/10 text-destructive border-destructive/40 text-[10px]">Delta crítico</Badge>;
    case "not_comparable":
      return <Badge variant="outline" className="text-[10px]">No comparable</Badge>;
  }
}

const REASON_LABEL: Record<ReasonKey, string> = {
  missing_pbp: "Sin fila en reconciliación",
  no_native_entries: "Sin fichajes nativos",
  open_entries: "Fichajes abiertos",
  no_shift_link: "Entries sin shift",
  abnormal_duration: "Duración anormal",
  midnight_cross: "Cruza medianoche",
  overlap_entries: "Overlaps",
  delta_minor: "Delta menor",
  delta_critical: "Delta crítico",
  not_comparable: "No comparable",
};

function ReasonChip({ reason }: { reason: ReasonKey }) {
  const danger = reason === "abnormal_duration" || reason === "missing_pbp" || reason === "overlap_entries";
  const warn = reason === "open_entries" || reason === "no_shift_link" || reason === "no_native_entries";
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[9px] font-medium",
        danger && "border-destructive/40 text-destructive bg-destructive/5",
        warn && "border-amber-400/40 text-amber-800 dark:text-amber-200 bg-amber-500/5",
        !danger && !warn && "text-muted-foreground",
      )}
    >
      {REASON_LABEL[reason]}
    </Badge>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 px-4 text-xs font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
