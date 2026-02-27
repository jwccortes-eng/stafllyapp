import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, FileText, Calendar, DollarSign, TrendingUp, TrendingDown, CheckCircle2, Receipt } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

interface MovementDetail {
  id: string;
  concept_name: string;
  category: string;
  quantity: number | null;
  rate: number | null;
  total_value: number;
  note: string | null;
}

interface PeriodInfo {
  start_date: string;
  end_date: string;
  status: string;
  paid_at: string | null;
}

export default function PayStub() {
  const { periodId } = useParams<{ periodId: string }>();
  const { employeeId } = useAuth();
  const [period, setPeriod] = useState<PeriodInfo | null>(null);
  const [basePay, setBasePay] = useState(0);
  const [movements, setMovements] = useState<MovementDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId || !periodId) return;
    async function load() {
      const [periodRes, baseRes, movRes] = await Promise.all([
        supabase.from("pay_periods").select("start_date, end_date, status, paid_at").eq("id", periodId).maybeSingle(),
        supabase.from("period_base_pay").select("base_total_pay").eq("employee_id", employeeId).eq("period_id", periodId).maybeSingle(),
        supabase.from("movements").select("id, total_value, quantity, rate, note, concepts(name, category)").eq("employee_id", employeeId).eq("period_id", periodId),
      ]);

      if (periodRes.data) setPeriod(periodRes.data as PeriodInfo);
      setBasePay(Number(baseRes.data?.base_total_pay) || 0);
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
      setLoading(false);
    }
    load();
  }, [employeeId, periodId]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  if (!period) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">Periodo no encontrado</p>
        <Link to="/portal/payments" className="text-primary text-sm mt-2 inline-block">← Volver a Nómina</Link>
      </div>
    );
  }

  const extras = movements.filter(m => m.category === "extra");
  const deductions = movements.filter(m => m.category === "deduction");
  const extrasTotal = extras.reduce((s, m) => s + m.total_value, 0);
  const deductionsTotal = deductions.reduce((s, m) => s + m.total_value, 0);
  const totalFinal = basePay + extrasTotal - deductionsTotal;
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const statusLabel = period.paid_at ? "Pagado" : period.status === "published" ? "Publicado" : period.status === "closed" ? "Cerrado" : "Abierto";
  const statusColor = period.paid_at
    ? "bg-earning/10 text-earning"
    : period.status === "published"
    ? "bg-primary/10 text-primary"
    : "bg-warning/10 text-warning";

  return (
    <div className="space-y-6">
      <PageHeader
        variant="2"
        icon={Receipt}
        title="Recibo de Pago"
        subtitle={`${period.start_date} → ${period.end_date}`}
        badge={statusLabel}
        rightSlot={
          <Link to="/portal/payments" className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center hover:bg-accent transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
      />

      {/* Total hero */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-6 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total a Pagar</p>
        <p className="text-4xl font-bold font-heading mt-2 tracking-tight tabular-nums">${fmt(totalFinal)}</p>
        {period.paid_at && (
          <p className="text-xs text-earning mt-2 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Pagado el {new Date(period.paid_at).toLocaleDateString("es")}
          </p>
        )}
      </div>

      {/* Breakdown cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-card border p-3 text-center">
          <DollarSign className="h-4 w-4 text-muted-foreground mx-auto" />
          <p className="text-[10px] text-muted-foreground mt-1">Base</p>
          <p className="text-sm font-bold mt-0.5 tabular-nums">${fmt(basePay)}</p>
        </div>
        <div className="rounded-2xl bg-earning/5 border border-earning/20 p-3 text-center">
          <TrendingUp className="h-4 w-4 text-earning mx-auto" />
          <p className="text-[10px] text-earning mt-1">Extras</p>
          <p className="text-sm font-bold text-earning mt-0.5 tabular-nums">+${fmt(extrasTotal)}</p>
        </div>
        <div className="rounded-2xl bg-destructive/5 border border-destructive/20 p-3 text-center">
          <TrendingDown className="h-4 w-4 text-deduction mx-auto" />
          <p className="text-[10px] text-deduction mt-1">Deduc.</p>
          <p className="text-sm font-bold text-deduction mt-0.5 tabular-nums">−${fmt(deductionsTotal)}</p>
        </div>
      </div>

      {/* Extras detail */}
      {extras.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-earning px-1">Extras</h3>
          {extras.map(m => (
            <div key={m.id} className="rounded-2xl border bg-earning/5 p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{m.concept_name}</p>
                {m.note && <p className="text-[10px] text-muted-foreground mt-0.5">{m.note}</p>}
                {m.quantity != null && m.rate != null && (
                  <p className="text-[10px] text-muted-foreground">{m.quantity} × ${fmt(m.rate)}</p>
                )}
              </div>
              <span className="text-sm font-bold text-earning tabular-nums">+${fmt(m.total_value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Deductions detail */}
      {deductions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-deduction px-1">Deducciones</h3>
          {deductions.map(m => (
            <div key={m.id} className="rounded-2xl border bg-destructive/5 p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{m.concept_name}</p>
                {m.note && <p className="text-[10px] text-muted-foreground mt-0.5">{m.note}</p>}
                {m.quantity != null && m.rate != null && (
                  <p className="text-[10px] text-muted-foreground">{m.quantity} × ${fmt(m.rate)}</p>
                )}
              </div>
              <span className="text-sm font-bold text-deduction tabular-nums">−${fmt(m.total_value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary line */}
      <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pago base</span>
            <span className="tabular-nums">${fmt(basePay)}</span>
          </div>
          {extrasTotal > 0 && (
            <div className="flex justify-between">
              <span className="text-earning">+ Extras</span>
              <span className="text-earning tabular-nums">${fmt(extrasTotal)}</span>
            </div>
          )}
          {deductionsTotal > 0 && (
            <div className="flex justify-between">
              <span className="text-deduction">− Deducciones</span>
              <span className="text-deduction tabular-nums">${fmt(deductionsTotal)}</span>
            </div>
          )}
          <div className="border-t pt-1.5 flex justify-between font-bold text-base">
            <span>Total Final</span>
            <span className="tabular-nums">${fmt(totalFinal)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center">
        <Link to={`/portal/week/${periodId}`} className="text-xs font-medium text-primary hover:underline">
          Ver detalle de turnos y horas →
        </Link>
      </div>
    </div>
  );
}
