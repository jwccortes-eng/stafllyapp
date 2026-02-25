import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft,
  CalendarDays,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  FileText,
} from "lucide-react";

interface MovementDetail {
  id: string;
  concept_name: string;
  category: string;
  quantity: number | null;
  rate: number | null;
  total_value: number;
  note: string | null;
}

export default function WeekDetail() {
  const { periodId } = useParams();
  const { employeeId } = useAuth();
  const navigate = useNavigate();
  const [basePay, setBasePay] = useState(0);
  const [movements, setMovements] = useState<MovementDetail[]>([]);
  const [periodLabel, setPeriodLabel] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId || !periodId) return;
    async function load() {
      const { data: periodData } = await supabase
        .from("pay_periods")
        .select("start_date, end_date, published_at")
        .eq("id", periodId)
        .maybeSingle();

      if (!periodData?.published_at) {
        navigate("/portal");
        return;
      }

      const [bpRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("base_total_pay").eq("employee_id", employeeId).eq("period_id", periodId).maybeSingle(),
        supabase.from("movements").select("id, total_value, quantity, rate, note, concepts(name, category)").eq("employee_id", employeeId).eq("period_id", periodId),
      ]);

      setBasePay(Number(bpRes.data?.base_total_pay) || 0);
      setMovements(
        (movRes.data ?? []).map((m: any) => ({
          id: m.id,
          concept_name: m.concepts?.name ?? "",
          category: m.concepts?.category ?? "",
          quantity: m.quantity,
          rate: m.rate,
          total_value: Number(m.total_value),
          note: m.note,
        }))
      );
      setPeriodLabel(`${periodData.start_date} → ${periodData.end_date}`);
      setLoading(false);
    }
    load();
  }, [employeeId, periodId]);

  const extras = useMemo(() => movements.filter(m => m.category === "extra"), [movements]);
  const deductions = useMemo(() => movements.filter(m => m.category === "deduction"), [movements]);
  const extrasTotal = extras.reduce((s, m) => s + m.total_value, 0);
  const deductionsTotal = deductions.reduce((s, m) => s + m.total_value, 0);
  const total = basePay + extrasTotal - deductionsTotal;

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
            <CalendarDays className="h-5 w-5" />
            <h1 className="text-2xl font-bold font-heading">Detalle de Semana</h1>
          </div>
          <p className="text-sm opacity-80">{periodLabel}</p>

          <div className="mt-4 bg-white/15 backdrop-blur-sm rounded-xl p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider opacity-70">Total final</p>
                <p className="text-2xl font-bold font-heading mt-0.5">${total.toFixed(2)}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center">
                <Wallet className="h-6 w-6" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pago Base</p>
            <div className="h-8 w-8 rounded-xl bg-warning/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-warning" />
            </div>
          </div>
          <p className="text-xl font-bold font-heading">${basePay.toFixed(2)}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Total Final</p>
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="text-xl font-bold font-heading">${total.toFixed(2)}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-earning">Extras</p>
            <div className="h-8 w-8 rounded-xl bg-earning/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-earning" />
            </div>
          </div>
          <p className="text-xl font-bold font-heading text-earning">+${extrasTotal.toFixed(2)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{extras.length} concepto{extras.length !== 1 ? "s" : ""}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-deduction">Deducciones</p>
            <div className="h-8 w-8 rounded-xl bg-destructive/10 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-deduction" />
            </div>
          </div>
          <p className="text-xl font-bold font-heading text-deduction">−${deductionsTotal.toFixed(2)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{deductions.length} concepto{deductions.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Extras list */}
      {extras.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <span className="text-base">💰</span> Extras
          </h2>
          <div className="space-y-2">
            {extras.map(m => (
              <div key={m.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-earning/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-5 w-5 text-earning" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{m.concept_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.quantity != null && m.rate != null && (
                        <span className="text-[11px] text-muted-foreground">
                          {m.quantity} × ${m.rate}
                        </span>
                      )}
                      {m.note && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 truncate">
                          <FileText className="h-3 w-3 shrink-0" /> {m.note}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-bold font-heading text-earning shrink-0">
                    +${m.total_value.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deductions list */}
      {deductions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <span className="text-base">📉</span> Deducciones
          </h2>
          <div className="space-y-2">
            {deductions.map(m => (
              <div key={m.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                    <TrendingDown className="h-5 w-5 text-deduction" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{m.concept_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.quantity != null && m.rate != null && (
                        <span className="text-[11px] text-muted-foreground">
                          {m.quantity} × ${m.rate}
                        </span>
                      )}
                      {m.note && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 truncate">
                          <FileText className="h-3 w-3 shrink-0" /> {m.note}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-bold font-heading text-deduction shrink-0">
                    −${m.total_value.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {movements.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No hay movimientos registrados esta semana</p>
        </div>
      )}
    </div>
  );
}
