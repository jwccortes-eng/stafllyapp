import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Archive, RefreshCw, ShieldAlert, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BatchAudit {
  id: string;
  batch_type: string;
  source: string;
  status: string;
  is_legacy: boolean;
  audit_notes: string | null;
  created_at: string;
  schedule_file_name: string | null;
  timeclock_file_name: string | null;
  payroll_file_name: string | null;
  date_range_from: string | null;
  date_range_to: string | null;
}

interface DateAudit {
  table_name: string;
  total_rows: number;
  null_dates: number;
  corrupt_dates: number;
  out_of_range: number;
  min_date: string | null;
  max_date: string | null;
}

interface Props {
  companyId: string;
}

export default function DataIntegrityAudit({ companyId }: Props) {
  const [batches, setBatches] = useState<BatchAudit[]>([]);
  const [dateAudits, setDateAudits] = useState<DateAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadAudit = async () => {
    setLoading(true);
    try {
      // Load batches
      const { data: batchData } = await supabase
        .from("import_batches")
        .select("id, batch_type, source, status, is_legacy, audit_notes, created_at, schedule_file_name, timeclock_file_name, payroll_file_name, date_range_from, date_range_to")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });

      setBatches((batchData as any[]) || []);

      // Date audit per table via counts
      const audits: DateAudit[] = [];

      // Schedule rows
      const { data: schedRows } = await supabase
        .from("normalized_schedule_rows")
        .select("work_date, batch_id")
        .eq("company_id", companyId);

      if (schedRows) {
        const total = schedRows.length;
        const nullDates = schedRows.filter((r: any) => !r.work_date).length;
        const dates = schedRows.filter((r: any) => r.work_date).map((r: any) => r.work_date);
        const corrupt = dates.filter((d: string) => {
          const y = parseInt(d.substring(0, 4));
          return y < 2020 || y > 2030;
        }).length;
        audits.push({
          table_name: "Schedule Rows",
          total_rows: total,
          null_dates: nullDates,
          corrupt_dates: corrupt,
          out_of_range: 0,
          min_date: dates.length ? dates.sort()[0] : null,
          max_date: dates.length ? dates.sort().reverse()[0] : null,
        });
      }

      // Clock rows
      const { data: clockRows } = await supabase
        .from("normalized_clock_rows")
        .select("work_date")
        .eq("company_id", companyId);

      if (clockRows) {
        const total = clockRows.length;
        const nullDates = clockRows.filter((r: any) => !r.work_date).length;
        const dates = clockRows.filter((r: any) => r.work_date).map((r: any) => r.work_date);
        const corrupt = dates.filter((d: string) => {
          const y = parseInt(d.substring(0, 4));
          return y < 2020 || y > 2030;
        }).length;
        audits.push({
          table_name: "Clock Rows",
          total_rows: total,
          null_dates: nullDates,
          corrupt_dates: corrupt,
          out_of_range: 0,
          min_date: dates.length ? dates.sort()[0] : null,
          max_date: dates.length ? dates.sort().reverse()[0] : null,
        });
      }

      // Payroll rows
      const { data: payRows } = await supabase
        .from("normalized_payroll_rows")
        .select("work_date")
        .eq("company_id", companyId);

      if (payRows) {
        const total = payRows.length;
        const nullDates = payRows.filter((r: any) => !r.work_date).length;
        const dates = payRows.filter((r: any) => r.work_date).map((r: any) => r.work_date);
        const corrupt = dates.filter((d: string) => {
          const y = parseInt(d.substring(0, 4));
          return y < 2020 || y > 2030;
        }).length;
        // Check generic date (2026-05-01)
        const genericDate = dates.filter((d: string) => d === "2026-05-01").length;
        audits.push({
          table_name: "Payroll Rows",
          total_rows: total,
          null_dates: nullDates,
          corrupt_dates: corrupt,
          out_of_range: genericDate,
          min_date: dates.length ? dates.sort()[0] : null,
          max_date: dates.length ? dates.sort().reverse()[0] : null,
        });
      }

      setDateAudits(audits);
    } catch (err) {
      console.error("Audit error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAudit(); }, [companyId]);

  const legacyCount = batches.filter(b => b.is_legacy).length;
  const activeCount = batches.filter(b => !b.is_legacy).length;
  const totalDateIssues = dateAudits.reduce((s, a) => s + a.null_dates + a.corrupt_dates + a.out_of_range, 0);

  const fileName = (b: BatchAudit) =>
    b.schedule_file_name || b.timeclock_file_name || b.payroll_file_name || "—";

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Database className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <div className="text-2xl font-bold">{batches.length}</div>
            <div className="text-xs text-muted-foreground">Total Batches</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <div className="text-2xl font-bold text-green-600">{activeCount}</div>
            <div className="text-xs text-muted-foreground">Activos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Archive className="h-5 w-5 mx-auto text-orange-500 mb-1" />
            <div className="text-2xl font-bold text-orange-600">{legacyCount}</div>
            <div className="text-xs text-muted-foreground">Legacy</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <ShieldAlert className="h-5 w-5 mx-auto text-red-500 mb-1" />
            <div className="text-2xl font-bold text-red-600">{totalDateIssues}</div>
            <div className="text-xs text-muted-foreground">Problemas de Fecha</div>
          </CardContent>
        </Card>
      </div>

      {/* Date Audit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Auditoría de Fechas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tabla</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Sin Fecha</TableHead>
                <TableHead className="text-right">Corruptas</TableHead>
                <TableHead className="text-right">Genéricas</TableHead>
                <TableHead>Rango</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dateAudits.map((a) => (
                <TableRow key={a.table_name}>
                  <TableCell className="font-medium">{a.table_name}</TableCell>
                  <TableCell className="text-right">{a.total_rows}</TableCell>
                  <TableCell className="text-right">
                    {a.null_dates > 0 ? (
                      <Badge variant="destructive" className="text-xs">{a.null_dates}</Badge>
                    ) : (
                      <span className="text-green-600">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {a.corrupt_dates > 0 ? (
                      <Badge variant="destructive" className="text-xs">{a.corrupt_dates}</Badge>
                    ) : (
                      <span className="text-green-600">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {a.out_of_range > 0 ? (
                      <Badge variant="outline" className="text-xs text-orange-600">{a.out_of_range}</Badge>
                    ) : (
                      <span className="text-green-600">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.min_date && a.max_date ? `${a.min_date} → ${a.max_date}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Batch History */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            Import Batches
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadAudit} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Rango</TableHead>
                  <TableHead>Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id} className={b.is_legacy ? "opacity-60 bg-muted/30" : ""}>
                    <TableCell>
                      {b.is_legacy ? (
                        <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">Legacy</Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-600 border-green-300 text-xs">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{b.batch_type}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={fileName(b)}>
                      {fileName(b)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(b.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.date_range_from && b.date_range_to
                        ? `${b.date_range_from} → ${b.date_range_to}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground" title={b.audit_notes || ""}>
                      {b.audit_notes || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {totalDateIssues > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Se detectaron <strong>{totalDateIssues}</strong> registros con problemas de fecha.
            Los batches legacy están marcados y excluidos del flujo de reconciliación activo.
            Los guardrails de fecha ahora rechazan fechas fuera del rango 2020–2030.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
