import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Microscope, Loader2, ChevronDown, ChevronUp, User, Calendar,
  Clock, MapPin, Briefcase, AlertTriangle, CheckCircle2, XCircle,
  Link2, Copy, HelpCircle, FileQuestion, ShieldAlert,
} from "lucide-react";

/* ── Types ── */

interface MatchRow {
  id: string;
  match_status: string;
  conflict_flags: any;
  employee_id: string | null;
  schedule_row_id: string | null;
  clock_row_id: string | null;
}

interface SchedRow {
  id: string;
  employee_name_raw: string | null;
  matched_employee_id: string | null;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  total_hours: number | null;
  shift_title: string | null;
  job_title: string | null;
  client_name: string | null;
  location_name: string | null;
  notes: string | null;
  external_shift_id: string | null;
}

interface ClockRow {
  id: string;
  employee_name_raw: string | null;
  matched_employee_id: string | null;
  work_date: string | null;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  shift_title: string | null;
  job_title: string | null;
  client_name: string | null;
  location_name: string | null;
  notes: string | null;
  external_clock_id: string | null;
}

type CaseClassification =
  | "valid_unscheduled_work"
  | "true_missing_clock"
  | "true_no_show"
  | "weak_linking_candidate"
  | "duplicate_clock"
  | "duplicate_schedule"
  | "insufficient_data";

interface SampledCase {
  caseKey: string;
  bucket: "clock_without_schedule" | "unmatched_schedule";
  empName: string;
  empId: string | null;
  date: string;
  scheduleDetail: SchedRow | null;
  clockDetail: ClockRow | null;
  shiftTitle: string;
  jobTitle: string;
  client: string;
  location: string;
  hasPayroll: boolean;
  duplicateCount: number;
  classification: CaseClassification;
  classificationLabel: string;
  reasoning: string;
  matchIds: string[];
  // For cross-check: nearby schedules / clocks for the same employee
  nearbySchedules: number;
  nearbyClocks: number;
}

const CLASS_META: Record<CaseClassification, { label: string; icon: any; color: string }> = {
  valid_unscheduled_work: { label: "Trabajo válido sin agenda", icon: CheckCircle2, color: "text-primary" },
  true_missing_clock: { label: "Fichaje realmente faltante", icon: AlertTriangle, color: "text-destructive" },
  true_no_show: { label: "No-show / turno no trabajado", icon: XCircle, color: "text-destructive" },
  weak_linking_candidate: { label: "Candidato a vincular (débil)", icon: Link2, color: "text-amber-500" },
  duplicate_clock: { label: "Fichaje duplicado", icon: Copy, color: "text-muted-foreground" },
  duplicate_schedule: { label: "Agenda duplicada", icon: Copy, color: "text-muted-foreground" },
  insufficient_data: { label: "Datos insuficientes", icon: HelpCircle, color: "text-muted-foreground" },
};

/* ── Helpers ── */

function flags(m: MatchRow): string[] {
  return Array.isArray(m.conflict_flags) ? m.conflict_flags : [];
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return "—";
  if (t.length > 10) return t.substring(11, 16);
  if (t.length >= 5) return t.substring(0, 5);
  return t;
}

