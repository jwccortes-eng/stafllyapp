import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Loader2, Search, AlertTriangle, ChevronRight, DollarSign } from "lucide-react";
import { format, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MobileAdminModuleShell,
  MobileAdminHeader,
  MobileAdminTabs,
  MobileSummaryStrip,
  MobileEntityCard,
  MOBILE_PAGE_PX,
  type MobileMetric,
} from "@/components/admin/mobile";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { cn } from "@/lib/utils";

/**
 * MobilePeriodSummaryView — Phase 1, read-only.
 * Mirrors the desktop PeriodSummary data model (period_base_pay + movements)
 * but renders an operator-first mobile UI: header, period chip, summary strip,
 * tabs (Summary / Issues), and entity cards per worker.
 *
 * No mutations. Heavy actions (close period, mark paid, send emails) are NOT
 * exposed in mobile Phase 1 — admins are routed to desktop.
 */

interface Period {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  paid_at: string | null;
}

interface Row {
  employee_id: string;
  first_name: string;
  last_name: string;
  base_total_pay: number;
  extras_total: number;
  deductions_total: number;
  total_final_pay: number;
}

type TabKey = "summary" | "issues";

const fmt$ = (n: number) =>
  `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function MobilePeriodSummaryView() {
  const { selectedCompanyId } = useCompany();
  const [searchParams, setSearchParams] = useSearchParams();

  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>(searchParams.get("periodId") ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("summary");
  const [search, setSearch] = useState("");

  // Fetch periods (tenant-scoped)
  useEffect(() => {
    if (!selectedCompanyId) {
      setPeriods([]);
      setLoading(false);
      return;
    }
    let alive = true;
    supabase
      .from("pay_periods")
      .select("id, start_date, end_date, status, paid_at")
      .eq("company_id", selectedCompanyId)
      .order("start_date", { ascending: false })
      .then(({ data }) => {
        if (!alive) return;
        const list = (data ?? []) as Period[];
        setPeriods(list);
        if (!periodId && list.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const current = list.find(p => p.start_date <= today && p.end_date >= today);
          const next = current?.id ?? list.find(p => p.end_date < today)?.id ?? list[0].id;
          setPeriodId(next);
          setSearchParams({ periodId: next });
        }
      });
    return () => { alive = false; };
  }, [selectedCompanyId]);

  // Fetch rows (period_base_pay + movements) — same shape as desktop
  useEffect(() => {
    if (!periodId || !selectedCompanyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);

    (async () => {
      const [bpRes, mvRes, mvEmpRes] = await Promise.all([
        supabase
          .from("period_base_pay")
          .select("employee_id, base_total_pay, employees(first_name, last_name)")
          .eq("period_id", periodId),
        supabase
          .from("movements")
          .select("employee_id, total_value, concepts(category)")
          .eq("period_id", periodId)
          .eq("approval_status", "approved"),
        supabase
          .from("movements")
          .select("employee_id, employees(first_name, last_name)")
          .eq("period_id", periodId),
      ]);

      if (!alive) return;

      const map = new Map<string, Row>();

      for (const bp of (bpRes.data ?? []) as any[]) {
        const emp = bp.employees ?? {};
        map.set(bp.employee_id, {
          employee_id: bp.employee_id,
          first_name: emp.first_name ?? "",
          last_name: emp.last_name ?? "",
          base_total_pay: Number(bp.base_total_pay ?? 0),
          extras_total: 0,
          deductions_total: 0,
          total_final_pay: 0,
        });
      }

      for (const mv of (mvEmpRes.data ?? []) as any[]) {
        if (!map.has(mv.employee_id)) {
          const emp = mv.employees ?? {};
          map.set(mv.employee_id, {
            employee_id: mv.employee_id,
            first_name: emp.first_name ?? "",
            last_name: emp.last_name ?? "",
            base_total_pay: 0,
            extras_total: 0,
            deductions_total: 0,
            total_final_pay: 0,
          });
        }
      }

      // Convención canónica: extras y deducciones se agregan como magnitud positiva.
      for (const m of (mvRes.data ?? []) as any[]) {
        const r = map.get(m.employee_id);
        if (!r) continue;
        const v = Math.abs(Number(m.total_value ?? 0));
        if (m.concepts?.category === "extra") r.extras_total += v;
        else r.deductions_total += v;
      }

      for (const r of map.values()) {
        r.total_final_pay = r.base_total_pay + r.extras_total - r.deductions_total;
      }

      setRows(Array.from(map.values()));
      setLoading(false);
    })();

    return () => { alive = false; };
  }, [periodId, selectedCompanyId]);

  const period = useMemo(() => periods.find(p => p.id === periodId), [periods, periodId]);

  const totals = useMemo(() => {
    let workers = 0, base = 0, extras = 0, deductions = 0, finalPay = 0;
    for (const r of rows) {
      workers++;
      base += r.base_total_pay;
      extras += r.extras_total;
      deductions += r.deductions_total;
      finalPay += r.total_final_pay;
    }
    return { workers, base, extras, deductions, finalPay };
  }, [rows]);

  const issues = useMemo(
    () => rows.filter(r => r.base_total_pay <= 0 || r.total_final_pay < 0),
    [rows]
  );

  const filteredSummary = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    );
    if (!q) return sorted;
    return sorted.filter(r =>
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const filteredIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter(r =>
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(q)
    );
  }, [issues, search]);

  const periodLabel = period
    ? `${format(parseISO(period.start_date), "MMM d", { locale: enUS })} – ${format(parseISO(period.end_date), "MMM d, yyyy", { locale: enUS })}`
    : "Select a period";

  const statusBadge = period && (
    period.paid_at ? (
      <Badge variant="outline" className="text-emerald-600 border-emerald-600/40 bg-emerald-500/10">Paid</Badge>
    ) : period.status === "closed" ? (
      <Badge variant="outline" className="text-blue-600 border-blue-600/40 bg-blue-500/10">Closed</Badge>
    ) : (
      <Badge variant="outline">Open</Badge>
    )
  );

  const metrics: MobileMetric[] = [
    { label: "Workers", value: totals.workers, tone: "default" },
    { label: "Base", value: fmt$(totals.base), tone: "default" },
    { label: "Extras", value: fmt$(totals.extras), tone: "success" },
    { label: "Final pay", value: fmt$(totals.finalPay), tone: "primary" },
  ];

  const tabs = [
    { key: "summary" as const, label: "Summary", count: rows.length },
    { key: "issues" as const, label: "Issues", count: issues.length },
  ];

  const list = tab === "summary" ? filteredSummary : filteredIssues;

  return (
    <MobileAdminModuleShell
      header={
        <MobileAdminHeader
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" /> Payroll period
            </span>
          }
          title="Payroll"
          subtitle={periodLabel}
          actions={statusBadge}
        />
      }
      tabs={
        <>
          {periods.length >= 1 && (
            <div className={cn(MOBILE_PAGE_PX, "pb-3")}>
              <select
                value={periodId}
                onChange={(e) => {
                  setPeriodId(e.target.value);
                  setSearchParams({ periodId: e.target.value });
                }}
                className="w-full h-11 px-3.5 rounded-xl border border-border/60 bg-card text-sm font-medium"
              >
                {periods.map(p => (
                  <option key={p.id} value={p.id}>
                    {format(parseISO(p.start_date), "MMM d", { locale: enUS })} – {format(parseISO(p.end_date), "MMM d, yyyy", { locale: enUS })}
                    {p.paid_at ? " · Paid" : p.status === "closed" ? " · Closed" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <MobileAdminTabs<TabKey> tabs={tabs} value={tab} onChange={setTab} />
        </>
      }
      summary={<MobileSummaryStrip metrics={metrics} columns={2} />}
      toolbar={
        <div className={cn(MOBILE_PAGE_PX, "pb-3")}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workers"
              className="h-11 pl-9 rounded-xl bg-card text-sm"
            />
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <div className={cn(MOBILE_PAGE_PX, "py-16 flex flex-col items-center text-center gap-3")}>
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
            {tab === "issues" ? (
              <span className="text-2xl">🎉</span>
            ) : (
              <DollarSign className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">
              {tab === "issues"
                ? "No issues for this period"
                : periods.length === 0
                  ? "No payroll periods yet"
                  : "No workers in this period"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {tab === "issues"
                ? "All workers have valid base pay."
                : periods.length === 0
                  ? "Create a period from desktop to get started."
                  : "Run consolidation from desktop to populate."}
            </p>
          </div>
        </div>
      ) : (
        <div className={cn(MOBILE_PAGE_PX, "space-y-2.5")}>
          {list.map((r) => {
            const fullName = `${r.first_name} ${r.last_name}`.trim() || "Unnamed";
            const negative = r.total_final_pay < 0;
            const zeroBase = r.base_total_pay <= 0;
            const tone = negative ? "danger" : zeroBase ? "warning" : "default";

            return (
              <Link
                key={r.employee_id}
                to={`/app/summary/detail?employeeId=${r.employee_id}&periodId=${periodId}`}
                className="block"
              >
                <MobileEntityCard
                  tone={tone}
                  leading={
                    <EmployeeAvatar
                      firstName={r.first_name}
                      lastName={r.last_name}
                      size="md"
                    />

                  }
                  title={fullName}
                  subtitle={
                    <span className="font-mono">
                      {fmt$(r.base_total_pay)} base
                      {r.extras_total > 0 && <span className="text-emerald-600"> · +{fmt$(r.extras_total)}</span>}
                      {r.deductions_total > 0 && <span className="text-destructive"> · -{fmt$(r.deductions_total)}</span>}
                    </span>
                  }
                  trailing={
                    <div className="flex items-center gap-1.5">
                      <div className={cn("text-base font-semibold tabular-nums", negative && "text-destructive")}>
                        {fmt$(r.total_final_pay)}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  }
                  footer={
                    (zeroBase || negative) && (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        {negative ? "Negative final pay" : "No base pay"}
                      </div>
                    )
                  }
                />
              </Link>
            );
          })}
        </div>
      )}
    </MobileAdminModuleShell>
  );
}
