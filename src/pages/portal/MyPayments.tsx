import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  CalendarDays,
  BarChart3,
  Wallet,
  Clock,
} from "lucide-react";

interface PaymentRow {
  period_id: string;
  start_date: string;
  end_date: string;
  base_total_pay: number;
  extras_total: number;
  deductions_total: number;
  total_final_pay: number;
}

export default function MyPayments() {
  const { employeeId } = useAuth();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    async function load() {
      const { data: publishedPeriods } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date")
        .not("published_at", "is", null)
        .order("start_date", { ascending: false });

      const publishedIds = new Set((publishedPeriods ?? []).map((p: any) => p.id));
      const periodMap = new Map<string, { start_date: string; end_date: string }>();
      (publishedPeriods ?? []).forEach((p: any) => periodMap.set(p.id, { start_date: p.start_date, end_date: p.end_date }));

      if (publishedIds.size === 0) {
        setPayments([]);
        setLoading(false);
        return;
      }

      const [bpRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("period_id, base_total_pay").eq("employee_id", employeeId).in("period_id", Array.from(publishedIds)),
        supabase.from("movements").select("period_id, total_value, concepts(category)").eq("employee_id", employeeId).in("period_id", Array.from(publishedIds)),
      ]);

      const paymentMap = new Map<string, PaymentRow>();
      (bpRes.data ?? []).forEach((bp: any) => {
        const pInfo = periodMap.get(bp.period_id);
        if (!pInfo) return;
        paymentMap.set(bp.period_id, {
          period_id: bp.period_id,
          start_date: pInfo.start_date,
          end_date: pInfo.end_date,
          base_total_pay: Number(bp.base_total_pay) || 0,
          extras_total: 0,
          deductions_total: 0,
          total_final_pay: 0,
        });
      });

      (movRes.data ?? []).forEach((m: any) => {
        const row = paymentMap.get(m.period_id);
        if (!row) return;
        if (m.concepts?.category === "extra") {
          row.extras_total += Number(m.total_value) || 0;
        } else {
          row.deductions_total += Number(m.total_value) || 0;
        }
      });

      paymentMap.forEach(row => {
        row.total_final_pay = row.base_total_pay + row.extras_total - row.deductions_total;
      });

      // Sort by start_date descending
      const sorted = Array.from(paymentMap.values()).sort((a, b) => b.start_date.localeCompare(a.start_date));
      setPayments(sorted);
      setLoading(false);
    }
    load();
  }, [employeeId]);

  const accumulated = useMemo(() => payments.reduce((s, r) => s + r.total_final_pay, 0), [payments]);
  const totalBase = useMemo(() => payments.reduce((s, r) => s + r.base_total_pay, 0), [payments]);
  const totalExtras = useMemo(() => payments.reduce((s, r) => s + r.extras_total, 0), [payments]);
  const totalDeductions = useMemo(() => payments.reduce((s, r) => s + r.deductions_total, 0), [payments]);

  const latestPayment = payments[0] ?? null;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  })();

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
      {/* Hero gradient card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-5 text-primary-foreground shadow-lg">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />

        <div className="relative z-10">
          <p className="text-sm opacity-80 flex items-center gap-1.5">
            <span className="text-base">✨</span> {greeting}
          </p>
          <h1 className="text-2xl font-bold font-heading mt-1">Mis Pagos</h1>

          {latestPayment && (
            <div className="mt-4 bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider opacity-70 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Último periodo
                  </p>
                  <p className="text-sm font-semibold mt-0.5">
                    {latestPayment.start_date} → {latestPayment.end_date}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider opacity-70">Total</p>
                  <p className="text-lg font-bold font-heading">
                    ${latestPayment.total_final_pay.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Acumulado</p>
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="text-xl font-bold font-heading">${accumulated.toFixed(2)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{payments.length} semanas</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pago Base</p>
            <div className="h-8 w-8 rounded-xl bg-warning/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-warning" />
            </div>
          </div>
          <p className="text-xl font-bold font-heading">${totalBase.toFixed(2)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">total acumulado</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-earning">Extras</p>
            <div className="h-8 w-8 rounded-xl bg-earning/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-earning" />
            </div>
          </div>
          <p className="text-xl font-bold font-heading text-earning">+${totalExtras.toFixed(2)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">total extras</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-deduction">Deducciones</p>
            <div className="h-8 w-8 rounded-xl bg-destructive/10 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-deduction" />
            </div>
          </div>
          <p className="text-xl font-bold font-heading text-deduction">−${totalDeductions.toFixed(2)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">total deducciones</p>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
          <span className="text-base">⚡</span> Accesos rápidos
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/portal/accumulated"
            className="group rounded-2xl border border-border bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Acumulado</p>
                <p className="text-[11px] text-muted-foreground">Historial completo</p>
              </div>
            </div>
          </Link>

          {latestPayment && (
            <Link
              to={`/portal/week/${latestPayment.period_id}`}
              className="group rounded-2xl border border-border bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-earning/10 flex items-center justify-center shrink-0 group-hover:bg-earning/20 transition-colors">
                  <CalendarDays className="h-5 w-5 text-earning" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Última semana</p>
                  <p className="text-[11px] text-muted-foreground">Ver detalle</p>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* Payments list */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Historial de pagos</h2>
        {payments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No hay pagos publicados aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map(p => (
              <Link
                key={p.period_id}
                to={`/portal/week/${p.period_id}`}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {p.start_date} → {p.end_date}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[11px]">
                    <span className="text-muted-foreground">Base: ${p.base_total_pay.toFixed(2)}</span>
                    {p.extras_total > 0 && <span className="text-earning">+${p.extras_total.toFixed(2)}</span>}
                    {p.deductions_total > 0 && <span className="text-deduction">−${p.deductions_total.toFixed(2)}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-heading">${p.total_final_pay.toFixed(2)}</p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto mt-0.5 group-hover:text-primary transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
