import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  CalendarDays,
  BarChart3,
  ArrowLeft,
} from "lucide-react";

interface PeriodAccum {
  period_id: string;
  start_date: string;
  end_date: string;
  base: number;
  extras: number;
  deductions: number;
  total: number;
}

export default function Accumulated() {
  const { employeeId } = useAuth();
  const [periods, setPeriods] = useState<PeriodAccum[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    async function load() {
      const { data: publishedPeriods } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date")
        .not("published_at", "is", null)
        .order("start_date", { ascending: false });

      const pIds = (publishedPeriods ?? []).map((p: any) => p.id);
      const pMap = new Map<string, { start_date: string; end_date: string }>();
      (publishedPeriods ?? []).forEach((p: any) => pMap.set(p.id, { start_date: p.start_date, end_date: p.end_date }));

      if (pIds.length === 0) {
        setPeriods([]);
        setLoading(false);
        return;
      }

      const [bpRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("period_id, base_total_pay").eq("employee_id", employeeId).in("period_id", pIds),
        supabase.from("movements").select("period_id, total_value, concepts(category)").eq("employee_id", employeeId).in("period_id", pIds),
      ]);

      const map = new Map<string, PeriodAccum>();
      (bpRes.data ?? []).forEach((bp: any) => {
        const info = pMap.get(bp.period_id);
        if (!info) return;
        map.set(bp.period_id, {
          period_id: bp.period_id,
          start_date: info.start_date,
          end_date: info.end_date,
          base: Number(bp.base_total_pay) || 0,
          extras: 0,
          deductions: 0,
          total: 0,
        });
      });

      (movRes.data ?? []).forEach((m: any) => {
        const row = map.get(m.period_id);
        if (!row) return;
        if (m.concepts?.category === "extra") row.extras += Number(m.total_value) || 0;
        else row.deductions += Number(m.total_value) || 0;
      });

      map.forEach(r => { r.total = r.base + r.extras - r.deductions; });

      setPeriods(Array.from(map.values()).sort((a, b) => b.start_date.localeCompare(a.start_date)));
      setLoading(false);
    }
    load();
  }, [employeeId]);

  const totals = useMemo(() => {
    const base = periods.reduce((s, r) => s + r.base, 0);
    const extras = periods.reduce((s, r) => s + r.extras, 0);
    const deductions = periods.reduce((s, r) => s + r.deductions, 0);
    return { base, extras, deductions, final: base + extras - deductions };
  }, [periods]);

  // Running accumulated total per period (oldest → newest order for cumulative, display newest first)
  const periodsWithAccum = useMemo(() => {
    const reversed = [...periods].reverse();
    let running = 0;
    const withAccum = reversed.map(p => {
      running += p.total;
      return { ...p, accumulated: running };
    });
    return withAccum.reverse();
  }, [periods]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-36 animate-pulse bg-primary/20 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 animate-pulse bg-muted rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-5 text-primary-foreground shadow-lg">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />

        <div className="relative z-10">
          <Link to="/portal" className="inline-flex items-center gap-1 text-xs opacity-70 hover:opacity-100 transition-opacity mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver al dashboard
          </Link>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-5 w-5" />
            <h1 className="text-2xl font-bold font-heading">Acumulado Histórico</h1>
          </div>
          <p className="text-sm opacity-80">Tu total ganado a lo largo del tiempo</p>

          <div className="mt-4 bg-white/15 backdrop-blur-sm rounded-xl p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider opacity-70">Total acumulado</p>
                <p className="text-2xl font-bold font-heading mt-0.5">
                  ${totals.final.toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider opacity-70">Semanas</p>
                <p className="text-lg font-bold font-heading">{periods.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Base</p>
            <div className="h-7 w-7 rounded-lg bg-warning/10 flex items-center justify-center">
              <DollarSign className="h-3.5 w-3.5 text-warning" />
            </div>
          </div>
          <p className="text-lg font-bold font-heading">${totals.base.toFixed(2)}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-earning">Extras</p>
            <div className="h-7 w-7 rounded-lg bg-earning/10 flex items-center justify-center">
              <TrendingUp className="h-3.5 w-3.5 text-earning" />
            </div>
          </div>
          <p className="text-lg font-bold font-heading text-earning">+${totals.extras.toFixed(2)}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-deduction">Deduc.</p>
            <div className="h-7 w-7 rounded-lg bg-destructive/10 flex items-center justify-center">
              <TrendingDown className="h-3.5 w-3.5 text-deduction" />
            </div>
          </div>
          <p className="text-lg font-bold font-heading text-deduction">−${totals.deductions.toFixed(2)}</p>
        </div>
      </div>

      {/* Period-by-period breakdown */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <span className="text-base">📊</span> Desglose por semana
        </h2>

        {periods.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No hay pagos publicados aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {periodsWithAccum.map(p => (
              <Link
                key={p.period_id}
                to={`/portal/week/${p.period_id}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {p.start_date} → {p.end_date}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[11px]">
                    <span className="text-muted-foreground">Base: ${p.base.toFixed(2)}</span>
                    {p.extras > 0 && <span className="text-earning">+${p.extras.toFixed(2)}</span>}
                    {p.deductions > 0 && <span className="text-deduction">−${p.deductions.toFixed(2)}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-heading">${p.total.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-end">
                    <Wallet className="h-3 w-3" /> ${p.accumulated.toFixed(2)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
