import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, ChevronDown,
  CalendarDays, BarChart3, Wallet, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentRow {
  period_id: string;
  start_date: string;
  end_date: string;
  base_total_pay: number;
  extras_total: number;
  deductions_total: number;
  total_final_pay: number;
}

interface MovementDetail {
  id: string;
  concept_name: string;
  category: string;
  quantity: number | null;
  rate: number | null;
  total_value: number;
  note: string | null;
}

/* ─── Mini sparkline bar chart ─── */
function PaymentTrendChart({ payments }: { payments: PaymentRow[] }) {
  const last = [...payments].reverse().slice(-8);
  if (last.length < 2) return null;
  const max = Math.max(...last.map(p => p.total_final_pay), 1);
  const prev = last.length >= 2 ? last[last.length - 2].total_final_pay : 0;
  const current = last[last.length - 1].total_final_pay;
  const diff = prev > 0 ? ((current - prev) / prev) * 100 : 0;
  const isUp = diff >= 0;

  return (
    <div className="rounded-2xl bg-card border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tendencia de pagos</p>
        <div className={cn(
          "flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full",
          isUp ? "text-earning bg-earning/10" : "text-deduction bg-deduction/10"
        )}>
          {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(diff).toFixed(1)}%
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-16">
        {last.map((p, i) => {
          const h = Math.max(4, (p.total_final_pay / max) * 100);
          const isLast = i === last.length - 1;
          return (
            <div key={p.period_id} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-full rounded-t-md transition-all",
                  isLast ? "bg-primary" : "bg-primary/20"
                )}
                style={{ height: `${h}%` }}
                title={`$${p.total_final_pay.toFixed(2)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{last[0].start_date.slice(5)}</span>
        <span>{last[last.length - 1].start_date.slice(5)}</span>
      </div>
    </div>
  );
}

export default function MyPayments() {
  const { employeeId } = useAuth();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const [periodDetails, setPeriodDetails] = useState<Record<string, MovementDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  const loadPeriodDetails = useCallback(async (periodId: string) => {
    if (periodDetails[periodId]) return;
    if (!employeeId) return;
    setLoadingDetails(periodId);
    const { data } = await supabase
      .from("movements")
      .select("id, total_value, quantity, rate, note, concepts(name, category)")
      .eq("employee_id", employeeId)
      .eq("period_id", periodId);

    const details: MovementDetail[] = (data ?? []).map((m: any) => ({
      id: m.id,
      concept_name: m.concepts?.name ?? "",
      category: m.concepts?.category ?? "",
      quantity: m.quantity,
      rate: m.rate,
      total_value: Number(m.total_value),
      note: m.note,
    }));

    setPeriodDetails(prev => ({ ...prev, [periodId]: details }));
    setLoadingDetails(null);
  }, [employeeId, periodDetails]);

  const toggleExpand = useCallback((periodId: string) => {
    if (expandedPeriod === periodId) {
      setExpandedPeriod(null);
    } else {
      setExpandedPeriod(periodId);
      loadPeriodDetails(periodId);
    }
  }, [expandedPeriod, loadPeriodDetails]);

  useEffect(() => {
    if (!employeeId) return;
    async function load() {
      const { data: publishedPeriods } = await supabase
        .from("pay_periods")
        .select("id, start_date, end_date")
        .not("published_at", "is", null)
        .order("start_date", { ascending: false });

      const publishedIds = (publishedPeriods ?? []).map((p: any) => p.id);
      const periodMap = new Map<string, { start_date: string; end_date: string }>();
      (publishedPeriods ?? []).forEach((p: any) => periodMap.set(p.id, { start_date: p.start_date, end_date: p.end_date }));

      if (publishedIds.length === 0) {
        setPayments([]);
        setLoading(false);
        return;
      }

      const [bpRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("period_id, base_total_pay").eq("employee_id", employeeId).in("period_id", publishedIds),
        supabase.from("movements").select("period_id, total_value, concepts(category)").eq("employee_id", employeeId).in("period_id", publishedIds),
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

      const sorted = Array.from(paymentMap.values()).sort((a, b) => b.start_date.localeCompare(a.start_date));
      setPayments(sorted);
      setLoading(false);
    }
    load();
  }, [employeeId]);

  const accumulated = useMemo(() => payments.reduce((s, r) => s + r.total_final_pay, 0), [payments]);
  const latestPayment = payments[0] ?? null;

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
        <h1 className="text-2xl font-bold font-heading tracking-tight">Nómina</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Tu historial de pagos y tendencia</p>
      </div>

      {/* Latest payment hero */}
      {latestPayment && (
        <div className="rounded-2xl bg-card border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Último pago</p>
              <p className="text-3xl font-bold font-heading mt-1.5 tracking-tight tabular-nums">
                ${latestPayment.total_final_pay.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {latestPayment.start_date} → {latestPayment.end_date}
              </p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center">
              <Wallet className="h-7 w-7 text-primary" />
            </div>
          </div>
        </div>
      )}

      {/* Payment trend chart — MOVED HERE */}
      <PaymentTrendChart payments={payments} />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-card border p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium">Acumulado</p>
          <p className="text-lg font-bold font-heading mt-1 tabular-nums">${accumulated.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-card border p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium">Semanas</p>
          <p className="text-lg font-bold font-heading mt-1">{payments.length}</p>
        </div>
        <Link to="/portal/accumulated" className="rounded-2xl bg-card border p-4 text-center hover:bg-accent/50 transition-colors group">
          <p className="text-xs text-muted-foreground font-medium">Historial</p>
          <BarChart3 className="h-5 w-5 text-primary mx-auto mt-2 group-hover:scale-110 transition-transform" />
        </Link>
      </div>

      {/* Payments list */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-4">Historial de pagos</h2>
        {payments.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay pagos publicados aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map(p => {
              const isExpanded = expandedPeriod === p.period_id;
              const details = periodDetails[p.period_id];
              const isLoadingThis = loadingDetails === p.period_id;
              const extras = details?.filter(m => m.category === "extra") ?? [];
              const deductions = details?.filter(m => m.category === "deduction") ?? [];

              return (
                <div
                  key={p.period_id}
                  className={cn(
                    "rounded-2xl border bg-card overflow-hidden transition-all",
                    isExpanded && "ring-1 ring-primary/20"
                  )}
                >
                  <button
                    onClick={() => toggleExpand(p.period_id)}
                    className="w-full flex items-center gap-4 p-4 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {p.start_date} → {p.end_date}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">Base ${p.base_total_pay.toFixed(0)}</span>
                        {p.extras_total > 0 && <span className="text-xs text-earning">+${p.extras_total.toFixed(0)}</span>}
                        {p.deductions_total > 0 && <span className="text-xs text-deduction">−${p.deductions_total.toFixed(0)}</span>}
                      </div>
                    </div>
                    <span className="text-sm font-bold font-heading tabular-nums">${p.total_final_pay.toFixed(2)}</span>
                    <ChevronDown className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isExpanded && "rotate-180"
                    )} />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 animate-fade-in">
                      <div className="border-t pt-4 space-y-3">
                        {isLoadingThis ? (
                          <div className="flex items-center justify-center py-6 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            <span className="text-sm">Cargando...</span>
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-4 gap-2">
                              <div className="rounded-xl bg-muted/50 p-2.5 text-center">
                                <p className="text-[10px] text-muted-foreground">Base</p>
                                <p className="text-xs font-bold mt-0.5">${p.base_total_pay.toFixed(2)}</p>
                              </div>
                              <div className="rounded-xl bg-earning/5 p-2.5 text-center">
                                <p className="text-[10px] text-earning">Extras</p>
                                <p className="text-xs font-bold text-earning mt-0.5">+${p.extras_total.toFixed(2)}</p>
                              </div>
                              <div className="rounded-xl bg-destructive/5 p-2.5 text-center">
                                <p className="text-[10px] text-deduction">Deduc.</p>
                                <p className="text-xs font-bold text-deduction mt-0.5">−${p.deductions_total.toFixed(2)}</p>
                              </div>
                              <div className="rounded-xl bg-primary/5 p-2.5 text-center">
                                <p className="text-[10px] text-primary">Total</p>
                                <p className="text-xs font-bold mt-0.5">${p.total_final_pay.toFixed(2)}</p>
                              </div>
                            </div>

                            {extras.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-earning mb-1.5">Extras</p>
                                <div className="space-y-1">
                                  {extras.map(m => (
                                    <div key={m.id} className="flex items-center justify-between rounded-xl bg-earning/5 px-3 py-2">
                                      <span className="text-xs font-medium text-foreground">{m.concept_name}</span>
                                      <span className="text-xs font-bold text-earning">+${m.total_value.toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {deductions.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-deduction mb-1.5">Deducciones</p>
                                <div className="space-y-1">
                                  {deductions.map(m => (
                                    <div key={m.id} className="flex items-center justify-between rounded-xl bg-destructive/5 px-3 py-2">
                                      <span className="text-xs font-medium text-foreground">{m.concept_name}</span>
                                      <span className="text-xs font-bold text-deduction">−${m.total_value.toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {details && details.length === 0 && (
                              <p className="text-xs text-muted-foreground text-center py-2">Sin movimientos adicionales</p>
                            )}

                            <div className="flex items-center justify-center gap-4 pt-1">
                              <Link
                                to={`/portal/paystub/${p.period_id}`}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Ver recibo de pago →
                              </Link>
                              <Link
                                to={`/portal/week/${p.period_id}`}
                                className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                              >
                                Ver turnos y horas →
                              </Link>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
