import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, ChevronDown,
  CalendarDays, BarChart3, Wallet, Loader2, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

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

const DATE_RANGES = [
  { key: "recent", label: "Reciente" },
  { key: "last4", label: "Último mes" },
  { key: "all", label: "Todo" },
] as const;

function formatPeriodLabel(start: string, end: string): string {
  try {
    const s = parseISO(start);
    const e = parseISO(end);
    return `${format(s, "d MMM", { locale: es })} → ${format(e, "d MMM", { locale: es })}`;
  } catch {
    return `${start} → ${end}`;
  }
}

function PaymentTrendChart({ payments }: { payments: PaymentRow[] }) {
  const last = [...payments].reverse().slice(-8);
  if (last.length < 2) return null;
  const max = Math.max(...last.map(p => p.total_final_pay), 1);
  const prev = last.length >= 2 ? last[last.length - 2].total_final_pay : 0;
  const current = last[last.length - 1].total_final_pay;
  const diff = prev > 0 ? ((current - prev) / prev) * 100 : 0;
  const isUp = diff >= 0;

  return (
    <div className="rounded-2xl bg-card border border-border/30 p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Tendencia</p>
        <div className={cn(
          "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
          isUp ? "text-[hsl(var(--status-confirmed))] bg-[hsl(var(--status-confirmed)/0.08)]" : "text-destructive bg-destructive/8"
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
                className={cn("w-full rounded-t-md transition-all", isLast ? "bg-primary" : "bg-primary/15")}
                style={{ height: `${h}%` }}
                title={`$${p.total_final_pay.toFixed(2)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/40 tabular-nums">
        <span>{formatPeriodLabel(last[0].start_date, last[0].end_date).split(" → ")[0]}</span>
        <span>{formatPeriodLabel(last[last.length - 1].start_date, last[last.length - 1].end_date).split(" → ")[0]}</span>
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
  const [dateRange, setDateRange] = useState<"recent" | "last4" | "all">("recent");

  const loadPeriodDetails = useCallback(async (periodId: string) => {
    if (periodDetails[periodId]) return;
    if (!employeeId) return;
    setLoadingDetails(periodId);
    const { data } = await supabase
      .from("movements").select("id, total_value, quantity, rate, note, concepts(name, category)")
      .eq("employee_id", employeeId).eq("period_id", periodId);
    const details: MovementDetail[] = (data ?? []).map((m: any) => ({
      id: m.id, concept_name: m.concepts?.name ?? "", category: m.concepts?.category ?? "",
      quantity: m.quantity, rate: m.rate, total_value: Number(m.total_value), note: m.note,
    }));
    setPeriodDetails(prev => ({ ...prev, [periodId]: details }));
    setLoadingDetails(null);
  }, [employeeId, periodDetails]);

  const toggleExpand = useCallback((periodId: string) => {
    if (expandedPeriod === periodId) setExpandedPeriod(null);
    else { setExpandedPeriod(periodId); loadPeriodDetails(periodId); }
  }, [expandedPeriod, loadPeriodDetails]);

  useEffect(() => {
    if (!employeeId) return;
    async function load() {
      // First get employee's company_id for scoping
      const { data: empData } = await supabase
        .from("employees").select("company_id").eq("id", employeeId!).maybeSingle();
      if (!empData) { setPayments([]); setLoading(false); return; }

      const { data: publishedPeriods } = await supabase
        .from("pay_periods").select("id, start_date, end_date")
        .eq("company_id", empData.company_id)
        .not("published_at", "is", null).order("start_date", { ascending: false });
      const publishedIds = (publishedPeriods ?? []).map((p: any) => p.id);
      const periodMap = new Map<string, { start_date: string; end_date: string }>();
      (publishedPeriods ?? []).forEach((p: any) => periodMap.set(p.id, { start_date: p.start_date, end_date: p.end_date }));
      if (publishedIds.length === 0) { setPayments([]); setLoading(false); return; }

      const [bpRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("period_id, base_total_pay").eq("employee_id", employeeId!).in("period_id", publishedIds),
        supabase.from("movements").select("period_id, total_value, concepts(category)").eq("employee_id", employeeId!).in("period_id", publishedIds),
      ]);
      const paymentMap = new Map<string, PaymentRow>();
      (bpRes.data ?? []).forEach((bp: any) => {
        const pInfo = periodMap.get(bp.period_id);
        if (!pInfo) return;
        paymentMap.set(bp.period_id, {
          period_id: bp.period_id, start_date: pInfo.start_date, end_date: pInfo.end_date,
          base_total_pay: Number(bp.base_total_pay) || 0, extras_total: 0, deductions_total: 0, total_final_pay: 0,
        });
      });
      (movRes.data ?? []).forEach((m: any) => {
        const row = paymentMap.get(m.period_id);
        if (!row) return;
        if (m.concepts?.category === "extra") row.extras_total += Number(m.total_value) || 0;
        else row.deductions_total += Number(m.total_value) || 0;
      });
      paymentMap.forEach(row => { row.total_final_pay = row.base_total_pay + row.extras_total - row.deductions_total; });
      setPayments(Array.from(paymentMap.values()).sort((a, b) => b.start_date.localeCompare(a.start_date)));
      setLoading(false);
    }
    load();
  }, [employeeId]);

  const filteredPayments = useMemo(() => {
    if (dateRange === "all") return payments;
    if (dateRange === "last4") return payments.slice(0, 4);
    return payments.slice(0, 2);
  }, [payments, dateRange]);

  const accumulated = useMemo(() => payments.reduce((s, r) => s + r.total_final_pay, 0), [payments]);
  const latestPayment = payments[0] ?? null;

  if (loading) {
    return (
      <div className="space-y-3 pt-4">
        {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold font-heading tracking-tight text-foreground">Mis Pagos</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {payments.length > 0 ? `${payments.length} período${payments.length > 1 ? "s" : ""} registrado${payments.length > 1 ? "s" : ""}` : "Sin pagos publicados"}
        </p>
      </div>

      {/* Hero card */}
      {latestPayment && (
        <div className="rounded-2xl bg-card border border-border/30 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold">Último período</p>
              <p className="text-3xl font-bold font-heading mt-1.5 tracking-tight tabular-nums text-foreground">
                ${latestPayment.total_final_pay.toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {formatPeriodLabel(latestPayment.start_date, latestPayment.end_date)}
              </p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center">
              <Wallet className="h-7 w-7 text-primary" />
            </div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl bg-card border border-border/30 p-3.5 text-center shadow-sm">
          <DollarSign className="h-4 w-4 mx-auto text-primary/40 mb-1" />
          <p className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-widest">Acumulado</p>
          <p className="text-base font-bold font-heading mt-1 tabular-nums">${accumulated.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-card border border-border/30 p-3.5 text-center shadow-sm">
          <CalendarDays className="h-4 w-4 mx-auto text-primary/40 mb-1" />
          <p className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-widest">Períodos</p>
          <p className="text-base font-bold font-heading mt-1 tabular-nums">{payments.length}</p>
        </div>
        <Link to="/portal/accumulated" className="rounded-2xl bg-card border border-border/30 p-3.5 text-center hover:bg-accent/50 transition-colors group shadow-sm">
          <BarChart3 className="h-4 w-4 mx-auto text-primary/40 mb-1 group-hover:text-primary transition-colors" />
          <p className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-widest">Historial</p>
          <p className="text-xs text-primary font-bold mt-1">Ver →</p>
        </Link>
      </div>

      {/* Trend chart */}
      <PaymentTrendChart payments={payments} />

      {/* Date range chips */}
      <div className="flex items-center gap-1 bg-muted/30 rounded-xl p-1">
        {DATE_RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => setDateRange(r.key)}
            className={cn(
              "flex-1 text-[11px] font-semibold py-2 rounded-lg transition-all text-center",
              dateRange === r.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground/60 hover:text-foreground"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Payments list */}
      <div>
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-3 px-1">Historial de pagos</h2>
        {payments.length === 0 ? (
          <div className="text-center py-14 space-y-3">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/30 flex items-center justify-center">
              <Wallet className="h-7 w-7 text-muted-foreground/20" />
            </div>
            <p className="text-sm font-bold text-foreground">Sin pagos publicados</p>
            <p className="text-xs text-muted-foreground/60 max-w-[240px] mx-auto">
              Tu historial de pagos aparecerá aquí cuando tu empresa publique un período.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPayments.map(p => {
              const isExpanded = expandedPeriod === p.period_id;
              const details = periodDetails[p.period_id];
              const isLoadingThis = loadingDetails === p.period_id;
              const extras = details?.filter(m => m.category === "extra") ?? [];
              const deductions = details?.filter(m => m.category === "deduction") ?? [];

              return (
                <div key={p.period_id} className={cn(
                  "rounded-2xl border bg-card overflow-hidden transition-all shadow-sm",
                  isExpanded ? "ring-1 ring-primary/20 border-primary/15" : "border-border/30"
                )}>
                  <button onClick={() => toggleExpand(p.period_id)} className="w-full flex items-center gap-3 p-4 text-left active:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-foreground">
                        {formatPeriodLabel(p.start_date, p.end_date)}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground font-medium tabular-nums">Base ${p.base_total_pay.toFixed(0)}</span>
                        {p.extras_total > 0 && <span className="text-[10px] text-[hsl(var(--status-confirmed))] font-bold tabular-nums">+${p.extras_total.toFixed(0)}</span>}
                        {p.deductions_total > 0 && <span className="text-[10px] text-destructive font-bold tabular-nums">−${p.deductions_total.toFixed(0)}</span>}
                      </div>
                    </div>
                    <span className="text-sm font-bold font-heading tabular-nums shrink-0">${p.total_final_pay.toFixed(2)}</span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground/30 transition-transform shrink-0", isExpanded && "rotate-180")} />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 animate-fade-in">
                      <div className="border-t border-border/30 pt-4 space-y-3">
                        {isLoadingThis ? (
                          <div className="flex items-center justify-center py-6 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            <span className="text-xs">Cargando detalles...</span>
                          </div>
                        ) : (
                          <>
                            {/* Summary grid */}
                            <div className="grid grid-cols-4 gap-2">
                              <div className="rounded-xl bg-muted/40 p-2.5 text-center">
                                <p className="text-[9px] text-muted-foreground/60 font-bold">Base</p>
                                <p className="text-xs font-bold mt-0.5 tabular-nums">${p.base_total_pay.toFixed(2)}</p>
                              </div>
                              <div className="rounded-xl bg-[hsl(var(--status-confirmed)/0.05)] p-2.5 text-center">
                                <p className="text-[9px] text-[hsl(var(--status-confirmed))] font-bold">Extras</p>
                                <p className="text-xs font-bold text-[hsl(var(--status-confirmed))] mt-0.5 tabular-nums">+${p.extras_total.toFixed(2)}</p>
                              </div>
                              <div className="rounded-xl bg-destructive/5 p-2.5 text-center">
                                <p className="text-[9px] text-destructive font-bold">Deduc.</p>
                                <p className="text-xs font-bold text-destructive mt-0.5 tabular-nums">−${p.deductions_total.toFixed(2)}</p>
                              </div>
                              <div className="rounded-xl bg-primary/5 p-2.5 text-center">
                                <p className="text-[9px] text-primary font-bold">Total</p>
                                <p className="text-xs font-bold mt-0.5 tabular-nums">${p.total_final_pay.toFixed(2)}</p>
                              </div>
                            </div>

                            {/* Extras */}
                            {extras.length > 0 && (
                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--status-confirmed))] mb-1.5">Extras</p>
                                <div className="space-y-1">
                                  {extras.map(m => (
                                    <div key={m.id} className="flex items-center justify-between rounded-xl bg-[hsl(var(--status-confirmed)/0.05)] px-3 py-2">
                                      <span className="text-xs font-medium text-foreground">{m.concept_name}</span>
                                      <span className="text-xs font-bold text-[hsl(var(--status-confirmed))] tabular-nums">+${m.total_value.toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Deductions */}
                            {deductions.length > 0 && (
                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-destructive mb-1.5">Deducciones</p>
                                <div className="space-y-1">
                                  {deductions.map(m => (
                                    <div key={m.id} className="flex items-center justify-between rounded-xl bg-destructive/5 px-3 py-2">
                                      <span className="text-xs font-medium text-foreground">{m.concept_name}</span>
                                      <span className="text-xs font-bold text-destructive tabular-nums">−${m.total_value.toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {details && details.length === 0 && (
                              <p className="text-xs text-muted-foreground/60 text-center py-2">Sin movimientos adicionales para este período</p>
                            )}

                            <div className="flex items-center justify-center gap-5 pt-1">
                              <Link to={`/portal/paystub/${p.period_id}`} className="text-xs font-bold text-primary hover:underline">
                                Ver recibo →
                              </Link>
                              <Link to={`/portal/week/${p.period_id}`} className="text-xs font-bold text-primary hover:underline">
                                Ver detalle →
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
