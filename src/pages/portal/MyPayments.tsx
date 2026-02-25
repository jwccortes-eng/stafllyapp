import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import {
  DollarSign, TrendingUp, TrendingDown, ChevronDown,
  CalendarDays, BarChart3, Wallet, Clock, Loader2,
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

export default function MyPayments() {
  const { employeeId } = useAuth();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const [periodDetails, setPeriodDetails] = useState<Record<string, MovementDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [empName, setEmpName] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<{ start_date: string; end_date: string; status: string; published_at: string | null } | null>(null);

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
      // Fetch employee name and company
      const { data: empData } = await supabase
        .from("employees")
        .select("first_name, last_name, company_id")
        .eq("id", employeeId)
        .maybeSingle();
      if (empData) {
        setEmpName(`${empData.first_name} ${empData.last_name}`);
        const { data: comp } = await supabase
          .from("companies")
          .select("name")
          .eq("id", empData.company_id)
          .maybeSingle();
        setCompanyName(comp?.name ?? null);

        // Fetch current (latest) period for the company
        const { data: latestPeriod } = await supabase
          .from("pay_periods")
          .select("start_date, end_date, status, published_at")
          .eq("company_id", empData.company_id)
          .order("start_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        setCurrentPeriod(latestPeriod ?? null);
      }
      const { data, error } = await supabase
        .from("period_base_pay")
        .select(
          `
            period_id,
            base_total_pay
          `
        )
        .eq("employee_id", employeeId);

      if (error) {
        console.error("Error fetching payments:", error);
        setLoading(false);
        return;
      }
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

      const sorted = Array.from(paymentMap.values()).sort((a, b) => b.start_date.localeCompare(a.start_date));
      setPayments(sorted);
      setLoading(false);
    }
    load();
  }, [employeeId]);

  const accumulated = useMemo(() => payments.reduce((s, r) => s + r.total_final_pay, 0), [payments]);
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
        {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  const periodStatusLabel = currentPeriod
    ? currentPeriod.published_at
      ? { label: "Publicado", cls: "bg-primary/10 text-primary" }
      : currentPeriod.status === "open"
        ? { label: "Abierto", cls: "bg-earning/10 text-earning" }
        : { label: "Cerrado", cls: "bg-warning/10 text-warning" }
    : null;

  return (
    <div className="space-y-8">
      {/* Greeting + summary */}
      <div>
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <h1 className="text-2xl font-bold font-heading tracking-tight mt-1">
          {empName ? `${greeting}, ${empName}` : "Mis Pagos"}
        </h1>
        {companyName && <p className="text-sm text-muted-foreground mt-0.5">{companyName}</p>}
        {currentPeriod && periodStatusLabel && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">
              {currentPeriod.start_date} → {currentPeriod.end_date}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${periodStatusLabel.cls}`}>
              {periodStatusLabel.label}
            </span>
          </div>
        )}
      </div>

      {/* Big number card */}
      {latestPayment && (
        <div className="rounded-2xl bg-card border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Último pago</p>
              <p className="text-3xl font-bold font-heading mt-2 tracking-tight">
                ${latestPayment.total_final_pay.toFixed(2)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {latestPayment.start_date} → {latestPayment.end_date}
              </p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center">
              <Wallet className="h-7 w-7 text-primary" />
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-card border p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium">Acumulado</p>
          <p className="text-lg font-bold font-heading mt-1">${accumulated.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-card border p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium">Semanas</p>
          <p className="text-lg font-bold font-heading mt-1">{payments.length}</p>
        </div>
        <Link to="/portal/accumulated" className="rounded-2xl bg-card border p-4 text-center hover:bg-accent transition-colors group">
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
                            {/* Summary row */}
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

                            {/* Movement details */}
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

                            <Link
                              to={`/portal/week/${p.period_id}`}
                              className="block text-center text-xs font-medium text-primary hover:underline pt-1"
                            >
                              Ver detalle completo →
                            </Link>
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
