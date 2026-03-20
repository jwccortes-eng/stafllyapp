import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompensationMutations, type CompensationProfile } from "@/hooks/useCompensation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const NUM_FIELDS = [
  "default_hourly_rate", "default_daily_rate", "default_half_day_rate",
  "default_ride_rate_regular", "default_ride_rate_special",
  "overtime_hourly_rate", "kitchen_hourly_rate",
  "bonus_transport_hourly_rate", "double_pay_hourly_rate",
] as const;

type NumField = typeof NUM_FIELDS[number];

export function CompensationChangeForm({
  open, onOpenChange, employeeId, employeeName, currentProfile,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  employeeName: string;
  currentProfile: CompensationProfile | null;
}) {
  const { upsertProfile } = useCompensationMutations();
  const [saving, setSaving] = useState(false);

  const init = (f: NumField) => currentProfile?.[f]?.toString() ?? "";

  const [form, setForm] = useState({
    payment_mode: currentProfile?.payment_mode ?? "hourly",
    default_hourly_rate: init("default_hourly_rate"),
    default_daily_rate: init("default_daily_rate"),
    default_half_day_rate: init("default_half_day_rate"),
    default_ride_rate_regular: init("default_ride_rate_regular"),
    default_ride_rate_special: init("default_ride_rate_special"),
    overtime_hourly_rate: init("overtime_hourly_rate"),
    kitchen_hourly_rate: init("kitchen_hourly_rate"),
    bonus_transport_hourly_rate: init("bonus_transport_hourly_rate"),
    double_pay_hourly_rate: init("double_pay_hourly_rate"),
    effective_from: new Date().toISOString().split("T")[0],
    reason: "",
  });

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const changedFields: { field: string; oldVal: string | null; newVal: string | null }[] = [];
      for (const f of NUM_FIELDS) {
        const newVal = form[f] ? Number(form[f]) : null;
        const oldVal = currentProfile?.[f] ?? null;
        if (newVal !== oldVal) {
          changedFields.push({ field: f, oldVal: oldVal != null ? String(oldVal) : null, newVal: newVal != null ? String(newVal) : null });
        }
      }
      if (form.payment_mode !== (currentProfile?.payment_mode ?? "hourly")) {
        changedFields.push({ field: "payment_mode", oldVal: currentProfile?.payment_mode ?? null, newVal: form.payment_mode });
      }

      const numPayload: Record<string, number | null> = {};
      for (const f of NUM_FIELDS) numPayload[f] = form[f] ? Number(form[f]) : null;

      await upsertProfile(employeeId, {
        payment_mode: form.payment_mode as any,
        ...numPayload,
        effective_from: form.effective_from,
        rate_source: "employee_custom" as any,
        hourly_rate_override_manual: true,
      } as any, {
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

  const RateInput = ({ label, field }: { label: string; field: string }) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={(form as any)[field]} onChange={e => set(field, e.target.value)} placeholder="—" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Cambiar compensación — {employeeName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Modo de pago</Label>
            <Select value={form.payment_mode} onValueChange={v => set("payment_mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Por hora</SelectItem>
                <SelectItem value="daily">Por día</SelectItem>
                <SelectItem value="mixed">Mixto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="daily" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="daily">Día / Pieza</TabsTrigger>
              <TabsTrigger value="hourly">Por Hora</TabsTrigger>
              <TabsTrigger value="rides">Rides</TabsTrigger>
            </TabsList>

            <TabsContent value="daily" className="grid grid-cols-2 gap-3 pt-2">
              <RateInput label="Día completo ($)" field="default_daily_rate" />
              <RateInput label="Medio día ($)" field="default_half_day_rate" />
            </TabsContent>

            <TabsContent value="hourly" className="grid grid-cols-2 gap-3 pt-2">
              <RateInput label="Hora regular ($)" field="default_hourly_rate" />
              <RateInput label="Hora overtime ($)" field="overtime_hourly_rate" />
              <RateInput label="Hora kitchen ($)" field="kitchen_hourly_rate" />
              <RateInput label="Hora transporte ($)" field="bonus_transport_hourly_rate" />
              <RateInput label="Hora doble ($)" field="double_pay_hourly_rate" />
            </TabsContent>

            <TabsContent value="rides" className="grid grid-cols-2 gap-3 pt-2">
              <RateInput label="Ride regular ($)" field="default_ride_rate_regular" />
              <RateInput label="Ride especial ($)" field="default_ride_rate_special" />
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Vigente desde</Label>
              <Input type="date" value={form.effective_from} onChange={e => set("effective_from", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Razón del cambio</Label>
              <Input value={form.reason} onChange={e => set("reason", e.target.value)} placeholder="Ej: Aumento" />
            </div>
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
