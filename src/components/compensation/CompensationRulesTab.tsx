import { useState } from "react";
import { useCompensationRules, useCompensationMutations, type CompensationRule, type CompRuleType } from "@/hooks/useCompensation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, DollarSign, Car, CalendarDays, Clock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

const RULE_TYPE_CONFIG: Record<CompRuleType, { label: string; icon: any; color: string }> = {
  hourly_default: { label: "Tarifa por hora", icon: Clock, color: "text-blue-500" },
  daily_full: { label: "Día completo", icon: CalendarDays, color: "text-emerald-500" },
  daily_half: { label: "Medio día", icon: CalendarDays, color: "text-amber-500" },
  ride_regular: { label: "Ride regular", icon: Car, color: "text-purple-500" },
  ride_special: { label: "Ride especial", icon: Car, color: "text-pink-500" },
  custom_daily_pattern: { label: "Patrón diario", icon: DollarSign, color: "text-orange-500" },
};

const UNIT_LABELS: Record<string, string> = { hour: "Hora", day: "Día", half_day: "½ Día", ride: "Ride", custom: "Otro" };

export default function CompensationRulesTab() {
  const { role, hasActionPermission } = useAuth();
  const { data: rules, isLoading } = useCompensationRules();
  const { saveRule, deleteRule } = useCompensationMutations();
  const [editRule, setEditRule] = useState<Partial<CompensationRule> | null>(null);
  const [saving, setSaving] = useState(false);

  const canEdit = role === "owner" || role === "admin" || role === "developer" || hasActionPermission("manage_compensation");

  const grouped = (rules ?? []).reduce<Record<string, CompensationRule[]>>((acc, r) => {
    (acc[r.rule_type] ??= []).push(r);
    return acc;
  }, {});

  const handleSave = async () => {
    if (!editRule) return;
    setSaving(true);
    try {
      await saveRule(editRule);
      toast.success(editRule.id ? "Regla actualizada" : "Regla creada");
      setEditRule(null);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRule(id);
      toast.success("Regla eliminada");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditRule({ rule_type: "hourly_default", rule_name: "", amount: 0, unit_type: "hour", is_active: true, priority: 0 })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nueva regla
          </Button>
        </div>
      )}

      {Object.entries(RULE_TYPE_CONFIG).map(([type, cfg]) => {
        const items = grouped[type] ?? [];
        const Icon = cfg.icon;
        return (
          <Card key={type} className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Icon className={`h-4 w-4 ${cfg.color}`} />
                {cfg.label}
              </CardTitle>
              <CardDescription className="text-xs">{items.length} regla(s) configurada(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Sin reglas definidas</p>
              ) : (
                <div className="space-y-2">
                  {items.map(r => (
                    <div key={r.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-sm">${r.amount}</span>
                        <span className="text-xs text-muted-foreground">/ {UNIT_LABELS[r.unit_type] ?? r.unit_type}</span>
                        <span className="text-xs font-medium">{r.rule_name}</span>
                        {r.applies_to_role && <Badge variant="outline" className="text-[10px]">{r.applies_to_role}</Badge>}
                        {!r.is_active && <Badge variant="destructive" className="text-[10px]">Inactivo</Badge>}
                      </div>
                      {canEdit && (
                        <div className="flex gap-1">
                          <Button size="xs" variant="ghost" onClick={() => setEditRule(r)}><Pencil className="h-3 w-3" /></Button>
                          <Button size="xs" variant="ghost" className="text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Edit/Create Dialog */}
      <Dialog open={!!editRule} onOpenChange={o => !o && setEditRule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editRule?.id ? "Editar regla" : "Nueva regla de compensación"}</DialogTitle>
          </DialogHeader>
          {editRule && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={editRule.rule_type} onValueChange={v => setEditRule(r => ({ ...r, rule_type: v as CompRuleType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RULE_TYPE_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nombre</Label>
                  <Input value={editRule.rule_name ?? ""} onChange={e => setEditRule(r => ({ ...r, rule_name: e.target.value }))} placeholder="Ej: Waiter regular" />
                </div>
                <div>
                  <Label className="text-xs">Monto ($)</Label>
                  <Input type="number" value={editRule.amount ?? ""} onChange={e => setEditRule(r => ({ ...r, amount: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Unidad</Label>
                  <Select value={editRule.unit_type ?? "hour"} onValueChange={v => setEditRule(r => ({ ...r, unit_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(UNIT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Prioridad</Label>
                  <Input type="number" value={editRule.priority ?? 0} onChange={e => setEditRule(r => ({ ...r, priority: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Aplica a rol</Label>
                  <Input value={editRule.applies_to_role ?? ""} onChange={e => setEditRule(r => ({ ...r, applies_to_role: e.target.value || null }))} placeholder="Opcional" />
                </div>
                <div>
                  <Label className="text-xs">Aplica a puesto</Label>
                  <Input value={editRule.applies_to_job ?? ""} onChange={e => setEditRule(r => ({ ...r, applies_to_job: e.target.value || null }))} placeholder="Opcional" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notas</Label>
                <Input value={editRule.notes ?? ""} onChange={e => setEditRule(r => ({ ...r, notes: e.target.value || null }))} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editRule.is_active ?? true} onCheckedChange={v => setEditRule(r => ({ ...r, is_active: v }))} />
                <Label className="text-xs">Activo</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRule(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !editRule?.rule_name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editRule?.id ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
