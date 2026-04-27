/**
 * AdvancedDetailsSection — collapsible block for non-essential fields.
 *  - Internal notes (admin-only)
 *  - Attendance mode + clock method
 *  - QR section (edit only)
 */
import { memo, useState } from "react";
import { ChevronDown, FileText, ScanLine, QrCode } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";
import { ShiftQRSection } from "../ShiftQRSection";
import {
  SHIFT_ATTENDANCE_MODE_LABELS,
  SHIFT_ATTENDANCE_MODE_HINTS,
  type ShiftAttendanceMode,
} from "@/lib/shift-attendance-mode";
import type { Shift } from "../types";

interface Props {
  mode: "create" | "edit";
  notes: string;
  attendanceMode: ShiftAttendanceMode;
  clockMethod: "mobile" | "kiosk" | "both";
  shift?: Shift | null;
  qrAttendanceMode?: string;
  qrToken?: string | null;
  onQrUpdate?: (updates: { qr_attendance_mode?: string; qr_token?: string | null }) => void;
  onChange: (patch: {
    notes?: string;
    attendanceMode?: ShiftAttendanceMode;
    clockMethod?: "mobile" | "kiosk" | "both";
  }) => void;
}

function AdvancedDetailsSectionImpl({
  mode,
  notes,
  attendanceMode,
  clockMethod,
  shift,
  qrAttendanceMode,
  qrToken,
  onQrUpdate,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <SectionCard
      icon={FileText}
      title="Detalles adicionales"
      subtitle="Notas internas, fichaje y opciones avanzadas."
      action={
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            {open ? "Ocultar" : "Mostrar"}
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
        </Collapsible>
      }
    >
      <Collapsible open={open}>
        <CollapsibleContent className="space-y-3">
          <div>
            <Label className="text-[11px] text-muted-foreground font-medium">
              Notas internas <span className="text-muted-foreground/40">(solo admins)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              rows={2}
              placeholder="Información operativa visible solo para admins…"
              className="text-sm resize-none mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <ScanLine className="h-3 w-3" /> Modo de asistencia
              </Label>
              <Select
                value={attendanceMode}
                onValueChange={(val) => onChange({ attendanceMode: val as ShiftAttendanceMode })}
              >
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clock">{SHIFT_ATTENDANCE_MODE_LABELS.clock}</SelectItem>
                  <SelectItem value="arrival">{SHIFT_ATTENDANCE_MODE_LABELS.arrival}</SelectItem>
                  <SelectItem value="hybrid">{SHIFT_ATTENDANCE_MODE_LABELS.hybrid}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium">Método de fichaje</Label>
              <Select
                value={clockMethod}
                onValueChange={(val) => onChange({ clockMethod: val as "mobile" | "kiosk" | "both" })}
              >
                <SelectTrigger className="h-9 text-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Móvil + Kiosk</SelectItem>
                  <SelectItem value="mobile">Solo Móvil</SelectItem>
                  <SelectItem value="kiosk">Solo Kiosk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-1.5">
            {SHIFT_ATTENDANCE_MODE_HINTS[attendanceMode]}
          </p>

          {mode === "edit" && shift && onQrUpdate && (
            <div className="pt-2 border-t border-border/30">
              <div className="flex items-center gap-1.5 mb-2">
                <QrCode className="h-3 w-3 text-primary" />
                <span className="text-[11px] font-semibold text-foreground">Asistencia por QR</span>
              </div>
              <ShiftQRSection
                shiftId={shift.id}
                qrToken={qrToken ?? null}
                qrAttendanceMode={qrAttendanceMode ?? "disabled"}
                onUpdate={onQrUpdate}
              />
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </SectionCard>
  );
}

export const AdvancedDetailsSection = memo(AdvancedDetailsSectionImpl);
