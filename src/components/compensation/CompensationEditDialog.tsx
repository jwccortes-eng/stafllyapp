import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useQueryClient } from "@tanstack/react-query";
import { type CompensationProfile } from "@/hooks/useCompensation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Pencil, ShieldCheck, AlertTriangle } from "lucide-react";

type PayMode = "hourly" | "daily" | "mixed";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  employeeName: string;
  profile: CompensationProfile | null;
  /** Called after successful save so parent can refresh */
  onSaved?: () => void;
}

interface FormState {
  payment_mode: PayMode;
  default_hourly_rate: string;
  default_daily_rate: string;
  default_half_day_rate: string;
  overtime_hourly_rate: string;
  kitchen_hourly_rate: string;
  double_pay_hourly_rate: string;
  bonus_transport_hourly_rate: string;
  default_ride_rate_regular: string;
  default_ride_rate_special: string;
  note: string;
}

function toStr(v: number | null | undefined): string {
  return v != null ? String(v) : "";
}

export default function CompensationEditDialog({ open, onOpenChange, employeeId, employeeName, profile, onSaved }: Props) {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const initial: FormState = useMemo(() => ({
    payment_mode: (profile?.payment_mode as PayMode) ?? "hourly",
    default_hourly_rate: toStr(profile?.default_hourly_rate),
    default_daily_rate: toStr(profile?.default_daily_rate),
    default_half_day_rate: toStr(profile?.default_half_day_rate),
    overtime_hourly_rate: toStr(profile?.overtime_hourly_rate),
    kitchen_hourly_rate: toStr(profile?.kitchen_hourly_rate),
    double_pay_hourly_rate: toStr(profile?.double_pay_hourly_rate),
    bonus_transport_hourly_rate: toStr(profile?.bonus_transport_hourly_rate),
    default_ride_rate_regular: toStr(profile?.default_ride_rate_regular),
    default_ride_rate_special: toStr(profile?.default_ride_rate_special),
    note: "",
  }), [profile]);

  const [form, setForm] = useState<FormState>(initial);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  const set = (key: keyof FormState, val: string) => setForm(prev => ({ ...prev, [key]: val }));
  const numOrNull = (v: string) => v === "" ? null : Number(v);

  // Field locking based on pay_mode
  const hourlyDisabled = form.payment_mode === "daily";
  const dailyDisabled = form.payment_mode === "hourly";

  // Detect changed fields for audit
  const changedFields = useMemo(() => {
    const changes: { field: string; oldVal: string | null; newVal: string | null }[] = [];
    const fields: (keyof Omit<FormState, "note">)[] = [
      "payment_mode", "default_hourly_rate", "default_daily_rate", "default_half_day_rate",
      "overtime_hourly_rate", "kitchen_hourly_rate", "double_pay_hourly_rate",
      "bonus_transport_hourly_rate", "default_ride_rate_regular", "default_ride_rate_special",
    ];
    for (const f of fields) {
      if (form[f] !== initial[f]) {
        changes.push({ field: f, oldVal: initial[f] || null, newVal: form[f] || null });
      }
    }
    return changes;
  }, [form, initial]);

  const handleSave = async () => {
    if (!user || !selectedCompanyId) return;
    if (changedFields.length === 0) { toast.info("Sin cambios"); return; }
    setSaving(true);

    try {
      const updates: Record<string, any> = {
        payment_mode: form.payment_mode,
        default_hourly_rate: numOrNull(form.default_hourly_rate),
        default_daily_rate: numOrNull(form.default_daily_rate),
        default_half_day_rate: numOrNull(form.default_half_day_rate),
        overtime_hourly_rate: numOrNull(form.overtime_hourly_rate),
        kitchen_hourly_rate: numOrNull(form.kitchen_hourly_rate),
        double_pay_hourly_rate: numOrNull(form.double_pay_hourly_rate),
        bonus_transport_hourly_rate: numOrNull(form.bonus_transport_hourly_rate),
        default_ride_rate_regular: numOrNull(form.default_ride_rate_regular),
        default_ride_rate_special: numOrNull(form.default_ride_rate_special),
        hourly_rate_override_manual: true,
        rate_source: "employee_custom" as const,
        updated_by: user.id,
      };

      if (profile) {
        const { error } = await supabase
          .from("compensation_profiles")
          .update(updates)
          .eq("id", profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("compensation_profiles")
          .insert({
            ...updates,
            company_id: selectedCompanyId,
            employee_id: employeeId,
            effective_from: new Date().toISOString().split("T")[0],
            is_active: true,
            created_by: user.id,
          });
        if (error) throw error;
      }

      // Log each changed field
      for (const cf of changedFields) {
        await supabase.from("compensation_change_log").insert({
          company_id: selectedCompanyId,
          employee_id: employeeId,
          compensation_profile_id: profile?.id ?? null,
          action_type: "inline_table_edit" as any,
          changed_field: cf.field,
          old_value: cf.oldVal,
          new_value: cf.newVal,
          reason: form.note || "Edición rápida desde reconciliación",
          source_type: "inline_edit" as any,
          changed_by: user.id,
        });
      }

      // Invalidate all compensation queries
      qc.invalidateQueries({ queryKey: ["comp-recon-profiles"] });
      qc.invalidateQueries({ queryKey: ["comp-validation-profiles"] });
      qc.invalidateQueries({ queryKey: ["compensation-profiles"] });

      toast.success(`Compensación actualizada para ${employeeName}`);
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4" /> Editar compensación
          </DialogTitle>
          <DialogDescription className="text-sm">
            {employeeName}
            {profile?.hourly_rate_override_manual && (
              <Badge className="ml-2 text-[10px] border-0 bg-warning/10 text-warning">
                <ShieldCheck className="h-3 w-3 mr-1" /> Manual override activo
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Pay mode */}
          <div>
            <Label className="text-xs font-semibold">Modo de pago</Label>
            <Select value={form.payment_mode} onValueChange={(v) => set("payment_mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Full / Half Day</SelectItem>
                <SelectItem value="mixed">Mixto</SelectItem>
              </SelectContent>
            </Select>
            {form.payment_mode !== "mixed" && (
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {hourlyDisabled ? "Campos hourly deshabilitados en modo daily" : "Campos daily deshabilitados en modo hourly"}
              </p>
            )}
          </div>

          {/* Hourly rates */}
          <fieldset className={hourlyDisabled ? "opacity-40 pointer-events-none" : ""}>
            <legend className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">Tarifas Hourly</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hourly Rate" value={form.default_hourly_rate} onChange={v => set("default_hourly_rate", v)} />
              <Field label="Overtime" value={form.overtime_hourly_rate} onChange={v => set("overtime_hourly_rate", v)} />
              <Field label="Kitchen" value={form.kitchen_hourly_rate} onChange={v => set("kitchen_hourly_rate", v)} />
              <Field label="Double Pay" value={form.double_pay_hourly_rate} onChange={v => set("double_pay_hourly_rate", v)} />
              <Field label="Bono Transport" value={form.bonus_transport_hourly_rate} onChange={v => set("bonus_transport_hourly_rate", v)} />
            </div>
          </fieldset>

          {/* Daily rates */}
          <fieldset className={dailyDisabled ? "opacity-40 pointer-events-none" : ""}>
            <legend className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">Tarifas Daily</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Día completo" value={form.default_daily_rate} onChange={v => set("default_daily_rate", v)} />
              <Field label="Medio día" value={form.default_half_day_rate} onChange={v => set("default_half_day_rate", v)} />
            </div>
          </fieldset>

          {/* Ride rates */}
          <fieldset>
            <legend className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">Pay Ride</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Regular" value={form.default_ride_rate_regular} onChange={v => set("default_ride_rate_regular", v)} />
              <Field label="Especial" value={form.default_ride_rate_special} onChange={v => set("default_ride_rate_special", v)} />
            </div>
          </fieldset>

          {/* Note */}
          <div>
            <Label className="text-xs font-semibold">Nota de revisión (opcional)</Label>
            <Textarea
              value={form.note}
              onChange={e => set("note", e.target.value)}
              placeholder="Motivo del cambio..."
              className="h-16 text-xs"
            />
          </div>

          {/* Changes preview */}
          {changedFields.length > 0 && (
            <div className="rounded-lg bg-warning/5 border border-warning/20 p-3">
              <p className="text-[10px] font-semibold uppercase text-warning mb-1">
                {changedFields.length} campo{changedFields.length > 1 ? "s" : ""} modificado{changedFields.length > 1 ? "s" : ""}
              </p>
              <div className="space-y-0.5">
                {changedFields.map(cf => (
                  <div key={cf.field} className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground w-32 truncate">{cf.field.replace(/_/g, " ")}</span>
                    <span className="text-destructive line-through">{cf.oldVal || "—"}</span>
                    <span>→</span>
                    <span className="text-earning font-medium">{cf.newVal || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || changedFields.length === 0}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="—"
        className="h-8 text-xs"
      />
    </div>
  );
}
