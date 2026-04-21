import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X, AlertCircle } from "lucide-react";
import {
  ShiftFormFields,
  EMPTY_SHIFT_FORM_STATE,
  shiftToFormState,
  formStateToShiftPayload,
  type ShiftFormState,
  type LocationOption,
} from "./ShiftFormFields";
import type { Shift, SelectOption, Employee } from "./types";

interface ShiftEditDialogProps {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: SelectOption[];
  locations: LocationOption[];
  employees?: Employee[];
  assignments?: { shift_id: string; employee_id: string; status: string }[];
  onSave: (shiftId: string, updates: Partial<Shift> & Record<string, any>, oldShift: Shift) => Promise<void>;
  /** When false, hides the claimable checkbox */
  allowClaims?: boolean;
}

export function ShiftEditDialog({
  shift, open, onOpenChange, clients, locations, employees = [], assignments = [], onSave, allowClaims = true,
}: ShiftEditDialogProps) {
  const [form, setForm] = useState<ShiftFormState>(EMPTY_SHIFT_FORM_STATE);
  const [qrAttendanceMode, setQrAttendanceMode] = useState("disabled");
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (shift && open) {
      setForm(shiftToFormState(shift));
      const s = shift as any;
      setQrAttendanceMode(s.qr_attendance_mode || "disabled");
      setQrToken(s.qr_token || null);
    }
  }, [shift, open]);

  if (!shift) return null;
  if (shift.status === "locked") return null;

  // Compute assigned employee IDs for admin validation
  const shiftAssignedIds = assignments
    .filter(a => a.shift_id === shift.id && a.status !== "rejected" && a.status !== "removed")
    .map(a => a.employee_id);
  const adminIsAssigned = !form.shiftAdminId || shiftAssignedIds.includes(form.shiftAdminId);
  const adminMissing = !form.shiftAdminId && shiftAssignedIds.length > 0;
  const adminError = adminMissing
    ? "Obligatorio: selecciona un responsable antes de guardar."
    : (form.shiftAdminId && !adminIsAssigned && shiftAssignedIds.length > 0
        ? "El admin seleccionado no está asignado al turno."
        : null);

  // Detect material changes that would require re-acceptance
  const s = shift as any;
  const hasMaterialChange =
    form.date !== s.date ||
    form.startTime !== s.start_time?.slice(0, 5) ||
    form.endTime !== s.end_time?.slice(0, 5) ||
    form.locationId !== (s.location_id || "") ||
    form.title.trim() !== (s.title || "") ||
    form.meetingPoint.trim() !== (s.meeting_point || "") ||
    form.notes.trim() !== (s.notes || "") ||
    form.specialInstructions.trim() !== (s.special_instructions || "") ||
    form.payType !== (s.pay_type || "hourly");

  const hasAcceptedAssignments = shiftAssignedIds.length > 0;

  const handleSave = async () => {
    if (!form.date) return;
    if (shiftAssignedIds.length > 0 && !form.shiftAdminId) {
      toast.error("Selecciona un admin del turno antes de guardar. El responsable operativo es obligatorio.");
      return;
    }
    if (form.shiftAdminId && shiftAssignedIds.length > 0 && !shiftAssignedIds.includes(form.shiftAdminId)) {
      toast.error("El admin del turno debe ser uno de los empleados asignados.");
      return;
    }
    setSaving(true);
    try {
      const payload = formStateToShiftPayload(form, allowClaims);
      await onSave(shift.id, { ...payload, qr_attendance_mode: qrAttendanceMode }, shift);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] p-0 gap-0 overflow-hidden flex flex-col rounded-2xl border-border/30 shadow-xl">
        {/* Hero header */}
        <div className="relative px-5 pt-5 pb-4 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-primary/5 -translate-y-12 translate-x-12 blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold font-[var(--font-heading)]">Editar turno</h2>
              <button onClick={() => onOpenChange(false)} className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">Modifica los detalles del turno</p>
          </div>
        </div>

        {/* Scrollable body — uses the shared ShiftFormFields component */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <ShiftFormFields
            mode="edit"
            companyId={(shift as any).company_id ?? null}
            value={form}
            onChange={(patch) => setForm(prev => ({ ...prev, ...patch }))}
            clients={clients}
            locations={locations}
            employees={employees}
            assignments={assignments as any}
            allowClaims={allowClaims}
            shift={shift}
            qrAttendanceMode={qrAttendanceMode}
            qrToken={qrToken}
            onQrUpdate={(updates) => {
              if (updates.qr_attendance_mode !== undefined) setQrAttendanceMode(updates.qr_attendance_mode);
              if (updates.qr_token !== undefined) setQrToken(updates.qr_token);
            }}
            adminError={adminError}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/30 bg-muted/10 space-y-2">
          {hasMaterialChange && hasAcceptedAssignments && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[hsl(var(--status-pending)/0.08)] border border-[hsl(var(--status-pending)/0.2)]">
              <AlertCircle className="h-4 w-4 text-[hsl(var(--status-pending))] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[hsl(var(--status-pending))] font-medium leading-snug">
                Este cambio requerirá nueva aceptación de los {shiftAssignedIds.length} empleado{shiftAssignedIds.length > 1 ? "s" : ""} asignado{shiftAssignedIds.length > 1 ? "s" : ""}.
              </p>
            </div>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || !form.date || (shiftAssignedIds.length > 0 && (!form.shiftAdminId || !adminIsAssigned))}
            className="w-full h-10 text-sm gap-2 rounded-xl font-semibold"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
