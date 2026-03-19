import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Clock, MapPin, Calendar, User, AlertTriangle, Link2, CheckCircle2,
  XCircle, Plus, Copy, Ban, Loader2,
} from "lucide-react";

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
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  total_hours: number | null;
  client_name: string | null;
  location_name: string | null;
  source_data: any;
  matched_employee_id: string | null;
}

interface ClockDetail {
  work_date: string | null;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  location_name: string | null;
  client_name: string | null;
  source_data: any;
  matched_employee_id: string | null;
}

function classifyCase(flags: string[], schedDetail: ScheduleDetail | null, clockDetail: ClockDetail | null): { label: string; icon: any; color: string } {
  const f = flags || [];
  if (f.includes("clock_without_schedule") && !schedDetail) {
    return { label: "Trabajo sin agenda (clock huérfano)", icon: AlertTriangle, color: "text-amber-500" };
  }
  if (f.includes("unmatched_schedule") && !clockDetail) {
    return { label: "Turno agendado sin fichaje", icon: AlertTriangle, color: "text-destructive" };
  }
  if (f.includes("hours_mismatch")) {
    return { label: "Probable turno con diferencia de horas", icon: Clock, color: "text-amber-500" };
  }
  if (f.includes("midnight_split")) {
    return { label: "Posible midnight split", icon: Clock, color: "text-blue-500" };
  }
  return { label: "Sin clasificar", icon: AlertTriangle, color: "text-muted-foreground" };
}

function timeDiffMinutes(schedStart: string | null, clockIn: string | null): number | null {
  if (!schedStart || !clockIn) return null;
  try {
    const sMin = parseInt(schedStart.substring(0, 2)) * 60 + parseInt(schedStart.substring(3, 5));
    const cStr = clockIn.length > 10 ? clockIn.substring(11, 16) : clockIn.substring(0, 5);
    const cMin = parseInt(cStr.substring(0, 2)) * 60 + parseInt(cStr.substring(3, 5));
    return cMin - sMin;
  } catch { return null; }
}

