import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Clock, Loader2, Layers, CheckCircle2, XCircle, Link2,
  ChevronDown, ChevronUp,
} from "lucide-react";

interface Props {
  companyId: string | null;
  onRefresh: () => void;
}

interface MatchRow {
  id: string;
  match_status: string;
  conflict_flags: any;
  employee_id: string | null;
  clock_row_id: string | null;
}

interface ClockDetail {
  id: string;
  employee_name_raw: string | null;
  matched_employee_id: string | null;
  work_date: string | null;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  job_title: string | null;
  shift_title: string | null;
  location_name: string | null;
}

interface OperationalCase {
  caseKey: string;
  empName: string;
  empId: string | null;
  date: string;
  timeKey: string;
  clockIn: string | null;
  clockOut: string | null;
  totalHours: number | null;
  jobTitle: string;
  location: string;
  matchIds: string[];
  rawRows: (MatchRow & { clock?: ClockDetail })[];
  duplicateCount: number;
}

export default function ClockWithoutScheduleBreakdown({ companyId, onRefresh }: Props) {
  const { toast } = useToast();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [clockMap, setClockMap] = useState<Record<string, ClockDetail>>({});
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    loadData(companyId);
  }, [companyId]);

  async function loadData(cid: string) {
    const PAGE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("reconciliation_matches" as any)
        .select("id, match_status, conflict_flags, employee_id, clock_row_id")
        .eq("company_id", cid)
        .contains("conflict_flags", ["clock_without_schedule"])
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setMatches(all as MatchRow[]);

    const clockIds = [...new Set(all.filter((m: any) => m.clock_row_id).map((m: any) => m.clock_row_id))];
    const cMap: Record<string, ClockDetail> = {};
    for (let i = 0; i < clockIds.length; i += 200) {
      const batch = clockIds.slice(i, i + 200);
      const { data } = await supabase
        .from("normalized_clock_rows" as any)
        .select("id, employee_name_raw, matched_employee_id, work_date, clock_in, clock_out, total_hours, job_title, shift_title, location_name")
        .in("id", batch);
      (data || []).forEach((r: any) => { cMap[r.id] = r; });
    }
    setClockMap(cMap);
    setLoading(false);
  }

  const cases = useMemo<OperationalCase[]>(() => {
    const groups = new Map<string, OperationalCase>();

    matches.forEach((m) => {
      const clock = m.clock_row_id ? clockMap[m.clock_row_id] : undefined;
      const empName = clock?.employee_name_raw || "(desconocido)";
      const empId = clock?.matched_employee_id || m.employee_id || null;
      const date = clock?.work_date || "?";
      const clockIn = clock?.clock_in || null;
      const clockOut = clock?.clock_out || null;
      const timeKey = `${clockIn?.substring(11, 16) || "?"}-${clockOut?.substring(11, 16) || "?"}`;
      const caseKey = `${empId || empName}|${date}|${timeKey}`;

      if (!groups.has(caseKey)) {
        groups.set(caseKey, {
          caseKey,
          empName,
          empId,
          date,
          timeKey,
          clockIn,
          clockOut,
          totalHours: clock?.total_hours || null,
          jobTitle: clock?.job_title || clock?.shift_title || "(sin título)",
          location: clock?.location_name || "—",
          matchIds: [],
          rawRows: [],
          duplicateCount: 0,
        });
      }
      const group = groups.get(caseKey)!;
      group.matchIds.push(m.id);
      group.rawRows.push({ ...m, clock });
      group.duplicateCount = group.matchIds.length;
    });

    return [...groups.values()].sort((a, b) => b.duplicateCount - a.duplicateCount);
  }, [matches, clockMap]);

  const totalRaw = matches.length;
  const totalUnique = cases.length;
  const duplicated = cases.filter(c => c.duplicateCount > 1);
  const duplicatedRawCount = duplicated.reduce((sum, c) => sum + c.duplicateCount, 0);

  const toggleCase = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedKeys.size === cases.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(cases.map(c => c.caseKey)));
    }
  };

  const selectDuplicatesOnly = () => {
    setSelectedKeys(new Set(duplicated.map(c => c.caseKey)));
  };

  const applyBulkAction = async (action: "valid_unscheduled" | "ignored_duplicate" | "linked") => {
    if (selectedKeys.size === 0) return;
    setApplying(true);
    try {
      const allIds: string[] = [];
      cases.forEach(c => {
        if (!selectedKeys.has(c.caseKey)) return;
        if (action === "ignored_duplicate") {
          // Keep first, mark rest as ignored
          c.matchIds.slice(1).forEach(id => allIds.push(id));
        } else {
          c.matchIds.forEach(id => allIds.push(id));
        }
      });

      for (let i = 0; i < allIds.length; i += 100) {
        const batch = allIds.slice(i, i + 100);
        const { error } = await supabase
          .from("reconciliation_matches" as any)
          .update({
            match_status: action,
            resolved_at: new Date().toISOString(),
            resolution_note: `Bulk de-dup: ${action}`,
          } as any)
          .in("id", batch);
        if (error) throw error;
      }

      toast({
        title: "Acción aplicada",
        description: `${allIds.length} filas marcadas como "${action}"`,
      });
      setSelectedKeys(new Set());
      onRefresh();
      if (companyId) loadData(companyId);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Agrupando fichajes sin agenda…
        </CardContent>
      </Card>
    );
  }

  if (totalRaw === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          className="w-full flex items-center gap-2 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <Layers className="h-4 w-4" />
          <CardTitle className="text-base flex-1">
            Fichaje sin agenda — {totalUnique} casos únicos
            <span className="text-muted-foreground font-normal ml-2 text-sm">
              ({totalRaw} filas raw)
            </span>
          </CardTitle>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBlock label="Filas raw" value={totalRaw} />
            <StatBlock label="Casos únicos" value={totalUnique} highlight />
            <StatBlock label="Casos con duplicados" value={duplicated.length} />
            <StatBlock label="Filas duplicadas" value={duplicatedRawCount - duplicated.length} />
          </div>

          {duplicated.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-xs">
              <p className="font-medium text-destructive">
                ⚠ {duplicated.length} casos tienen filas duplicadas ({duplicatedRawCount - duplicated.length} copias extra)
              </p>
              <p className="text-muted-foreground mt-0.5">
                Usa "Ignorar duplicados" para conservar solo una fila por caso operacional.
              </p>
            </div>
          )}

          {/* Bulk actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {selectedKeys.size} seleccionados
            </Badge>
            <Button variant="outline" size="xs" onClick={selectAll}>
              {selectedKeys.size === cases.length ? "Deseleccionar todos" : "Seleccionar todos"}
            </Button>
            {duplicated.length > 0 && (
              <Button variant="outline" size="xs" onClick={selectDuplicatesOnly}>
                Seleccionar solo duplicados
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              disabled={selectedKeys.size === 0 || applying}
              onClick={() => applyBulkAction("ignored_duplicate")}
            >
              {applying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <XCircle className="h-3 w-3 mr-1" />}
              Ignorar duplicados
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedKeys.size === 0 || applying}
              onClick={() => applyBulkAction("valid_unscheduled")}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Trabajo sin agenda
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedKeys.size === 0 || applying}
              onClick={() => applyBulkAction("linked")}
            >
              <Link2 className="h-3 w-3 mr-1" />
              Vincular manualmente
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={selectedKeys.size === cases.length && cases.length > 0}
                      onCheckedChange={() => selectAll()}
                    />
                  </TableHead>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Horario</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Título/Job</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="text-right">Copias</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <TableRow
                    key={c.caseKey}
                    className={`${c.duplicateCount > 1 ? "bg-destructive/5" : ""} ${selectedKeys.has(c.caseKey) ? "bg-primary/5" : ""}`}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedKeys.has(c.caseKey)}
                        onCheckedChange={() => toggleCase(c.caseKey)}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[160px] truncate">
                      {c.empName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.date}</TableCell>
                    <TableCell className="font-mono text-xs">{c.timeKey}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.totalHours != null ? `${c.totalHours.toFixed(1)}h` : "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[140px] truncate">{c.jobTitle}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{c.location}</TableCell>
                    <TableCell className="text-right">
                      {c.duplicateCount > 1 ? (
                        <Badge variant="destructive" className="font-mono text-xs">
                          ×{c.duplicateCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">1</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function StatBlock({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold font-mono ${highlight ? "text-primary" : ""}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
