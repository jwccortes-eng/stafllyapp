import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, Users, Clock, Calendar, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, FileQuestion, Loader2,
} from "lucide-react";

interface Props {
  companyId: string | null;
}

interface MatchRow {
  id: string;
  match_status: string;
  confidence_score: number;
  conflict_flags: any;
  employee_id: string | null;
  schedule_row_id: string | null;
  clock_row_id: string | null;
}

interface BucketDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  test: (m: MatchRow) => boolean;
  action: string;
}

const BUCKETS: BucketDef[] = [
  {
    key: "no_employee",
    label: "Sin empleado matcheado",
    icon: <Users className="h-4 w-4" />,
    color: "text-amber-500",
    test: (m) => !m.employee_id && !flags(m).includes("clock_exempt"),
    action: "Ejecutar Employee Matching o crear alias para nombres no reconocidos",
  },
  {
    key: "availability_block",
    label: "Bloqueo / No disponible",
    icon: <Ban className="h-4 w-4" />,
    color: "text-muted-foreground",
    test: (m) => flags(m).includes("availability_block"),
    action: "✅ Resuelto — fila de disponibilidad/bloqueo, no requiere reloj",
  },
  {
    key: "daily_pay",
    label: "Daily Pay (Weekend shift)",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-primary",
    test: (m) => flags(m).includes("daily_pay_weekend_job"),
    action: "✅ Resuelto — compensación especial sin reloj",
  },
  {
    key: "ride_pay",
    label: "Ride Pay (Pay Ride)",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-primary",
    test: (m) => flags(m).includes("ride_pay"),
    action: "✅ Resuelto — compensación de transporte",
  },
  {
    key: "clock_without_schedule",
    label: "Fichaje sin agenda",
    icon: <Clock className="h-4 w-4" />,
    color: "text-destructive",
    test: (m) => flags(m).includes("clock_without_schedule"),
    action: "Vincular a turno existente, crear turno trabajado, o marcar como trabajo sin agenda",
  },
  {
    key: "unmatched_schedule",
    label: "Agenda sin fichaje",
    icon: <Calendar className="h-4 w-4" />,
    color: "text-amber-500",
    test: (m) => flags(m).includes("unmatched_schedule") && !!m.employee_id,
    action: "Verificar si fue ausencia, turno cancelado, o si el fichaje está con nombre diferente",
  },
  {
    key: "time_mismatch",
    label: "Diferencia de horario",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "text-warning",
    test: (m) => flags(m).includes("start_time_diff") || flags(m).includes("end_time_diff"),
    action: "Revisar si el empleado llegó tarde/temprano o si hay error de zona horaria",
  },
  {
    key: "duplicate",
    label: "Posible duplicado",
    icon: <FileQuestion className="h-4 w-4" />,
    color: "text-muted-foreground",
    test: (m) => flags(m).includes("possible_duplicate"),
    action: "Confirmar duplicado e ignorar la entrada redundante",
  },
  {
    key: "matched",
    label: "Matcheados correctamente",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-primary",
    test: (m) => m.match_status === "exact" && !flags(m).includes("clock_exempt"),
    action: "✅ Sin acción requerida",
  },
  {
    key: "probable",
    label: "Match probable",
    icon: <BarChart3 className="h-4 w-4" />,
    color: "text-secondary-foreground",
    test: (m) => m.match_status === "probable",
    action: "Revisar y aprobar o corregir el emparejamiento",
  },
];

function flags(m: MatchRow): string[] {
  return Array.isArray(m.conflict_flags) ? m.conflict_flags : [];
}

function classifyRow(m: MatchRow): string {
  for (const b of BUCKETS) {
    if (b.test(m)) return b.key;
  }
  return "other";
}

