import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { ChevronDown, Wallet, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";

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

function formatPeriodLabel(start: string, end: string): string {
  try {
    const s = parseISO(start);
    const e = parseISO(end);
    return `${format(s, "d MMM", { locale: enUS })} – ${format(e, "d MMM", { locale: enUS })}`;
  } catch {
    return `${start} – ${end}`;
  }
}

export default function MyPayments() {
  const { employeeId } = useAuth();
  const { effectiveEmployeeId } = useEffectiveEmployee();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const [periodDetails, setPeriodDetails] = useState<Record<string, MovementDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  const loadPeriodDetails = useCallback(async (periodId: string) => {
    if (periodDetails[periodId]) return;
    if (!effectiveEmployeeId) return;
    setLoadingDetails(periodId);
    const { data } = await supabase
      .from("movements").select("id, total_value, quantity, rate, note, concepts(name, category)")
      .eq("employee_id", effectiveEmployeeId).eq("period_id", periodId);
    const details: MovementDetail[] = (data ?? []).map((m: any) => ({
      id: m.id, concept_name: m.concepts?.name ?? "", category: m.concepts?.category ?? "",
      quantity: m.quantity, rate: m.rate, total_value: Number(m.total_value), note: m.note,
    }));
    setPeriodDetails(prev => ({ ...prev, [periodId]: details }));
    setLoadingDetails(null);
  }, [effectiveEmployeeId, periodDetails]);

  const toggleExpand = useCallback((periodId: string) => {
    if (expandedPeriod === periodId) setExpandedPeriod(null);
    else { setExpandedPeriod(periodId); loadPeriodDetails(periodId); }
  }, [expandedPeriod, loadPeriodDetails]);

  useEffect(() => {
    if (!effectiveEmployeeId) return;
    async function load() {
      const { data: empData } = await supabase
        .from("employees").select("company_id").eq("id", effectiveEmployeeId!).maybeSingle();
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
        supabase.from("period_base_pay").select("period_id, base_total_pay").eq("employee_id", effectiveEmployeeId!).in("period_id", publishedIds),
        supabase.from("movements").select("period_id, total_value, concepts(category)").eq("employee_id", effectiveEmployeeId!).in("period_id", publishedIds),
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
        if (!paymentMap.has(m.period_id)) {
          const pInfo = periodMap.get(m.period_id);
          if (!pInfo) return;
          paymentMap.set(m.period_id, {
            period_id: m.period_id, start_date: pInfo.start_date, end_date: pInfo.end_date,
            base_total_pay: 0, extras_total: 0, deductions_total: 0, total_final_pay: 0,
          });
        }
        const row = paymentMap.get(m.period_id)!;
        if (m.concepts?.category === "extra") row.extras_total += Number(m.total_value) || 0;
        else row.deductions_total += Number(m.total_value) || 0;
      });
      paymentMap.forEach(row => { row.total_final_pay = row.base_total_pay + row.extras_total - row.deductions_total; });
      setPayments(Array.from(paymentMap.values()).sort((a, b) => b.start_date.localeCompare(a.start_date)));
      setLoading(false);
    }
    load();
  }, [effectiveEmployeeId]);

  const latestPayment = payments[0] ?? null;
  const previousPayments = useMemo(() => payments.slice(1), [payments]);

  if (loading) {
    return (
      <div className="space-y-3 pt-4 pb-24">
        <div className="h-32 animate-pulse bg-muted rounded-3xl" />
        {[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold font-heading tracking-tight text-foreground">My Payments</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {payments.length > 0 ? `${payments.length} period${payments.length > 1 ? "s" : ""} recorded` : "No published payments"}
        </p>
      </div>

      {/* Hero — single source: latest period */}
      {latestPayment && (
        <div className="rounded-3xl bg-card border border-border/40 p-5 shadow-sm">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold">Latest period</p>
          <p className="text-[40px] font-bold font-heading mt-2 leading-none tracking-tight tabular-nums text-foreground">
            ${latestPayment.total_final_pay.toFixed(2)}
          </p>
          <p className="text-[11.5px] text-muted-foreground mt-2.5 font-medium">
            {formatPeriodLabel(latestPayment.start_date, latestPayment.end_date)}
          </p>
          {(latestPayment.extras_total > 0 || latestPayment.deductions_total > 0) && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30 text-[10.5px] tabular-nums">
              <span className="text-muted-foreground/70">Base ${latestPayment.base_total_pay.toFixed(0)}</span>
              {latestPayment.extras_total > 0 && (
                <span className="text-[hsl(var(--status-confirmed))] font-semibold">+${latestPayment.extras_total.toFixed(0)}</span>
              )}
              {latestPayment.deductions_total > 0 && (
                <span className="text-destructive font-semibold">−${latestPayment.deductions_total.toFixed(0)}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Previous periods — minimal list */}
      {previousPayments.length > 0 && (
        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2 px-1">Previous</h2>
          <div className="space-y-1.5">
            {previousPayments.map(p => {
              const isExpanded = expandedPeriod === p.period_id;
              const details = periodDetails[p.period_id];
              const isLoadingThis = loadingDetails === p.period_id;
              const extras = details?.filter(m => m.category === "extra") ?? [];
              const deductions = details?.filter(m => m.category === "deduction") ?? [];

              return (
                <div key={p.period_id} className={cn(
                  "rounded-2xl border bg-card overflow-hidden transition-all",
                  isExpanded ? "border-primary/20 shadow-sm" : "border-border/30"
                )}>
                  <button
                    onClick={() => toggleExpand(p.period_id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-foreground">
                        {formatPeriodLabel(p.start_date, p.end_date)}
                      </p>
                    </div>
                    <span className="text-[14px] font-bold font-heading tabular-nums shrink-0 text-foreground">
                      ${p.total_final_pay.toFixed(2)}
                    </span>
                    <ChevronDown className={cn(
                      "h-3.5 w-3.5 text-muted-foreground/30 transition-transform shrink-0",
                      isExpanded && "rotate-180"
                    )} />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 animate-fade-in">
                      <div className="border-t border-border/30 pt-3 space-y-2.5">
                        {isLoadingThis ? (
                          <div className="flex items-center justify-center py-4 text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                            <span className="text-[11px]">Loading...</span>
                          </div>
                        ) : (
                          <>
                            {/* Compact summary */}
                            <div className="flex items-center justify-between text-[11px] tabular-nums px-1">
                              <span className="text-muted-foreground/70">Base</span>
                              <span className="font-semibold text-foreground">${p.base_total_pay.toFixed(2)}</span>
                            </div>

                            {extras.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--status-confirmed))] px-1">Extras</p>
                                {extras.map(m => (
                                  <div key={m.id} className="flex items-center justify-between rounded-lg bg-[hsl(var(--status-confirmed)/0.05)] px-3 py-1.5 text-[11px]">
                                    <span className="font-medium text-foreground truncate">{m.concept_name}</span>
                                    <span className="font-bold text-[hsl(var(--status-confirmed))] tabular-nums shrink-0 ml-2">+${m.total_value.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {deductions.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-destructive px-1">Deductions</p>
                                {deductions.map(m => (
                                  <div key={m.id} className="flex items-center justify-between rounded-lg bg-destructive/[0.04] px-3 py-1.5 text-[11px]">
                                    <span className="font-medium text-foreground truncate">{m.concept_name}</span>
                                    <span className="font-bold text-destructive tabular-nums shrink-0 ml-2">−${m.total_value.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-2 border-t border-border/30 text-[12px] tabular-nums px-1">
                              <span className="font-bold text-foreground">Total</span>
                              <span className="font-bold text-foreground">${p.total_final_pay.toFixed(2)}</span>
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
        </div>
      )}

      {/* Empty */}
      {payments.length === 0 && (
        <div className="text-center py-14 space-y-3">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/30 flex items-center justify-center">
            <Wallet className="h-7 w-7 text-muted-foreground/20" />
          </div>
          <p className="text-sm font-bold text-foreground">No published payments</p>
          <p className="text-xs text-muted-foreground/60 max-w-[240px] mx-auto">
            Your payment history will appear here when your company publishes a period.
          </p>
        </div>
      )}
    </div>
  );
}
