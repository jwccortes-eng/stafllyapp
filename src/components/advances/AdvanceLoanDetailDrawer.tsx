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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle, Pause, Play, DollarSign, XCircle, FileText,
  ArrowDownCircle, ArrowUpCircle, Loader2, Trash2, AlertTriangle,
  TrendingUp, TrendingDown, Ban, BookOpen,
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
  payroll_deduction: { label: "Deducción nómina", icon: ArrowDownCircle, color: "text-earning" },
  manual_adjustment_add: { label: "Ajuste (+)", icon: TrendingUp, color: "text-amber-500" },
  manual_adjustment_reduce: { label: "Ajuste (−)", icon: TrendingDown, color: "text-earning" },
  repayment_outside_payroll: { label: "Pago externo", icon: DollarSign, color: "text-earning" },
  pause: { label: "Pausado", icon: Pause, color: "text-muted-foreground" },
  resume: { label: "Reanudado", icon: Play, color: "text-blue-500" },
  approval: { label: "Aprobado", icon: CheckCircle, color: "text-earning" },
  cancellation: { label: "Cancelado", icon: XCircle, color: "text-destructive" },
  manual_close: { label: "Cierre manual", icon: Ban, color: "text-muted-foreground" },
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

const CATEGORY_LABELS: Record<string, string> = {
  payroll_advance: "Anticipo nómina",
  employee_loan: "Préstamo empleado",
  transport_support: "Transporte",
  emergency_support: "Emergencia",
  payroll_correction: "Corrección nómina",
  equipment_deduction: "Equipo",
  uniform_related: "Uniforme",
  other: "Otro",
};

const MODE_LABELS: Record<string, string> = {
  fixed_amount: "Monto fijo",
  percentage_net: "% Neto",
  percentage_gross: "% Bruto",
  one_time_next: "Única vez",
  manual: "Manual",
  hybrid: "Híbrido",
};

