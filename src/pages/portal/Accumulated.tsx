import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarDays, Wallet } from "lucide-react";

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
        .from("pay_periods").select("id, start_date, end_date")
        .not("published_at", "is", null).order("start_date", { ascending: false });

      const pIds = (publishedPeriods ?? []).map((p: any) => p.id);
      const pMap = new Map<string, { start_date: string; end_date: string }>();
      (publishedPeriods ?? []).forEach((p: any) => pMap.set(p.id, { start_date: p.start_date, end_date: p.end_date }));

      if (pIds.length === 0) { setPeriods([]); setLoading(false); return; }

      const [bpRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("period_id, base_total_pay").eq("employee_id", employeeId).in("period_id", pIds),
        supabase.from("movements").select("period_id, total_value, concepts(category)").eq("employee_id", employeeId).in("period_id", pIds),
      ]);

      const map = new Map<string, PeriodAccum>();
      (bpRes.data ?? []).forEach((bp: any) => {
        const info = pMap.get(bp.period_id);
        if (!info) return;
        map.set(bp.period_id, { period_id: bp.period_id, start_date: info.start_date, end_date: info.end_date, base: Number(bp.base_total_pay) || 0, extras: 0, deductions: 0, total: 0 });
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

  const periodsWithAccum = useMemo(() => {
    const reversed = [...periods].reverse();
    let running = 0;
    return reversed.map(p => { running += p.total; return { ...p, accumulated: running }; }).reverse();
  }, [periods]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/portal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="text-2xl font-bold font-heading tracking-tight">Acumulado Histórico</h1>
        <p className="text-sm text-muted-foreground mt-1">Tu total ganado a lo largo del tiempo</p>
      </div>

      {/* Total card */}
      <div className="rounded-2xl bg-card border p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total acumulado</p>
            <p className="text-3xl font-bold font-heading mt-2 tracking-tight">${totals.final.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-1">{periods.length} semanas</p>
          </div>
          <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center">
            <Wallet className="h-7 w-7 text-primary" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-card border p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium">Base</p>
          <p className="text-lg font-bold font-heading mt-1">${totals.base.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-card border p-4 text-center">
          <p className="text-xs text-earning font-medium">Extras</p>
          <p className="text-lg font-bold font-heading text-earning mt-1">+${totals.extras.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-card border p-4 text-center">
          <p className="text-xs text-deduction font-medium">Deducciones</p>
          <p className="text-lg font-bold font-heading text-deduction mt-1">−${totals.deductions.toFixed(0)}</p>
        </div>
      </div>

      {/* Period list */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-4">Desglose por semana</h2>
        {periods.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay pagos publicados aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {periodsWithAccum.map(p => (
              <Link
                key={p.period_id}
                to={`/portal/week/${p.period_id}`}
                className="flex items-center gap-4 rounded-2xl border bg-card p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {p.start_date} → {p.end_date}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">Base ${p.base.toFixed(0)}</span>
                    {p.extras > 0 && <span className="text-xs text-earning">+${p.extras.toFixed(0)}</span>}
                    {p.deductions > 0 && <span className="text-xs text-deduction">−${p.deductions.toFixed(0)}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-heading tabular-nums">${p.total.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Acum. ${p.accumulated.toFixed(0)}
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