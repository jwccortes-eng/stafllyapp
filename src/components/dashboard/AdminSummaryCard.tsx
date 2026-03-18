/**
 * Cross-context card: shows pending admin actions on the Employee Dashboard
 * when the employee also has admin access (dual access).
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, ChevronRight, Clock, Users, AlertCircle, CheckCircle2 } from "lucide-react";

export function AdminSummaryCard() {
  const { canAccessAdmin, canAccessPortal, setActiveMode } = useAuth();
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ shiftsToday: 0, clockedIn: 0, pendingApprovals: 0 });
  const [loading, setLoading] = useState(true);

  const shouldShow = canAccessAdmin && canAccessPortal;

  const loadData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];

    const [shiftsRes, clockedRes, pendingRes] = await Promise.all([
      supabase.from("scheduled_shifts").select("id", { count: "exact", head: true })
        .eq("company_id", selectedCompanyId).eq("date", today).is("deleted_at", null),
      supabase.from("time_entries").select("id", { count: "exact", head: true })
        .eq("company_id", selectedCompanyId).is("clock_out", null),
      supabase.from("time_entries").select("id", { count: "exact", head: true })
        .eq("company_id", selectedCompanyId).eq("status", "pending"),
    ]);

    setCounts({
      shiftsToday: shiftsRes.count ?? 0,
      clockedIn: clockedRes.count ?? 0,
      pendingApprovals: pendingRes.count ?? 0,
    });
    setLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => { if (shouldShow) loadData(); }, [shouldShow, loadData]);

  if (!shouldShow || loading) return null;

  const goToAdmin = () => {
    setActiveMode('admin');
    navigate('/app');
  };

  const hasPending = counts.pendingApprovals > 0;

  return (
    <div className={cn(
      "rounded-2xl border bg-card p-4 transition-all",
      hasPending ? "border-warning/25 shadow-[0_0_0_1px_hsl(var(--warning)/0.08)]" : "border-border/40"
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
          </div>
          <h3 className="text-xs font-semibold text-foreground">Operación</h3>
        </div>
        <button
          onClick={goToAdmin}
          className="text-[10px] text-primary font-medium hover:underline flex items-center gap-0.5"
        >
          Panel Admin <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center p-2.5 rounded-xl bg-muted/40">
          <Clock className="h-3.5 w-3.5 text-primary mb-1" />
          <p className="text-lg font-bold tabular-nums leading-none">{counts.shiftsToday}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Turnos hoy</p>
        </div>
        <div className="flex flex-col items-center p-2.5 rounded-xl bg-muted/40">
          <Users className="h-3.5 w-3.5 text-earning mb-1" />
          <p className="text-lg font-bold tabular-nums leading-none text-earning">{counts.clockedIn}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Fichados</p>
        </div>
        <button
          onClick={goToAdmin}
          className={cn(
            "flex flex-col items-center p-2.5 rounded-xl transition-colors",
            hasPending ? "bg-warning/10 hover:bg-warning/15" : "bg-muted/40"
          )}
        >
          {hasPending ? (
            <AlertCircle className="h-3.5 w-3.5 text-warning mb-1" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-earning mb-1" />
          )}
          <p className={cn("text-lg font-bold tabular-nums leading-none", hasPending ? "text-warning" : "text-earning")}>
            {counts.pendingApprovals}
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Pendientes</p>
        </button>
      </div>
    </div>
  );
}
