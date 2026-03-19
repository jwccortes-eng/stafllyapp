import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, Calendar, Clock, GitMerge } from "lucide-react";

interface MatchRow {
  id: string;
  match_status: string;
  conflict_flags: any;
  employee_id: string | null;
  schedule_row_id: string | null;
  clock_row_id: string | null;
}

interface Props {
  matches: MatchRow[];
  scheduleLabels: Record<string, { shift_title: string | null; employee_name_raw: string | null }>;
  clockLabels: Record<string, { employee_name_raw: string | null }>;
}

function flags(m: MatchRow): string[] {
  return Array.isArray(m.conflict_flags) ? m.conflict_flags : [];
}

function getEmployeeName(
  m: MatchRow,
  schedLabels: Props["scheduleLabels"],
  clockLabels: Props["clockLabels"],
): string {
  if (m.employee_id) return m.employee_id;
  return (
    (m.schedule_row_id && schedLabels[m.schedule_row_id]?.employee_name_raw) ||
    (m.clock_row_id && clockLabels[m.clock_row_id]?.employee_name_raw) ||
    ""
  );
}

export default function OverlapDiagnostic({ matches, scheduleLabels, clockLabels }: Props) {
  const analysis = useMemo(() => {
    const unmatchedSched = matches.filter(
      (m) => flags(m).includes("unmatched_schedule") && !!getEmployeeName(m, scheduleLabels, clockLabels),
    );
    const clockNoSched = matches.filter(
      (m) => flags(m).includes("clock_without_schedule") && !!getEmployeeName(m, scheduleLabels, clockLabels),
    );

    const schedEmployees = new Map<string, number>();
    unmatchedSched.forEach((m) => {
      const name = getEmployeeName(m, scheduleLabels, clockLabels);
      schedEmployees.set(name, (schedEmployees.get(name) || 0) + 1);
    });

    const clockEmployees = new Map<string, number>();
    clockNoSched.forEach((m) => {
      const name = getEmployeeName(m, scheduleLabels, clockLabels);
      clockEmployees.set(name, (clockEmployees.get(name) || 0) + 1);
    });

    const allNames = new Set([...schedEmployees.keys(), ...clockEmployees.keys()]);

    const both: { name: string; schedCount: number; clockCount: number }[] = [];
    const onlySched: { name: string; count: number }[] = [];
    const onlyClock: { name: string; count: number }[] = [];

    allNames.forEach((name) => {
      const inSched = schedEmployees.get(name) || 0;
      const inClock = clockEmployees.get(name) || 0;
      if (inSched > 0 && inClock > 0) {
        both.push({ name, schedCount: inSched, clockCount: inClock });
      } else if (inSched > 0) {
        onlySched.push({ name, count: inSched });
      } else {
        onlyClock.push({ name, count: inClock });
      }
    });

    both.sort((a, b) => (b.schedCount + b.clockCount) - (a.schedCount + a.clockCount));
    onlySched.sort((a, b) => b.count - a.count);
    onlyClock.sort((a, b) => b.count - a.count);

    const total = allNames.size;

    return { both, onlySched, onlyClock, total, schedTotal: schedEmployees.size, clockTotal: clockEmployees.size, unmatchedSchedRows: unmatchedSched.length, clockNoSchedRows: clockNoSched.length };
  }, [matches, scheduleLabels, clockLabels]);

  if (analysis.unmatchedSchedRows === 0 && analysis.clockNoSchedRows === 0) return null;

  const { both, onlySched, onlyClock, total } = analysis;
  const pctBoth = total > 0 ? ((both.length / total) * 100) : 0;
  const pctOnlySched = total > 0 ? ((onlySched.length / total) * 100) : 0;
  const pctOnlyClock = total > 0 ? ((onlyClock.length / total) * 100) : 0;

  const verdict =
    pctBoth > 50
      ? "Mayormente el mismo grupo — el problema principal es linking débil entre agenda y fichaje."
      : pctBoth < 20
        ? "Poblaciones mayormente separadas — agenda sin fichaje y fichaje sin agenda son grupos distintos."
        : "Poblaciones parcialmente solapadas — hay mezcla de linking débil y grupos operacionales distintos.";

  const sections = [
    {
      key: "both",
      label: "En ambos buckets",
      icon: <GitMerge className="h-4 w-4" />,
      color: "text-primary",
      count: both.length,
      pct: pctBoth,
      hint: "Linking débil — el empleado tiene agenda Y fichaje pero no se conectan",
      examples: both.slice(0, 8).map((e) => `${e.name} (${e.schedCount}A/${e.clockCount}F)`),
    },
    {
      key: "only_sched",
      label: "Solo Agenda sin fichaje",
      icon: <Calendar className="h-4 w-4" />,
      color: "text-amber-500",
      count: onlySched.length,
      pct: pctOnlySched,
      hint: "Programados pero nunca ficharon — ausencias reales o placeholders",
      examples: onlySched.slice(0, 8).map((e) => `${e.name} (${e.count})`),
    },
    {
      key: "only_clock",
      label: "Solo Fichaje sin agenda",
      icon: <Clock className="h-4 w-4" />,
      color: "text-destructive",
      count: onlyClock.length,
      pct: pctOnlyClock,
      hint: "Ficharon pero no están en la agenda — trabajo sin programar",
      examples: onlyClock.slice(0, 8).map((e) => `${e.name} (${e.count})`),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GitMerge className="h-4 w-4" />
          Diagnóstico de Solapamiento — Agenda sin fichaje vs Fichaje sin agenda
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary bar */}
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="outline" className="font-mono">
            {analysis.unmatchedSchedRows} filas agenda sin fichaje
          </Badge>
          <span className="text-muted-foreground">×</span>
          <Badge variant="outline" className="font-mono">
            {analysis.clockNoSchedRows} filas fichaje sin agenda
          </Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant="secondary" className="font-mono">
            {total} empleados únicos
          </Badge>
        </div>

        {/* Verdict */}
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
          <p className="text-sm font-medium">{verdict}</p>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {sections.map((s) => (
            <div key={s.key} className="border border-border/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-3">
                <span className={s.color}>{s.icon}</span>
                <span className="font-medium flex-1">{s.label}</span>
                <Badge variant="secondary" className="font-mono">
                  {s.count}
                </Badge>
                <span className="text-xs text-muted-foreground w-14 text-right">
                  {s.pct.toFixed(1)}%
                </span>
                <Progress value={s.pct} className="w-24 h-2" />
              </div>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
              {s.examples.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.examples.map((ex, i) => (
                    <Badge key={i} variant="outline" className="text-xs font-normal">
                      {ex}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
