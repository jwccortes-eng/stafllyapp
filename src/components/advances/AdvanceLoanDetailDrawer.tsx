import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle, Pause, Play, DollarSign, XCircle, FileText,
  ArrowDownCircle, ArrowUpCircle, Loader2, Trash2,
} from "lucide-react";

interface Props {
  recordId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

interface LedgerEntry {
  id: string;
  transaction_type: string;
  transaction_date: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  note: string | null;
  created_at: string;
}

const TX_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  disbursement: { label: "Desembolso", icon: ArrowUpCircle, color: "text-blue-500" },
  payroll_deduction: { label: "Deducción nómina", icon: ArrowDownCircle, color: "text-emerald-600" },
  manual_adjustment_add: { label: "Ajuste (+)", icon: ArrowUpCircle, color: "text-amber-500" },
  manual_adjustment_reduce: { label: "Ajuste (−)", icon: ArrowDownCircle, color: "text-emerald-500" },
  repayment_outside_payroll: { label: "Pago externo", icon: DollarSign, color: "text-emerald-600" },
  pause: { label: "Pausado", icon: Pause, color: "text-muted-foreground" },
  resume: { label: "Reanudado", icon: Play, color: "text-blue-500" },
  approval: { label: "Aprobado", icon: CheckCircle, color: "text-emerald-600" },
  cancellation: { label: "Cancelado", icon: XCircle, color: "text-destructive" },
  manual_close: { label: "Cierre manual", icon: XCircle, color: "text-muted-foreground" },
  writeoff: { label: "Castigado", icon: Trash2, color: "text-destructive" },
  reversal: { label: "Reversión", icon: ArrowUpCircle, color: "text-amber-500" },
  refund: { label: "Reembolso", icon: DollarSign, color: "text-amber-500" },
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "outline" },
  pending_approval: { label: "Pendiente", variant: "secondary" },
  approved: { label: "Aprobado", variant: "default" },
  active: { label: "Activo", variant: "default" },
  paused: { label: "Pausado", variant: "secondary" },
  paid: { label: "Pagado", variant: "default" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  closed_manually: { label: "Cerrado", variant: "outline" },
  written_off: { label: "Castigado", variant: "destructive" },
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export default function AdvanceLoanDetailDrawer({ recordId, open, onOpenChange, onUpdated }: Props) {
  const { user, role } = useAuth();
  const [record, setRecord] = useState<any>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Payment dialog
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payNote, setPayNote] = useState("");

  const fetchDetail = async () => {
    setLoading(true);
    const [recRes, ledRes] = await Promise.all([
      supabase.from("employee_financial_records").select("*, employees(first_name, last_name)").eq("id", recordId).single(),
      supabase.from("employee_financial_ledger").select("*").eq("record_id", recordId).order("transaction_date", { ascending: false }),
    ]);
    if (recRes.data) setRecord(recRes.data);
    if (ledRes.data) setLedger(ledRes.data as any[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open && recordId) fetchDetail();
  }, [open, recordId]);

  const addLedgerEntry = async (type: string, amount: number, note: string) => {
    if (!record || !user?.id) return;
    const balBefore = Number(record.balance_remaining);
    let balAfter = balBefore;

    if (type === "payroll_deduction" || type === "repayment_outside_payroll" || type === "manual_adjustment_reduce") {
      balAfter = Math.max(0, balBefore - Math.abs(amount));
    } else if (type === "manual_adjustment_add" || type === "reversal") {
      balAfter = balBefore + Math.abs(amount);
    }

    await supabase.from("employee_financial_ledger").insert({
      record_id: record.id,
      company_id: record.company_id,
      employee_id: record.employee_id,
      transaction_type: type as any,
      amount: Math.abs(amount),
      balance_before: balBefore,
      balance_after: balAfter,
      note,
      created_by: user.id,
    });

    const newStatus = balAfter === 0 ? "paid" : record.status;
    await supabase.from("employee_financial_records").update({
      balance_remaining: balAfter,
      status: newStatus as any,
      updated_by: user.id,
    }).eq("id", record.id);

    return balAfter;
  };

  const handleApprove = async () => {
    if (!record || !user?.id) return;
    setActionLoading(true);
    await supabase.from("employee_financial_records").update({
      status: "active" as any,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_by: user.id,
    }).eq("id", record.id);

    await supabase.from("employee_financial_ledger").insert({
      record_id: record.id,
      company_id: record.company_id,
      employee_id: record.employee_id,
      transaction_type: "approval" as any,
      amount: 0,
      balance_before: record.balance_remaining,
      balance_after: record.balance_remaining,
      note: "Aprobado y activado",
      created_by: user.id,
    });

    toast.success("Registro aprobado y activado");
    fetchDetail();
    onUpdated();
    setActionLoading(false);
  };

  const handlePauseResume = async () => {
    if (!record || !user?.id) return;
    setActionLoading(true);
    const isPaused = record.status === "paused";
    const newStatus = isPaused ? "active" : "paused";
    const txType = isPaused ? "resume" : "pause";

    await supabase.from("employee_financial_records").update({
      status: newStatus as any,
      updated_by: user.id,
    }).eq("id", record.id);

    await supabase.from("employee_financial_ledger").insert({
      record_id: record.id,
      company_id: record.company_id,
      employee_id: record.employee_id,
      transaction_type: txType as any,
      amount: 0,
      balance_before: record.balance_remaining,
      balance_after: record.balance_remaining,
      note: isPaused ? "Repago reanudado" : "Repago pausado",
      created_by: user.id,
    });

    toast.success(isPaused ? "Repago reanudado" : "Repago pausado");
    fetchDetail();
    onUpdated();
    setActionLoading(false);
  };

  const handleRecordPayment = async () => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { toast.error("Monto inválido"); return; }
    if (amt > Number(record.balance_remaining)) { toast.error("El monto excede el saldo"); return; }

    setActionLoading(true);
    await addLedgerEntry("repayment_outside_payroll", amt, payNote || `Pago externo: ${payMethod}`);
    toast.success("Pago registrado");
    setShowPayment(false);
    setPayAmount("");
    setPayNote("");
    fetchDetail();
    onUpdated();
    setActionLoading(false);
  };

  const handleCancel = async () => {
    if (!record || !user?.id) return;
    setActionLoading(true);
    await supabase.from("employee_financial_records").update({
      status: "cancelled" as any,
      updated_by: user.id,
    }).eq("id", record.id);

    await supabase.from("employee_financial_ledger").insert({
      record_id: record.id,
      company_id: record.company_id,
      employee_id: record.employee_id,
      transaction_type: "cancellation" as any,
      amount: 0,
      balance_before: record.balance_remaining,
      balance_after: record.balance_remaining,
      note: "Registro cancelado",
      created_by: user.id,
    });

    toast.success("Registro cancelado");
    fetchDetail();
    onUpdated();
    setActionLoading(false);
  };

  if (loading || !record) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const sc = STATUS_LABELS[record.status];
  const totalRepaid = Number(record.original_amount) - Number(record.balance_remaining);
  const pct = record.original_amount > 0 ? Math.round((totalRepaid / record.original_amount) * 100) : 0;
  const isActive = record.status === "active" || record.status === "approved";
  const isPaused = record.status === "paused";
  const isPending = record.status === "pending_approval";
  const canAct = !["paid", "cancelled", "closed_manually", "written_off"].includes(record.status);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4">
            <div className="flex items-center gap-3">
              <SheetTitle className="font-mono text-base">{record.reference_code}</SheetTitle>
              <Badge variant={sc?.variant ?? "outline"}>{sc?.label ?? record.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {record.employees?.first_name} {record.employees?.last_name} · {record.record_type === "advance" ? "Anticipo" : "Préstamo"}
            </p>
          </SheetHeader>

          {/* Summary */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Monto original</p>
                <p className="text-lg font-bold">{fmt(record.original_amount)}</p>
              </div>
              <div className="rounded-xl border p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo restante</p>
                <p className={`text-lg font-bold ${record.balance_remaining === 0 ? "text-emerald-600" : ""}`}>
                  {fmt(record.balance_remaining)}
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Repagado: {fmt(totalRepaid)}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><span className="text-muted-foreground">Fecha emisión:</span> {record.issue_date}</div>
              <div><span className="text-muted-foreground">Modo repago:</span> {record.repayment_mode}</div>
              {record.fixed_amount_per_cut && <div><span className="text-muted-foreground">Monto/corte:</span> {fmt(record.fixed_amount_per_cut)}</div>}
              {record.percentage_per_cut && <div><span className="text-muted-foreground">%/corte:</span> {record.percentage_per_cut}%</div>}
              <div><span className="text-muted-foreground">Auto-deducción:</span> {record.auto_deduct_enabled ? "Sí" : "No"}</div>
              <div><span className="text-muted-foreground">Fuente pago:</span> {record.payment_source}</div>
            </div>

            {record.notes_internal && (
              <div className="rounded-xl border p-3 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notas</p>
                <p>{record.notes_internal}</p>
              </div>
            )}

            <Separator />

            {/* Actions */}
            {canAct && (
              <div className="flex flex-wrap gap-2">
                {isPending && (
                  <Button size="sm" onClick={handleApprove} disabled={actionLoading} className="gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" /> Aprobar
                  </Button>
                )}
                {(isActive || isPaused) && (
                  <>
                    <Button size="sm" variant="outline" onClick={handlePauseResume} disabled={actionLoading} className="gap-1.5">
                      {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      {isPaused ? "Reanudar" : "Pausar"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowPayment(true)} disabled={actionLoading} className="gap-1.5">
                      <DollarSign className="h-3.5 w-3.5" /> Registrar pago
                    </Button>
                  </>
                )}
                {record.status !== "paid" && (
                  <Button size="sm" variant="destructive" onClick={handleCancel} disabled={actionLoading} className="gap-1.5">
                    <XCircle className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                )}
              </div>
            )}

            <Separator />

            {/* Ledger Timeline */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Historial financiero</h4>
              {ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin transacciones registradas</p>
              ) : (
                <div className="space-y-3">
                  {ledger.map(tx => {
                    const txc = TX_LABELS[tx.transaction_type];
                    const Icon = txc?.icon ?? FileText;
                    return (
                      <div key={tx.id} className="flex gap-3">
                        <div className={`mt-0.5 ${txc?.color ?? "text-muted-foreground"}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{txc?.label ?? tx.transaction_type}</span>
                            {tx.amount > 0 && (
                              <span className="text-sm font-mono">{fmt(tx.amount)}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(tx.transaction_date).toLocaleString("es-US", { dateStyle: "medium", timeStyle: "short" })}
                            {tx.amount > 0 && ` · Saldo: ${fmt(tx.balance_after)}`}
                          </div>
                          {tx.note && <p className="text-xs text-muted-foreground mt-0.5">{tx.note}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Record Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pago externo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Monto</Label>
              <Input type="number" min="0.01" step="0.01" max={record.balance_remaining} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" />
              <p className="text-[11px] text-muted-foreground">Saldo actual: {fmt(record.balance_remaining)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Método</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="zelle">Zelle</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="check">Cheque</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nota</Label>
              <Textarea value={payNote} onChange={e => setPayNote(e.target.value)} rows={2} placeholder="Detalle del pago..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayment(false)}>Cancelar</Button>
            <Button onClick={handleRecordPayment} disabled={actionLoading} className="gap-2">
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
