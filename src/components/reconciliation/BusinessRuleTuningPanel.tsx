import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Settings2, Plus, Trash2, BookOpen, Sparkles } from "lucide-react";

interface BusinessRule {
  id: string;
  company_id: string;
  rule_key: string;
  rule_label: string;
  rule_type: string;
  match_field: string;
  match_operator: string;
  match_value: string;
  result_pay_type: string;
  result_description: string | null;
  applies_to_employee: string | null;
  priority: number;
  is_active: boolean;
}

interface LearnedRule {
  id: string;
  rule_label: string;
  source_type: string;
  match_criteria: any;
  result_action: any;
  employee_id: string | null;
  usage_count: number;
  created_at: string;
}

interface Props {
  companyId: string | null;
  employees: Map<string, string>;
}

const PAY_TYPES = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily Pay" },
  { value: "daily_half", label: "Half Day" },
  { value: "pay_ride", label: "Ride Regular" },
  { value: "pay_ride_special", label: "Ride Especial" },
  { value: "weekend_job", label: "Weekend Job" },
  { value: "manual_adjustment", label: "Ajuste Manual" },
];

const MATCH_OPERATORS = [
  { value: "equals", label: "= Exacto" },
  { value: "range", label: "Rango" },
  { value: "contains", label: "Contiene" },
  { value: "pattern", label: "Patrón múltiplo" },
];

const MATCH_FIELDS = [
  { value: "amount", label: "Monto ($)" },
  { value: "description", label: "Descripción" },
  { value: "hours", label: "Horas" },
  { value: "job_title", label: "Título de turno" },
];

const PRESET_RULES = [
  { key: "daily_200", label: "Día completo = $200", field: "amount", op: "equals", value: "200", payType: "daily", desc: "$200 = 1 día completo" },
  { key: "daily_125", label: "Medio día = $125", field: "amount", op: "equals", value: "125", payType: "daily_half", desc: "$125 = medio día" },
  { key: "ride_100", label: "Ride regular = $100", field: "amount", op: "equals", value: "100", payType: "pay_ride", desc: "$100 = transporte regular" },
  { key: "ride_160", label: "Ride especial = $160", field: "amount", op: "equals", value: "160", payType: "pay_ride_special", desc: "$160 = transporte especial" },
  { key: "daily_525", label: "2.5 días = $525", field: "amount", op: "equals", value: "525", payType: "daily", desc: "2 días + 1 medio día" },
  { key: "daily_600", label: "2 días = $600 (patrón)", field: "amount", op: "equals", value: "600", payType: "daily", desc: "Patrón: 2 días completos @$300" },
  { key: "daily_900", label: "3 días = $900 (patrón)", field: "amount", op: "equals", value: "900", payType: "daily", desc: "Patrón: 3 días completos @$300" },
];

