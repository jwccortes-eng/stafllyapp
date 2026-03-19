import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Clock, MapPin, Calendar, User, AlertTriangle, Link2, CheckCircle2,
  XCircle, Plus, Copy, Ban, Loader2, ArrowRightLeft, Hash, Star,
  ShieldCheck, ShieldAlert, HelpCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { normalizeText } from "@/lib/reconciliation-engine";

/* ── Types ── */

interface MatchRow {
  id: string;
  match_type: string;
  match_status: string;
  confidence_score: number;
  hours_variance: number | null;
  pay_variance: number | null;
  conflict_flags: any;
  employee_id: string | null;
  schedule_row_id: string | null;
  clock_row_id: string | null;
  payroll_row_id: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

interface Props {
  match: MatchRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onResolve: (id: string, status: string, note?: string) => void;
  companyId: string | null;
}

interface ScheduleDetail {
  id: string;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  total_hours: number | null;
  client_name: string | null;
  location_name: string | null;
  source_data: any;
  matched_employee_id: string | null;
  external_shift_id: string | null;
}

interface ClockDetail {
  id: string;
  work_date: string | null;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  location_name: string | null;
  client_name: string | null;
  source_data: any;
  matched_employee_id: string | null;
  external_clock_id: string | null;
}

/* ── Helpers ── */

function parseTime(t: string | null | undefined): { h: number; m: number } | null {
  if (!t) return null;
  const str = t.length > 10 ? t.substring(11, 16) : t.substring(0, 5);
  const [hh, mm] = str.split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return null;
  return { h: hh, m: mm };
}

function toMinutes(t: { h: number; m: number }): number {
  return t.h * 60 + t.m;
}

function timeDiffMin(a: string | null, b: string | null): number | null {
  const ta = parseTime(a);
  const tb = parseTime(b);
  if (!ta || !tb) return null;
  return toMinutes(tb) - toMinutes(ta);
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return "—";
  if (t.length > 10) return t.substring(11, 16);
  if (t.length >= 5) return t.substring(0, 5);
  return t;
}

function locMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeText(a) === normalizeText(b);
}

interface CandidateScore {
  schedule: ScheduleDetail;
  score: number;
  sameDate: boolean;
  startDiff: number | null;
  endDiff: number | null;
  hoursDiff: number | null;
  sameLocation: boolean;
  sameClient: boolean;
  reasons: string[];
}

function scoreCandidates(clock: ClockDetail, schedules: ScheduleDetail[]): CandidateScore[] {
  return schedules.map((s) => {
    let score = 0;
    const reasons: string[] = [];
    const sameDate = !!(s.work_date && clock.work_date && s.work_date === clock.work_date);
    const startDiff = timeDiffMin(s.start_time, clock.clock_in);
    const endDiff = timeDiffMin(s.end_time, clock.clock_out);
    const hoursDiff = (s.total_hours != null && clock.total_hours != null) ? clock.total_hours - s.total_hours : null;
    const sameLoc = locMatch(s.location_name, clock.location_name);
    const sameCli = locMatch(s.client_name, clock.client_name);

    if (sameDate) { score += 40; reasons.push("Misma fecha"); }
    else if (s.work_date && clock.work_date) {
      const diff = Math.abs(new Date(s.work_date).getTime() - new Date(clock.work_date).getTime()) / 86400000;
      if (diff <= 1) { score += 20; reasons.push("±1 día (midnight split)"); }
    }
    if (startDiff != null && Math.abs(startDiff) <= 15) { score += 25; reasons.push("Hora inicio ≤15min"); }
    else if (startDiff != null && Math.abs(startDiff) <= 60) { score += 10; reasons.push(`Hora inicio ±${Math.abs(startDiff)}min`); }
    if (sameLoc) { score += 15; reasons.push("Misma ubicación"); }
    if (sameCli) { score += 15; reasons.push("Mismo cliente"); }
    if (hoursDiff != null && Math.abs(hoursDiff) <= 0.5) { score += 10; reasons.push("Horas similares"); }

    return { schedule: s, score, sameDate, startDiff, endDiff, hoursDiff, sameLocation: sameLoc, sameClient: sameCli, reasons };
  }).sort((a, b) => b.score - a.score);
}

type Recommendation = "likely_match" | "likely_unscheduled" | "likely_duplicate" | "insufficient_evidence";

