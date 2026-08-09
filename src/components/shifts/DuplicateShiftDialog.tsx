import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Copy, Loader2, AlertTriangle, Users } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buildCanonicalServiceInsert } from "@/lib/shifts/recurrence";
import {
  snapshotFromServiceRow,
  buildSeriesIntentFromSnapshot,
  verifySeriesIntegrity,
  describeSeriesVerification,
} from "@/lib/shifts/series-engine";

/**
 * DuplicateShiftDialog — Phase 1 Quick Win #2.
 *
 * Always creates a draft/draft shift. NEVER publishes, NEVER sends
 * notifications, NEVER bypasses the prevent_overlapping_shift_assignments
 * trigger. Workers are copied as `pending` only when explicitly opted in.
 */

interface SourceShift {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  slots: number | null;
  client_id: string | null;
  location_id: string | null;
  notes: string | null;
  meeting_point: string | null;
  special_instructions: string | null;
  pay_type: string | null;
  day_type?: string | null;
  pay_override?: boolean | null;
  attendance_mode?: string | null;
  clock_method: string | null;
  transportation_required: boolean | null;
  car_capacity: number | null;
  transportation_notes: string | null;
  shift_admin_id: string | null;
  meeting_point_location_id?: string | null;
  job_site_location_id?: string | null;
  claimable?: boolean | null;
}

interface SourceAssignment {
  id: string;
  employee_id: string;
  assignment_role: string;
  status: string;
  employee?: { first_name?: string | null; last_name?: string | null } | null;
}

interface OverlapRow {
  employee_id: string;
  employee_name: string;
  conflict_shift_id: string;
  conflict_title: string;
  conflict_start: string;
  conflict_end: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shift: SourceShift;
  assignments: SourceAssignment[];
  companyId: string;
  userId: string | null;
  /** Default workers toggle when opened (e.g. via "Duplicate with workers"). */
  defaultCopyWorkers?: boolean;
  onDuplicated?: (newShiftId: string) => void;
}

const DUPLICATE_DEBUG_PREFIX = "[DuplicateShiftDialog]";

function debugDuplicateShift(payload: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.info(DUPLICATE_DEBUG_PREFIX, payload);
  }
}

