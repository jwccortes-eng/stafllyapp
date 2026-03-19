import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus, Search, DollarSign, Banknote, Clock, AlertTriangle,
  Pause, Users, ArrowUpDown, Download, Filter,
} from "lucide-react";
import AdvanceLoanCreateDialog from "@/components/advances/AdvanceLoanCreateDialog";
import AdvanceLoanDetailDrawer from "@/components/advances/AdvanceLoanDetailDrawer";

type RecordStatus = "draft" | "pending_approval" | "approved" | "active" | "paused" | "paid" | "cancelled" | "closed_manually" | "written_off";
type RecordType = "advance" | "loan";

interface FinancialRecord {
  id: string;
  company_id: string;
  employee_id: string;
  record_type: RecordType;
  category: string;
  reference_code: string;
  status: RecordStatus;
  issue_date: string;
  original_amount: number;
  balance_remaining: number;
  repayment_mode: string;
  auto_deduct_enabled: boolean;
  created_at: string;
  updated_at: string;
  employees?: { first_name: string; last_name: string } | null;
}

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

const TYPE_LABELS: Record<string, string> = {
  advance: "Anticipo",
  loan: "Préstamo",
};

const MODE_LABELS: Record<string, string> = {
  fixed_amount: "Monto fijo",
  percentage_net: "% Neto",
  percentage_gross: "% Bruto",
  one_time_next: "Única vez",
  manual: "Manual",
  hybrid: "Híbrido",
};

export default function AdvancesLoans() {
  const { selectedCompanyId } = useCompany();
  const { user, role } = useAuth();
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const isGlobal = role === "developer" || role === "owner";

  const fetchRecords = async () => {
    setLoading(true);
    let query = supabase
      .from("employee_financial_records")
      .select("*, employees(first_name, last_name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (selectedCompanyId && !isGlobal) {
      query = query.eq("company_id", selectedCompanyId);
    } else if (selectedCompanyId) {
      query = query.eq("company_id", selectedCompanyId);
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Error cargando registros financieros");
      console.error(error);
    } else {
      setRecords((data as any[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedCompanyId) fetchRecords();
  }, [selectedCompanyId]);

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (typeFilter !== "all" && r.record_type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const name = `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.toLowerCase();
        if (!name.includes(s) && !r.reference_code.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [records, typeFilter, statusFilter, search]);

  // KPI calculations
  const kpis = useMemo(() => {
    const active = records.filter(r => r.status === "active" || r.status === "approved");
    const totalOutstanding = active.reduce((s, r) => s + Number(r.balance_remaining), 0);
    const pending = records.filter(r => r.status === "pending_approval").length;
    const paused = records.filter(r => r.status === "paused").length;
    const paidThisMonth = records
      .filter(r => r.status === "paid" && r.updated_at?.startsWith(new Date().toISOString().slice(0, 7)))
      .reduce((s, r) => s + Number(r.original_amount), 0);
    const employeesWithBalance = new Set(active.map(r => r.employee_id)).size;
    return { totalOutstanding, activeCount: active.length, pending, paused, paidThisMonth, employeesWithBalance };
  }, [records]);

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Anticipos y Préstamos"
        description="Gestión de anticipos de nómina y préstamos a empleados"
      >
        <Button onClick={() => setShowCreate(true)} className="press-scale gap-2">
          <Plus className="h-4 w-4" /> Nuevo registro
        </Button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Saldo pendiente" value={fmt(kpis.totalOutstanding)} icon={DollarSign} />
        <KpiCard title="Registros activos" value={kpis.activeCount} icon={Banknote} />
        <KpiCard title="Cobrado este mes" value={fmt(kpis.paidThisMonth)} icon={DollarSign} />
        <KpiCard title="Pendientes aprobación" value={kpis.pending} icon={Clock} />
        <KpiCard title="Pausados" value={kpis.paused} icon={Pause} />
        <KpiCard title="Empleados con saldo" value={kpis.employeesWithBalance} icon={Users} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="advance">Anticipos</SelectItem>
            <SelectItem value="loan">Préstamos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="pending_approval">Pendiente</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
            <SelectItem value="paid">Pagado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
            <SelectItem value="written_off">Castigado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Data Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="Sin registros"
          description="No hay anticipos ni préstamos registrados. Crea uno nuevo para empezar."
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Empleado</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Monto original</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const sc = STATUS_CONFIG[r.status];
                const pct = r.original_amount > 0
                  ? Math.round(((r.original_amount - r.balance_remaining) / r.original_amount) * 100)
                  : 0;
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedRecordId(r.id)}
                  >
                    <TableCell className="font-mono text-xs">{r.reference_code}</TableCell>
                    <TableCell className="font-medium">
                      {r.employees?.first_name} {r.employees?.last_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {TYPE_LABELS[r.record_type] ?? r.record_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmt(r.original_amount)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={r.balance_remaining === 0 ? "text-emerald-600" : ""}>{fmt(r.balance_remaining)}</span>
                        {r.status === "active" && (
                          <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{MODE_LABELS[r.repayment_mode] ?? r.repayment_mode}</TableCell>
                    <TableCell>
                      <Badge variant={sc?.variant ?? "outline"} className="text-[10px]">
                        {sc?.label ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.issue_date}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <AdvanceLoanCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={fetchRecords}
      />

      {/* Detail Drawer */}
      {selectedRecordId && (
        <AdvanceLoanDetailDrawer
          recordId={selectedRecordId}
          open={!!selectedRecordId}
          onOpenChange={open => !open && setSelectedRecordId(null)}
          onUpdated={fetchRecords}
        />
      )}
    </div>
  );
}
