import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarDays, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

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
  const [empName, setEmpName] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<{ start_date: string; end_date: string; status: string; published_at: string | null } | null>(null);

  useEffect(() => {
    if (!employeeId) return;
    async function load() {
      // Fetch employee info
      const { data: empData } = await supabase
        .from("employees")
        .select("first_name, last_name, company_id")
        .eq("id", employeeId)
        .maybeSingle();
      if (empData) {
        setEmpName(`${empData.first_name} ${empData.last_name}`);
        const { data: comp } = await supabase.from("companies").select("name").eq("id", empData.company_id).maybeSingle();
        setCompanyName(comp?.name ?? null);
        const { data: latestPeriod } = await supabase.from("pay_periods")
          .select("start_date, end_date, status, published_at")
          .eq("company_id", empData.company_id)
          .order("start_date", { ascending: false }).limit(1).maybeSingle();
        setCurrentPeriod(latestPeriod ?? null);
      }

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

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const periodStatusLabel = currentPeriod
    ? currentPeriod.published_at
      ? { label: "Publicado", cls: "bg-primary/10 text-primary" }
      : currentPeriod.status === "open"
        ? { label: "Abierto", cls: "bg-earning/10 text-earning" }
        : { label: "Cerrado", cls: "bg-warning/10 text-warning" }
    : null;

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
        <PageHeader
          variant="2"
          title={empName ? `${greeting}, ${empName}` : "Acumulado Histórico"}
          subtitle="Tu total ganado a lo largo del tiempo"
          badge="Semanal"
        />
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