import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown, ChevronUp, FileQuestion, Clock, Users,
  MapPin, FileText, AlertTriangle, CheckCircle2, Ban,
} from "lucide-react";

/* ── Types ── */

interface ScheduleRow {
  id: string;
  employee_name_raw: string | null;
  matched_employee_id: string | null;
  shift_title: string | null;
  pay_type: string | null;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  total_hours: number | null;
  client_name: string | null;
  location_name: string | null;
  notes: string | null;
  match_id: string;
}

type NoTitleSub =
  | "no_title_no_times"
  | "no_title_no_employee"
  | "no_title_has_payroll"
  | "no_title_duplicate"
  | "no_title_no_location"
  | "no_title_has_times"
  | "no_title_placeholder"
  | "no_title_likely_real";

interface SubDef {
  key: NoTitleSub;
  label: string;
  icon: React.ReactNode;
  color: string;
  clockRequired: "no" | "maybe" | "yes";
  recommendedAction: string;
}

const SUB_DEFS: SubDef[] = [
  {
    key: "no_title_no_times",
    label: "Sin título + sin horario",
    icon: <Ban className="h-4 w-4" />,
    color: "text-muted-foreground",
    clockRequired: "no",
    recommendedAction: "Marcar como placeholder no-ejecutable — no es turno real",
  },
  {
    key: "no_title_no_employee",
    label: "Sin título + sin empleado",
    icon: <Users className="h-4 w-4" />,
    color: "text-amber-500",
    clockRequired: "no",
    recommendedAction: "Resolver matching de empleado o ignorar fila de sistema",
  },
  {
    key: "no_title_duplicate",
    label: "Sin título + duplicado",
    icon: <FileQuestion className="h-4 w-4" />,
    color: "text-muted-foreground",
    clockRequired: "no",
    recommendedAction: "Ignorar duplicado de importación",
  },
  {
    key: "no_title_has_payroll",
    label: "Sin título + evidencia nómina",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-primary",
    clockRequired: "maybe",
    recommendedAction: "Pagado sin reloj — verificar si turno compensado directamente",
  },
  {
    key: "no_title_no_location",
    label: "Sin título + sin ubicación",
    icon: <MapPin className="h-4 w-4" />,
    color: "text-muted-foreground",
    clockRequired: "no",
    recommendedAction: "Fila sin contexto suficiente — probablemente placeholder",
  },
  {
    key: "no_title_placeholder",
    label: "Sin título + probable placeholder",
    icon: <FileText className="h-4 w-4" />,
    color: "text-muted-foreground",
    clockRequired: "no",
    recommendedAction: "Sin job/notes/location — fila vacía de importación",
  },
  {
    key: "no_title_has_times",
    label: "Sin título + tiene horario",
    icon: <Clock className="h-4 w-4" />,
    color: "text-amber-500",
    clockRequired: "yes",
    recommendedAction: "Probablemente turno real sin título — verificar fichaje",
  },
  {
    key: "no_title_likely_real",
    label: "Sin título + probable turno real",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "text-destructive",
    clockRequired: "yes",
    recommendedAction: "Turno con horario y ubicación — fichaje esperado",
  },
];

/* ── Classification ── */

function classifyNoTitle(
  row: ScheduleRow,
  duplicateKeys: Set<string>,
  payrollDates: Set<string>,
): NoTitleSub {
  if (!row.matched_employee_id) return "no_title_no_employee";
  if (!row.start_time && !row.end_time) return "no_title_no_times";

  const dupeKey = `${row.matched_employee_id}|${row.work_date}|`;
  if (duplicateKeys.has(dupeKey)) return "no_title_duplicate";

  const payKey = `${row.matched_employee_id}|${row.work_date}`;
  if (payrollDates.has(payKey)) return "no_title_has_payroll";

  const hasLocation = !!(row.location_name || row.client_name);
  const hasJob = !!row.pay_type;
  const hasNotes = !!row.notes;

  if (!hasLocation && !hasJob && !hasNotes) return "no_title_placeholder";
  if (!hasLocation) return "no_title_no_location";

  if (row.start_time && row.end_time && hasLocation) return "no_title_likely_real";
  if (row.start_time || row.end_time) return "no_title_has_times";

  return "no_title_placeholder";
}

