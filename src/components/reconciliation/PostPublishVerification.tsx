import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, AlertTriangle, Shield, DollarSign, Users,
  FileText, Clock, Calendar,
} from "lucide-react";
import type { EmployeeFinalRecord, ClosingReceipt, EmployeeVariance } from "@/hooks/useReconciliationPeriod";

interface Props {
  closingReceipt: ClosingReceipt;
  finalRecords: EmployeeFinalRecord[];
  variances: EmployeeVariance[];
  employees: Map<string, string>;
}

export default function PostPublishVerification({ closingReceipt, finalRecords, variances, employees }: Props) {
  const checks = useMemo(() => {
    const reconciledTotal = finalRecords.reduce((s, r) => s + (r.grand_total || r.final_total_pay || 0), 0);
    const postedTotal = closingReceipt.grand_total_posted || 0;
    const drift = Math.round((postedTotal - reconciledTotal) * 100) / 100;
    const totalsMatch = Math.abs(drift) < 0.01;

    const remainingWarnings = finalRecords.reduce((s, r) => s + (r.warnings?.length || 0), 0);
    const minorVariances = variances.filter(v => v.variance_status === "minor_variance").length;

    return { reconciledTotal, postedTotal, drift, totalsMatch, remainingWarnings, minorVariances };
  }, [closingReceipt, finalRecords, variances]);

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const allGreen = checks.totalsMatch && checks.remainingWarnings === 0;

  return (
    <Card className={`border-2 ${allGreen ? "border-primary/30 bg-primary/3" : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20"}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Verificación Post-Publicación
          {allGreen ? (
            <Badge variant="default" className="text-[10px] gap-1"><CheckCircle2 className="h-2.5 w-2.5" /> Todo correcto</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] gap-1 text-amber-600"><AlertTriangle className="h-2.5 w-2.5" /> Con observaciones</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total comparison */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Pre-Publicación</div>
            <div className="text-sm font-bold font-mono">{fmt(checks.reconciledTotal)}</div>
          </div>
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Publicado</div>
            <div className="text-sm font-bold font-mono text-primary">{fmt(checks.postedTotal)}</div>
          </div>
          <div className={`p-3 rounded-lg text-center ${checks.totalsMatch ? "bg-primary/5" : "bg-destructive/5"}`}>
            <div className="text-[10px] text-muted-foreground uppercase">Drift</div>
            <div className={`text-sm font-bold font-mono ${checks.totalsMatch ? "text-primary" : "text-destructive"}`}>
              {checks.drift >= 0 ? "+" : ""}{fmt(checks.drift)}
            </div>
          </div>
        </div>

        <Separator />

        {/* Verification checks */}
        <div className="space-y-1.5">
          {[
            { pass: checks.totalsMatch, label: "Totales validados coinciden con totales publicados", detail: checks.totalsMatch ? "Sin drift detectado" : `Drift: ${fmt(checks.drift)}` },
            { pass: checks.remainingWarnings === 0, label: "Sin advertencias no-bloqueantes pendientes", detail: checks.remainingWarnings > 0 ? `${checks.remainingWarnings} advertencia(s) residual(es)` : "Limpio" },
            { pass: checks.minorVariances === 0, label: "Sin varianzas menores post-publish", detail: checks.minorVariances > 0 ? `${checks.minorVariances} varianza(s) menor(es)` : "Ninguna" },
          ].map(check => (
            <div key={check.label} className={`flex items-center gap-2 p-2 rounded-lg ${check.pass ? "bg-primary/5" : "bg-amber-50 dark:bg-amber-950/20"}`}>
              {check.pass ? <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
              <div className="flex-1">
                <span className="text-xs font-medium">{check.label}</span>
                <span className="text-[10px] text-muted-foreground ml-2">{check.detail}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Posted details */}
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: "Empleados", value: closingReceipt.total_employees, icon: Users },
            { label: "Turnos Prog.", value: closingReceipt.total_scheduled_shifts, icon: Calendar },
            { label: "Turnos Trab.", value: closingReceipt.total_worked_shifts, icon: Clock },
            { label: "Filas Nómina", value: closingReceipt.total_payroll_rows, icon: FileText },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="p-2 rounded bg-muted/20">
                <Icon className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
                <div className="text-sm font-bold">{item.value}</div>
                <div className="text-[10px] text-muted-foreground">{item.label}</div>
              </div>
            );
          })}
        </div>

        <div className="text-[10px] text-muted-foreground text-center">
          Publicado el {new Date(closingReceipt.published_at).toLocaleString()} por {closingReceipt.published_by}
        </div>
      </CardContent>
    </Card>
  );
}
