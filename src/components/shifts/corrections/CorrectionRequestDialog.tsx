/**
 * CorrectionRequestDialog
 *
 * Captain/admin modal to propose an attendance correction.
 * Calls request_time_entry_correction RPC. Never overwrites raw
 * punches silently; backend always creates a pending row.
 */
import { useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CORRECTION_TYPE_LABEL,
  type CorrectionType,
  mapCorrectionErrorMessage,
  requestTimeEntryCorrection,
} from "@/lib/shifts/time-corrections";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  shiftId: string;
  shiftDate: string; // yyyy-MM-dd
  employeeId: string;
  employeeName: string;
  /** Existing time_entry id, if we're adjusting / adding salida to it. */
  timeEntryId?: string | null;
  initialType: CorrectionType;
  initialClockIn?: string | null;  // iso
  initialClockOut?: string | null; // iso
  onSubmitted?: () => void;
}

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function localInputToISO(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function CorrectionRequestDialog({
  open,
  onOpenChange,
  companyId,
  shiftId,
  shiftDate,
  employeeId,
  employeeName,
  timeEntryId,
  initialType,
  initialClockIn,
  initialClockOut,
  onSubmitted,
}: Props) {
  const [type, setType] = useState<CorrectionType>(initialType);
  const [clockIn, setClockIn] = useState(
    isoToLocalInput(initialClockIn) ||
      (initialType === "missing_clock_in" || initialType === "manual_entry"
        ? `${shiftDate}T08:00`
        : ""),
  );
  const [clockOut, setClockOut] = useState(
    isoToLocalInput(initialClockOut) ||
      (initialType === "missing_clock_out" ||
      initialType === "adjust_clock_out" ||
      initialType === "manual_entry"
        ? `${shiftDate}T17:00`
        : ""),
  );
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const needsIn =
    type === "missing_clock_in" ||
    type === "adjust_clock_in" ||
    type === "manual_entry";
  const needsOut =
    type === "missing_clock_out" ||
    type === "adjust_clock_out" ||
    type === "manual_entry";

  const canSubmit =
    confirmed &&
    reason.trim().length >= 3 &&
    (!needsIn || !!clockIn) &&
    (!needsOut || !!clockOut) &&
    !busy;

  async function handleSubmit() {
    setBusy(true);
    try {
      await requestTimeEntryCorrection({
        company_id: companyId,
        shift_id: shiftId,
        employee_id: employeeId,
        time_entry_id: timeEntryId ?? null,
        correction_type: type,
        corrected_clock_in: needsIn ? localInputToISO(clockIn) : null,
        corrected_clock_out: needsOut ? localInputToISO(clockOut) : null,
        reason: reason.trim(),
        note: note.trim() || null,
      });
      toast.success("Corrección enviada a revisión");
      onSubmitted?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(mapCorrectionErrorMessage(e?.message ?? "Error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Corregir fichaje</DialogTitle>
          <DialogDescription>
            {employeeName} · {CORRECTION_TYPE_LABEL[type]}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11.5px] text-amber-900 dark:text-amber-200 flex gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-none" />
          <span>
            La corrección queda <strong>pendiente</strong> hasta que el
            revisor de horas la apruebe. Payroll no se recalcula
            automáticamente.
          </span>
        </div>

        <div className="space-y-3">
          {needsIn && (
            <div className="space-y-1.5">
              <Label htmlFor="corr-in" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Entrada real
              </Label>
              <Input
                id="corr-in"
                type="datetime-local"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
              />
            </div>
          )}
          {needsOut && (
            <div className="space-y-1.5">
              <Label htmlFor="corr-out" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Salida real
              </Label>
              <Input
                id="corr-out"
                type="datetime-local"
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="corr-reason" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="corr-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. olvidó marcar salida"
              maxLength={140}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="corr-note" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Nota (opcional)
            </Label>
            <Textarea
              id="corr-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contexto adicional para el revisor."
              maxLength={500}
            />
          </div>

          <label className="flex items-start gap-2 text-[12px] cursor-pointer">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <span>Entiendo que esta corrección quedará auditada.</span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Enviar corrección a revisión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
