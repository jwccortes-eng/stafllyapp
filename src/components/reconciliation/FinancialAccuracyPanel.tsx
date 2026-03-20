import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign, CheckCircle2, AlertTriangle, XCircle, TrendingUp,
  Clock, Calendar, Car, Briefcase, PenTool, Users, Shield, CalendarDays,
} from "lucide-react";
import type { EmployeeFinalRecord, EmployeeVariance } from "@/hooks/useReconciliationPeriod";

interface Props {
  finalRecords: EmployeeFinalRecord[];
  variances: EmployeeVariance[];
  publishedTotal?: number;
}

export default function FinancialAccuracyPanel({ finalRecords, variances, publishedTotal }: Props) {
  const data = useMemo(() => {
    const sourceTotal = variances.reduce((s, v) => s + v.source_payroll_total, 0);
    const reconciledTotal = variances.reduce((s, v) => s + v.reconciled_total, 0);
    const totalVariance = Math.round((reconciledTotal - sourceTotal) * 100) / 100;
    const matchPct = sourceTotal > 0 ? Math.round(Math.max(0, 1 - Math.abs(totalVariance) / sourceTotal) * 10000) / 100 : 100;

    const exact = variances.filter(v => v.variance_status === "exact_match").length;
    const minor = variances.filter(v => v.variance_status === "minor_variance").length;
    const major = variances.filter(v => v.variance_status === "major_variance").length;
    const unresolved = variances.filter(v => v.variance_status === "unresolved").length;
    const empPct = variances.length > 0 ? Math.round((exact / variances.length) * 100) : 100;

    const hourlyTotal = finalRecords.reduce((s, r) => s + (r.hourly_pay_total || r.base_pay || 0), 0);
    const dailyTotal = finalRecords.reduce((s, r) => s + (r.daily_pay_total || 0), 0);
    const rideTotal = finalRecords.reduce((s, r) => s + (r.ride_pay_total || r.ride_amount || 0), 0);
    const weekendTotal = finalRecords.reduce((s, r) => s + (r.weekend_pay_total || r.weekend_amount || 0), 0);
    const manualTotal = finalRecords.reduce((s, r) => s + (r.manual_adjustment_total || r.manual_amount || 0), 0);
    const grandTotal = finalRecords.reduce((s, r) => s + (r.grand_total || r.final_total_pay || 0), 0);

    // Shift-based calculation aggregates
    const shiftCalcTotal = finalRecords.reduce((s, r) => s + (r.shift_calculated_total || 0), 0);
    const payrollRefTotal = finalRecords.reduce((s, r) => s + (r.payroll_reference_total || r.source_payroll_total || 0), 0);
    const totalFullDays = finalRecords.reduce((s, r) => s + (r.shift_full_day_count || 0), 0);
    const totalHalfDays = finalRecords.reduce((s, r) => s + (r.shift_half_day_count || 0), 0);
    const shiftVsPayrollDiff = Math.round((shiftCalcTotal - payrollRefTotal) * 100) / 100;
    const empsWithShiftCalc = finalRecords.filter(r => (r.shift_calculated_total || 0) > 0).length;

    return { sourceTotal, reconciledTotal, totalVariance, matchPct, exact, minor, major, unresolved, empPct, hourlyTotal, dailyTotal, rideTotal, weekendTotal, manualTotal, grandTotal, shiftCalcTotal, payrollRefTotal, totalFullDays, totalHalfDays, shiftVsPayrollDiff, empsWithShiftCalc };
  }, [finalRecords, variances]);

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const accuracy = data.matchPct >= 99.5 ? "high" : data.matchPct >= 95 ? "medium" : "low";
  const accuracyConfig = {
    high: { label: "Alta Precisión", color: "text-primary", bg: "bg-primary/5 border-primary/30", icon: CheckCircle2 },
    medium: { label: "Precisión Media", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-300", icon: AlertTriangle },
    low: { label: "Baja Precisión", color: "text-destructive", bg: "bg-destructive/5 border-destructive/30", icon: XCircle },
  }[accuracy];
  const AccuracyIcon = accuracyConfig.icon;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Panel de Precisión Financiera
          </CardTitle>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${accuracyConfig.bg} ${accuracyConfig.color}`}>
            <AccuracyIcon className="h-3 w-3" />
            {accuracyConfig.label} ({data.matchPct}%)
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Shift-based calculation panel (PRIMARY) */}
        {data.empsWithShiftCalc > 0 && (
          <>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="text-xs font-medium text-primary mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Cálculo por Turnos (Fuente Primaria)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Días Completos</div>
                  <div className="text-lg font-bold">{data.totalFullDays}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Medios Días</div>
                  <div className="text-lg font-bold">{data.totalHalfDays}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Calculado</div>
                  <div className="text-lg font-bold font-mono text-primary">{fmt(data.shiftCalcTotal)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Empleados</div>
                  <div className="text-lg font-bold">{data.empsWithShiftCalc}</div>
                </div>
              </div>
              {/* Shift vs Payroll comparison */}
              <div className="mt-3 pt-2 border-t border-primary/10 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-muted-foreground">Shift-Calc</div>
                  <div className="text-sm font-bold font-mono text-primary">{fmt(data.shiftCalcTotal)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Payroll (ref)</div>
                  <div className="text-sm font-bold font-mono text-muted-foreground">{fmt(data.payrollRefTotal)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Diferencia</div>
                  <div className={`text-sm font-bold font-mono ${Math.abs(data.shiftVsPayrollDiff) > 10 ? "text-destructive" : "text-primary"}`}>
                    {data.shiftVsPayrollDiff >= 0 ? "+" : ""}{fmt(data.shiftVsPayrollDiff)}
                  </div>
                </div>
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Main totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Nómina Fuente</div>
            <div className="text-base font-bold font-mono">{fmt(data.sourceTotal)}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Reconciliado</div>
            <div className="text-base font-bold font-mono">{fmt(data.reconciledTotal)}</div>
          </div>
          {publishedTotal !== undefined && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Publicado</div>
              <div className="text-base font-bold font-mono text-primary">{fmt(publishedTotal)}</div>
            </div>
          )}
          <div className={`p-3 rounded-lg text-center ${Math.abs(data.totalVariance) > 10 ? "bg-destructive/5 border border-destructive/20" : "bg-muted/30"}`}>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Varianza Total</div>
            <div className={`text-base font-bold font-mono ${Math.abs(data.totalVariance) > 10 ? "text-destructive" : ""}`}>
              {data.totalVariance >= 0 ? "+" : ""}{fmt(data.totalVariance)}
            </div>
          </div>
        </div>

        <Separator />

        {/* Employee variance breakdown */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Empleados por Varianza</h4>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Exact Match", count: data.exact, icon: CheckCircle2, color: "text-primary" },
              { label: "Menor (≤$10)", count: data.minor, icon: AlertTriangle, color: "text-amber-600" },
              { label: "Mayor (>$10)", count: data.major, icon: XCircle, color: "text-destructive" },
              { label: "Sin Resolver", count: data.unresolved, icon: XCircle, color: "text-destructive" },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                  <Icon className={`h-3.5 w-3.5 ${item.color} shrink-0`} />
                  <div>
                    <div className="text-sm font-bold">{item.count}</div>
                    <div className="text-[10px] text-muted-foreground">{item.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Component breakdown */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Desglose por Componente</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              { label: "Hourly", value: data.hourlyTotal, icon: Clock, color: "text-blue-600" },
              { label: "Daily", value: data.dailyTotal, icon: Calendar, color: "text-emerald-600" },
              { label: "Ride", value: data.rideTotal, icon: Car, color: "text-amber-600" },
              { label: "Weekend", value: data.weekendTotal, icon: Briefcase, color: "text-purple-600" },
              { label: "Manual", value: data.manualTotal, icon: PenTool, color: "text-rose-600" },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                  <Icon className={`h-3.5 w-3.5 ${item.color} shrink-0`} />
                  <div>
                    <div className="text-xs font-bold font-mono">{fmt(item.value)}</div>
                    <div className="text-[10px] text-muted-foreground">{item.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Grand total */}
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Reconciliado</div>
          <div className="text-2xl font-bold font-mono text-primary">{fmt(data.grandTotal)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {variances.length} empleados · {data.empPct}% exact match
            {data.empsWithShiftCalc > 0 && ` · ${data.empsWithShiftCalc} con cálculo por turnos`}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
