/**
 * MobileShiftEditSheet — mobile-first edit of an existing shift.
 *
 * Scope (intentionally narrow):
 *  - Loads the CURRENT values of the shift (date, start, end, slots,
 *    meeting point, notes).
 *  - Saves with a single UPDATE on scheduled_shifts filtered by the existing
 *    shift id. Never INSERTs, never touches tenant/company_id, assignments,
 *    time_entries or payroll.
 *  - Only the fields the operator actually changed are sent.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, X, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Shift } from "@/components/shifts/types";

interface Props {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful UPDATE so the caller can refresh its lists. */
  onSaved?: (patch: Record<string, any>) => void;
}

interface EditState {
  date: string;
  startTime: string;
  endTime: string;
  slots: string;
  meetingPoint: string;
  notes: string;
}

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");

function toState(shift: Shift): EditState {
  const s = shift as any;
  return {
    date: shift.date ?? "",
    startTime: hhmm(shift.start_time),
    endTime: hhmm(shift.end_time),
    slots: shift.slots != null ? String(shift.slots) : "1",
    meetingPoint: s.meeting_point ?? "",
    notes: shift.notes ?? "",
  };
}

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function MobileShiftEditSheet({ shift, open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<EditState>(() => (shift ? toState(shift) : {
    date: "", startTime: "", endTime: "", slots: "1", meetingPoint: "", notes: "",
  }));
  const [overnight, setOvernight] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (shift && open) {
      setForm(toState(shift));
      setOvernight(
        !!shift.start_time && !!shift.end_time &&
        minutes(hhmm(shift.end_time)) < minutes(hhmm(shift.start_time))
      );
      setSaving(false);
    }
  }, [shift?.id, open]);

  const initial = useMemo(() => (shift ? toState(shift) : null), [shift?.id, shift?.date, shift?.start_time, shift?.end_time, shift?.slots, shift?.notes]);
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

  const patch = (p: Partial<EditState>) => setForm((prev) => ({ ...prev, ...p }));

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

    // Only the fields the operator actually changed.
    const updates: Record<string, any> = {};
    const cur = shift as any;
    if (form.date !== cur.date) updates.date = form.date;
    if (form.startTime !== hhmm(cur.start_time)) updates.start_time = form.startTime;
    if (form.endTime !== hhmm(cur.end_time)) updates.end_time = form.endTime;
    const slotsNum = parseInt(form.slots, 10);
    if (!Number.isNaN(slotsNum) && slotsNum !== cur.slots) updates.slots = slotsNum;
    if (form.meetingPoint.trim() !== (cur.meeting_point ?? "")) {
      updates.meeting_point = form.meetingPoint.trim() || null;
    }
    if (form.notes.trim() !== (cur.notes ?? "")) updates.notes = form.notes.trim() || null;

    if (Object.keys(updates).length === 0) { toast.info("Sin cambios"); onOpenChange(false); return; }

    setSaving(true);
    // UPDATE by existing id — never an INSERT, company_id untouched.
    const { error } = await supabase
      .from("scheduled_shifts")
      .update(updates as any)
      .eq("id", shift.id);
    setSaving(false);

    if (error) { toast.error(error.message); return; }
    toast.success("Turno actualizado");
    onSaved?.(updates);
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

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Fecha</Label>
              <div className="mt-1.5">
                <SmartDateInput
                  value={form.date}
                  onChange={(iso) => patch({ date: iso })}
                  placeholder="MM/DD/YYYY"
                  aria-label="Fecha del turno"
                  inputClassName="h-12 text-base"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Hora de inicio</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => patch({ startTime: e.target.value })}
                  className="h-12 text-base mt-1.5"
                  aria-label="Hora de inicio"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Hora final</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => patch({ endTime: e.target.value })}
                  className="h-12 text-base mt-1.5"
                  aria-label="Hora de finalización"
                />
              </div>
            </div>

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

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Plazas</Label>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={form.slots}
                onChange={(e) => patch({ slots: e.target.value })}
                className="h-12 text-base mt-1.5"
                aria-label="Plazas requeridas"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Punto de encuentro</Label>
              <Input
                value={form.meetingPoint}
                onChange={(e) => patch({ meetingPoint: e.target.value })}
                className="h-12 text-base mt-1.5"
                placeholder="Dónde se reúne el equipo"
                aria-label="Punto de encuentro"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">Notas internas</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                className="mt-1.5 min-h-[96px] text-base"
                placeholder="Instrucciones u observaciones"
                aria-label="Notas internas"
              />
            </div>

            {validationError && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-[12px] text-destructive leading-snug">{validationError}</p>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground leading-snug">
              Editar el horario programado no modifica fichajes ni payroll. Las asignaciones del
              equipo se conservan.
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