function buildDuplicateKeysForNoTitle(rows: ScheduleRow[]): Set<string> {
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    const key = `${r.matched_employee_id || r.employee_name_raw}|${r.work_date}|`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const dupes = new Set<string>();
  const seen = new Set<string>();
  rows.forEach((r) => {
    const key = `${r.matched_employee_id || r.employee_name_raw}|${r.work_date}|`;
    if ((counts.get(key) || 0) > 1) {
      if (seen.has(key)) dupes.add(key);
      seen.add(key);
    }
  });
  return dupes;
}

/* ── Field availability summary ── */

interface FieldAvailability {
  field: string;
  available: number;
  missing: number;
  pct: number;
  examples: string[];
}

function computeFieldAvailability(rows: ScheduleRow[]): FieldAvailability[] {
  const fields: { field: string; getter: (r: ScheduleRow) => string | null | undefined }[] = [
    { field: "Raw job (pay_type)", getter: (r) => r.pay_type },
    { field: "Raw notes", getter: (r) => r.notes },
    { field: "Raw client", getter: (r) => r.client_name },
    { field: "Raw location", getter: (r) => r.location_name },
    { field: "Start time", getter: (r) => r.start_time },
    { field: "End time", getter: (r) => r.end_time },
    { field: "Employee (raw)", getter: (r) => r.employee_name_raw },
    { field: "Employee (matched)", getter: (r) => r.matched_employee_id },
    { field: "Work date", getter: (r) => r.work_date },
  ];

  return fields.map(({ field, getter }) => {
    let available = 0;
    const exampleSet = new Set<string>();
    rows.forEach((r) => {
      const v = getter(r);
      if (v && String(v).trim()) {
        available++;
        if (exampleSet.size < 3) exampleSet.add(String(v).trim().substring(0, 40));
      }
    });
    return {
      field,
      available,
      missing: rows.length - available,
      pct: rows.length > 0 ? (available / rows.length) * 100 : 0,
      examples: Array.from(exampleSet),
    };
  });
}

/* ── Component ── */

interface Props {
  allUnmatchedRows: ScheduleRow[];
  payrollDates: Set<string>;
}

