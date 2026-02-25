import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Users, DollarSign, FileSpreadsheet, TrendingUp, TrendingDown, BarChart3, CalendarIcon, X, UserMinus, Crown, Download, Sparkles } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { format, parseISO } from "date-fns";
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

interface TopEarner {
  employee_id: string;
  first_name: string;
  last_name: string;
  company_name: string;
  total_earned: number;
}

interface InactiveEmployee {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string;
  end_date: string | null;
  start_date: string | null;
  last_period_end: string | null;
}

const CHART_COLORS = [
  "hsl(207, 90%, 54%)",
  "hsl(152, 60%, 40%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 60%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(180, 60%, 40%)",
];

type GroupMode = "period" | "month" | "year";

export default function OwnerDashboard() {
  const { fullName } = useAuth();
  const [companies, setCompanies] = useState<CompanyStats[]>([]);
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [groupMode, setGroupMode] = useState<GroupMode>("period");
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>("all");

  const [allTrendData, setAllTrendData] = useState<(PeriodPayData & { _start_date: string })[]>([]);
  const [topEarners, setTopEarners] = useState<TopEarner[]>([]);
  const [inactiveEmployees, setInactiveEmployees] = useState<InactiveEmployee[]>([]);

  // Filter by date range and company
  const filteredTrendData = useMemo(() => {
    let filtered = allTrendData;
    if (dateFrom) {
      const fromStr = format(dateFrom, "yyyy-MM-dd");
      filtered = filtered.filter((d) => d._start_date >= fromStr);
    }
    if (dateTo) {
      const toStr = format(dateTo, "yyyy-MM-dd");
      filtered = filtered.filter((d) => d._start_date <= toStr);
    }
    return filtered;
  }, [allTrendData, dateFrom, dateTo]);

  // Group data by period/month/year
  const payTrendData = useMemo(() => {
    const activeNames = selectedCompanyFilter === "all"
      ? companyNames
      : companyNames.filter(n => n === selectedCompanyFilter);

    if (groupMode === "period") {
      return filteredTrendData.map(({ _start_date, ...rest }) => {
        const row: PeriodPayData = { period_label: rest.period_label as string };
        activeNames.forEach(n => { row[n] = (rest as any)[n] ?? 0; });
        return row;
      });
    }

    const grouped = new Map<string, PeriodPayData>();
    filteredTrendData.forEach(item => {
      const date = parseISO(item._start_date);
      const key = groupMode === "month"
        ? format(date, "yyyy-MM")
        : format(date, "yyyy");
      const label = groupMode === "month"
        ? format(date, "MMM yyyy", { locale: es })
        : format(date, "yyyy");

      if (!grouped.has(key)) {
        const row: PeriodPayData = { period_label: label };
        activeNames.forEach(n => { row[n] = 0; });
        grouped.set(key, row);
      }
      const row = grouped.get(key)!;
      activeNames.forEach(n => {
        (row[n] as number) += Number((item as any)[n] ?? 0);
      });
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => {
        // Round values
        const rounded: PeriodPayData = { period_label: v.period_label };
        activeNames.forEach(n => { rounded[n] = Math.round((v[n] as number) * 100) / 100; });
        return rounded;
      });
  }, [filteredTrendData, groupMode, companyNames, selectedCompanyFilter]);

  const activeChartNames = useMemo(() =>
    selectedCompanyFilter === "all" ? companyNames : [selectedCompanyFilter],
  [companyNames, selectedCompanyFilter]);

  useEffect(() => {
    async function fetchAll() {
      const { data: companyList } = await supabase
        .from("companies")
        .select("id, name, is_active")
        .order("name");

      if (!companyList?.length) { setLoading(false); return; }

      const names = companyList.map((c) => c.name);
      setCompanyNames(names);

      const [stats, trendData] = await Promise.all([
        Promise.all(
          companyList.map(async (c) => {
            const [empRes, periodRes, impRes, movRes] = await Promise.all([
              supabase.from("employees").select("id", { count: "exact", head: true }).eq("company_id", c.id).eq("is_active", true),
              supabase.from("pay_periods").select("start_date, end_date, status").eq("company_id", c.id).order("start_date", { ascending: false }).limit(1).maybeSingle(),
              supabase.from("imports").select("id", { count: "exact", head: true }).eq("company_id", c.id),
              supabase.from("movements").select("id", { count: "exact", head: true }).eq("company_id", c.id),
            ]);
            return {
              id: c.id, name: c.name, is_active: c.is_active,
              employees: empRes.count ?? 0,
              active_period: periodRes.data ? `${periodRes.data.start_date} → ${periodRes.data.end_date}` : null,
              period_status: periodRes.data?.status ?? null,
              imports: impRes.count ?? 0, movements: movRes.count ?? 0,
            };
          })
        ),
        (async () => {
          const { data: periods } = await supabase
            .from("pay_periods")
            .select("id, start_date, end_date, company_id")
            .order("start_date", { ascending: true });
          if (!periods?.length) return [];

          const periodMap = new Map<string, { label: string; ids: Map<string, string> }>();
          for (const p of periods) {
            const label = `${p.start_date.slice(5)}`;
            if (!periodMap.has(p.start_date)) periodMap.set(p.start_date, { label, ids: new Map() });
            const company = companyList.find((c) => c.id === p.company_id);
            if (company) periodMap.get(p.start_date)!.ids.set(company.name, p.id);
          }

          const sortedDates = Array.from(periodMap.keys()).sort();
          const allPeriodIds = sortedDates.flatMap(d => Array.from(periodMap.get(d)!.ids.values()));
          const { data: basePays } = await supabase
            .from("period_base_pay")
            .select("period_id, base_total_pay, company_id")
            .in("period_id", allPeriodIds);

          return sortedDates.map((date) => {
            const entry = periodMap.get(date)!;
            const row: PeriodPayData & { _start_date: string } = { period_label: entry.label, _start_date: date };
            for (const company of companyList) {
              const periodId = entry.ids.get(company.name);
              if (periodId && basePays) {
                const total = basePays
                  .filter(bp => bp.period_id === periodId && bp.company_id === company.id)
                  .reduce((sum, bp) => sum + Number(bp.base_total_pay), 0);
                row[company.name] = Math.round(total * 100) / 100;
              } else { row[company.name] = 0; }
            }
            return row;
          });
        })(),
      ]);

      setCompanies(stats);
      setAllTrendData(trendData);

      // Fetch top earners (all-time sum of base_total_pay per employee)
      const { data: basePaysAll } = await supabase
        .from("period_base_pay")
        .select("employee_id, base_total_pay, company_id");

      if (basePaysAll?.length) {
        const empTotals = new Map<string, { total: number; company_id: string }>();
        basePaysAll.forEach(bp => {
          const existing = empTotals.get(bp.employee_id) ?? { total: 0, company_id: bp.company_id };
          existing.total += Number(bp.base_total_pay);
          empTotals.set(bp.employee_id, existing);
        });

        const topIds = Array.from(empTotals.entries())
          .sort((a, b) => b[1].total - a[1].total)
          .slice(0, 10);

        const { data: empNames } = await supabase
          .from("employees")
          .select("id, first_name, last_name, company_id")
          .in("id", topIds.map(t => t[0]));

        if (empNames) {
          const earners: TopEarner[] = topIds.map(([empId, { total }]) => {
            const emp = empNames.find(e => e.id === empId);
            const comp = companyList.find(c => c.id === emp?.company_id);
            return {
              employee_id: empId,
              first_name: emp?.first_name ?? "—",
              last_name: emp?.last_name ?? "",
              company_name: comp?.name ?? "—",
              total_earned: Math.round(total * 100) / 100,
            };
          });
          setTopEarners(earners);
        }
      }

      // Fetch inactive employees (is_active = false)
      const { data: inactive } = await supabase
        .from("employees")
        .select("id, first_name, last_name, company_id, end_date, start_date, is_active")
        .eq("is_active", false)
        .order("end_date", { ascending: false });

      if (inactive?.length) {
        // Get last period for each inactive employee
        const inactiveIds = inactive.map(e => e.id);
        const { data: lastPeriods } = await supabase
          .from("period_base_pay")
          .select("employee_id, period_id")
          .in("employee_id", inactiveIds);

        const periodIds = [...new Set((lastPeriods ?? []).map(lp => lp.period_id))];
        const { data: periodDates } = periodIds.length > 0
          ? await supabase.from("pay_periods").select("id, end_date").in("id", periodIds)
          : { data: [] };

        const empLastPeriod = new Map<string, string>();
        (lastPeriods ?? []).forEach(lp => {
          const pDate = (periodDates ?? []).find(p => p.id === lp.period_id)?.end_date;
          if (pDate) {
            const current = empLastPeriod.get(lp.employee_id);
            if (!current || pDate > current) empLastPeriod.set(lp.employee_id, pDate);
          }
        });

        setInactiveEmployees(inactive.map(e => ({
          id: e.id,
          first_name: e.first_name,
          last_name: e.last_name,
          company_name: companyList.find(c => c.id === e.company_id)?.name ?? "—",
          end_date: e.end_date,
          start_date: e.start_date,
          last_period_end: empLastPeriod.get(e.id) ?? null,
        })));
      }

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

  const grandTotal = useMemo(() => {
    return payTrendData.reduce((sum, row) => {
      let rowTotal = 0;
      activeChartNames.forEach(n => { rowTotal += Number(row[n] ?? 0); });
      return sum + rowTotal;
    }, 0);
  }, [payTrendData, activeChartNames]);

  const summaryCards = [
    { title: "Empresas activas", value: totals.activeCompanies, icon: Building2, color: "text-primary" },
    { title: "Empleados activos", value: totals.employees, icon: Users, color: "text-earning" },
    { title: "Importaciones", value: totals.imports, icon: FileSpreadsheet, color: "text-warning" },
    { title: "Novedades", value: totals.movements, icon: DollarSign, color: "text-deduction" },
  ];

  const formatCurrency = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const exportInactiveCSV = () => {
    if (!inactiveEmployees.length) return;
    const header = "Nombre,Empresa,Inicio,Fin,Último Periodo";
    const rows = inactiveEmployees.map(e =>
      `${e.first_name} ${e.last_name},${e.company_name},${e.start_date ?? "—"},${e.end_date ?? "—"},${e.last_period_end ?? "—"}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "empleados_inactivos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="text-sm text-muted-foreground">{greeting}</span>
        </div>
        <h1 className="page-title">{fullName ? `${greeting}, ${fullName}` : "Vista global"}</h1>
        <p className="page-subtitle">
          {selectedCompanyFilter !== "all" ? selectedCompanyFilter : "Todas las empresas"} · Resumen consolidado
        </p>
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

          {/* Filters Row */}
          {allTrendData.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span className="text-sm font-medium text-muted-foreground">Filtros:</span>

              {/* Company filter */}
              <Select value={selectedCompanyFilter} onValueChange={setSelectedCompanyFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las empresas</SelectItem>
                  {companyNames.map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Date from */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd MMM yyyy", { locale: es }) : "Desde"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>

              {/* Date to */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
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

          {/* Grand Total KPI */}
          {payTrendData.length > 0 && (
            <Card className="mb-6">
              <CardContent className="pt-4 pb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    Pago total {groupMode === "month" ? "(filtrado por mes)" : groupMode === "year" ? "(filtrado por año)" : "(filtrado por periodo)"}
                  </p>
                  <p className="text-2xl font-bold font-mono">{formatCurrency(grandTotal)}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {payTrendData.length} {groupMode === "month" ? "meses" : groupMode === "year" ? "años" : "periodos"}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Charts with Tabs for grouping */}
          {allTrendData.length > 0 && (
            <Tabs value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)} className="mb-6">
              <TabsList>
                <TabsTrigger value="period">Por periodo</TabsTrigger>
                <TabsTrigger value="month">Por mes</TabsTrigger>
                <TabsTrigger value="year">Por año</TabsTrigger>
              </TabsList>

              <TabsContent value={groupMode} className="mt-4">
                {payTrendData.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader className="flex flex-row items-center gap-2 pb-2">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">
                          Pago total {groupMode === "month" ? "por mes" : groupMode === "year" ? "por año" : "por periodo"}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={payTrendData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="period_label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <Tooltip
                              formatter={(value: number, name: string) => [formatCurrency(value), name]}
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                            />
                            <Legend wrapperStyle={{ fontSize: "12px" }} />
                            {activeChartNames.map((name, i) => (
                              <Bar key={name} dataKey={name} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center gap-2 pb-2">
                        <TrendingUp className="h-5 w-5 text-earning" />
                        <CardTitle className="text-base">Tendencia de pagos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={280}>
                          <LineChart data={payTrendData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="period_label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <Tooltip
                              formatter={(value: number, name: string) => [formatCurrency(value), name]}
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                            />
                            <Legend wrapperStyle={{ fontSize: "12px" }} />
                            {activeChartNames.map((name, i) => (
                              <Line key={name} type="monotone" dataKey={name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 4, fill: CHART_COLORS[i % CHART_COLORS.length] }} activeDot={{ r: 6 }} />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">No hay datos en el rango seleccionado</div>
                )}
              </TabsContent>
            </Tabs>
          )}

          {/* Top Earners + Inactive Employees side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Top Earners */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Crown className="h-5 w-5 text-warning" />
                <CardTitle className="text-base">Top 10 empleados que más devengan</CardTitle>
              </CardHeader>
              <CardContent>
                {topEarners.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead className="text-right">Total devengado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topEarners.map((e, i) => (
                        <TableRow key={e.employee_id}>
                          <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{e.first_name} {e.last_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{e.company_name}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-earning">{formatCurrency(e.total_earned)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-6 text-muted-foreground">Sin datos de pago</p>
                )}
              </CardContent>
            </Card>

            {/* Inactive employees */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserMinus className="h-5 w-5 text-deduction" />
                  <CardTitle className="text-base">Empleados que dejaron de laborar</CardTitle>
                </div>
                {inactiveEmployees.length > 0 && (
                  <Button variant="outline" size="sm" onClick={exportInactiveCSV}>
                    <Download className="h-3.5 w-3.5 mr-1" /> CSV
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {inactiveEmployees.length > 0 ? (
                  <div className="max-h-[400px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Empleado</TableHead>
                          <TableHead>Empresa</TableHead>
                          <TableHead>Fecha salida</TableHead>
                          <TableHead>Último periodo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inactiveEmployees.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">{e.first_name} {e.last_name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{e.company_name}</TableCell>
                            <TableCell className="text-sm font-mono">{e.end_date ?? <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-sm font-mono">{e.last_period_end ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center py-6 text-muted-foreground">No hay empleados inactivos</p>
                )}
                {inactiveEmployees.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-3">{inactiveEmployees.length} empleado{inactiveEmployees.length !== 1 ? "s" : ""} inactivo{inactiveEmployees.length !== 1 ? "s" : ""}</p>
                )}
              </CardContent>
            </Card>
          </div>

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
