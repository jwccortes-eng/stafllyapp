import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Banknote, Shield } from "lucide-react";

interface Policy {
  id?: string;
  advances_enabled: boolean;
  loans_enabled: boolean;
  require_approval: boolean;
  max_advance_amount: number | null;
  max_loan_amount: number | null;
  max_deduction_percent_of_net: number | null;
  protect_minimum_net_pay_amount: number | null;
  allow_multiple_active: boolean;
  deduction_priority: string;
  default_repayment_mode: string;
  default_fixed_amount: number | null;
  default_percentage: number | null;
  allow_transport_advances: boolean;
  allow_outside_payroll_repayments: boolean;
}

const DEFAULTS: Policy = {
  advances_enabled: true,
  loans_enabled: true,
  require_approval: true,
  max_advance_amount: null,
  max_loan_amount: null,
  max_deduction_percent_of_net: null,
  protect_minimum_net_pay_amount: null,
  allow_multiple_active: true,
  deduction_priority: "oldest_first",
  default_repayment_mode: "fixed_amount",
  default_fixed_amount: null,
  default_percentage: null,
  allow_transport_advances: true,
  allow_outside_payroll_repayments: true,
};

export default function CompanyFinancialPolicies() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const [policy, setPolicy] = useState<Policy>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    supabase
      .from("company_financial_policies")
      .select("*")
      .eq("company_id", selectedCompanyId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPolicy({
            id: data.id,
            advances_enabled: data.advances_enabled,
            loans_enabled: data.loans_enabled,
            require_approval: data.require_approval,
            max_advance_amount: data.max_advance_amount,
            max_loan_amount: data.max_loan_amount,
            max_deduction_percent_of_net: data.max_deduction_percent_of_net,
            protect_minimum_net_pay_amount: data.protect_minimum_net_pay_amount,
            allow_multiple_active: data.allow_multiple_active,
            deduction_priority: data.deduction_priority ?? "oldest_first",
            default_repayment_mode: data.default_repayment_mode ?? "fixed_amount",
            default_fixed_amount: data.default_fixed_amount,
            default_percentage: data.default_percentage,
            allow_transport_advances: data.allow_transport_advances,
            allow_outside_payroll_repayments: data.allow_outside_payroll_repayments,
          });
        }
        setLoading(false);
      });
  }, [selectedCompanyId]);

  const handleSave = async () => {
    if (!selectedCompanyId) return;
    setSaving(true);

    const payload = {
      company_id: selectedCompanyId,
      advances_enabled: policy.advances_enabled,
      loans_enabled: policy.loans_enabled,
      require_approval: policy.require_approval,
      max_advance_amount: policy.max_advance_amount,
      max_loan_amount: policy.max_loan_amount,
      max_deduction_percent_of_net: policy.max_deduction_percent_of_net,
      protect_minimum_net_pay_amount: policy.protect_minimum_net_pay_amount,
      allow_multiple_active: policy.allow_multiple_active,
      deduction_priority: policy.deduction_priority as any,
      default_repayment_mode: policy.default_repayment_mode as any,
      default_fixed_amount: policy.default_fixed_amount,
      default_percentage: policy.default_percentage,
      allow_transport_advances: policy.allow_transport_advances,
      allow_outside_payroll_repayments: policy.allow_outside_payroll_repayments,
    };

    if (policy.id) {
      const { error } = await supabase
        .from("company_financial_policies")
        .update(payload)
        .eq("id", policy.id);
      if (error) toast.error("Error guardando: " + error.message);
      else toast.success("Políticas actualizadas");
    } else {
      const { data, error } = await supabase
        .from("company_financial_policies")
        .insert(payload)
        .select("id")
        .single();
      if (error) toast.error("Error guardando: " + error.message);
      else {
        setPolicy(prev => ({ ...prev, id: data.id }));
        toast.success("Políticas creadas");
      }
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const update = (key: keyof Policy, value: any) => setPolicy(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/[0.08] flex items-center justify-center">
          <Banknote className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Políticas de anticipos y préstamos</h2>
          <p className="text-xs text-muted-foreground">Configura reglas de negocio para este módulo financiero</p>
        </div>
      </div>

      {/* Enable/disable */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Módulos habilitados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Anticipos de nómina</Label>
            <Switch checked={policy.advances_enabled} onCheckedChange={v => update("advances_enabled", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Préstamos a empleados</Label>
            <Switch checked={policy.loans_enabled} onCheckedChange={v => update("loans_enabled", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Anticipos de transporte</Label>
            <Switch checked={policy.allow_transport_advances} onCheckedChange={v => update("allow_transport_advances", v)} />
          </div>
        </CardContent>
      </Card>

      {/* Approval */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" /> Aprobación y control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Requiere aprobación antes de activar</Label>
            <Switch checked={policy.require_approval} onCheckedChange={v => update("require_approval", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Permitir múltiples registros activos por empleado</Label>
            <Switch checked={policy.allow_multiple_active} onCheckedChange={v => update("allow_multiple_active", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Permitir pagos fuera de nómina</Label>
            <Switch checked={policy.allow_outside_payroll_repayments} onCheckedChange={v => update("allow_outside_payroll_repayments", v)} />
          </div>
        </CardContent>
      </Card>

      {/* Limits */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Límites</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Monto máximo anticipo ($)</Label>
              <Input
                type="number" min="0" step="100"
                value={policy.max_advance_amount ?? ""}
                onChange={e => update("max_advance_amount", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="Sin límite"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Monto máximo préstamo ($)</Label>
              <Input
                type="number" min="0" step="100"
                value={policy.max_loan_amount ?? ""}
                onChange={e => update("max_loan_amount", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="Sin límite"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Máx. deducción % del neto</Label>
              <Input
                type="number" min="1" max="100" step="5"
                value={policy.max_deduction_percent_of_net ?? ""}
                onChange={e => update("max_deduction_percent_of_net", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="Sin límite"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Neto mínimo protegido ($)</Label>
              <Input
                type="number" min="0" step="50"
                value={policy.protect_minimum_net_pay_amount ?? ""}
                onChange={e => update("protect_minimum_net_pay_amount", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="Sin protección"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Defaults */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Valores por defecto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Modo de repago por defecto</Label>
              <Select value={policy.default_repayment_mode} onValueChange={v => update("default_repayment_mode", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_amount">Monto fijo</SelectItem>
                  <SelectItem value="percentage_net">% del neto</SelectItem>
                  <SelectItem value="one_time_next">Única vez</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridad de deducción</Label>
              <Select value={policy.deduction_priority} onValueChange={v => update("deduction_priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="oldest_first">Más antiguo primero</SelectItem>
                  <SelectItem value="newest_first">Más reciente primero</SelectItem>
                  <SelectItem value="highest_balance_first">Mayor saldo primero</SelectItem>
                  <SelectItem value="manual_priority">Prioridad manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Monto fijo por defecto ($)</Label>
              <Input
                type="number" min="0" step="25"
                value={policy.default_fixed_amount ?? ""}
                onChange={e => update("default_fixed_amount", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Porcentaje por defecto (%)</Label>
              <Input
                type="number" min="1" max="100" step="5"
                value={policy.default_percentage ?? ""}
                onChange={e => update("default_percentage", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="—"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Guardar políticas
      </Button>
    </div>
  );
}