export default function MatchDetailDrawer({ match, open, onOpenChange, onResolve, companyId }: Props) {
  const [schedDetail, setSchedDetail] = useState<ScheduleDetail | null>(null);
  const [clockDetail, setClockDetail] = useState<ClockDetail | null>(null);
  const [empName, setEmpName] = useState<string>("—");
  const [closestSchedule, setClosestSchedule] = useState<ScheduleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!match || !open) { setSchedDetail(null); setClockDetail(null); setEmpName("—"); setClosestSchedule(null); return; }
    setLoading(true);

    const promises: Promise<any>[] = [];

    // Fetch schedule row
    if (match.schedule_row_id) {
      promises.push(
        supabase.from("normalized_schedule_rows" as any).select("*").eq("id", match.schedule_row_id).maybeSingle()
          .then(({ data }) => { if (data) setSchedDetail(data as any); })
      );
    }

    // Fetch clock row
    if (match.clock_row_id) {
      promises.push(
        supabase.from("normalized_clock_rows" as any).select("*").eq("id", match.clock_row_id).maybeSingle()
          .then(({ data }) => { if (data) setClockDetail(data as any); })
      );
    }

    // Fetch employee name
    if (match.employee_id) {
      promises.push(
        supabase.from("employees").select("first_name, last_name").eq("id", match.employee_id).maybeSingle()
          .then(({ data }) => { if (data) setEmpName(`${data.first_name} ${data.last_name}`); })
      );
    }

    // Find closest schedule for orphan clocks
    if (!match.schedule_row_id && match.clock_row_id && match.employee_id && companyId) {
      promises.push(
        supabase.from("normalized_schedule_rows" as any).select("*")
          .eq("company_id", companyId)
          .eq("matched_employee_id", match.employee_id)
          .order("work_date", { ascending: false }).limit(5)
          .then(({ data }) => {
            if (data && data.length > 0) setClosestSchedule((data as any[])[0]);
          })
      );
    }

    Promise.all(promises).finally(() => setLoading(false));
  }, [match, open, companyId]);

  if (!match) return null;

  const flags: string[] = Array.isArray(match.conflict_flags) ? match.conflict_flags : [];
  const caseInfo = classifyCase(flags, schedDetail, clockDetail);
  const CaseIcon = caseInfo.icon;
  const tDiff = schedDetail && clockDetail ? timeDiffMinutes(schedDetail.start_time, clockDetail.clock_in) : null;
  const isResolved = ["approved", "rejected", "linked", "created_shift", "valid_unscheduled", "ignored_duplicate"].includes(match.match_status);

  const handleResolve = async (status: string, note?: string) => {
    setResolving(true);
    await onResolve(match.id, status, note);
    setResolving(false);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto w-full sm:max-w-lg lg:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CaseIcon className={`h-5 w-5 ${caseInfo.color}`} />
            Detalle de Matching
          </SheetTitle>
          <SheetDescription>{caseInfo.label}</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {/* Employee */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4" /> Empleado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{empName}</p>
                <p className="text-xs text-muted-foreground font-mono">{match.employee_id?.slice(0, 12) || "Sin asignar"}</p>
              </CardContent>
            </Card>

            {/* Schedule Detail */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Turno Agendado
                </CardTitle>
              </CardHeader>
              <CardContent>
                {schedDetail ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Fecha:</span> {schedDetail.work_date || "—"}</div>
                    <div><span className="text-muted-foreground">Horario:</span> {schedDetail.start_time?.substring(0, 5) || "?"} – {schedDetail.end_time?.substring(0, 5) || "?"}</div>
                    <div><span className="text-muted-foreground">Horas:</span> {schedDetail.total_hours ?? "—"}</div>
                    <div><span className="text-muted-foreground">Cliente:</span> {schedDetail.client_name || "—"}</div>
                    <div className="col-span-2"><span className="text-muted-foreground">Ubicación:</span> {schedDetail.location_name || "—"}</div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Sin turno agendado vinculado</p>
                )}
              </CardContent>
            </Card>

            {/* Clock Detail */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Fichaje (Clock)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {clockDetail ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Fecha:</span> {clockDetail.work_date || "—"}</div>
                    <div><span className="text-muted-foreground">Horas:</span> {clockDetail.total_hours ?? "—"}</div>
                    <div><span className="text-muted-foreground">Clock in:</span> {clockDetail.clock_in ? clockDetail.clock_in.substring(11, 16) : "—"}</div>
                    <div><span className="text-muted-foreground">Clock out:</span> {clockDetail.clock_out ? clockDetail.clock_out.substring(11, 16) : "—"}</div>
                    <div className="col-span-2"><span className="text-muted-foreground">Ubicación:</span> {clockDetail.location_name || clockDetail.client_name || "—"}</div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Sin fichaje vinculado</p>
                )}
              </CardContent>
            </Card>

            {/* Analysis */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Análisis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Clasificación:</span>
                  <Badge variant="outline">{caseInfo.label}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Confianza:</span>
                  <span className="font-mono">{match.confidence_score}%</span>
                </div>
                {match.hours_variance != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Var. horas:</span>
                    <span className={Math.abs(match.hours_variance) > 0.5 ? "text-destructive font-medium" : ""}>
                      {match.hours_variance > 0 ? "+" : ""}{match.hours_variance.toFixed(1)}h
                    </span>
                  </div>
                )}
                {tDiff != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Dif. hora inicio:</span>
                    <span className={Math.abs(tDiff) > 30 ? "text-amber-500 font-medium" : ""}>
                      {tDiff > 0 ? "+" : ""}{tDiff} min
                    </span>
                  </div>
                )}
                {flags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {flags.map(f => <Badge key={f} variant="outline" className="text-xs">{f.replace(/_/g, " ")}</Badge>)}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Closest schedule candidate for orphan clocks */}
            {closestSchedule && !schedDetail && (
              <Card className="border-amber-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
                    <MapPin className="h-4 w-4" /> Candidato más cercano
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">Fecha:</span> {closestSchedule.work_date || "—"}</div>
                    <div><span className="text-muted-foreground">Horario:</span> {closestSchedule.start_time?.substring(0, 5) || "?"} – {closestSchedule.end_time?.substring(0, 5) || "?"}</div>
                    <div><span className="text-muted-foreground">Cliente:</span> {closestSchedule.client_name || "—"}</div>
                    <div><span className="text-muted-foreground">Ubicación:</span> {closestSchedule.location_name || "—"}</div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* Actions */}
            {!isResolved ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Acciones de resolución</p>
                <div className="grid grid-cols-1 gap-2">
                  {closestSchedule && !schedDetail && (
                    <Button variant="outline" className="justify-start" disabled={resolving}
                      onClick={() => handleResolve("linked", `Vinculado a turno ${closestSchedule.work_date}`)}>
                      <Link2 className="h-4 w-4 mr-2" /> Vincular al turno más cercano
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
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