function classifyCase(
  c: {
    bucket: "clock_without_schedule" | "unmatched_schedule";
    clockDetail: ClockRow | null;
    scheduleDetail: SchedRow | null;
    hasPayroll: boolean;
    duplicateCount: number;
    nearbySchedules: number;
    nearbyClocks: number;
  },
): { classification: CaseClassification; reasoning: string } {
  if (c.bucket === "clock_without_schedule") {
    if (c.duplicateCount > 1) {
      return { classification: "duplicate_clock", reasoning: `${c.duplicateCount} filas de fichaje idénticas para el mismo empleado+fecha+hora` };
    }
    if (c.nearbySchedules > 0) {
      return { classification: "weak_linking_candidate", reasoning: `Tiene ${c.nearbySchedules} turno(s) programado(s) para el mismo empleado en fechas cercanas — posible match no detectado` };
    }
    if (c.hasPayroll) {
      return { classification: "valid_unscheduled_work", reasoning: "Existe evidencia de nómina para este empleado+fecha — trabajo válido pagado sin agenda" };
    }
    const clock = c.clockDetail;
    if (!clock?.matched_employee_id) {
      return { classification: "insufficient_data", reasoning: "Fichaje sin empleado matcheado — no se puede verificar contra agenda" };
    }
    if (!clock?.total_hours || clock.total_hours < 0.5) {
      return { classification: "insufficient_data", reasoning: `Fichaje con ${clock?.total_hours?.toFixed(1) || "0"}h — posible entrada/salida accidental` };
    }
    return { classification: "valid_unscheduled_work", reasoning: "Fichaje con empleado y horas válidas, sin turno programado — probable trabajo extra o turno no agendado" };
  }

  // unmatched_schedule
  if (c.duplicateCount > 1) {
    return { classification: "duplicate_schedule", reasoning: `${c.duplicateCount} filas de agenda idénticas para el mismo empleado+fecha+hora` };
  }
  const sched = c.scheduleDetail;
  if (!sched?.matched_employee_id) {
    return { classification: "insufficient_data", reasoning: "Turno sin empleado matcheado" };
  }
  if (!sched?.start_time && !sched?.end_time) {
    return { classification: "insufficient_data", reasoning: "Turno sin hora de inicio/fin — probablemente placeholder" };
  }
  if (c.nearbyClocks > 0) {
    return { classification: "weak_linking_candidate", reasoning: `Tiene ${c.nearbyClocks} fichaje(s) cercano(s) para el mismo empleado — posible match no detectado por diferencia de horario/ubicación` };
  }
  if (c.hasPayroll) {
    return { classification: "true_no_show", reasoning: "Turno programado con evidencia de nómina pero sin fichaje — ¿cancelado y pagado?" };
  }
  return { classification: "true_missing_clock", reasoning: "Turno programado con empleado y horario, sin fichaje ni evidencia de nómina" };
}

/* ── Component ── */

interface Props {
  companyId: string | null;
}

