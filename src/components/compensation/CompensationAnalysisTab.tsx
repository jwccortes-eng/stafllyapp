import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { Loader2, CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface AnalysisRow {
  id: string;
  employee_id: string;
  first_seen_date: string | null;
  first_known_hourly_rate: number | null;
  current_known_hourly_rate: number | null;
  hourly_rate_change_count: number;
  last_hourly_change_date: string | null;
  daily_payment_detected: boolean;
  ride_payment_detected: boolean;
  manual_adjustment_detected: boolean;
  mixed_compensation_detected: boolean;
  notes: string | null;
  employee_name?: string;
  employee_role?: string;
}

export default function CompensationAnalysisTab() {
  const { selectedCompanyId } = useCompany();
  const { role, hasActionPermission } = useAuth();
  const [search, setSearch] = useState("");

  const canEdit = role === "owner" || role === "admin" || role === "developer" || hasActionPermission("edit_compensation_analysis");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["compensation-analysis", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compensation_analysis_summary")
        .select(`*, employees!inner(first_name, last_name, employee_role)`)
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
        employee_role: r.employees?.employee_role,
      })) as AnalysisRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!search || !rows) return rows ?? [];
    const s = search.toLowerCase();
    return rows.filter(r => (r.employee_name ?? "").toLowerCase().includes(s));
  }, [rows, search]);

  const formatDate = (d: string | null) => d ? format(new Date(d + "T00:00:00"), "dd MMM yyyy") : "—";
  const formatRate = (v: number | null) => v != null ? `$${v.toFixed(0)}` : "—";

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!rows || rows.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="py-12 text-center">
          <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No hay datos de análisis aún.</p>
          <p className="text-xs text-muted-foreground mt-1">Importa archivos de nómina para generar el análisis de compensación.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar empleado..." />

      <Card className="rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Primera vez</TableHead>
                  <TableHead className="text-right">1ª Tarifa</TableHead>
                  <TableHead className="text-right">Tarifa actual</TableHead>
                  <TableHead className="text-center">Cambios</TableHead>
                  <TableHead>Últ. cambio</TableHead>
                  <TableHead className="text-center">Diario</TableHead>
                  <TableHead className="text-center">Ride</TableHead>
                  <TableHead className="text-center">Manual</TableHead>
                  <TableHead className="text-center">Mixto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium text-sm">{r.employee_name}</span>
                        {r.employee_role && <span className="text-[10px] text-muted-foreground ml-2">{r.employee_role}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(r.first_seen_date)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatRate(r.first_known_hourly_rate)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{formatRate(r.current_known_hourly_rate)}</TableCell>
                    <TableCell className="text-center">
                      {r.hourly_rate_change_count > 0 ? (
                        <Badge variant="outline" className="text-warning border-warning/30 text-[10px]">{r.hourly_rate_change_count}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(r.last_hourly_change_date)}</TableCell>
                    <TableCell className="text-center">{r.daily_payment_detected ? <CheckCircle2 className="h-3.5 w-3.5 text-earning mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell className="text-center">{r.ride_payment_detected ? <CheckCircle2 className="h-3.5 w-3.5 text-primary mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell className="text-center">{r.manual_adjustment_detected ? <AlertTriangle className="h-3.5 w-3.5 text-warning mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell className="text-center">{r.mixed_compensation_detected ? <AlertTriangle className="h-3.5 w-3.5 text-destructive mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
