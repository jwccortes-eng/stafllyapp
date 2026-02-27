import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft, DollarSign, TrendingUp, TrendingDown, Wallet, FileText,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

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

      if (!periodData?.published_at) { navigate("/portal"); return; }

      const [bpRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("base_total_pay").eq("employee_id", employeeId).eq("period_id", periodId).maybeSingle(),
        supabase.from("movements").select("id, total_value, quantity, rate, note, concepts(name, category)").eq("employee_id", employeeId).eq("period_id", periodId),
      ]);

      setBasePay(Number(bpRes.data?.base_total_pay) || 0);
      setMovements(
        (movRes.data ?? []).map((m: any) => ({
          id: m.id, concept_name: m.concepts?.name ?? "", category: m.concepts?.category ?? "",
          quantity: m.quantity, rate: m.rate, total_value: Number(m.total_value), note: m.note,
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
        {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/portal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <PageHeader
          variant="3"
          title="Detalle de Semana"
          subtitle={periodLabel}
        />
      </div>

      {/* Total card */}
      <div className="rounded-2xl bg-card border p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total final</p>
            <p className="text-3xl font-bold font-heading mt-2 tracking-tight">${total.toFixed(2)}</p>
          </div>
          <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center">
            <Wallet className="h-7 w-7 text-primary" />
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-card border p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium">Base</p>
          <p className="text-lg font-bold font-heading mt-1">${basePay.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl bg-card border p-4 text-center">
          <p className="text-xs text-earning font-medium">Extras</p>
          <p className="text-lg font-bold font-heading text-earning mt-1">+${extrasTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl bg-card border p-4 text-center">
          <p className="text-xs text-deduction font-medium">Deducciones</p>
          <p className="text-lg font-bold font-heading text-deduction mt-1">−${deductionsTotal.toFixed(2)}</p>
        </div>
      </div>

      {/* Extras list */}
      {extras.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Extras</h2>
          <div className="space-y-2">
            {extras.map(m => (
              <div key={m.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{m.concept_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.quantity != null && m.rate != null && (
                        <span className="text-xs text-muted-foreground">{m.quantity} × ${m.rate}</span>
                      )}
                      {m.note && (
                        <span className="text-xs text-muted-foreground truncate">{m.note}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-bold text-earning">+${m.total_value.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deductions list */}
      {deductions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Deducciones</h2>
          <div className="space-y-2">
            {deductions.map(m => (
              <div key={m.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{m.concept_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.quantity != null && m.rate != null && (
                        <span className="text-xs text-muted-foreground">{m.quantity} × ${m.rate}</span>
                      )}
                      {m.note && (
                        <span className="text-xs text-muted-foreground truncate">{m.note}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-bold text-deduction">−${m.total_value.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {movements.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay movimientos registrados esta semana</p>
        </div>
      )}
    </div>
  );
}