export default function CaseSamplingDiagnostic({ companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [cases, setCases] = useState<SampledCase[]>([]);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    loadAndSample(companyId);
  }, [companyId]);

  async function loadAndSample(cid: string) {
    const PAGE = 1000;

    // 1. Fetch all conflict matches
    let allMatches: MatchRow[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("reconciliation_matches" as any)
        .select("id, match_status, conflict_flags, employee_id, schedule_row_id, clock_row_id")
        .eq("company_id", cid)
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allMatches = allMatches.concat(data as any);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const clockMatches = allMatches.filter(m => flags(m).includes("clock_without_schedule"));
    const schedMatches = allMatches.filter(m => flags(m).includes("unmatched_schedule"));

    // 2. Collect IDs for detail fetching
    const schedIds = new Set<string>();
    const clockIds = new Set<string>();
    const empIds = new Set<string>();

    [...clockMatches, ...schedMatches].forEach(m => {
      if (m.schedule_row_id) schedIds.add(m.schedule_row_id);
      if (m.clock_row_id) clockIds.add(m.clock_row_id);
      if (m.employee_id) empIds.add(m.employee_id);
    });

    // 3. Fetch details in parallel
    const schedMap: Record<string, SchedRow> = {};
    const clockMap: Record<string, ClockRow> = {};
    const empNames: Record<string, string> = {};

    const schedIdArr = [...schedIds];
    const clockIdArr = [...clockIds];
    const empIdArr = [...empIds];

    const fetchPromises: Promise<void>[] = [];

    for (let i = 0; i < schedIdArr.length; i += 200) {
      const batch = schedIdArr.slice(i, i + 200);
      fetchPromises.push(
        supabase.from("normalized_schedule_rows" as any)
          .select("id, employee_name_raw, matched_employee_id, work_date, start_time, end_time, total_hours, shift_title, job_title, client_name, location_name, notes, external_shift_id")
          .in("id", batch)
          .then(({ data }) => { (data || []).forEach((r: any) => { schedMap[r.id] = r; }); })
      );
    }

    for (let i = 0; i < clockIdArr.length; i += 200) {
      const batch = clockIdArr.slice(i, i + 200);
      fetchPromises.push(
        supabase.from("normalized_clock_rows" as any)
          .select("id, employee_name_raw, matched_employee_id, work_date, clock_in, clock_out, total_hours, shift_title, job_title, client_name, location_name, notes, external_clock_id")
          .in("id", batch)
          .then(({ data }) => { (data || []).forEach((r: any) => { clockMap[r.id] = r; }); })
      );
    }

    for (let i = 0; i < empIdArr.length; i += 200) {
      const batch = empIdArr.slice(i, i + 200);
      fetchPromises.push(
        supabase.from("employees")
          .select("id, first_name, last_name")
          .in("id", batch)
          .then(({ data }) => { (data || []).forEach((r: any) => { empNames[r.id] = `${r.first_name} ${r.last_name}`; }); })
      );
    }

    await Promise.all(fetchPromises);

    // 4. Fetch payroll evidence
    const payrollDates = new Set<string>();
    let pFrom = 0;
    while (true) {
      const { data } = await supabase
        .from("normalized_payroll_rows" as any)
        .select("matched_employee_id, work_date")
        .eq("company_id", cid)
        .not("matched_employee_id", "is", null)
        .range(pFrom, pFrom + PAGE - 1);
      if (!data || data.length === 0) break;
      data.forEach((r: any) => {
        if (r.matched_employee_id && r.work_date) payrollDates.add(`${r.matched_employee_id}|${r.work_date}`);
      });
      if (data.length < PAGE) break;
      pFrom += PAGE;
    }

    // 5. Build grouped cases for each bucket
    const buildCases = (
      matches: MatchRow[],
      bucket: "clock_without_schedule" | "unmatched_schedule",
    ): SampledCase[] => {
      const groups = new Map<string, { matchIds: string[]; matches: MatchRow[] }>();

      matches.forEach(m => {
        const detail = bucket === "clock_without_schedule"
          ? (m.clock_row_id ? clockMap[m.clock_row_id] : null)
          : (m.schedule_row_id ? schedMap[m.schedule_row_id] : null);

        const empId = detail && "matched_employee_id" in detail ? detail.matched_employee_id : m.employee_id;
        const empName = detail && "employee_name_raw" in detail ? detail.employee_name_raw : null;
        const date = detail && "work_date" in detail ? (detail as any).work_date : "?";

        let timeKey: string;
        if (bucket === "clock_without_schedule" && detail && "clock_in" in detail) {
          const c = detail as ClockRow;
          timeKey = `${c.clock_in?.substring(11, 16) || "?"}-${c.clock_out?.substring(11, 16) || "?"}`;
        } else if (bucket === "unmatched_schedule" && detail && "start_time" in detail) {
          const s = detail as SchedRow;
          timeKey = `${s.start_time?.substring(0, 5) || "?"}-${s.end_time?.substring(0, 5) || "?"}`;
        } else {
          timeKey = "?";
        }

        const caseKey = `${empId || empName || "?"}|${date}|${timeKey}`;
        if (!groups.has(caseKey)) groups.set(caseKey, { matchIds: [], matches: [] });
        const g = groups.get(caseKey)!;
        g.matchIds.push(m.id);
        g.matches.push(m);
      });

      return [...groups.entries()].map(([caseKey, g]) => {
        const firstMatch = g.matches[0];
        const sched = firstMatch.schedule_row_id ? schedMap[firstMatch.schedule_row_id] ?? null : null;
        const clock = firstMatch.clock_row_id ? clockMap[firstMatch.clock_row_id] ?? null : null;

        const empId = sched?.matched_employee_id || clock?.matched_employee_id || firstMatch.employee_id || null;
        const empName = empId ? (empNames[empId] || sched?.employee_name_raw || clock?.employee_name_raw || "(desconocido)") : (sched?.employee_name_raw || clock?.employee_name_raw || "(desconocido)");
        const date = sched?.work_date || clock?.work_date || "?";
        const hasPayroll = empId ? payrollDates.has(`${empId}|${date}`) : false;

        // Count nearby schedules/clocks for cross-check
        const nearbySchedules = empId ? Object.values(schedMap).filter(s =>
          s.matched_employee_id === empId && s.work_date === date && s.id !== sched?.id
        ).length : 0;

        const nearbyClocks = empId ? Object.values(clockMap).filter(c =>
          c.matched_employee_id === empId && c.work_date === date && c.id !== clock?.id
        ).length : 0;

        const { classification, reasoning } = classifyCase({
          bucket, clockDetail: clock, scheduleDetail: sched,
          hasPayroll, duplicateCount: g.matchIds.length,
          nearbySchedules, nearbyClocks,
        });

        return {
          caseKey,
          bucket,
          empName,
          empId,
          date,
          scheduleDetail: sched,
          clockDetail: clock,
          shiftTitle: sched?.shift_title || clock?.shift_title || "(sin título)",
          jobTitle: sched?.job_title || clock?.job_title || "—",
          client: sched?.client_name || clock?.client_name || "—",
          location: sched?.location_name || clock?.location_name || "—",
          hasPayroll,
          duplicateCount: g.matchIds.length,
          classification,
          classificationLabel: CLASS_META[classification].label,
          reasoning,
          matchIds: g.matchIds,
          nearbySchedules,
          nearbyClocks,
        };
      });
    };

    const clockCases = buildCases(clockMatches, "clock_without_schedule");
    const schedCases = buildCases(schedMatches, "unmatched_schedule");

    // 6. Sample: pick diverse representatives
    const sample = (all: SampledCase[], n: number): SampledCase[] => {
      // Group by classification, take proportionally
      const byClass = new Map<CaseClassification, SampledCase[]>();
      all.forEach(c => {
        if (!byClass.has(c.classification)) byClass.set(c.classification, []);
        byClass.get(c.classification)!.push(c);
      });

      const result: SampledCase[] = [];
      const classes = [...byClass.entries()].sort((a, b) => b[1].length - a[1].length);

      // First pass: at least 1 from each class
      for (const [, items] of classes) {
        if (result.length >= n) break;
        result.push(items[0]);
      }

      // Second pass: fill remaining proportionally
      let idx = 0;
      while (result.length < n && idx < 20) {
        for (const [, items] of classes) {
          if (result.length >= n) break;
          const next = items.find(c => !result.includes(c));
          if (next) result.push(next);
        }
        idx++;
      }

      return result;
    };

    const sampledClock = sample(clockCases, 10);
    const sampledSched = sample(schedCases, 10);

    // Attach summary counts per classification
    setCases([...sampledClock, ...sampledSched]);
    setLoading(false);
  }

  const clockSamples = useMemo(() => cases.filter(c => c.bucket === "clock_without_schedule"), [cases]);
  const schedSamples = useMemo(() => cases.filter(c => c.bucket === "unmatched_schedule"), [cases]);

  // Classification distribution
  const classDistrib = useMemo(() => {
    const counts: Record<string, number> = {};
    cases.forEach(c => {
      counts[c.classification] = (counts[c.classification] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [cases]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Muestreando casos representativos…
        </CardContent>
      </Card>
    );
  }

  if (cases.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <button className="w-full flex items-center gap-2 text-left" onClick={() => setExpanded(!expanded)}>
          <Microscope className="h-4 w-4" />
          <CardTitle className="text-base flex-1">
            Muestreo de Casos — {cases.length} representativos
          </CardTitle>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5">
          {/* Classification distribution */}
          <div className="flex flex-wrap gap-2">
            {classDistrib.map(([cls, count]) => {
              const meta = CLASS_META[cls as CaseClassification];
              return (
                <Badge key={cls} variant="outline" className="text-xs gap-1">
                  <meta.icon className={`h-3 w-3 ${meta.color}`} />
                  {meta.label}: {count}
                </Badge>
              );
            })}
          </div>

          {/* Fichaje sin agenda samples */}
          <BucketSection
            title="Fichaje sin agenda"
            icon={<Clock className="h-4 w-4" />}
            color="text-destructive"
            samples={clockSamples}
          />

          <Separator />

          {/* Agenda sin fichaje samples */}
          <BucketSection
            title="Agenda sin fichaje"
            icon={<Calendar className="h-4 w-4" />}
            color="text-amber-500"
            samples={schedSamples}
          />
        </CardContent>
      )}
    </Card>
  );
}

/* ── Sub-components ── */

function BucketSection({ title, icon, color, samples }: {
  title: string;
  icon: React.ReactNode;
  color: string;
  samples: SampledCase[];
}) {
  if (samples.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className={`font-semibold text-sm flex items-center gap-2 ${color}`}>
        {icon} {title} — {samples.length} muestras
      </h4>
      <div className="space-y-2">
        {samples.map((c, i) => (
          <CaseCard key={c.caseKey} c={c} index={i + 1} />
        ))}
      </div>
    </div>
  );
}

function CaseCard({ c, index }: { c: SampledCase; index: number }) {
  const [open, setOpen] = useState(false);
  const meta = CLASS_META[c.classification];
  const Icon = meta.icon;

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-xs font-mono text-muted-foreground w-5">#{index}</span>
        <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
        <span className="flex-1 text-sm font-medium truncate">{c.empName}</span>
        <span className="text-xs font-mono text-muted-foreground">{c.date}</span>
        <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
        {c.duplicateCount > 1 && (
          <Badge variant="destructive" className="text-[10px] font-mono">×{c.duplicateCount}</Badge>
        )}
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-3 border-t border-border/30 bg-muted/20 space-y-3 text-xs">
          {/* Detail grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 pt-2">
            <Detail icon={<User className="h-3 w-3" />} label="Empleado" value={c.empName} />
            <Detail icon={<Calendar className="h-3 w-3" />} label="Fecha" value={c.date} mono />
            <Detail icon={<Briefcase className="h-3 w-3" />} label="Título turno" value={c.shiftTitle} />
            <Detail icon={<Briefcase className="h-3 w-3" />} label="Job" value={c.jobTitle} />
            <Detail icon={<MapPin className="h-3 w-3" />} label="Cliente" value={c.client} />
            <Detail icon={<MapPin className="h-3 w-3" />} label="Ubicación" value={c.location} />
          </div>

          {/* Schedule details */}
          {c.scheduleDetail && (
            <div className="rounded border border-border/40 p-2 space-y-1">
              <p className="font-semibold text-[10px] uppercase tracking-wide text-muted-foreground">Agenda</p>
              <div className="grid grid-cols-3 gap-2">
                <span>Inicio: <b className="font-mono">{fmtTime(c.scheduleDetail.start_time)}</b></span>
                <span>Fin: <b className="font-mono">{fmtTime(c.scheduleDetail.end_time)}</b></span>
                <span>Horas: <b className="font-mono">{c.scheduleDetail.total_hours?.toFixed(1) ?? "—"}</b></span>
              </div>
              {c.scheduleDetail.notes && (
                <p className="text-muted-foreground truncate">Notas: {c.scheduleDetail.notes}</p>
              )}
            </div>
          )}

          {/* Clock details */}
          {c.clockDetail && (
            <div className="rounded border border-border/40 p-2 space-y-1">
              <p className="font-semibold text-[10px] uppercase tracking-wide text-muted-foreground">Fichaje</p>
              <div className="grid grid-cols-3 gap-2">
                <span>In: <b className="font-mono">{fmtTime(c.clockDetail.clock_in)}</b></span>
                <span>Out: <b className="font-mono">{fmtTime(c.clockDetail.clock_out)}</b></span>
                <span>Horas: <b className="font-mono">{c.clockDetail.total_hours?.toFixed(1) ?? "—"}</b></span>
              </div>
              {c.clockDetail.notes && (
                <p className="text-muted-foreground truncate">Notas: {c.clockDetail.notes}</p>
              )}
            </div>
          )}

          {/* Evidence & cross-check */}
          <div className="flex flex-wrap gap-2">
            <Badge variant={c.hasPayroll ? "default" : "outline"} className="text-[10px]">
              {c.hasPayroll ? "✓ Evidencia nómina" : "✗ Sin nómina"}
            </Badge>
            {c.nearbySchedules > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {c.nearbySchedules} agenda(s) cercana(s)
              </Badge>
            )}
            {c.nearbyClocks > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {c.nearbyClocks} fichaje(s) cercano(s)
              </Badge>
            )}
            {c.duplicateCount > 1 && (
              <Badge variant="destructive" className="text-[10px]">
                {c.duplicateCount} copias raw
              </Badge>
            )}
          </div>

          {/* Classification reasoning */}
          <div className={`rounded-md border px-3 py-2 ${
            c.classification === "valid_unscheduled_work" ? "border-primary/30 bg-primary/5" :
            c.classification === "weak_linking_candidate" ? "border-amber-500/30 bg-amber-500/5" :
            c.classification.startsWith("duplicate") ? "border-muted bg-muted/30" :
            c.classification === "insufficient_data" ? "border-muted bg-muted/20" :
            "border-destructive/30 bg-destructive/5"
          }`}>
            <p className="font-semibold text-[11px] flex items-center gap-1">
              <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
              {meta.label}
            </p>
            <p className="text-muted-foreground mt-0.5">{c.reasoning}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <span className="text-muted-foreground">{label}:</span>{" "}
        <span className={`font-medium ${mono ? "font-mono" : ""}`}>{value}</span>
      </div>
    </div>
  );
}
