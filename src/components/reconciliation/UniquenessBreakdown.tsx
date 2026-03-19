import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search } from "lucide-react";

interface Props {
  companyId: string | null;
}

interface MatchRow {
  id: string;
  conflict_flags: any;
  employee_id: string | null;
  schedule_row_id: string | null;
  clock_row_id: string | null;
}

interface SchedExtra {
  id: string;
  employee_name_raw: string | null;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  shift_title: string | null;
}

interface ClockExtra {
  id: string;
  employee_name_raw: string | null;
  work_date: string | null;
  clock_in: string | null;
  clock_out: string | null;
}

function flags(m: MatchRow): string[] {
  return Array.isArray(m.conflict_flags) ? m.conflict_flags : [];
}

function analysisBucket(
  rows: MatchRow[],
  detailMap: Record<string, { empName: string; date: string; timeKey: string }>,
) {
  const totalRows = rows.length;
  const employees = new Set<string>();
  const empDateKeys = new Set<string>();
  const empDateTimeKeys = new Set<string>();
  const dupeCounts = new Map<string, { count: number; label: string }>();

  rows.forEach((r) => {
    const id = r.schedule_row_id || r.clock_row_id || r.id;
    const detail = detailMap[id];
    const emp = detail?.empName || r.employee_id || "(unknown)";
    const date = detail?.date || "?";
    const timeKey = detail?.timeKey || "?";

    employees.add(emp);
    const edKey = `${emp}|${date}`;
    empDateKeys.add(edKey);
    const edtKey = `${emp}|${date}|${timeKey}`;
    empDateTimeKeys.add(edtKey);

    const existing = dupeCounts.get(edtKey);
    if (existing) {
      existing.count++;
    } else {
      dupeCounts.set(edtKey, { count: 1, label: `${emp} ${date} ${timeKey}` });
    }
  });

  const topDupes = [...dupeCounts.values()]
    .filter((d) => d.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    totalRows,
    uniqueEmployees: employees.size,
    uniqueEmpDate: empDateKeys.size,
    uniqueEmpDateTime: empDateTimeKeys.size,
    inflationRatio: empDateTimeKeys.size > 0 ? (totalRows / empDateTimeKeys.size).toFixed(2) : "—",
    topDupes,
  };
}

export default function UniquenessBreakdown({ companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [schedMap, setSchedMap] = useState<Record<string, SchedExtra>>({});
  const [clockMap, setClockMap] = useState<Record<string, ClockExtra>>({});

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    loadData(companyId);
  }, [companyId]);

  async function loadData(cid: string) {
    // Fetch matches
    const PAGE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("reconciliation_matches" as any)
        .select("id, conflict_flags, employee_id, schedule_row_id, clock_row_id")
        .eq("company_id", cid)
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setMatches(all as MatchRow[]);

    const schedIds = [...new Set(all.filter((m: any) => m.schedule_row_id).map((m: any) => m.schedule_row_id))];
    const clockIds = [...new Set(all.filter((m: any) => m.clock_row_id).map((m: any) => m.clock_row_id))];

    const sMap: Record<string, SchedExtra> = {};
    for (let i = 0; i < schedIds.length; i += 200) {
      const batch = schedIds.slice(i, i + 200);
      const { data } = await supabase
        .from("normalized_schedule_rows" as any)
        .select("id, employee_name_raw, work_date, start_time, end_time, shift_title")
        .in("id", batch);
      (data || []).forEach((r: any) => { sMap[r.id] = r; });
    }

    const cMap: Record<string, ClockExtra> = {};
    for (let i = 0; i < clockIds.length; i += 200) {
      const batch = clockIds.slice(i, i + 200);
      const { data } = await supabase
        .from("normalized_clock_rows" as any)
        .select("id, employee_name_raw, work_date, clock_in, clock_out")
        .in("id", batch);
      (data || []).forEach((r: any) => { cMap[r.id] = r; });
    }

    setSchedMap(sMap);
    setClockMap(cMap);
    setLoading(false);
  }

  const detailMapSched = useMemo(() => {
    const m: Record<string, { empName: string; date: string; timeKey: string }> = {};
    Object.values(schedMap).forEach((s) => {
      m[s.id] = {
        empName: s.employee_name_raw || "(unknown)",
        date: s.work_date || "?",
        timeKey: `${s.start_time?.substring(0, 5) || "?"}-${s.end_time?.substring(0, 5) || "?"}`,
      };
    });
    return m;
  }, [schedMap]);

  const detailMapClock = useMemo(() => {
    const m: Record<string, { empName: string; date: string; timeKey: string }> = {};
    Object.values(clockMap).forEach((c) => {
      m[c.id] = {
        empName: c.employee_name_raw || "(unknown)",
        date: c.work_date || "?",
        timeKey: `${c.clock_in?.substring(11, 16) || "?"}-${c.clock_out?.substring(11, 16) || "?"}`,
      };
    });
    return m;
  }, [clockMap]);

  const unmatchedSched = useMemo(
    () => matches.filter((m) => flags(m).includes("unmatched_schedule")),
    [matches],
  );
  const clockNoSched = useMemo(
    () => matches.filter((m) => flags(m).includes("clock_without_schedule")),
    [matches],
  );

  const schedAnalysis = useMemo(() => analysisBucket(unmatchedSched, detailMapSched), [unmatchedSched, detailMapSched]);
  const clockAnalysis = useMemo(() => analysisBucket(clockNoSched, detailMapClock), [clockNoSched, detailMapClock]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Analizando unicidad…
        </CardContent>
      </Card>
    );
  }

  if (unmatchedSched.length === 0 && clockNoSched.length === 0) return null;

  const sections = [
    { label: "Agenda sin fichaje", data: schedAnalysis, color: "text-amber-500" },
    { label: "Fichaje sin agenda", data: clockAnalysis, color: "text-destructive" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          Reality Check — Unicidad de conflictos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.map((s) => (
          <div key={s.label} className="border border-border/50 rounded-lg p-4 space-y-3">
            <h4 className={`font-semibold text-sm ${s.color}`}>{s.label}</h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Filas conflicto" value={s.data.totalRows} />
              <Stat label="Empleados únicos" value={s.data.uniqueEmployees} />
              <Stat label="Emp+Fecha únicos" value={s.data.uniqueEmpDate} />
              <Stat label="Emp+Fecha+Hora únicos" value={s.data.uniqueEmpDateTime} />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Ratio de inflación:</span>
              <Badge variant={Number(s.data.inflationRatio) > 1.5 ? "destructive" : "secondary"} className="font-mono">
                {s.data.inflationRatio}x
              </Badge>
              <span className="text-muted-foreground">
                {Number(s.data.inflationRatio) > 1.5
                  ? "⚠ Filas duplicadas detectadas — los conflictos están inflados"
                  : Number(s.data.inflationRatio) > 1.05
                    ? "Ligera duplicación"
                    : "✅ Cada fila es un registro único"}
              </span>
            </div>

            {s.data.topDupes.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">
                  Top duplicados (mismo emp+fecha+hora con múltiples filas)
                </p>
                <div className="flex flex-wrap gap-1">
                  {s.data.topDupes.map((d, i) => (
                    <Badge key={i} variant="outline" className="text-xs font-normal">
                      {d.label} ×{d.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold font-mono">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