export default function BusinessRuleTuningPanel({ companyId, employees }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [learnedRules, setLearnedRules] = useState<LearnedRule[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    rule_key: "", rule_label: "", match_field: "amount", match_operator: "equals",
    match_value: "", result_pay_type: "daily", result_description: "",
    applies_to_employee: "", priority: 10,
  });

  const loadRules = useCallback(async () => {
    if (!companyId) return;
    const [{ data: r }, { data: lr }] = await Promise.all([
      supabase.from("reconciliation_business_rules" as any).select("*").eq("company_id", companyId).order("priority"),
      supabase.from("reconciliation_learned_rules" as any).select("*").eq("company_id", companyId).order("usage_count", { ascending: false }),
    ]);
    setRules((r || []) as any);
    setLearnedRules((lr || []) as any);
  }, [companyId]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const saveRule = async () => {
    if (!companyId || !user?.id || !form.rule_key || !form.match_value) return;
    await supabase.from("reconciliation_business_rules" as any).upsert({
      company_id: companyId,
      rule_key: form.rule_key,
      rule_label: form.rule_label || form.rule_key,
      match_field: form.match_field,
      match_operator: form.match_operator,
      match_value: form.match_value,
      result_pay_type: form.result_pay_type,
      result_description: form.result_description || null,
      applies_to_employee: form.applies_to_employee || null,
      priority: form.priority,
      is_active: true,
      created_by: user.id,
    } as any, { onConflict: "company_id,rule_key" });
    toast({ title: "Regla guardada" });
    setShowAdd(false);
    setForm({ rule_key: "", rule_label: "", match_field: "amount", match_operator: "equals", match_value: "", result_pay_type: "daily", result_description: "", applies_to_employee: "", priority: 10 });
    loadRules();
  };

  const toggleRule = async (id: string, active: boolean) => {
    await supabase.from("reconciliation_business_rules" as any).update({ is_active: active } as any).eq("id", id);
    loadRules();
  };

  const deleteRule = async (id: string) => {
    await supabase.from("reconciliation_business_rules" as any).delete().eq("id", id);
    loadRules();
  };

  const applyPreset = async (preset: typeof PRESET_RULES[0]) => {
    if (!companyId || !user?.id) return;
    await supabase.from("reconciliation_business_rules" as any).upsert({
      company_id: companyId,
      rule_key: preset.key,
      rule_label: preset.label,
      match_field: preset.field,
      match_operator: preset.op,
      match_value: preset.value,
      result_pay_type: preset.payType,
      result_description: preset.desc,
      priority: 10,
      is_active: true,
      created_by: user.id,
    } as any, { onConflict: "company_id,rule_key" });
    toast({ title: `Regla "${preset.label}" aplicada` });
    loadRules();
  };

  const promoteLearnedRule = async (lr: LearnedRule) => {
    if (!companyId || !user?.id) return;
    const key = `learned_${lr.id.slice(0, 8)}`;
    const criteria = lr.match_criteria || {};
    await supabase.from("reconciliation_business_rules" as any).upsert({
      company_id: companyId,
      rule_key: key,
      rule_label: lr.rule_label,
      match_field: criteria.field || "amount",
      match_operator: criteria.operator || "equals",
      match_value: criteria.value || "",
      result_pay_type: (lr.result_action || {}).pay_type || "manual_adjustment",
      result_description: `Promovido desde regla aprendida (usado ${lr.usage_count}x)`,
      applies_to_employee: lr.employee_id,
      priority: 5,
      is_active: true,
      created_by: user.id,
    } as any, { onConflict: "company_id,rule_key" });
    toast({ title: "Regla promovida a permanente" });
    loadRules();
  };

  return (
    <div className="space-y-6">
      {/* Presets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Reglas Predefinidas (Quality Staff)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PRESET_RULES.map(p => {
              const exists = rules.some(r => r.rule_key === p.key);
              return (
                <Button key={p.key} variant={exists ? "default" : "outline"} size="sm" onClick={() => applyPreset(p)} disabled={exists} className="text-xs gap-1">
                  {exists ? "✓" : "+"} {p.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Active Rules */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-5 w-5" /> Reglas de Clasificación ({rules.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
            <Plus className="h-3 w-3" /> Nueva Regla
          </Button>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay reglas configuradas. Usa los presets o crea una nueva.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Regla</TableHead>
                  <TableHead className="text-xs">Campo</TableHead>
                  <TableHead className="text-xs">Operador</TableHead>
                  <TableHead className="text-xs">Valor</TableHead>
                  <TableHead className="text-xs">→ Tipo Pago</TableHead>
                  <TableHead className="text-xs">Empleado</TableHead>
                  <TableHead className="text-xs text-center">Activa</TableHead>
                  <TableHead className="text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(r => (
                  <TableRow key={r.id} className={!r.is_active ? "opacity-50" : ""}>
                    <TableCell className="text-xs font-medium">{r.rule_label}</TableCell>
                    <TableCell className="text-xs">{MATCH_FIELDS.find(f => f.value === r.match_field)?.label || r.match_field}</TableCell>
                    <TableCell className="text-xs">{MATCH_OPERATORS.find(o => o.value === r.match_operator)?.label || r.match_operator}</TableCell>
                    <TableCell className="text-xs font-mono">{r.match_value}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{PAY_TYPES.find(t => t.value === r.result_pay_type)?.label || r.result_pay_type}</Badge></TableCell>
                    <TableCell className="text-xs">{r.applies_to_employee ? (employees.get(r.applies_to_employee) || "—") : "Todos"}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={r.is_active} onCheckedChange={v => toggleRule(r.id, v)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => deleteRule(r.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Learned Rules */}
      {learnedRules.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> Reglas Aprendidas ({learnedRules.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Regla</TableHead>
                  <TableHead className="text-xs">Criterio</TableHead>
                  <TableHead className="text-xs">Acción</TableHead>
                  <TableHead className="text-xs text-center">Usos</TableHead>
                  <TableHead className="text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {learnedRules.map(lr => (
                  <TableRow key={lr.id}>
                    <TableCell className="text-xs font-medium">{lr.rule_label}</TableCell>
                    <TableCell className="text-xs font-mono">{JSON.stringify(lr.match_criteria).slice(0, 60)}</TableCell>
                    <TableCell className="text-xs font-mono">{JSON.stringify(lr.result_action).slice(0, 60)}</TableCell>
                    <TableCell className="text-xs text-center font-mono">{lr.usage_count}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => promoteLearnedRule(lr)} className="text-xs">
                        Promover
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Add Rule Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Regla de Clasificación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Clave única</Label>
                <Input value={form.rule_key} onChange={e => setForm(f => ({ ...f, rule_key: e.target.value }))} placeholder="custom_rule_1" />
              </div>
              <div>
                <Label className="text-xs">Etiqueta</Label>
                <Input value={form.rule_label} onChange={e => setForm(f => ({ ...f, rule_label: e.target.value }))} placeholder="Mi regla personalizada" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Campo</Label>
                <Select value={form.match_field} onValueChange={v => setForm(f => ({ ...f, match_field: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATCH_FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Operador</Label>
                <Select value={form.match_operator} onValueChange={v => setForm(f => ({ ...f, match_operator: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATCH_OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Valor</Label>
                <Input value={form.match_value} onChange={e => setForm(f => ({ ...f, match_value: e.target.value }))} placeholder="200" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo de Pago Resultante</Label>
                <Select value={form.result_pay_type} onValueChange={v => setForm(f => ({ ...f, result_pay_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Prioridad</Label>
                <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Descripción</Label>
              <Input value={form.result_description} onChange={e => setForm(f => ({ ...f, result_description: e.target.value }))} placeholder="Explicación de la regla..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button onClick={saveRule} disabled={!form.rule_key || !form.match_value}>Guardar Regla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
