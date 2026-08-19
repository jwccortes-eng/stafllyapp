import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { notifyError, notifySuccess } from "@/lib/feedback/notify";
import { safeRead, safeSheetToJson, getSheetNames, getSheet } from "@/lib/safe-xlsx";
import {
  PAYROLL_SHEET,
  SECRETARIA_SHEET,
  extractPayrollRows,
  previewExternalPayrollClose,
  importExternalPayrollClose,
  formatMoney,
  type BridgePreviewResult,
  type Payroll142RawRow,
} from "@/lib/payroll/payroll142-bridge";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface Period {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface Props {
  companyId: string | null;
  periods: Period[];
}

export default function ExternalPayrollCloseImport({ companyId, periods }: Props) {
  const [periodId, setPeriodId] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Payroll142RawRow[]>([]);
  const [secretariaTotal, setSecretariaTotal] = useState<number | null>(null);
  const [preview, setPreview] = useState<BridgePreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [ackOverrides, setAckOverrides] = useState(false);
  const [imported, setImported] = useState<{ basePayRows: number; movementsInserted: number } | null>(null);

  const reset = () => {
    setRawRows([]);
    setPreview(null);
    setImported(null);
    setAckOverrides(false);
    setSecretariaTotal(null);
  };

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      notifyError({ title: "Archivo demasiado grande", description: "El límite es 10MB." });
      return;
    }
    reset();
    setFileName(f.name);
    setLoading(true);
    try {
      const buffer = await f.arrayBuffer();
      const wb = await safeRead(buffer);
      const names = getSheetNames(wb);
      const payrollName = names.find((n) => n.trim().toUpperCase() === PAYROLL_SHEET);
      if (!payrollName) {
        notifyError({
          title: "Falta la hoja PAYROLL",
          description: `Este archivo no tiene la hoja de cierre aprobada. Hojas encontradas: ${names.join(", ") || "ninguna"}.`,
        });
        setLoading(false);
        return;
      }

      const ws = getSheet(wb, payrollName);
      const json = ws ? safeSheetToJson<Record<string, unknown>>(ws, { defval: "" }) : [];
      const rows = extractPayrollRows(json);
      setRawRows(rows);

      // Control informativo: SECRETARIA nunca define importes.
      const secName = names.find((n) => n.trim().toUpperCase() === SECRETARIA_SHEET);
      if (secName) {
        const secWs = getSheet(wb, secName);
        const secJson = secWs ? safeSheetToJson<Record<string, unknown>>(secWs, { defval: "" }) : [];
        let sum = 0;
        for (const row of secJson) {
          const key = Object.keys(row).find((k) => k.toLowerCase().trim() === "total");
          const value = key ? Number(String(row[key]).replace(/[$,\s]/g, "")) : NaN;
          if (Number.isFinite(value)) sum += value;
        }
        setSecretariaTotal(Math.round(sum * 100) / 100);
      }
    } catch (err) {
      notifyError({ title: "No se pudo leer el archivo", description: (err as Error).message });
    }
    setLoading(false);
  }, []);

  const runPreview = async () => {
    if (!companyId || !periodId || rawRows.length === 0) return;
    setLoading(true);
    setImported(null);
    try {
      const result = await previewExternalPayrollClose({
        companyId, periodId, rows: rawRows, fileName: fileName ?? undefined,
      });
      setPreview(result);
    } catch (err) {
      notifyError({ title: "Preview fallido", description: (err as Error).message });
    }
    setLoading(false);
  };

  const runImport = async () => {
    if (!companyId || !periodId || !preview) return;
    setImporting(true);
    try {
      const result = await importExternalPayrollClose({
        companyId, periodId, rows: rawRows, fileName: fileName ?? undefined,
        expectedGrandTotal: preview.summary.grandApprovedTotal,
        acknowledgeOverrides: ackOverrides,
      });
      setImported({ basePayRows: result.basePayRows, movementsInserted: result.movementsInserted });
      notifySuccess({
        title: "Cierre cargado",
        description: `${result.basePayRows} pagos base y ${result.movementsInserted} movimientos. Total aprobado ${formatMoney(result.summary.grandApprovedTotal)}. Aún no se publican recibos.`,
      });
    } catch (err) {
      notifyError({ title: "Importación bloqueada", description: (err as Error).message });
    }
    setImporting(false);
  };

  const s = preview?.summary;
  const blocked = !!s && !s.canImport;
  const needsAck = !!s && s.approvedTotalOverrides > 0 && !ackOverrides;

  const statusBadge = useMemo(() => (row: BridgePreviewResult["rows"][number]) => {
    if (row.status === "BLOCKED") return <Badge variant="destructive">Bloqueado</Badge>;
    if (row.status === "REVIEW") return <Badge variant="secondary">Total forzado</Badge>;
    return <Badge variant="outline">OK</Badge>;
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Cargar cierre aprobado (hoja PAYROLL)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Lee únicamente la hoja <strong>PAYROLL</strong> como autoridad financiera. El TOTAL aprobado se respeta tal cual:
          no se recalcula con tarifas, turnos ni marcaciones. El preview no escribe nada.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Periodo</Label>
            <Select value={periodId} onValueChange={(v) => { setPeriodId(v); setPreview(null); setImported(null); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona el corte" /></SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.start_date} → {p.end_date} · {p.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="external-close-file">Archivo del cierre</Label>
            <Input id="external-close-file" type="file" accept=".xlsx,.xls" className="mt-1" onChange={handleFile} disabled={loading} />
          </div>
        </div>

        {rawRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" /> {fileName} · {rawRows.length} trabajadores en PAYROLL
            </span>
            {secretariaTotal !== null && (
              <span className="text-muted-foreground">Control SECRETARIA (informativo): {formatMoney(secretariaTotal)}</span>
            )}
            <Button size="sm" onClick={runPreview} disabled={!periodId || loading}>
              {loading ? "Analizando…" : "Ver preview (sin escribir)"}
            </Button>
          </div>
        )}

        {s && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <Kpi label="Trabajadores" value={String(s.workers)} />
              <Kpi label="Total aprobado" value={formatMoney(s.grandApprovedTotal)} />
              <Kpi label="Suma de componentes" value={formatMoney(s.grandComponentSum)} />
              <Kpi label="Identidades" value={`${s.matched} ok · ${s.ambiguous} ambiguas · ${s.notFound} sin ficha`} />
            </div>

            {secretariaTotal !== null && Math.abs(secretariaTotal - s.grandApprovedTotal) >= 0.01 && (
              <p className="text-sm text-muted-foreground">
                SECRETARIA difiere de PAYROLL en {formatMoney(Math.round((s.grandApprovedTotal - secretariaTotal) * 100) / 100)}.
                PAYROLL manda; la diferencia queda solo como control informativo.
              </p>
            )}

            {blocked && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <p className="font-medium">Importación bloqueada</p>
                  <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                    {s.blockers.slice(0, 8).map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trabajador</TableHead>
                    <TableHead>ID empleador</TableHead>
                    <TableHead>Identidad</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead>Conceptos</TableHead>
                    <TableHead className="text-right">Suma</TableHead>
                    <TableHead className="text-right">TOTAL aprobado</TableHead>
                    <TableHead className="text-right">Dif.</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview!.rows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="font-medium">
                        {row.worker}
                        {row.warnings.length > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{row.warnings.join(" · ")}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{row.employerIdentification || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={row.identityStatus === "MATCHED" ? "outline" : "destructive"}>
                          {row.identityStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(row.basePay)}</TableCell>
                      <TableCell className="text-xs">
                        {row.components.length === 0
                          ? "—"
                          : row.components.map((c) => `${c.conceptName} ${formatMoney(c.value)}`).join(" · ")}
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(row.componentSum)}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(row.approvedTotal)}</TableCell>
                      <TableCell className="text-right">{row.hasApprovedTotalOverride ? formatMoney(row.difference) : "—"}</TableCell>
                      <TableCell>{statusBadge(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {s.approvedTotalOverrides > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={ackOverrides} onCheckedChange={(v) => setAckOverrides(v === true)} className="mt-0.5" />
                <span>
                  Confirmo que {s.approvedTotalOverrides} trabajador(es) tienen un TOTAL aprobado distinto al desglose y que
                  se debe congelar el TOTAL del archivo sin recalcular ni crear movimientos de ajuste.
                </span>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runImport} disabled={blocked || needsAck || importing || !!imported}>
                {importing ? "Cargando…" : `Importar cierre (${formatMoney(s.grandApprovedTotal)})`}
              </Button>
              <span className="text-xs text-muted-foreground">
                No publica recibos ni envía notificaciones. La publicación es un paso posterior.
              </span>
            </div>

            {imported && (
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <span>
                  Cierre cargado: {imported.basePayRows} pagos base y {imported.movementsInserted} movimientos.
                  Total congelable {formatMoney(s.grandApprovedTotal)}. Recibos aún sin publicar.
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