function deriveRecommendation(candidates: CandidateScore[], clock: ClockDetail, flags: string[]): { key: Recommendation; label: string; icon: any; color: string; explanation: string } {
  const top = candidates[0];
  if (!top || candidates.length === 0) {
    return { key: "likely_unscheduled", label: "Probable trabajo válido sin agenda", icon: ShieldAlert, color: "text-amber-500", explanation: "No se encontraron turnos candidatos para este empleado en fechas cercanas." };
  }
  if (top.score >= 65) {
    return { key: "likely_match", label: "Probable turno correcto", icon: ShieldCheck, color: "text-primary", explanation: `Candidato #1 tiene score ${top.score}/100 con: ${top.reasons.join(", ")}.` };
  }
  if (flags.includes("duplicate_clock_suspected")) {
    return { key: "likely_duplicate", label: "Probable fichaje duplicado", icon: Copy, color: "text-muted-foreground", explanation: "Se detectó un patrón de fichaje duplicado." };
  }
  if (top.score >= 35) {
    return { key: "insufficient_evidence", label: "Evidencia insuficiente", icon: HelpCircle, color: "text-amber-500", explanation: `El mejor candidato tiene score ${top.score}/100. Se recomienda revisión manual.` };
  }
  return { key: "likely_unscheduled", label: "Probable trabajo válido sin agenda", icon: ShieldAlert, color: "text-amber-500", explanation: "No hay candidatos con coincidencia suficiente." };
}

/* ── Component ── */

