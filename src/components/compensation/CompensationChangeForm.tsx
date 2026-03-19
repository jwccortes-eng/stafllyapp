import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompensationMutations, type CompensationProfile } from "@/hooks/useCompensation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function CompensationChangeForm({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  currentProfile,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  employeeName: string;
  currentProfile: CompensationProfile | null;
}) {
  const { upsertProfile } = useCompensationMutations();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    payment_mode: currentProfile?.payment_mode ?? "hourly",
    default_hourly_rate: currentProfile?.default_hourly_rate?.toString() ?? "",
    default_daily_rate: currentProfile?.default_daily_rate?.toString() ?? "",
    default_half_day_rate: currentProfile?.default_half_day_rate?.toString() ?? "",
    default_ride_rate_regular: currentProfile?.default_ride_rate_regular?.toString() ?? "",
    default_ride_rate_special: currentProfile?.default_ride_rate_special?.toString() ?? "",
    effective_from: new Date().toISOString().split("T")[0],
    reason: "",
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const changedFields: { field: string; oldVal: string | null; newVal: string | null }[] = [];
      const numFields = ["default_hourly_rate", "default_daily_rate", "default_half_day_rate", "default_ride_rate_regular", "default_ride_rate_special"] as const;
      
      for (const f of numFields) {
        const newVal = form[f] ? Number(form[f]) : null;
        const oldVal = currentProfile?.[f] ?? null;
        if (newVal !== oldVal) {
          changedFields.push({ field: f, oldVal: oldVal != null ? String(oldVal) : null, newVal: newVal != null ? String(newVal) : null });
        }
      }
      if (form.payment_mode !== (currentProfile?.payment_mode ?? "hourly")) {
        changedFields.push({ field: "payment_mode", oldVal: currentProfile?.payment_mode ?? null, newVal: form.payment_mode });
      }

      await upsertProfile(employeeId, {
        payment_mode: form.payment_mode as any,
        default_hourly_rate: form.default_hourly_rate ? Number(form.default_hourly_rate) : null,
        default_daily_rate: form.default_daily_rate ? Number(form.default_daily_rate) : null,
        default_half_day_rate: form.default_half_day_rate ? Number(form.default_half_day_rate) : null,
        default_ride_rate_regular: form.default_ride_rate_regular ? Number(form.default_ride_rate_regular) : null,
        default_ride_rate_special: form.default_ride_rate_special ? Number(form.default_ride_rate_special) : null,
        effective_from: form.effective_from,
        rate_source: "employee_custom" as any,
      }, {
        reason: form.reason || "Cambio manual desde perfil",
        sourceType: "admin_edit",
        changedFields,
      });

      toast.success("Compensación actualizada");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Error al guardar");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Cambiar compensación — {employeeName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Modo de pago</Label>
            <Select value={form.payment_mode} onValueChange={v => setForm(f => ({ ...f, payment_mode: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Por hora</SelectItem>
                <SelectItem value="daily">Por día</SelectItem>
                <SelectItem value="mixed">Mixto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tarifa hora ($)</Label>
              <Input type="number" value={form.default_hourly_rate} onChange={e => setForm(f => ({ ...f, default_hourly_rate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Tarifa día completo ($)</Label>
              <Input type="number" value={form.default_daily_rate} onChange={e => setForm(f => ({ ...f, default_daily_rate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Tarifa medio día ($)</Label>
              <Input type="number" value={form.default_half_day_rate} onChange={e => setForm(f => ({ ...f, default_half_day_rate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Ride regular ($)</Label>
              <Input type="number" value={form.default_ride_rate_regular} onChange={e => setForm(f => ({ ...f, default_ride_rate_regular: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Ride especial ($)</Label>
              <Input type="number" value={form.default_ride_rate_special} onChange={e => setForm(f => ({ ...f, default_ride_rate_special: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Vigente desde</Label>
              <Input type="date" value={form.effective_from} onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Razón del cambio</Label>
            <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Ej: Aumento por desempeño" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Guardar cambio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