export function DuplicateShiftDialog({
  open, onOpenChange, shift, assignments, companyId, userId,
  defaultCopyWorkers = false, onDuplicated,
}: Props) {
  const [targetDate, setTargetDate] = useState<Date | undefined>(undefined);
  const [copyClient, setCopyClient] = useState(true);
  const [copyTime, setCopyTime] = useState(true);
  const [copyNotes, setCopyNotes] = useState(true);
  const [copyRoles, setCopyRoles] = useState(true);
  const [copyWorkers, setCopyWorkers] = useState(defaultCopyWorkers);
  const [forcedIncludedConflicts, setForcedIncludedConflicts] = useState<Set<string>>(new Set());
  const [overlaps, setOverlaps] = useState<OverlapRow[]>([]);
  const [checkingOverlap, setCheckingOverlap] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingForceEmployee, setPendingForceEmployee] = useState<OverlapRow | null>(null);

  // Reset when reopened
  useEffect(() => {
    if (open) {
      debugDuplicateShift({
        source_shift_id: shift.id,
        assignments_count_received: assignments.length,
        employee_ids_received: assignments.map((assignment) => assignment.employee_id),
        default_copy_workers_received: defaultCopyWorkers,
      });
      setTargetDate(undefined);
      setCopyClient(true);
      setCopyTime(true);
      setCopyNotes(true);
      setCopyRoles(true);
      setCopyWorkers(defaultCopyWorkers);
      setForcedIncludedConflicts(new Set());
      setOverlaps([]);
    }
  }, [open, defaultCopyWorkers]);

  const eligibleWorkers = useMemo(() => {
    const seen = new Set<string>();
    return assignments.filter((a) => {
      if (!a.employee_id || a.status === "rejected" || a.status === "removed") return false;
      if (seen.has(a.employee_id)) return false;
      seen.add(a.employee_id);
      return true;
    });
  }, [assignments]);

  const overlappingEmployeeIds = useMemo(
    () => new Set(overlaps.map((o) => o.employee_id)),
    [overlaps],
  );

  const excludedConflictCount = useMemo(
    () => Array.from(overlappingEmployeeIds).filter((employeeId) => !forcedIncludedConflicts.has(employeeId)).length,
    [forcedIncludedConflicts, overlappingEmployeeIds],
  );

  const workersToCopy = useMemo(
    () => eligibleWorkers.filter((a) => !overlappingEmployeeIds.has(a.employee_id) || forcedIncludedConflicts.has(a.employee_id)),
    [eligibleWorkers, forcedIncludedConflicts, overlappingEmployeeIds],
  );

  useEffect(() => {
    if (!open) return;
    debugDuplicateShift({
      source_shift_id: shift.id,
      assignments_count_received: assignments.length,
      eligible_workers_count: eligibleWorkers.length,
      workers_to_copy_count: workersToCopy.length,
    });
  }, [open, shift.id, assignments.length, eligibleWorkers.length, workersToCopy.length]);

  const overlapCount = overlappingEmployeeIds.size;

  // Overlap precheck whenever target date or copyWorkers changes
  useEffect(() => {
    let cancelled = false;
    async function check() {
      setOverlaps([]);
      if (!copyWorkers || !targetDate || eligibleWorkers.length === 0) return;
      setCheckingOverlap(true);
      const dateStr = format(targetDate, "yyyy-MM-dd");
      const ids = eligibleWorkers.map(a => a.employee_id);
      const startT = copyTime ? shift.start_time : shift.start_time;
      const endT = copyTime ? shift.end_time : shift.end_time;
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("employee_id, scheduled_shifts!inner(id, title, date, start_time, end_time), employees(first_name, last_name)")
        .eq("company_id", companyId)
        .in("employee_id", ids)
        .neq("status", "rejected") as any;
      if (cancelled) return;
      if (error) {
        setCheckingOverlap(false);
        return;
      }
      const rows: OverlapRow[] = [];
      for (const r of (data ?? [])) {
        const ss = r.scheduled_shifts;
        if (!ss || ss.date !== dateStr) continue;
        // overlap if start_a < end_b AND end_a > start_b
        if (ss.start_time < endT && ss.end_time > startT) {
          rows.push({
            employee_id: r.employee_id,
            employee_name: r.employees ? `${r.employees.first_name ?? ""} ${r.employees.last_name ?? ""}`.trim() : r.employee_id,
            conflict_shift_id: ss.id,
            conflict_title: ss.title,
            conflict_start: ss.start_time,
            conflict_end: ss.end_time,
          });
        }
      }
      setOverlaps(rows);
      setCheckingOverlap(false);
    }
    check();
    return () => { cancelled = true; };
  }, [copyWorkers, targetDate, copyTime, eligibleWorkers, companyId, shift.start_time, shift.end_time]);

  const toggleExcluded = (employeeId: string) => {
    setForcedIncludedConflicts(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!targetDate) {
      toast.error("Selecciona una fecha destino");
      return;
    }
    if (copyWorkers && workersToCopy.length === 0) {
      toast.error("No hay trabajadores elegibles para copiar en esta fecha.");
      return;
    }
    setSubmitting(true);
    const dateStr = format(targetDate, "yyyy-MM-dd");

    debugDuplicateShift({
      source_shift_id: shift.id,
      target_date: dateStr,
      copyWorkers,
      assignments_count_received: assignments.length,
      eligible_workers_count: eligibleWorkers.length,
      overlaps_count: overlapCount,
      excluded_count: excludedConflictCount,
      assignments_to_insert_count: copyWorkers ? workersToCopy.length : 0,
    });

    // P0 FINAL — snapshot canónico congelado ANTES de escribir. Duplicar usa el
    // mismo contrato que Crear, Publicar, Copiar semana y Editar → Repetir.
    const snapshot = snapshotFromServiceRow(shift, {
      companyId,
      employeeIds: copyWorkers ? workersToCopy.map((a) => a.employee_id) : [],
      publicationIntent: "draft",
      include: { client: copyClient, notes: copyNotes, roles: copyRoles },
    });
    const intent = buildSeriesIntentFromSnapshot({ snapshot, baseDate: dateStr });
    const sourceRef = intent.recurrence.occurrences[0]?.sourceRef ?? null;
    const insertPayload = buildCanonicalServiceInsert({
      snapshot,
      date: dateStr,
      sourceRef,
      createdBy: userId,
      // Explicitly draft. Never auto-publish.
      draft: true,
    });


    const { data: created, error: insertErr } = await supabase
      .from("scheduled_shifts")
      .insert(insertPayload as any)
      .select("id")
      .single();

    if (insertErr || !created) {
      setSubmitting(false);
      toast.error(insertErr?.message ?? "No se pudo duplicar el turno");
      return;
    }

    const newShiftId = (created as any).id as string;

    // 2) Optionally copy workers as pending draft reservations.
    if (copyWorkers) {
      const toInsert = workersToCopy
        .map(a => ({
          company_id: companyId,
          shift_id: newShiftId,
          employee_id: a.employee_id,
          status: "pending",
          assignment_role: copyRoles ? (a.assignment_role || "staff") : "staff",
          response_status: "pending",
          response_required: false,
          attendance_status: "pending",
          is_draft_reservation: true,
        }));

      if (toInsert.length > 0) {
        const { error: assignErr } = await supabase
          .from("shift_assignments")
          .insert(toInsert as any);
        if (assignErr) {
          // Rollback the shift to keep things clean — trigger blocked something
          // unexpected. UI surfaces the error and removes the empty draft.
          debugDuplicateShift({
            source_shift_id: shift.id,
            target_date: dateStr,
            copyWorkers,
            assignments_count_received: assignments.length,
            eligible_workers_count: eligibleWorkers.length,
            overlaps_count: overlapCount,
            excluded_count: excludedConflictCount,
            assignments_to_insert_count: toInsert.length,
            insert_error_exact: assignErr.message,
          });
          const { error: rollbackErr } = await supabase.from("scheduled_shifts").delete().eq("id", newShiftId);
          setSubmitting(false);
          const msg = assignErr.message || "Error al copiar trabajadores";
          if (rollbackErr) {
            debugDuplicateShift({ rollback_error_exact: rollbackErr.message, new_shift_id: newShiftId });
          }
          toast.error(
            msg.toLowerCase().includes("overlap") || msg.toLowerCase().includes("solapa")
              ? "Un trabajador tiene solapamiento. Revisa los conflictos antes de duplicar."
              : msg,
          );
          return;
        }
      }
    }

    setSubmitting(false);
    toast.success("Turno duplicado como borrador.", {
      description: copyWorkers
        ? `Se copiaron ${workersToCopy.length} trabajador${workersToCopy.length === 1 ? "" : "es"} como pending.`
        : "Sin trabajadores. Asigna desde Staffing.",
    });
    onOpenChange(false);
    onDuplicated?.(newShiftId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-primary" /> Duplicar turno
          </DialogTitle>
          <DialogDescription className="text-xs">
            Siempre crea un borrador nuevo. Nunca publica ni envía notificaciones.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Target date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Fecha destino</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal h-9",
                    !targetDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {targetDate ? format(targetDate, "EEE, d MMM yyyy") : "Selecciona una fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={targetDate}
                  onSelect={setTargetDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <Separator />

          {/* Toggles */}
          <div className="space-y-3">
            <ToggleRow
              label="Copiar cliente y ubicación"
              checked={copyClient}
              onChange={setCopyClient}
            />
            <ToggleRow
              label="Copiar horario"
              checked={copyTime}
              onChange={setCopyTime}
              hint={`${shift.start_time?.slice(0,5)} – ${shift.end_time?.slice(0,5)}`}
            />
            <ToggleRow
              label="Copiar notas e instrucciones"
              checked={copyNotes}
              onChange={setCopyNotes}
            />
            <ToggleRow
              label="Copiar roles (admin de turno, asignación)"
              checked={copyRoles}
              onChange={setCopyRoles}
            />
            <ToggleRow
              label={`Copiar trabajadores (${eligibleWorkers.length})`}
              checked={copyWorkers}
              onChange={setCopyWorkers}
              hint="Se copian como pending. Nunca se envían notificaciones."
            />
          </div>

          {/* Locked toggles */}
          <div className="rounded-lg bg-muted/30 px-3 py-2 space-y-1.5">
            <ToggleRow label="Dejar como borrador" checked disabled />
            <ToggleRow label="Publicar después de duplicar" checked={false} disabled />
            <ToggleRow label="Enviar notificaciones" checked={false} disabled />
          </div>

          {/* Overlap preview */}
          {copyWorkers && targetDate && (
            <div className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">Validación de solapamiento</span>
                {checkingOverlap && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Disponibles</p>
                  <p className="font-semibold">{eligibleWorkers.length}</p>
                </div>
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Excluidos</p>
                  <p className="font-semibold">{excludedConflictCount}</p>
                </div>
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Se copiarán</p>
                  <p className="font-semibold">{workersToCopy.length}</p>
                </div>
              </div>
              {overlaps.length === 0 && !checkingOverlap && (
                <p className="text-[11px] text-muted-foreground">Sin conflictos detectados.</p>
              )}
              {overlaps.length > 0 && (
                <>
                  <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      {overlaps.length} trabajador{overlaps.length === 1 ? "" : "es"} con turno conflictivo en esa fecha.
                      Quedan <strong>excluidos por defecto</strong>. Incluirlos no es recomendado y el sistema puede bloquearlo.
                    </p>
                  </div>
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                    {overlaps.map(o => {
                      const forced = forcedIncludedConflicts.has(o.employee_id);
                      return (
                        <div
                          key={`${o.employee_id}-${o.conflict_shift_id}`}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{o.employee_name}</p>
                            <p className="text-muted-foreground truncate">
                              ↳ {o.conflict_title} · {o.conflict_start.slice(0,5)}–{o.conflict_end.slice(0,5)}
                            </p>
                          </div>
                          <Badge
                            variant={forced ? "destructive" : "outline"}
                            className="text-[9px] cursor-pointer shrink-0"
                            onClick={() => {
                              if (forced) toggleExcluded(o.employee_id);
                              else setPendingForceEmployee(o);
                            }}
                          >
                            {forced ? "No recomendado" : "Excluido"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {!checkingOverlap && workersToCopy.length === 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Todos los trabajadores tienen conflicto para esta fecha. Ajusta la fecha o duplica sin trabajadores.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !targetDate || (copyWorkers && !checkingOverlap && workersToCopy.length === 0)}>
            {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Copy className="h-4 w-4 mr-1.5" />}
            Duplicar como borrador
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog
        open={!!pendingForceEmployee}
        onOpenChange={(o) => { if (!o) setPendingForceEmployee(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Incluir trabajador con conflicto</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingForceEmployee?.employee_name} tiene otro turno en ese horario
              ({pendingForceEmployee?.conflict_title} ·{" "}
              {pendingForceEmployee?.conflict_start.slice(0,5)}–{pendingForceEmployee?.conflict_end.slice(0,5)}).
              {" "}El sistema puede bloquear esta acción. No es recomendado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mantener excluido</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingForceEmployee) toggleExcluded(pendingForceEmployee.employee_id);
                setPendingForceEmployee(null);
              }}
            >
              Incluir igual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function ToggleRow({
  label, checked, onChange, hint, disabled,
}: {
  label: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={cn("text-xs", disabled ? "text-muted-foreground" : "text-foreground")}>{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled || !onChange}
      />
    </div>
  );
}
