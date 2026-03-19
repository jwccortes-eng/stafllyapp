import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  prefillEmployeeId?: string;
}

export default function AdvanceLoanCreateDialog({ open, onOpenChange, onCreated, prefillEmployeeId }: Props) {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string }[]>([]);

  // Form state
  const [employeeId, setEmployeeId] = useState(prefillEmployeeId ?? "");
  const [recordType, setRecordType] = useState<string>("advance");
  const [category, setCategory] = useState<string>("payroll_advance");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [repaymentMode, setRepaymentMode] = useState("fixed_amount");
  const [fixedAmount, setFixedAmount] = useState("");
  const [percentage, setPercentage] = useState("");
  const [autoDeduct, setAutoDeduct] = useState(true);
  const [paymentSource, setPaymentSource] = useState("cash");
  const [notes, setNotes] = useState("");
  const [isTransport, setIsTransport] = useState(false);

  useEffect(() => {
    if (open && selectedCompanyId) {
      supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", selectedCompanyId)
        .eq("is_active", true)
        .order("first_name")
        .then(({ data }) => setEmployees(data ?? []));
    }
  }, [open, selectedCompanyId]);

  useEffect(() => {
    if (prefillEmployeeId) setEmployeeId(prefillEmployeeId);
  }, [prefillEmployeeId]);

  const resetForm = () => {
    setEmployeeId(prefillEmployeeId ?? "");
    setRecordType("advance");
    setCategory("payroll_advance");
    setAmount("");
    setIssueDate(new Date().toISOString().slice(0, 10));
    setRepaymentMode("fixed_amount");
    setFixedAmount("");
    setPercentage("");
    setAutoDeduct(true);
    setPaymentSource("cash");
    setNotes("");
    setIsTransport(false);
  };

  const handleSave = async () => {
    if (!selectedCompanyId || !user?.id) return;
    if (!employeeId) { toast.error("Selecciona un empleado"); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("El monto debe ser mayor a 0"); return; }

    setSaving(true);

    // Check company policy for approval requirement
    const { data: policy } = await supabase
      .from("company_financial_policies")
      .select("require_approval")
      .eq("company_id", selectedCompanyId)
      .maybeSingle();

    const requiresApproval = policy?.require_approval ?? true;
    const initialStatus = requiresApproval ? "pending_approval" : "active";

    const { data: record, error } = await supabase
      .from("employee_financial_records")
      .insert({
        company_id: selectedCompanyId,
        employee_id: employeeId,
        record_type: recordType as any,
        category: category as any,
        status: initialStatus as any,
        issue_date: issueDate,
        original_amount: amt,
        balance_remaining: amt,
        repayment_mode: repaymentMode as any,
        fixed_amount_per_cut: fixedAmount ? parseFloat(fixedAmount) : null,
        percentage_per_cut: percentage ? parseFloat(percentage) : null,
        auto_deduct_enabled: autoDeduct,
        payment_source: paymentSource as any,
        notes_internal: notes || null,
        is_transport_related: isTransport,
        created_by: user.id,
      })
      .select("id, balance_remaining")
      .single();

    if (error) {
      toast.error("Error creando registro: " + error.message);
      setSaving(false);
      return;
    }

    // Create initial disbursement ledger entry
    if (record) {
      await supabase.from("employee_financial_ledger").insert({
        record_id: record.id,
        company_id: selectedCompanyId,
        employee_id: employeeId,
        transaction_type: "disbursement" as any,
        amount: amt,
        balance_before: 0,
        balance_after: amt,
        note: `Desembolso inicial: ${recordType === "advance" ? "Anticipo" : "Préstamo"} por ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amt)}`,
        created_by: user.id,
      });
    }

    toast.success(requiresApproval ? "Registro creado — pendiente de aprobación" : "Registro creado y activado");
    resetForm();
    onOpenChange(false);
    onCreated();
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo anticipo o préstamo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Employee */}
          <div className="space-y-1.5">
            <Label>Empleado *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar empleado" /></SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={recordType} onValueChange={setRecordType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Anticipo</SelectItem>
                  <SelectItem value="loan">Préstamo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payroll_advance">Anticipo nómina</SelectItem>
                  <SelectItem value="employee_loan">Préstamo empleado</SelectItem>
                  <SelectItem value="transport_support">Transporte</SelectItem>
                  <SelectItem value="emergency_support">Emergencia</SelectItem>
                  <SelectItem value="payroll_correction">Corrección nómina</SelectItem>
                  <SelectItem value="equipment_deduction">Equipo</SelectItem>
                  <SelectItem value="uniform_related">Uniforme</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Monto (USD) *</Label>
              <Input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de emisión</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
          </div>

          {/* Repayment mode */}
          <div className="space-y-1.5">
            <Label>Modo de repago</Label>
            <Select value={repaymentMode} onValueChange={setRepaymentMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed_amount">Monto fijo por ciclo</SelectItem>
                <SelectItem value="percentage_net">% del salario neto</SelectItem>
                <SelectItem value="one_time_next">Única vez (próxima nómina)</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {repaymentMode === "fixed_amount" && (
            <div className="space-y-1.5">
              <Label>Monto fijo por corte</Label>
              <Input type="number" min="0.01" step="0.01" value={fixedAmount} onChange={e => setFixedAmount(e.target.value)} placeholder="100.00" />
            </div>
          )}

          {repaymentMode === "percentage_net" && (
            <div className="space-y-1.5">
              <Label>Porcentaje por corte (%)</Label>
              <Input type="number" min="1" max="100" step="0.5" value={percentage} onChange={e => setPercentage(e.target.value)} placeholder="15" />
            </div>
          )}

          {/* Payment source */}
          <div className="space-y-1.5">
            <Label>Método de entrega</Label>
            <Select value={paymentSource} onValueChange={setPaymentSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="zelle">Zelle</SelectItem>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="check">Cheque</SelectItem>
                <SelectItem value="payroll_offset">Offset nómina</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Toggles */}
          <div className="flex items-center justify-between">
            <Label>Deducción automática en nómina</Label>
            <Switch checked={autoDeduct} onCheckedChange={setAutoDeduct} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Relacionado con transporte</Label>
            <Switch checked={isTransport} onCheckedChange={setIsTransport} />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notas internas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Razón o contexto del anticipo/préstamo..." rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear registro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