export default function MatchDetailDrawer({ match, open, onOpenChange, onResolve, companyId }: Props) {
  const [schedDetail, setSchedDetail] = useState<ScheduleDetail | null>(null);
  const [clockDetail, setClockDetail] = useState<ClockDetail | null>(null);
  const [empName, setEmpName] = useState("—");
  const [candidateSchedules, setCandidateSchedules] = useState<ScheduleDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  useEffect(() => {
    if (!match || !open) { setSchedDetail(null); setClockDetail(null); setEmpName("—"); setCandidateSchedules([]); return; }
    setLoading(true);
    setShowAllCandidates(false);

    const load = async () => {
      if (match.schedule_row_id) {
        const { data } = await supabase.from("normalized_schedule_rows" as any).select("*").eq("id", match.schedule_row_id).maybeSingle();
        if (data) setSchedDetail(data as any);
      }
      if (match.clock_row_id) {
        const { data } = await supabase.from("normalized_clock_rows" as any).select("*").eq("id", match.clock_row_id).maybeSingle();
        if (data) setClockDetail(data as any);
      }
      if (match.employee_id) {
        const { data } = await supabase.from("employees").select("first_name, last_name").eq("id", match.employee_id).maybeSingle();
        if (data) setEmpName(`${data.first_name} ${data.last_name}`);
      }
      if (match.employee_id && companyId) {
        const { data } = await supabase.from("normalized_schedule_rows" as any).select("*")
          .eq("company_id", companyId).eq("matched_employee_id", match.employee_id)
          .order("work_date", { ascending: false }).limit(20);
        if (data) setCandidateSchedules(data as any[]);
      }
      setLoading(false);
    };
    load();
  }, [match, open, companyId]);

  const flags: string[] = useMemo(() => Array.isArray(match?.conflict_flags) ? match!.conflict_flags : [], [match]);

  const rankedCandidates = useMemo(() => {
    if (!clockDetail || candidateSchedules.length === 0) return [];
    return scoreCandidates(clockDetail, candidateSchedules);
  }, [clockDetail, candidateSchedules]);

  const recommendation = useMemo(() => {
    if (!clockDetail) return null;
    return deriveRecommendation(rankedCandidates, clockDetail, flags);
  }, [rankedCandidates, clockDetail, flags]);

  if (!match) return null;

  const isResolved = ["approved", "rejected", "linked", "created_shift", "valid_unscheduled", "ignored_duplicate"].includes(match.match_status);
  const topCandidate = rankedCandidates[0] ?? null;
  const RecoIcon = recommendation?.icon ?? HelpCircle;

  // Detect special compensation category
  const isClockExempt = flags.includes("clock_exempt");
  const compCategoryLabel = flags.includes("daily_pay_weekend_job") ? "Daily Pay (Weekend Job)" : flags.includes("ride_pay") ? "Ride Pay (Pay Ride)" : null;

  // Use linked schedule detail or top candidate for side-by-side
  const comparisonSched = schedDetail || topCandidate?.schedule || null;
  const compStartDiff = comparisonSched ? timeDiffMin(comparisonSched.start_time, clockDetail?.clock_in ?? null) : null;
  const compEndDiff = comparisonSched ? timeDiffMin(comparisonSched.end_time, clockDetail?.clock_out ?? null) : null;
  const compHoursDiff = (comparisonSched?.total_hours != null && clockDetail?.total_hours != null) ? clockDetail.total_hours - comparisonSched.total_hours : null;
  const compSameDate = !!(comparisonSched?.work_date && clockDetail?.work_date && comparisonSched.work_date === clockDetail.work_date);
  const compSameLoc = locMatch(comparisonSched?.location_name, clockDetail?.location_name);
  const compSameCli = locMatch(comparisonSched?.client_name, clockDetail?.client_name);

  const handleResolve = async (status: string, note?: string) => {
    setResolving(true);
    await onResolve(match.id, status, note);
    setResolving(false);
    onOpenChange(false);
  };

  const visibleCandidates = showAllCandidates ? rankedCandidates : rankedCandidates.slice(0, 3);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto w-full sm:max-w-xl lg:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Inspección de Matching
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <User className="h-3.5 w-3.5" /> {empName}
            <span className="text-xs font-mono text-muted-foreground/70">({match.employee_id?.slice(0, 8) || "—"})</span>
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 mt-4">

            {/* ── RECOMMENDATION BANNER ── */}
            {recommendation && (
              <Card className={`border-l-4 ${recommendation.key === "likely_match" ? "border-l-primary bg-primary/5" : recommendation.key === "likely_unscheduled" ? "border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10" : recommendation.key === "likely_duplicate" ? "border-l-muted-foreground bg-muted/30" : "border-l-amber-400 bg-amber-50/30 dark:bg-amber-900/5"}`}>
                <CardContent className="py-3 flex items-start gap-3">
                  <RecoIcon className={`h-5 w-5 mt-0.5 shrink-0 ${recommendation.color}`} />
                  <div>
                    <p className="font-semibold text-sm">{recommendation.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{recommendation.explanation}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── SIDE-BY-SIDE COMPARISON ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4" /> Comparación lado a lado
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-[1fr,auto,1fr] text-xs">
                  {/* Header */}
                  <div className="bg-muted/50 px-3 py-2 font-semibold flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Fichaje
                  </div>
                  <div className="bg-muted/50 px-1 py-2" />
                  <div className="bg-muted/50 px-3 py-2 font-semibold flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> {schedDetail ? "Turno vinculado" : "Candidato #1"}
                  </div>

                  {/* Date */}
                  <div className="px-3 py-1.5 border-t border-border">{clockDetail?.work_date || "—"}</div>
                  <div className="px-1 py-1.5 border-t border-border flex items-center justify-center">
                    <CompCheck ok={compSameDate} label="Fecha" />
                  </div>
                  <div className="px-3 py-1.5 border-t border-border">{comparisonSched?.work_date || "—"}</div>

                  {/* Start */}
                  <div className="px-3 py-1.5 border-t border-border font-mono">{fmtTime(clockDetail?.clock_in)}</div>
                  <div className="px-1 py-1.5 border-t border-border flex items-center justify-center">
                    <DiffBadge diff={compStartDiff} unit="min" />
                  </div>
                  <div className="px-3 py-1.5 border-t border-border font-mono">{fmtTime(comparisonSched?.start_time)}</div>

                  {/* End */}
                  <div className="px-3 py-1.5 border-t border-border font-mono">{fmtTime(clockDetail?.clock_out)}</div>
                  <div className="px-1 py-1.5 border-t border-border flex items-center justify-center">
                    <DiffBadge diff={compEndDiff} unit="min" />
                  </div>
                  <div className="px-3 py-1.5 border-t border-border font-mono">{fmtTime(comparisonSched?.end_time)}</div>

                  {/* Hours */}
                  <div className="px-3 py-1.5 border-t border-border">{clockDetail?.total_hours?.toFixed(1) ?? "—"}h</div>
                  <div className="px-1 py-1.5 border-t border-border flex items-center justify-center">
                    <DiffBadge diff={compHoursDiff} unit="h" />
                  </div>
                  <div className="px-3 py-1.5 border-t border-border">{comparisonSched?.total_hours?.toFixed(1) ?? "—"}h</div>

                  {/* Location */}
                  <div className="px-3 py-1.5 border-t border-border truncate max-w-[180px]">{clockDetail?.location_name || "—"}</div>
                  <div className="px-1 py-1.5 border-t border-border flex items-center justify-center">
                    <CompCheck ok={compSameLoc} label="Ubic." />
                  </div>
                  <div className="px-3 py-1.5 border-t border-border truncate max-w-[180px]">{comparisonSched?.location_name || "—"}</div>

                  {/* Client */}
                  <div className="px-3 py-1.5 border-t border-border truncate max-w-[180px]">{clockDetail?.client_name || "—"}</div>
                  <div className="px-1 py-1.5 border-t border-border flex items-center justify-center">
                    <CompCheck ok={compSameCli} label="Cliente" />
                  </div>
                  <div className="px-3 py-1.5 border-t border-border truncate max-w-[180px]">{comparisonSched?.client_name || "—"}</div>
                </div>
              </CardContent>
            </Card>

            {/* ── CONFLICT FLAGS ── */}
            {flags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {flags.map(f => <Badge key={f} variant="outline" className="text-xs">{f.replace(/_/g, " ")}</Badge>)}
              </div>
            )}

            {/* ── CANDIDATE RANKING ── */}
            {rankedCandidates.length > 0 && !schedDetail && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500" /> Candidatos ({rankedCandidates.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-3">
                  {visibleCandidates.map((c, i) => (
                    <div key={c.schedule.id} className={`rounded-md border p-2.5 text-xs ${i === 0 ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold">#{i + 1}</span>
                        <Badge variant={i === 0 ? "default" : "outline"} className="text-[10px] h-5">
                          Score: {c.score}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-muted-foreground">
                        <span>Fecha: <b className="text-foreground">{c.schedule.work_date || "—"}</b></span>
                        <span>Inicio: <b className="text-foreground">{fmtTime(c.schedule.start_time)}</b></span>
                        <span>Fin: <b className="text-foreground">{fmtTime(c.schedule.end_time)}</b></span>
                        <span>Horas: <b className="text-foreground">{c.schedule.total_hours?.toFixed(1) ?? "—"}</b></span>
                        <span className="col-span-2 truncate">Cliente: <b className="text-foreground">{c.schedule.client_name || "—"}</b></span>
                      </div>
                      {c.reasons.length > 0 && (
                        <p className="text-[10px] mt-1 text-muted-foreground italic">
                          {c.reasons.join(" · ")}
                        </p>
                      )}
                      {i === 0 && rankedCandidates.length > 1 && (
                        <p className="text-[10px] mt-1 font-medium text-primary">
                          ★ Recomendado: mayor coincidencia en fecha, hora y ubicación
                        </p>
                      )}
                    </div>
                  ))}
                  {rankedCandidates.length > 3 && (
                    <Button variant="ghost" size="sm" className="w-full text-xs"
                      onClick={() => setShowAllCandidates(!showAllCandidates)}>
                      {showAllCandidates ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                      {showAllCandidates ? "Ver menos" : `Ver ${rankedCandidates.length - 3} más`}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {rankedCandidates.length === 0 && !schedDetail && clockDetail && (
              <Card className="border-dashed">
                <CardContent className="py-4 text-center text-sm text-muted-foreground">
                  No se encontraron turnos candidatos para este empleado.
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* ── ACTIONS ── */}
            {!isResolved ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Resolución</p>
                <div className="grid grid-cols-1 gap-2">
                  {topCandidate && topCandidate.score >= 35 && !schedDetail && (
                    <Button variant="outline" className="justify-start" disabled={resolving}
                      onClick={() => handleResolve("linked", `Vinculado a candidato ${topCandidate.schedule.work_date} (score ${topCandidate.score})`)}>
                      <Link2 className="h-4 w-4 mr-2 text-primary" /> Vincular al candidato #{1} (score {topCandidate.score})
                    </Button>
                  )}
                  <Button variant="outline" className="justify-start" disabled={resolving}
                    onClick={() => handleResolve("valid_unscheduled", "Trabajo válido sin agenda")}>
                    <CheckCircle2 className="h-4 w-4 mr-2 text-primary" /> Marcar como trabajo válido sin agenda
                  </Button>
                  <Button variant="outline" className="justify-start" disabled={resolving}
                    onClick={() => handleResolve("created_shift", "Turno creado desde fichaje")}>
                    <Plus className="h-4 w-4 mr-2" /> Crear turno trabajado desde fichaje
                  </Button>
                  <Button variant="outline" className="justify-start" disabled={resolving}
                    onClick={() => handleResolve("ignored_duplicate", "Duplicado ignorado")}>
                    <Copy className="h-4 w-4 mr-2 text-muted-foreground" /> Ignorar duplicado
                  </Button>
                  <Button variant="outline" className="justify-start text-destructive" disabled={resolving}
                    onClick={() => handleResolve("rejected", "Rechazado manualmente")}>
                    <Ban className="h-4 w-4 mr-2" /> Rechazar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Resuelto como: <Badge variant="secondary">{match.match_status}</Badge>
                {match.resolution_note && <span className="text-xs italic">— {match.resolution_note}</span>}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ── Micro components ── */

function CompCheck({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span className="text-primary text-[10px] font-medium flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> ✓</span>
  ) : (
    <span className="text-destructive text-[10px] flex items-center gap-0.5"><XCircle className="h-3 w-3" /> ✗</span>
  );
}

function DiffBadge({ diff, unit }: { diff: number | null; unit: string }) {
  if (diff == null) return <span className="text-[10px] text-muted-foreground">—</span>;
  const abs = Math.abs(diff);
  const color = abs <= (unit === "h" ? 0.5 : 15) ? "text-primary" : abs <= (unit === "h" ? 1 : 60) ? "text-amber-500" : "text-destructive";
  return (
    <span className={`text-[10px] font-mono font-medium ${color}`}>
      {diff > 0 ? "+" : ""}{unit === "h" ? diff.toFixed(1) : diff}{unit}
    </span>
  );
}
