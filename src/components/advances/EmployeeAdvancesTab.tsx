import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Banknote, Plus, DollarSign, Pause, Play, ExternalLink } from "lucide-react";
import AdvanceLoanCreateDialog from "@/components/advances/AdvanceLoanCreateDialog";
import AdvanceLoanDetailDrawer from "@/components/advances/AdvanceLoanDetailDrawer";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "outline" },
  pending_approval: { label: "Pendiente", variant: "secondary" },
  approved: { label: "Aprobado", variant: "default" },
  active: { label: "Activo", variant: "default" },
  paused: { label: "Pausado", variant: "secondary" },
  paid: { label: "Pagado", variant: "default" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  closed_manually: { label: "Cerrado", variant: "outline" },
  written_off: { label: "Castigado", variant: "destructive" },
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

interface Props {
  employeeId: string;
  companyId: string;
}

export default function EmployeeAdvancesTab({ employeeId, companyId }: Props) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employee_financial_records")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setRecords(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (employeeId && companyId) fetchRecords();
  }, [employeeId, companyId]);

  const stats = useMemo(() => {
    const active = records.filter(r => ["active", "approved"].includes(r.status));
    const outstanding = active.reduce((s, r) => s + Number(r.balance_remaining), 0);
    const totalRepaid = records.reduce((s, r) => s + (Number(r.original_amount) - Number(r.balance_remaining)), 0);
    const pausedCount = records.filter(r => r.status === "paused").length;
    return { outstanding, totalRepaid, activeCount: active.length, pausedCount };
  }, [records]);

  if (loading) return <div className="py-8 text-center text-xs text-muted-foreground">Cargando...</div>;

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-primary tabular-nums">{fmt(stats.outstanding)}</p>
            <p className="text-[10px] text-muted-foreground">Saldo pendiente</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-earning tabular-nums">{fmt(stats.totalRepaid)}</p>
            <p className="text-[10px] text-muted-foreground">Total pagado</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{stats.activeCount}</p>
            <p className="text-[10px] text-muted-foreground">Registros activos</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{stats.pausedCount}</p>
            <p className="text-[10px] text-muted-foreground">Pausados</p>
          </CardContent>
        </Card>
      </div>

      {/* Records list */}
      {records.length === 0 ? (
        <EmptyState icon={Banknote} title="Sin anticipos ni préstamos" description="Este empleado no tiene registros financieros" compact />
      ) : (
        <div className="space-y-2">
          {records.map(r => {
            const sc = STATUS_CONFIG[r.status];
            const pct = r.original_amount > 0
              ? Math.round(((r.original_amount - r.balance_remaining) / r.original_amount) * 100) : 0;
            return (
              <Card
                key={r.id}
                className="rounded-xl border-border/40 cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setSelectedId(r.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{r.reference_code}</span>
                      <Badge variant={sc?.variant ?? "outline"} className="text-[10px]">
                        {sc?.label ?? r.status}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {r.record_type === "advance" ? "Anticipo" : "Préstamo"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">{fmt(r.original_amount)}</p>
                      <p className="text-[10px] text-muted-foreground">Emitido: {r.issue_date}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${r.balance_remaining === 0 ? "text-earning" : ""}`}>
                        {fmt(r.balance_remaining)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Saldo</p>
                    </div>
                  </div>
                  {r.status === "active" && (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{pct}% pagado</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add new */}
      <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setShowCreate(true)}>
        <Plus className="h-4 w-4 mr-2" /> Nuevo anticipo o préstamo
      </Button>

      <AdvanceLoanCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={fetchRecords}
        prefillEmployeeId={employeeId}
      />

      {selectedId && (
        <AdvanceLoanDetailDrawer
          recordId={selectedId}
          open={!!selectedId}
          onOpenChange={open => !open && setSelectedId(null)}
          onUpdated={fetchRecords}
        />
      )}
    </div>
  );
}
