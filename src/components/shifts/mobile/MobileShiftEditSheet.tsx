/**
 * MobileShiftEditSheet — mobile-first edit of an existing shift.
 *
 * Field parity: renders the SAME <ShiftFormFields/> used by "Crear turno" and
 * by the desktop edit dialog (stack layout), so every editable column is
 * available on mobile: cliente, dirección del evento (job site), punto de
 * encuentro, hora de encuentro, transporte, pago, instrucciones, etc.
 *
 * Persistence rules:
 *  - Single UPDATE on scheduled_shifts filtered by the existing shift id.
 *    Never an INSERT. tenant_id / company_id / assignments untouched.
 *  - Only the columns the operator actually changed are sent.
 *  - Never touches time_entries, attendance or payroll.
 *  - meeting_point and job_site_address stay independent columns.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, X, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ShiftFormFields,
  EMPTY_SHIFT_FORM_STATE,
  shiftToFormState,
  formStateToShiftPayload,
  type ShiftFormState,
  type LocationOption,
} from "@/components/shifts/ShiftFormFields";
import { syncShiftDriverRoles, driverIdsFromAssignments } from "@/lib/shifts/driver-sync";
import { notifyWarning } from "@/lib/feedback/notify";
import type { Shift, SelectOption, Employee, Assignment } from "@/components/shifts/types";

interface Props {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reference data — same lists the create flow uses. */
  clients?: SelectOption[];
  locations?: LocationOption[];
  employees?: Employee[];
  assignments?: Assignment[];
  companyId?: string | null;
  allowClaims?: boolean;
  /** Called after a successful UPDATE so the caller can refresh its lists. */
  onSaved?: (patch: Record<string, any>) => void;
}

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function MobileShiftEditSheet({
  shift,
  open,
  onOpenChange,
  clients = [],
  locations = [],
  employees = [],
  assignments = [],
  companyId = null,
  allowClaims = true,
  onSaved,
}: Props) {
  const [form, setForm] = useState<ShiftFormState>(EMPTY_SHIFT_FORM_STATE);
  const [overnight, setOvernight] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  /**
   * P0.3.1 — paridad multi-driver con desktop.
   * Los conductores reales viven en `shift_assignments.assignment_role='driver'`;
   * `driver_employee_id` sólo entra como compatibilidad legada.
   */
  const baseForm = useMemo<ShiftFormState | null>(() => {
    if (!shift) return null;
    return {
      ...shiftToFormState(shift),
      driverIds: driverIdsFromAssignments(
        assignments as any[],
        shift.id,
        (shift as any).driver_employee_id,
      ),
    };
  }, [shift, assignments]);

  useEffect(() => {
    if (shift && open && baseForm) {
      setForm(baseForm);
      setOvernight(
        !!shift.start_time && !!shift.end_time &&
        minutes(hhmm(shift.end_time)) < minutes(hhmm(shift.start_time))
      );
      setSaving(false);
    }
  }, [shift?.id, open, baseForm]);

  const initial = baseForm;
  const isDirty = useMemo(
    () => (initial ? JSON.stringify(initial) !== JSON.stringify(form) : false),
    [initial, form]
  );

  if (!shift) return null;

  const crossesMidnight =
    !!form.startTime && !!form.endTime && minutes(form.endTime) < minutes(form.startTime);
  const sameTime =
    !!form.startTime && !!form.endTime && minutes(form.endTime) === minutes(form.startTime);

  const validationError =
    !form.date ? "Selecciona una fecha."
      : !form.startTime || !form.endTime ? "Indica hora de inicio y de finalización."
      : sameTime ? "La hora final debe ser distinta de la inicial."
      : crossesMidnight && !overnight
        ? "La hora final es anterior a la inicial. Marca “Turno nocturno” si cruza la medianoche."
        : null;

  const requestClose = () => {
    if (saving) return;
    if (isDirty) setConfirmClose(true);
    else onOpenChange(false);
  };

  const handleSave = async () => {
    if (saving) return; // double-tap guard
    if (validationError) { toast.error(validationError); return; }
    if (!isDirty) { toast.info("Sin cambios"); onOpenChange(false); return; }
    if (shift.status === "locked" || shift.status === "archived" || shift.status === "cancelled") {
      toast.error("Este turno no se puede editar");
      return;
    }

    // Diff the full payload against the shift's current values so we only send
    // the columns that actually changed.
    const next = formStateToShiftPayload(form, allowClaims);
    const prev = formStateToShiftPayload(shiftToFormState(shift), allowClaims);
    const updates: Record<string, any> = {};
    for (const key of Object.keys(next)) {
      if (JSON.stringify(next[key]) !== JSON.stringify(prev[key])) updates[key] = next[key];
    }

    // Los conductores no viven en scheduled_shifts: se comparan aparte.
    const wantedDrivers = [...new Set((form.driverIds ?? []).filter(Boolean))];
    const currentDrivers = initial?.driverIds ?? [];
    const driversChanged =
      JSON.stringify([...wantedDrivers].sort()) !== JSON.stringify([...currentDrivers].sort());

    if (Object.keys(updates).length === 0 && !driversChanged) {
      toast.info("Sin cambios"); onOpenChange(false); return;
    }

    setSaving(true);
    // UPDATE verificado por id — nunca un INSERT, company_id/tenant intactos.
    let savedRow: Record<string, any> | null = null;
    if (Object.keys(updates).length > 0) {
      const result = await updateShiftVerified(
        shift.id,
        updates,
        companyId ?? (shift as any).company_id ?? null,
      );
      if (!result.ok) {
        setSaving(false);
        notifyError({
          key: "shift-update-mobile",
          title: "No pudimos guardar el turno",
          fact: result.message,
          consequence: "Tus cambios siguen aquí, sin aplicarse al turno.",
        });
        return; // mantenemos la hoja abierta con los cambios del operador
      }
      savedRow = result.row;
    }

    // Roles de conductor: sólo `assignment_role` + el campo legado.
    // Nunca fichajes, horas ni payroll; nunca borra asignaciones.
    if (driversChanged) {
      try {
        await syncShiftDriverRoles(shift.id, wantedDrivers);
      } catch (driverError) {
        notifyWarning({
          key: "shift-driver-sync-mobile",
          title: "El turno se guardó, pero los conductores no",
          fact: "No pudimos actualizar quién maneja en este turno.",
          consequence: "El equipo verá los conductores anteriores hasta que lo reintentes.",
          cause: driverError,
        });
      }
    }
    setSaving(false);
    toast.success("Turno actualizado");
    // Devolvemos la fila releída del backend, no lo que creíamos haber enviado.
    onSaved?.(savedRow ?? updates);
    onOpenChange(false);
  };


  return (
    <>
      <Sheet open={open} onOpenChange={(next) => { if (!next) requestClose(); else onOpenChange(true); }}>
        <SheetContent
          side="bottom"
          hideClose
          className="h-[92dvh] p-0 rounded-t-3xl flex flex-col overflow-hidden bg-background"
        >
          {/* Header */}
          <div
            className="px-5 py-3 border-b border-border/40 flex items-center justify-between gap-3"
            style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 0.75rem)" }}
          >
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">Editar turno</h2>
              <p className="text-[11px] text-muted-foreground truncate">
                {shift.title || "Turno"} · {shift.date}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={requestClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Body — full field parity with "Crear turno" */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <ShiftFormFields
              layout="stack"
              mode="edit"
              companyId={companyId}
              value={form}
              onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
              clients={clients}
              locations={locations}
              employees={employees}
              assignments={assignments}
              allowClaims={allowClaims}
              shift={shift}
              showEmployeePicker={false}
              renderInlineSummary={false}
            />

            {crossesMidnight && (
              <label className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
                <Checkbox
                  checked={overnight}
                  onCheckedChange={(v) => setOvernight(v === true)}
                  className="mt-0.5"
                  aria-label="Turno nocturno que cruza la medianoche"
                />
                <span className="text-[12px] leading-snug text-amber-700 dark:text-amber-400">
                  La hora final es anterior a la inicial. Marca esta casilla solo si el turno
                  cruza la medianoche.
                </span>
              </label>
            )}

            {validationError && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-[12px] text-destructive leading-snug">{validationError}</p>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground leading-snug">
              Editar el turno no modifica fichajes ni payroll. Las asignaciones del equipo se
              conservan. La dirección del evento y el punto de encuentro son campos distintos.
            </p>
          </div>

          {/* Sticky footer */}
          <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom,0px),12px)] border-t border-border/40 bg-background/95 backdrop-blur-sm">
            <Button
              className="w-full h-12 rounded-xl text-sm font-semibold gap-2"
              onClick={() => void handleSave()}
              disabled={saving || !!validationError}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar en este turno. Si sales ahora se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmClose(false); onOpenChange(false); }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>

      </AlertDialog>
    </>
  );
}
