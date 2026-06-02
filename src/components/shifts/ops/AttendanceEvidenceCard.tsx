/**
 * AttendanceEvidenceCard.tsx
 *
 * Per-worker attendance evidence block for the Shift Operations screen.
 *
 * Boundaries (enforced by design):
 *  - We READ from `time_entries` to surface real clock evidence.
 *  - We READ + WRITE only `shift_notes` rows of type `attendance_validation`
 *    to record admin validations as operational audit trail.
 *  - We NEVER write to `time_entries`. We NEVER write payroll. We NEVER
 *    convert scheduled hours into paid hours.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Clock, Phone, AlertTriangle, CheckCircle2, ShieldCheck, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getAttendanceEvidenceState,
  getShiftOperationalSummary,
  getWorkerNextActions,
  type AdminValidation,
  type AdminValidationKind,
  type AdminValidationReason,
  type AttendanceShift,
  type ClockEntry,
  type EvidenceState,
} from "@/lib/shifts/attendance-evidence";

type Assignment = {
  id: string;
  employee_id: string;
  status: string;
  employee?: { first_name: string; last_name: string; phone_number: string | null } | null;
};

interface Props {
  shift: AttendanceShift;
  assignments: Assignment[];
  companyId: string;
  userId: string | null;
}

const VALIDATION_KIND_OPTIONS: { value: AdminValidationKind; label: string }[] = [
  { value: "present_no_clock",     label: "Presente sin clock" },
  { value: "late_no_clock",        label: "Llegó tarde" },
  { value: "left_early_no_clock",  label: "Salió temprano" },
  { value: "absent_confirmed",     label: "Ausente confirmado" },
  { value: "other",                label: "Otro" },
];

const REASON_OPTIONS: { value: AdminValidationReason; label: string }[] = [
  { value: "seen_on_site",            label: "Lo vi en sitio" },
  { value: "supervisor_confirmed",    label: "Supervisor lo confirmó" },
  { value: "worker_message_or_photo", label: "Worker envió mensaje/foto" },
  { value: "phone_call_confirmed",    label: "Confirmado por llamada" },
  { value: "other",                   label: "Otro" },
];

const TONE_CLASSES: Record<EvidenceState["tone"], string> = {
  neutral: "bg-muted/30 text-muted-foreground border-border/40",
  info:    "bg-info/10 text-info border-info/20",
  success: "bg-earning/10 text-earning border-earning/20",
  warn:    "bg-warning/10 text-warning border-warning/20",
  danger:  "bg-destructive/10 text-destructive border-destructive/20",
};

const ACTION_TONE: Record<"primary" | "warn" | "danger", string> = {
  primary: "",
  warn: "border-warning/40 text-warning hover:bg-warning/10",
  danger: "border-destructive/40 text-destructive hover:bg-destructive/10",
};

export function AttendanceEvidenceCard({ shift, assignments, companyId, userId }: Props) {
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  const [validations, setValidations] = useState<AdminValidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowIso, setNowIso] = useState(new Date().toISOString());

  // Tick "now" once per minute so banners update without a manual refresh.
  useEffect(() => {
    const t = setInterval(() => setNowIso(new Date().toISOString()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setLoading(true);
    const [teRes, snRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("id, employee_id, clock_in, clock_out")
        .eq("shift_id", shift.id),
      supabase
        .from("shift_notes")
        .select("id, note_type, content, linked_employee_id, created_at")
        .eq("shift_id", shift.id)
        .eq("note_type", "attendance_validation")
        .order("created_at", { ascending: false }),
    ]);
    setEntries((teRes.data ?? []) as any);
    const parsed: AdminValidation[] = (snRes.data ?? [])
      .map((row: any) => parseValidationNote(row))
      .filter(Boolean) as AdminValidation[];
    setValidations(parsed);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [shift.id]);

  const entriesByEmployee = useMemo(() => {
    const m = new Map<string, ClockEntry[]>();
    for (const e of entries) {
      const arr = m.get(e.employee_id) ?? [];
      arr.push(e);
      m.set(e.employee_id, arr);
    }
    return m;
  }, [entries]);

  const validationsByEmployee = useMemo(() => {
    const m = new Map<string, AdminValidation[]>();
    for (const v of validations) {
      const arr = m.get(v.employee_id) ?? [];
      arr.push(v);
      m.set(v.employee_id, arr);
    }
    return m;
  }, [validations]);

  const summary = useMemo(
    () => getShiftOperationalSummary(shift, assignments as any, entriesByEmployee, validationsByEmployee, nowIso),
    [shift, assignments, entriesByEmployee, validationsByEmployee, nowIso],
  );

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogFor, setDialogFor] = useState<Assignment | null>(null);
  const [kind, setKind] = useState<AdminValidationKind>("present_no_clock");
  const [reason, setReason] = useState<AdminValidationReason>("seen_on_site");
  const [extraNote, setExtraNote] = useState("");
  const [saving, setSaving] = useState(false);

  const openValidation = (a: Assignment, presetKind?: AdminValidationKind) => {
    setDialogFor(a);
    setKind(presetKind ?? "present_no_clock");
    setReason("seen_on_site");
    setExtraNote("");
    setDialogOpen(true);
  };

  const saveValidation = async () => {
    if (!dialogFor || !companyId) return;
    setSaving(true);
    const payload = encodeValidationContent({
      employee_id: dialogFor.employee_id,
      kind,
      reason,
      note: extraNote.trim() || null,
    });
    const { error } = await supabase.from("shift_notes").insert({
      shift_id: shift.id,
      company_id: companyId,
      note_type: "attendance_validation",
      content: payload,
      created_by: userId ?? null,
      linked_employee_id: dialogFor.employee_id,
    } as any);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Validación registrada. No afecta payroll.");
      setDialogOpen(false);
      load();
    }
    setSaving(false);
  };

  const active = assignments.filter(a => a.status !== "rejected" && a.status !== "removed");

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Asistencia y evidencia
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-snug">
            {loading ? "Cargando evidencia…" : summary.sentence}
          </p>
        </div>
        {summary.pendingPayrollReview > 0 && (
          <Badge variant="outline" className="border-warning/40 text-warning text-[10px] shrink-0">
            {summary.pendingPayrollReview} pendiente{summary.pendingPayrollReview === 1 ? "" : "s"} payroll review
          </Badge>
        )}
      </div>

      {/* Quick KPIs */}
      <div className="flex flex-wrap gap-2">
        <Kpi label="Fichaje completo" value={summary.withClockComplete} tone="success" />
        <Kpi label="En turno" value={summary.withOpenClock} tone="info" />
        <Kpi label="Presente sin clock" value={summary.presentWithoutClock} tone="warn" />
        <Kpi label="Falta clock-in" value={summary.missingClockIn} tone="warn" />
        <Kpi label="Falta clock-out" value={summary.missingClockOut} tone="warn" />
        <Kpi label="Ausente" value={summary.absent} tone="danger" />
      </div>

      {/* Per-worker list */}
      <div className="space-y-2">
        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Sin workers activos asignados.</p>
        ) : active.map(a => {
          const state = getAttendanceEvidenceState(
            shift,
            entriesByEmployee.get(a.employee_id) ?? [],
            validationsByEmployee.get(a.employee_id) ?? [],
            nowIso,
          );
          const actions = getWorkerNextActions(state);
          const emp = a.employee;
          const lastValidation = (validationsByEmployee.get(a.employee_id) ?? [])[0] ?? null;
          return (
            <div key={a.id} className="rounded-xl border border-border/30 bg-muted/10 p-3 space-y-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                    {emp ? `${emp.first_name[0]}${emp.last_name[0]}` : "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">
                    {emp ? `${emp.first_name} ${emp.last_name}` : a.employee_id}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{state.message}</p>
                </div>
                <Badge variant="outline" className={cn("text-[10px] shrink-0", TONE_CLASSES[state.tone])}>
                  {state.label}
                </Badge>
              </div>
              {(state.recommendedAction || lastValidation) && (
                <div className="text-[10px] text-muted-foreground pl-11 space-y-0.5">
                  {state.recommendedAction && (
                    <p>· Sugerido: {state.recommendedAction}</p>
                  )}
                  {lastValidation && (
                    <p>· Última validación: {VALIDATION_KIND_OPTIONS.find(k => k.value === lastValidation.kind)?.label} — {REASON_OPTIONS.find(r => r.value === lastValidation.reason)?.label}</p>
                  )}
                </div>
              )}
              {actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-11">
                  {emp?.phone_number && actions.some(x => x.kind === "contact_worker") && (
                    <a href={`tel:${emp.phone_number}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] hover:bg-muted/40">
                      <Phone className="h-3 w-3" /> Llamar
                    </a>
                  )}
                  {actions.filter(x => x.kind !== "contact_worker").map(act => (
                    <Button
                      key={act.kind}
                      size="sm"
                      variant="outline"
                      className={cn("h-7 px-2 text-[10px]", ACTION_TONE[act.tone])}
                      onClick={() => {
                        if (act.kind === "mark_present_no_clock") openValidation(a, "present_no_clock");
                        else if (act.kind === "mark_late_no_clock") openValidation(a, "late_no_clock");
                        else if (act.kind === "mark_absent") openValidation(a, "absent_confirmed");
                        else if (act.kind === "mark_left_early") openValidation(a, "left_early_no_clock");
                        else if (act.kind === "close_open_clock") {
                          toast.info("Cerrar clock-out se hace en Reloj de tiempo. Sin clock evidence usa una validación admin.");
                        } else if (act.kind === "review_hours") {
                          toast.info("La revisión final de horas se hace en Centro de Validación antes de payroll.");
                        }
                      }}
                    >
                      {act.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Payroll boundary disclaimer */}
      <div className="flex items-start gap-2 rounded-xl bg-muted/30 border border-border/30 p-3">
        <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground leading-snug">
          Las validaciones admin son evidencia operativa. <strong>No cambian payroll.</strong> Payroll se calcula con fichajes reales o ajustes aprobados en el Centro de Validación.
        </p>
      </div>

      {/* Validation dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Registrar validación admin</DialogTitle>
            <DialogDescription className="text-xs">
              Captura por qué confirmas la presencia (o ausencia) sin clock evidence.
              Esta validación queda en la cronología y NO modifica payroll por sí sola.
            </DialogDescription>
          </DialogHeader>
          {dialogFor && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/30 p-2 text-xs">
                <strong>{dialogFor.employee?.first_name} {dialogFor.employee?.last_name}</strong>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px]">¿Qué pasó?</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as AdminValidationKind)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VALIDATION_KIND_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px]">¿Cómo lo confirmas?</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as AdminValidationReason)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px]">Nota adicional (opcional)</Label>
                <Textarea
                  rows={2}
                  value={extraNote}
                  onChange={e => setExtraNote(e.target.value)}
                  className="text-xs"
                  placeholder="Ej: llegó 9:15, se le vio en la entrada del cliente"
                />
              </div>
              <div className="rounded-lg bg-info/5 border border-info/20 p-2 text-[10px] text-muted-foreground">
                Se generará un pendiente <strong>“Revisar horas antes de payroll”</strong> para este worker.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={saveValidation} disabled={saving}>
              {saving ? "Guardando…" : "Guardar validación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: "success" | "info" | "warn" | "danger" }) {
  if (value === 0) return null;
  const toneClass: Record<typeof tone, string> = {
    success: "text-earning",
    info: "text-info",
    warn: "text-warning",
    danger: "text-destructive",
  } as any;
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-muted/30 px-2.5 py-1.5">
      <span className={cn("text-sm font-bold tabular-nums", toneClass[tone])}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Encoding ──────────────────────────────────────────────────────────────
// We piggy-back on existing shift_notes.content (text). We encode the
// validation as a JSON payload inside the content so we don't need a schema
// change. Anything that doesn't parse is ignored gracefully.

const PREFIX = "ATTENDANCE_VALIDATION_V1::";

function encodeValidationContent(v: {
  employee_id: string;
  kind: AdminValidationKind;
  reason: AdminValidationReason;
  note: string | null;
}): string {
  return PREFIX + JSON.stringify(v);
}

function parseValidationNote(row: {
  content: string;
  linked_employee_id: string | null;
  created_at: string;
}): AdminValidation | null {
  if (!row?.content || !row.content.startsWith(PREFIX)) return null;
  try {
    const json = JSON.parse(row.content.slice(PREFIX.length));
    if (!json.employee_id && !row.linked_employee_id) return null;
    return {
      employee_id: json.employee_id ?? row.linked_employee_id,
      kind: json.kind,
      reason: json.reason,
      note: json.note ?? null,
      created_at: row.created_at,
    };
  } catch {
    return null;
  }
}
