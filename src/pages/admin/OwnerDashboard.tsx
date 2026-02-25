import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Users, CalendarDays, DollarSign, FileSpreadsheet, TrendingUp } from "lucide-react";

interface CompanyStats {
  id: string;
  name: string;
  is_active: boolean;
  employees: number;
  active_period: string | null;
  period_status: string | null;
  imports: number;
  movements: number;
}

export default function OwnerDashboard() {
  const [companies, setCompanies] = useState<CompanyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      const { data: companyList } = await supabase
        .from("companies")
        .select("id, name, is_active")
        .order("name");

      if (!companyList?.length) {
        setLoading(false);
        return;
      }

      const stats: CompanyStats[] = await Promise.all(
        companyList.map(async (c) => {
          const [empRes, periodRes, impRes, movRes] = await Promise.all([
            supabase.from("employees").select("id", { count: "exact", head: true }).eq("company_id", c.id).eq("is_active", true),
            supabase.from("pay_periods").select("start_date, end_date, status").eq("company_id", c.id).order("start_date", { ascending: false }).limit(1).maybeSingle(),
            supabase.from("imports").select("id", { count: "exact", head: true }).eq("company_id", c.id),
            supabase.from("movements").select("id", { count: "exact", head: true }).eq("company_id", c.id),
          ]);

          return {
            id: c.id,
            name: c.name,
            is_active: c.is_active,
            employees: empRes.count ?? 0,
            active_period: periodRes.data
              ? `${periodRes.data.start_date} → ${periodRes.data.end_date}`
              : null,
            period_status: periodRes.data?.status ?? null,
            imports: impRes.count ?? 0,
            movements: movRes.count ?? 0,
          };
        })
      );

      setCompanies(stats);
      setLoading(false);
    }
    fetchAll();
  }, []);

  const totals = {
    employees: companies.reduce((s, c) => s + c.employees, 0),
    imports: companies.reduce((s, c) => s + c.imports, 0),
    movements: companies.reduce((s, c) => s + c.movements, 0),
    activeCompanies: companies.filter((c) => c.is_active).length,
  };

  const summaryCards = [
    { title: "Empresas activas", value: totals.activeCompanies, icon: Building2, color: "text-primary" },
    { title: "Empleados totales", value: totals.employees, icon: Users, color: "text-earning" },
    { title: "Importaciones", value: totals.imports, icon: FileSpreadsheet, color: "text-warning" },
    { title: "Novedades", value: totals.movements, icon: DollarSign, color: "text-deduction" },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Vista global</h1>
        <p className="page-subtitle">Resumen consolidado de todas las empresas</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card h-28 animate-pulse bg-muted rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {summaryCards.map((card) => (
              <Card key={card.title} className="stat-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-heading">{card.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Detalle por empresa</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-center">Empleados</TableHead>
                    <TableHead>Periodo actual</TableHead>
                    <TableHead className="text-center">Importaciones</TableHead>
                    <TableHead className="text-center">Novedades</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-center">
                        <span className={c.is_active ? "earning-badge" : "deduction-badge"}>
                          {c.is_active ? "Activa" : "Inactiva"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono">{c.employees}</TableCell>
                      <TableCell className="text-sm">
                        {c.active_period ?? <span className="text-muted-foreground">Sin periodos</span>}
                        {c.period_status && (
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                            c.period_status === "open" ? "bg-earning-bg text-earning" : "bg-muted text-muted-foreground"
                          }`}>
                            {c.period_status === "open" ? "Abierto" : "Cerrado"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono">{c.imports}</TableCell>
                      <TableCell className="text-center font-mono">{c.movements}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