const SOURCE_LABELS: Record<string, string> = {
  cash: "Efectivo",
  zelle: "Zelle",
  transfer: "Transferencia",
  check: "Cheque",
  payroll_offset: "Offset nómina",
  other: "Otro",
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

type DialogMode = null | "payment" | "adjust_add" | "adjust_reduce" | "writeoff" | "close" | "approve";

export default function AdvanceLoanDetailDrawer({ recordId, open, onOpenChange, onUpdated }: Props) {
  const { user, role } = useAuth();
  const [record, setRecord] = useState<any>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [dialogAmount, setDialogAmount] = useState("");
  const [dialogMethod, setDialogMethod] = useState("cash");
  const [dialogNote, setDialogNote] = useState("");

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

  const resetDialog = () => {
    setDialogMode(null);
    setDialogAmount("");
    setDialogMethod("cash");
    setDialogNote("");
  };

  const addLedgerEntry = async (type: string, amount: number, note: string) => {
    if (!record || !user?.id) return 0;
    const balBefore = Number(record.balance_remaining);
    let balAfter = balBefore;

    if (["payroll_deduction", "repayment_outside_payroll", "manual_adjustment_reduce"].includes(type)) {
      balAfter = Math.max(0, Math.round((balBefore - Math.abs(amount)) * 100) / 100);
    } else if (["manual_adjustment_add", "reversal"].includes(type)) {
      balAfter = Math.round((balBefore + Math.abs(amount)) * 100) / 100;
    } else if (type === "writeoff" || type === "manual_close") {
      balAfter = 0;
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

    const statusMap: Record<string, string> = {
      writeoff: "written_off",
      manual_close: "closed_manually",
      cancellation: "cancelled",
    };
    const newStatus = statusMap[type] ?? (balAfter === 0 ? "paid" : record.status);

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
      approval_note: dialogNote || null,
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
      note: dialogNote ? `Aprobado — ${dialogNote}` : "Aprobado y activado",
      created_by: user.id,
    });

    toast.success("Registro aprobado y activado");
    resetDialog();
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

  const handleDialogConfirm = async () => {
    if (!record || !user?.id) return;
    setActionLoading(true);

    try {
      switch (dialogMode) {
        case "approve":
          await handleApprove();
          return;

        case "payment": {
          const amt = parseFloat(dialogAmount);
          if (!amt || amt <= 0) { toast.error("Monto inválido"); setActionLoading(false); return; }
          if (amt > Number(record.balance_remaining)) { toast.error("El monto excede el saldo"); setActionLoading(false); return; }
          await addLedgerEntry("repayment_outside_payroll", amt, dialogNote || `Pago externo: ${dialogMethod}`);
          toast.success("Pago registrado");
          break;
        }

        case "adjust_add": {
          const amt = parseFloat(dialogAmount);
          if (!amt || amt <= 0) { toast.error("Monto inválido"); setActionLoading(false); return; }
          await addLedgerEntry("manual_adjustment_add", amt, dialogNote || "Ajuste manual — aumento de saldo");
          toast.success("Saldo incrementado");
          break;
        }

        case "adjust_reduce": {
          const amt = parseFloat(dialogAmount);
          if (!amt || amt <= 0) { toast.error("Monto inválido"); setActionLoading(false); return; }
          if (amt > Number(record.balance_remaining)) { toast.error("El monto excede el saldo"); setActionLoading(false); return; }
          await addLedgerEntry("manual_adjustment_reduce", amt, dialogNote || "Ajuste manual — reducción de saldo");
          toast.success("Saldo reducido");
          break;
        }

        case "writeoff": {
          if (!dialogNote) { toast.error("Se requiere una razón para castigar"); setActionLoading(false); return; }
          await addLedgerEntry("writeoff", Number(record.balance_remaining), dialogNote);
          toast.success("Saldo castigado (write-off)");
          break;
        }

        case "close": {
          if (!dialogNote) { toast.error("Se requiere una razón para cerrar manualmente"); setActionLoading(false); return; }
          await addLedgerEntry("manual_close", Number(record.balance_remaining), dialogNote);
          toast.success("Registro cerrado manualmente");
          break;
        }
      }
    } finally {
      resetDialog();
      fetchDetail();
      onUpdated();
      setActionLoading(false);
    }
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

  const dialogTitles: Record<string, string> = {
    payment: "Registrar pago externo",
    adjust_add: "Aumentar saldo",
    adjust_reduce: "Reducir saldo",
    writeoff: "Castigar saldo (Write-off)",
    close: "Cerrar manualmente",
    approve: "Aprobar registro",
  };

  const needsAmount = ["payment", "adjust_add", "adjust_reduce"].includes(dialogMode ?? "");
  const needsNote = ["writeoff", "close"].includes(dialogMode ?? "");

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

          <div className="space-y-4">
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/40 p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Monto original</p>
                <p className="text-lg font-bold tabular-nums">{fmt(record.original_amount)}</p>
              </div>
              <div className="rounded-xl border border-border/40 p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo restante</p>
                <p className={`text-lg font-bold tabular-nums ${record.balance_remaining === 0 ? "text-earning" : ""}`}>
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
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Details grid */}
            <div className="rounded-xl border border-border/40 p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Detalles</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div className="text-muted-foreground">Fecha emisión</div>
                <div className="font-medium">{record.issue_date}</div>

                <div className="text-muted-foreground">Categoría</div>
                <div className="font-medium">{CATEGORY_LABELS[record.category] ?? record.category}</div>

                <div className="text-muted-foreground">Modo repago</div>
                <div className="font-medium">{MODE_LABELS[record.repayment_mode] ?? record.repayment_mode}</div>

                {record.fixed_amount_per_cut && (
                  <>
                    <div className="text-muted-foreground">Monto/corte</div>
                    <div className="font-medium tabular-nums">{fmt(record.fixed_amount_per_cut)}</div>
                  </>
                )}
                {record.percentage_per_cut && (
                  <>
                    <div className="text-muted-foreground">%/corte</div>
                    <div className="font-medium">{record.percentage_per_cut}%</div>
                  </>
                )}

                <div className="text-muted-foreground">Auto-deducción</div>
                <div className="font-medium">{record.auto_deduct_enabled ? "Sí" : "No"}</div>

                <div className="text-muted-foreground">Fuente pago</div>
                <div className="font-medium">{SOURCE_LABELS[record.payment_source] ?? record.payment_source ?? "—"}</div>

                {record.is_transport_related && (
                  <>
                    <div className="text-muted-foreground">Transporte</div>
                    <div className="font-medium">Sí</div>
                  </>
                )}

                <div className="text-muted-foreground">Neto mínimo protegido</div>
                <div className="font-medium">{record.protect_minimum_net_pay ? "Sí" : "No"}</div>

                <div className="text-muted-foreground">Protección negativa</div>
                <div className="font-medium">{record.protect_negative_payroll ? "Sí" : "No"}</div>

                {record.approved_by && (
                  <>
                    <div className="text-muted-foreground">Aprobado</div>
                    <div className="font-medium text-xs">{record.approved_at ? new Date(record.approved_at).toLocaleDateString("es-US") : "—"}</div>
                  </>
                )}

                {record.repayment_start_date && (
                  <>
                    <div className="text-muted-foreground">Inicio repago</div>
                    <div className="font-medium">{record.repayment_start_date}</div>
                  </>
                )}
                {record.expected_end_date && (
                  <>
                    <div className="text-muted-foreground">Fin esperado</div>
                    <div className="font-medium">{record.expected_end_date}</div>
                  </>
                )}
              </div>
            </div>

            {/* Notes */}
            {(record.notes_internal || record.approval_note || record.employee_visible_notes) && (
              <div className="rounded-xl border border-border/40 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Notas</p>
                {record.notes_internal && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Internas</p>
                    <p className="text-sm">{record.notes_internal}</p>
                  </div>
                )}
                {record.approval_note && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Nota de aprobación</p>
                    <p className="text-sm">{record.approval_note}</p>
                  </div>
                )}
                {record.employee_visible_notes && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Visible al empleado</p>
                    <p className="text-sm">{record.employee_visible_notes}</p>
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Actions */}
            {canAct && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Acciones</p>
                <div className="flex flex-wrap gap-2">
                  {isPending && (
                    <Button size="sm" onClick={() => setDialogMode("approve")} disabled={actionLoading} className="gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5" /> Aprobar
                    </Button>
                  )}
                  {(isActive || isPaused) && (
                    <>
                      <Button size="sm" variant="outline" onClick={handlePauseResume} disabled={actionLoading} className="gap-1.5">
                        {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        {isPaused ? "Reanudar" : "Pausar"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDialogMode("payment")} disabled={actionLoading} className="gap-1.5">
                        <DollarSign className="h-3.5 w-3.5" /> Registrar pago
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDialogMode("adjust_reduce")} disabled={actionLoading} className="gap-1.5">
                        <TrendingDown className="h-3.5 w-3.5" /> Reducir saldo
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDialogMode("adjust_add")} disabled={actionLoading} className="gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" /> Aumentar saldo
                      </Button>
                    </>
                  )}
                  {record.status !== "paid" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setDialogMode("close")} disabled={actionLoading} className="gap-1.5 text-muted-foreground">
                        <Ban className="h-3.5 w-3.5" /> Cerrar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDialogMode("writeoff")} disabled={actionLoading} className="gap-1.5 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" /> Castigar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={handleCancel} disabled={actionLoading} className="gap-1.5">
                        <XCircle className="h-3.5 w-3.5" /> Cancelar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            <Separator />

            {/* Ledger Timeline */}
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Historial financiero ({ledger.length})</h4>
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
                              <span className="text-sm font-mono tabular-nums">{fmt(tx.amount)}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(tx.transaction_date).toLocaleString("es-US", { dateStyle: "medium", timeStyle: "short" })}
                            {tx.amount > 0 && ` · Saldo: ${fmt(tx.balance_after)}`}
                          </div>
                          {tx.note && <p className="text-xs text-muted-foreground/70 mt-0.5">{tx.note}</p>}
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

      {/* Universal Action Dialog */}
      <Dialog open={!!dialogMode} onOpenChange={open => !open && resetDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogTitles[dialogMode ?? ""] ?? ""}</DialogTitle>
            {(dialogMode === "writeoff" || dialogMode === "close") && (
              <DialogDescription className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {dialogMode === "writeoff"
                  ? `Se castigará el saldo restante de ${fmt(record.balance_remaining)}.`
                  : `Se cerrará el registro con saldo de ${fmt(record.balance_remaining)}.`
                }
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3 py-2">
            {needsAmount && (
              <div className="space-y-1.5">
                <Label>Monto</Label>
                <Input
                  type="number" min="0.01" step="0.01"
                  max={dialogMode !== "adjust_add" ? record.balance_remaining : undefined}
                  value={dialogAmount}
                  onChange={e => setDialogAmount(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-[11px] text-muted-foreground">Saldo actual: {fmt(record.balance_remaining)}</p>
              </div>
            )}
            {dialogMode === "payment" && (
              <div className="space-y-1.5">
                <Label>Método</Label>
                <Select value={dialogMethod} onValueChange={setDialogMethod}>
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
            )}
            <div className="space-y-1.5">
              <Label>{needsNote ? "Razón (requerida) *" : "Nota (opcional)"}</Label>
              <Textarea
                value={dialogNote}
                onChange={e => setDialogNote(e.target.value)}
                rows={2}
                placeholder={needsNote ? "Explica la razón..." : "Detalle adicional..."}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>Cancelar</Button>
            <Button
              onClick={handleDialogConfirm}
              disabled={actionLoading}
              variant={dialogMode === "writeoff" ? "destructive" : "default"}
              className="gap-2"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