export default function MatchingConflictSummary({ companyId }: Props) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [scheduleLabels, setScheduleLabels] = useState<Record<string, { shift_title: string | null; employee_name_raw: string | null }>>({});
  const [clockLabels, setClockLabels] = useState<Record<string, { employee_name_raw: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"bucket" | "shift_title" | "employee">("bucket");

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    loadData(companyId);
  }, [companyId]);

  async function loadData(cid: string) {
    // Fetch all matches
    const PAGE = 1000;
    let allMatches: any[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("reconciliation_matches" as any)
        .select("id, match_status, confidence_score, conflict_flags, employee_id, schedule_row_id, clock_row_id")
        .eq("company_id", cid)
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allMatches = allMatches.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setMatches(allMatches as MatchRow[]);

    // Fetch schedule labels for context
    const schedIds = [...new Set(allMatches.filter((m: any) => m.schedule_row_id).map((m: any) => m.schedule_row_id))];
    const clockIds = [...new Set(allMatches.filter((m: any) => m.clock_row_id).map((m: any) => m.clock_row_id))];

    const labelMap: Record<string, { shift_title: string | null; employee_name_raw: string | null }> = {};
    const clockMap: Record<string, { employee_name_raw: string | null }> = {};

    // Fetch schedule labels in batches
    for (let i = 0; i < schedIds.length; i += 200) {
      const batch = schedIds.slice(i, i + 200);
      const { data } = await supabase
        .from("normalized_schedule_rows" as any)
        .select("id, shift_title, employee_name_raw")
        .in("id", batch);
      (data || []).forEach((r: any) => { labelMap[r.id] = { shift_title: r.shift_title, employee_name_raw: r.employee_name_raw }; });
    }

    for (let i = 0; i < clockIds.length; i += 200) {
      const batch = clockIds.slice(i, i + 200);
      const { data } = await supabase
        .from("normalized_clock_rows" as any)
        .select("id, employee_name_raw")
        .in("id", batch);
      (data || []).forEach((r: any) => { clockMap[r.id] = { employee_name_raw: r.employee_name_raw }; });
    }

    setScheduleLabels(labelMap);
    setClockLabels(clockMap);
    setLoading(false);
  }

  const bucketData = useMemo(() => {
    const counts: Record<string, MatchRow[]> = {};
    BUCKETS.forEach(b => { counts[b.key] = []; });
    counts["other"] = [];

    matches.forEach(m => {
      const key = classifyRow(m);
      if (!counts[key]) counts[key] = [];
      counts[key].push(m);
    });
    return counts;
  }, [matches]);

  const shiftTitleGroups = useMemo(() => {
    const groups: Record<string, { count: number; statuses: Record<string, number> }> = {};
    matches.forEach(m => {
      const label = (m.schedule_row_id && scheduleLabels[m.schedule_row_id]?.shift_title) || "(sin título)";
      if (!groups[label]) groups[label] = { count: 0, statuses: {} };
      groups[label].count++;
      const bucket = classifyRow(m);
      groups[label].statuses[bucket] = (groups[label].statuses[bucket] || 0) + 1;
    });
    return Object.entries(groups).sort((a, b) => b[1].count - a[1].count);
  }, [matches, scheduleLabels]);

  const employeeGroups = useMemo(() => {
    const groups: Record<string, { count: number; statuses: Record<string, number> }> = {};
    matches.forEach(m => {
      const empName =
        (m.schedule_row_id && scheduleLabels[m.schedule_row_id]?.employee_name_raw) ||
        (m.clock_row_id && clockLabels[m.clock_row_id]?.employee_name_raw) ||
        "(desconocido)";
      if (!groups[empName]) groups[empName] = { count: 0, statuses: {} };
      groups[empName].count++;
      const bucket = classifyRow(m);
      groups[empName].statuses[bucket] = (groups[empName].statuses[bucket] || 0) + 1;
    });
    return Object.entries(groups).sort((a, b) => b[1].count - a[1].count);
  }, [matches, scheduleLabels, clockLabels]);

  const total = matches.length;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Analizando resultados de matching...
        </CardContent>
      </Card>
    );
  }

  if (total === 0) return null;

  const allBuckets = [
    ...BUCKETS.map(b => ({ ...b, rows: bucketData[b.key] || [] })),
    {
      key: "other",
      label: "Otros / Sin clasificar",
      icon: <FileQuestion className="h-4 w-4" />,
      color: "text-muted-foreground",
      action: "Revisar manualmente",
      rows: bucketData["other"] || [],
    },
  ].filter(b => b.rows.length > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Diagnóstico de Conflictos — {total.toLocaleString()} resultados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
          <TabsList>
            <TabsTrigger value="bucket">Por categoría</TabsTrigger>
            <TabsTrigger value="shift_title">Por título de turno</TabsTrigger>
            <TabsTrigger value="employee">Por empleado</TabsTrigger>
          </TabsList>

          <TabsContent value="bucket" className="space-y-2 mt-3">
            {allBuckets.map(b => {
              const pct = total > 0 ? ((b.rows.length / total) * 100) : 0;
              const isExpanded = expandedBucket === b.key;
              // Top examples
              const examples = getExamples(b.rows, scheduleLabels, clockLabels);

              return (
                <div key={b.key} className="border border-border/50 rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
                    onClick={() => setExpandedBucket(isExpanded ? null : b.key)}
                  >
                    <span className={b.color}>{b.icon}</span>
                    <span className="font-medium flex-1">{b.label}</span>
                    <Badge variant="secondary" className="font-mono">
                      {b.rows.length.toLocaleString()}
                    </Badge>
                    <span className="text-xs text-muted-foreground w-14 text-right">
                      {pct.toFixed(1)}%
                    </span>
                    <Progress value={pct} className="w-24 h-2" />
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2 border-t border-border/30 bg-muted/20">
                      <div className="pt-2">
                        <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wide">
                          Acción recomendada
                        </p>
                        <p className="text-sm">{b.action}</p>
                      </div>

                      {examples.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wide">
                            Ejemplos ({Math.min(10, examples.length)} de {b.rows.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {examples.slice(0, 10).map((ex, i) => (
                              <Badge key={i} variant="outline" className="text-xs font-normal">
                                {ex}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="shift_title" className="mt-3">
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título del turno</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Distribución</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shiftTitleGroups.slice(0, 30).map(([title, data]) => (
                    <TableRow key={title}>
                      <TableCell className="font-medium text-sm max-w-[200px] truncate">{title}</TableCell>
                      <TableCell className="text-right font-mono">{data.count}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(data.statuses)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 4)
                            .map(([status, cnt]) => {
                              const bucketDef = BUCKETS.find(b => b.key === status);
                              return (
                                <Badge key={status} variant="outline" className="text-[10px]">
                                  {bucketDef?.label || status}: {cnt}
                                </Badge>
                              );
                            })}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="employee" className="mt-3">
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Distribución</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeGroups.slice(0, 30).map(([name, data]) => (
                    <TableRow key={name}>
                      <TableCell className="font-medium text-sm max-w-[200px] truncate">{name}</TableCell>
                      <TableCell className="text-right font-mono">{data.count}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(data.statuses)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 4)
                            .map(([status, cnt]) => {
                              const bucketDef = BUCKETS.find(b => b.key === status);
                              return (
                                <Badge key={status} variant="outline" className="text-[10px]">
                                  {bucketDef?.label || status}: {cnt}
                                </Badge>
                              );
                            })}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function getExamples(
  rows: MatchRow[],
  schedLabels: Record<string, { shift_title: string | null; employee_name_raw: string | null }>,
  clockLabels: Record<string, { employee_name_raw: string | null }>,
): string[] {
  const seen = new Set<string>();
  const examples: string[] = [];
  for (const r of rows) {
    if (examples.length >= 10) break;
    const parts: string[] = [];
    const empName =
      (r.schedule_row_id && schedLabels[r.schedule_row_id]?.employee_name_raw) ||
      (r.clock_row_id && clockLabels[r.clock_row_id]?.employee_name_raw);
    if (empName) parts.push(empName);
    const title = r.schedule_row_id && schedLabels[r.schedule_row_id]?.shift_title;
    if (title) parts.push(`[${title}]`);
    const label = parts.join(" ") || r.id.slice(0, 8);
    if (!seen.has(label)) {
      seen.add(label);
      examples.push(label);
    }
  }
  return examples;
}
