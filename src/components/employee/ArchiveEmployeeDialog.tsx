import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Archive, Loader2 } from "lucide-react";

const ARCHIVE_REASONS = [
  { value: "voluntary_resignation", label: "Renuncia voluntaria" },
  { value: "termination", label: "Terminación" },
  { value: "contract_end", label: "Fin de contrato" },
  { value: "no_show", label: "No show / Abandono" },
  { value: "performance", label: "Rendimiento" },
  { value: "conduct", label: "Conducta" },
  { value: "restructuring", label: "Reestructuración" },
  { value: "other", label: "Otro" },
];

interface ArchiveEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: { id: string; first_name: string; last_name: string; company_id: string };
  onArchived: () => void;
}

export function ArchiveEmployeeDialog({ open, onOpenChange, employee, onArchived }: ArchiveEmployeeDialogProps) {
  const { user } = useAuth();
  const { logAudit } = useAuditLog();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [eligibleForRehire, setEligibleForRehire] = useState(true);
  const [busy, setBusy] = useState(false);

  const canSubmit = reason && effectiveDate;

  const handleArchive = async () => {
    if (!canSubmit || !user?.id) return;
    setBusy(true);

    try {
      // 1. Create archive record
      const { error: archiveErr } = await supabase
        .from("employee_archive_records" as any)
        .insert({
          employee_id: employee.id,
          company_id: employee.company_id,
          reason,
          effective_date: effectiveDate,
          notes: notes.trim() || null,
          eligible_for_rehire: eligibleForRehire,
          archived_by: user.id,
        } as any);

      if (archiveErr) throw archiveErr;

      // 2. Deactivate employee
      const { error: updateErr } = await supabase
        .from("employees")
        .update({
          is_active: false,
          end_date: effectiveDate,
        } as any)
        .eq("id", employee.id);

      if (updateErr) throw updateErr;

      // 3. Audit log
      await logAudit({
        action: "delete",
        entityType: "employee",
        entityId: employee.id,
        details: {
          reason,
          effective_date: effectiveDate,
          eligible_for_rehire: eligibleForRehire,
          archive_type: "deactivation",
        },
        newData: { is_active: false, reason, eligible_for_rehire: eligibleForRehire },
        oldData: { is_active: true },
      });

      toast({ title: "Empleado archivado", description: `${employee.first_name} ${employee.last_name} ha sido desactivado.` });
      onArchived();
      onOpenChange(false);
      setReason("");
      setNotes("");
      setEligibleForRehire(true);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Error al archivar", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-destructive" />
            Archivar empleado
          </DialogTitle>
          <DialogDescription>
            Desactivar a <strong>{employee.first_name} {employee.last_name}</strong>. Se requiere motivo obligatorio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Reason */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Motivo de archivo <span className="text-destructive">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecciona un motivo" />
              </SelectTrigger>
              <SelectContent>
                {ARCHIVE_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Effective date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Fecha efectiva <span className="text-destructive">*</span></Label>
            <Input
              type="date"
              value={effectiveDate}
              onChange={e => setEffectiveDate(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notas internas</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Detalles adicionales sobre la desactivación..."
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          {/* Rehire eligibility */}
          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Elegible para recontratación</p>
              <p className="text-[10px] text-muted-foreground">Si se marca "No", se mostrará alerta si intenta registrarse de nuevo</p>
            </div>
            <Switch checked={eligibleForRehire} onCheckedChange={setEligibleForRehire} />
          </div>

          {/* Warning */}
          {!eligibleForRehire && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">
                Este empleado quedará marcado como <strong>no recontratable</strong>. Si intenta aplicar de nuevo, el sistema alertará al administrador.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={!canSubmit || busy}
              className="flex-1 gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              {busy ? "Archivando..." : "Archivar empleado"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