export default function NoTitleDiagnostics({ allUnmatchedRows, payrollDates }: Props) {
  const [expandedSub, setExpandedSub] = useState<string | null>(null);

  const noTitleRows = useMemo(
    () => allUnmatchedRows.filter((r) => !r.shift_title || !r.shift_title.trim()),
    [allUnmatchedRows],
  );

  const duplicateKeys = useMemo(() => buildDuplicateKeysForNoTitle(noTitleRows), [noTitleRows]);

  const classified = useMemo(() => {
    const buckets: Record<NoTitleSub, ScheduleRow[]> = {
      no_title_no_times: [],
      no_title_no_employee: [],
      no_title_has_payroll: [],
      no_title_duplicate: [],
      no_title_no_location: [],
      no_title_has_times: [],
      no_title_placeholder: [],
      no_title_likely_real: [],
    };
    noTitleRows.forEach((r) => {
      const sub = classifyNoTitle(r, duplicateKeys, payrollDates);
      buckets[sub].push(r);
    });
    return buckets;
  }, [noTitleRows, duplicateKeys, payrollDates]);

  const fieldAvailability = useMemo(() => computeFieldAvailability(noTitleRows), [noTitleRows]);

  const total = noTitleRows.length;
  if (total === 0) return null;

  const clockRequiredCount = SUB_DEFS.reduce(
    (acc, d) => acc + (d.clockRequired === "yes" ? (classified[d.key]?.length || 0) : 0),
    0,
  );

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileQuestion className="h-4 w-4 text-amber-500" />
          Diagnóstico: "(sin título)" — {total.toLocaleString()} filas
          <Badge variant="outline" className="ml-auto text-xs">
            {clockRequiredCount} probablemente requieren fichaje
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Field availability summary */}
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/60 bg-muted/30">
            <p className="text-sm font-medium">Campos disponibles en filas sin título</p>
          </div>
          <div className="overflow-auto max-h-[220px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Vacío</TableHead>
                  <TableHead>Cobertura</TableHead>
                  <TableHead>Ejemplos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fieldAvailability.map((f) => (
                  <TableRow key={f.field}>
                    <TableCell className="text-sm font-medium">{f.field}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{f.available.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{f.missing.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={f.pct} className="w-16 h-2" />
                        <span className="text-xs font-mono">{f.pct.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                      {f.examples.length > 0 ? f.examples.join(", ") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Sub-category breakdown */}
        {SUB_DEFS.map((def) => {
          const bucketRows = classified[def.key] || [];
          if (bucketRows.length === 0) return null;
          const pct = total > 0 ? (bucketRows.length / total) * 100 : 0;
          const isExpanded = expandedSub === def.key;

          // Sample employees
          const empSample = new Set<string>();
          bucketRows.forEach((r) => {
            if (empSample.size < 5 && r.employee_name_raw) empSample.add(r.employee_name_raw);
          });

          return (
            <div key={def.key} className="border border-border/50 rounded-lg overflow-hidden">
              <button
                className="flex items-center gap-2 px-4 py-3 hover:bg-accent/30 transition-colors w-full text-left"
                onClick={() => setExpandedSub(isExpanded ? null : def.key)}
              >
                <span className={def.color}>{def.icon}</span>
                <span className="font-medium flex-1 text-sm">{def.label}</span>
                <Badge
                  variant={def.clockRequired === "yes" ? "warning" : def.clockRequired === "maybe" ? "secondary" : "outline"}
                  className="text-[10px]"
                >
                  clock: {def.clockRequired}
                </Badge>
                <Badge variant="secondary" className="font-mono">
                  {bucketRows.length.toLocaleString()}
                </Badge>
                <span className="text-xs text-muted-foreground w-14 text-right">
                  {pct.toFixed(1)}%
                </span>
                <Progress value={pct} className="w-20 h-2" />
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-border/30 bg-muted/20">
                  <div className="px-4 pt-2 pb-1 space-y-1">
                    <p className="text-xs text-muted-foreground">{def.recommendedAction}</p>
                    {empSample.size > 0 && (
                      <p className="text-xs">
                        <span className="font-semibold">Empleados ejemplo:</span>{" "}
                        {Array.from(empSample).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="overflow-auto max-h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Empleado</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Horario</TableHead>
                          <TableHead>Job/pay_type</TableHead>
                          <TableHead>Ubicación/Cliente</TableHead>
                          <TableHead>Notas</TableHead>
                          <TableHead>Nómina?</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bucketRows.slice(0, 50).map((r) => {
                          const hasPayroll = r.matched_employee_id && r.work_date
                            ? payrollDates.has(`${r.matched_employee_id}|${r.work_date}`)
                            : false;
                          return (
                            <TableRow key={r.match_id}>
                              <TableCell className="text-xs max-w-[140px] truncate">
                                {r.employee_name_raw || "—"}
                                {!r.matched_employee_id && (
                                  <Badge variant="outline" className="ml-1 text-[10px]">sin match</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-mono">{r.work_date || "—"}</TableCell>
                              <TableCell className="text-xs font-mono">
                                {r.start_time && r.end_time
                                  ? `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`
                                  : <span className="text-muted-foreground">sin horario</span>}
                              </TableCell>
                              <TableCell className="text-xs max-w-[100px] truncate">{r.pay_type || "—"}</TableCell>
                              <TableCell className="text-xs max-w-[140px] truncate">
                                {r.location_name || r.client_name || "—"}
                              </TableCell>
                              <TableCell className="text-xs max-w-[120px] truncate">{r.notes || "—"}</TableCell>
                              <TableCell>
                                <Badge variant={hasPayroll ? "success" : "outline"} className="text-[10px]">
                                  {hasPayroll ? "sí" : "no"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {bucketRows.length > 50 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Mostrando 50 de {bucketRows.length.toLocaleString()} filas
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
