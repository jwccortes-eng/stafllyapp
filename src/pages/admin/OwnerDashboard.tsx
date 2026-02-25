import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Users, DollarSign, FileSpreadsheet, TrendingUp, BarChart3, CalendarIcon, X } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

interface PeriodPayData {
  period_label: string;
  [companyName: string]: number | string;
}

const CHART_COLORS = [
  "hsl(207, 90%, 54%)",   // primary blue
  "hsl(152, 60%, 40%)",   // earning green
  "hsl(38, 92%, 50%)",    // warning orange
  "hsl(280, 60%, 50%)",   // purple
  "hsl(0, 72%, 51%)",     // deduction red
  "hsl(180, 60%, 40%)",   // teal
];

export default function OwnerDashboard() {
  const [companies, setCompanies] = useState<CompanyStats[]>([]);
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // All trend data (unfiltered) stored separately
  const [allTrendData, setAllTrendData] = useState<(PeriodPayData & { _start_date: string })[]>([]);

  // Filter trend data by date range
  const payTrendData = useMemo(() => {
    let filtered = allTrendData;
    if (dateFrom) {
      const fromStr = format(dateFrom, "yyyy-MM-dd");
      filtered = filtered.filter((d) => d._start_date >= fromStr);
    }
    if (dateTo) {
      const toStr = format(dateTo, "yyyy-MM-dd");
      filtered = filtered.filter((d) => d._start_date <= toStr);
    }
    // Remove internal field for chart consumption
    return filtered.map(({ _start_date, ...rest }) => rest as PeriodPayData);
  }, [allTrendData, dateFrom, dateTo]);

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

      const names = companyList.map((c) => c.name);
      setCompanyNames(names);

      // Fetch stats and trend data in parallel
      const [stats, trendData] = await Promise.all([
        // Company stats
        Promise.all(
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
              active_period: periodRes.data ? `${periodRes.data.start_date} → ${periodRes.data.end_date}` : null,
              period_status: periodRes.data?.status ?? null,
              imports: impRes.count ?? 0,
              movements: movRes.count ?? 0,
            };
          })
        ),
        // Trend data: base pay per period per company (last 8 periods)
        (async () => {
          const { data: periods } = await supabase
            .from("pay_periods")
            .select("id, start_date, end_date, company_id")
            .order("start_date", { ascending: true });

          if (!periods?.length) return [];

          // Get unique period date ranges across all companies
          const periodMap = new Map<string, { label: string; ids: Map<string, string> }>();
          for (const p of periods) {
            const label = `${p.start_date.slice(5)}`;
            if (!periodMap.has(p.start_date)) {
              periodMap.set(p.start_date, { label, ids: new Map() });
            }
            const company = companyList.find((c) => c.id === p.company_id);
            if (company) {
              periodMap.get(p.start_date)!.ids.set(company.name, p.id);
            }
          }

          // Don't limit to 8 — fetch all, filtering happens client-side
          const sortedDates = Array.from(periodMap.keys()).sort();

          // Fetch all base pay data
          const allPeriodIds = sortedDates.flatMap(
            (d) => Array.from(periodMap.get(d)!.ids.values())
          );

          const { data: basePays } = await supabase
            .from("period_base_pay")
            .select("period_id, base_total_pay, company_id")
            .in("period_id", allPeriodIds);

          // Build chart data with _start_date for filtering
          const chartData = sortedDates.map((date) => {
            const entry = periodMap.get(date)!;
            const row: PeriodPayData & { _start_date: string } = { period_label: entry.label, _start_date: date };

            for (const company of companyList) {
              const periodId = entry.ids.get(company.name);
              if (periodId && basePays) {
                const total = basePays
                  .filter((bp) => bp.period_id === periodId && bp.company_id === company.id)
                  .reduce((sum, bp) => sum + Number(bp.base_total_pay), 0);
                row[company.name] = Math.round(total * 100) / 100;
              } else {
                row[company.name] = 0;
              }
            }
            return row;
          });

          return chartData;
        })(),
      ]);

      setCompanies(stats);
      setAllTrendData(trendData);
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

  const formatCurrency = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Vista global</h1>
        <p className="page-subtitle">Resumen consolidado de todas las empresas</p>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="stat-card h-28 animate-pulse bg-muted rounded-xl" />
            ))}
          </div>
          <div className="h-72 animate-pulse bg-muted rounded-xl" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
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

          {/* Date Range Filter */}
          {allTrendData.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span className="text-sm font-medium text-muted-foreground">Filtrar gráficos:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[160px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd MMM yyyy", { locale: es }) : "Desde"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[160px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd MMM yyyy", { locale: es }) : "Hasta"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                  <X className="h-4 w-4 mr-1" /> Limpiar
                </Button>
              )}
            </div>
          )}

          {/* Charts */}
          {payTrendData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Bar Chart - Total Pay by Period */}
              <Card>
                <CardHeader className="flex flex-row items-center gap-2 pb-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Pago total por periodo</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={payTrendData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="period_label"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [formatCurrency(value), name]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      {companyNames.map((name, i) => (
                        <Bar
                          key={name}
                          dataKey={name}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          radius={[4, 4, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Line Chart - Payment Trend */}
              <Card>
                <CardHeader className="flex flex-row items-center gap-2 pb-2">
                  <TrendingUp className="h-5 w-5 text-earning" />
                  <CardTitle className="text-base">Tendencia de pagos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={payTrendData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="period_label"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [formatCurrency(value), name]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      {companyNames.map((name, i) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 4, fill: CHART_COLORS[i % CHART_COLORS.length] }}
                          activeDot={{ r: 6 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Detail Table */}
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
