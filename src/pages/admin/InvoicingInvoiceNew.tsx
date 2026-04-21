import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useBillingClients } from "@/hooks/useBillingClients";
import { useBillableServiceBlocks, type BillableServiceBlock } from "@/hooks/useBillableServiceBlocks";
import { useCreateInvoiceFromBlocks } from "@/hooks/useInvoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, FilePlus2, Loader2, Save, Sparkles, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function InvoicingInvoiceNew() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();

  // Header form
  const [clientId, setClientId] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState(todayISO(0));
  const [dueDate, setDueDate] = useState(todayISO(15));
  const [subject, setSubject] = useState("");
  const [terms, setTerms] = useState("Net 15");
  const [notes, setNotes] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");

  // Block selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(todayISO(-60));
  const [dateTo, setDateTo] = useState(todayISO(0));

  const { clients: billingClients } = useBillingClients({ includeInactive: false });
  const { blocks, isLoading } = useBillableServiceBlocks({
    status: "approved",
    date_from: dateFrom,
    date_to: dateTo,
    client_id: clientId || null,
  });

  const createMutation = useCreateInvoiceFromBlocks();

  // Reset selection when client changes
  useEffect(() => {
    setSelected(new Set());
  }, [clientId]);

  const eligibleBlocks: BillableServiceBlock[] = useMemo(
    () => blocks.filter((b) => b.source_status === "approved" && !b.invoice_id),
    [blocks],
  );

  const selectedBlocks = useMemo(
    () => eligibleBlocks.filter((b) => selected.has(b.id)),
    [eligibleBlocks, selected],
  );

  const totals = useMemo(() => {
    const subtotal = selectedBlocks.reduce((s, b) => s + Number(b.amount ?? 0), 0);
    return {
      subtotal,
      total: Math.round(subtotal * 100) / 100,
      currency: selectedBlocks[0]?.currency ?? "USD",
    };
  }, [selectedBlocks]);

  const allSelected =
    eligibleBlocks.length > 0 && selectedBlocks.length === eligibleBlocks.length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(eligibleBlocks.map((b) => b.id)));
  };

  const canSave = !!clientId && selectedBlocks.length > 0 && !createMutation.isPending;

  const handleSaveDraft = async () => {
    if (!canSave) return;
    const res = await createMutation.mutateAsync({
      client_id: clientId,
      invoice_date: invoiceDate,
      due_date: dueDate || null,
      subject: subject || null,
      terms: terms || null,
      notes: notes || null,
      payment_instructions: paymentInstructions || null,
      currency: totals.currency,
      block_ids: Array.from(selected),
    });
    navigate(`/app/invoicing/invoices/${res.id}`);
  };

  if (!selectedCompanyId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={FilePlus2}
          title="No company selected"
          description="Select a company to create invoices."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="New invoice"
        subtitle="Bundle approved service blocks into a billable draft."
        icon={FilePlus2}
        rightSlot={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/app/invoicing/invoices")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button size="sm" onClick={handleSaveDraft} disabled={!canSave}>
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save as draft
            </Button>
          </div>
        }
      />

      {/* Header */}
      <section className="rounded-lg border border-border/60 bg-surface-1 p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Invoice header
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Billing client *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
              <SelectContent>
                {billingClients.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">
                    No billing clients yet. Create one in Billing Clients.
                  </div>
                ) : billingClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Invoice date</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Staffing services — March 2025"
            />
          </div>
          <div className="space-y-1">
            <Label>Terms</Label>
            <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Net 15" />
          </div>
        </div>
      </section>

      {/* Block selector */}
      <section className="rounded-lg border border-border/60 bg-surface-1 p-5 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-sm font-semibold">Service blocks</h2>
          <div className="flex items-center gap-2">
            <div className="space-y-0.5">
              <Label className="text-[10px] uppercase">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-36" />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] uppercase">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-36" />
            </div>
          </div>
        </div>

        {!clientId ? (
          <EmptyState
            icon={FilePlus2}
            title="Select a billing client first"
            description="Approved service blocks for that client will appear here."
            compact
          />
        ) : (
          <div className="rounded-md border border-border/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      disabled={eligibleBlocks.length === 0}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10">
                      <Loader2 className="inline h-4 w-4 animate-spin" /> Loading blocks…
                    </TableCell>
                  </TableRow>
                ) : eligibleBlocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                      No approved &amp; billable blocks for this client in this range.
                    </TableCell>
                  </TableRow>
                ) : eligibleBlocks.map((b) => {
                  const isSel = selected.has(b.id);
                  return (
                    <TableRow
                      key={b.id}
                      className={isSel ? "bg-primary/5" : ""}
                      data-state={isSel ? "selected" : undefined}
                    >
                      <TableCell>
                        <Checkbox checked={isSel} onCheckedChange={() => toggle(b.id)} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(b.service_date + "T00:00:00"), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="max-w-72 truncate">
                        {b.description_rendered ?? b.service_type ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">{Number(b.qty).toFixed(2)}</TableCell>
                      <TableCell className="uppercase text-xs">{b.billable_unit}</TableCell>
                      <TableCell className="text-right">${Number(b.rate).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">
                        ${Number(b.amount).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Lines preview */}
      {selectedBlocks.length > 0 && (
        <section className="rounded-lg border border-border/60 bg-surface-1 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Invoice lines preview</h2>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              {selectedBlocks.length} line{selectedBlocks.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <div className="rounded-md border border-border/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedBlocks.map((b, idx) => {
                  const desc =
                    b.description_rendered ??
                    `${b.service_type ?? "Service"} — ${b.service_date}${
                      b.workers_count > 1 ? ` (${b.workers_count} workers)` : ""
                    }`;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="text-sm">{desc}</TableCell>
                      <TableCell className="text-right">{Number(b.qty).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(b.rate).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">
                        ${Number(b.amount).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Notes / payment + Summary */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-lg border border-border/60 bg-surface-1 p-5 space-y-4">
          <h2 className="text-sm font-semibold">Notes &amp; payment instructions</h2>
          <div className="space-y-1">
            <Label>Notes (visible to client)</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Thank you for your business…"
            />
          </div>
          <div className="space-y-1">
            <Label>Payment instructions</Label>
            <Textarea
              rows={3}
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              placeholder="ACH / Zelle / Check details…"
            />
          </div>
        </section>

        <section className="rounded-lg border border-border/60 bg-surface-1 p-5 space-y-3">
          <h2 className="text-sm font-semibold">Summary</h2>
          <Row label="Lines" value={String(selectedBlocks.length)} />
          <Row label="Subtotal" value={`$${totals.subtotal.toFixed(2)}`} />
          <div className="border-t border-border/60 pt-3">
            <Row label="Total" value={`$${totals.total.toFixed(2)}`} bold currency={totals.currency} />
          </div>
          <Button className="w-full" onClick={handleSaveDraft} disabled={!canSave}>
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save as draft
          </Button>
          {!clientId && (
            <p className="text-[11px] text-warning flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Select a client to continue.
            </p>
          )}
          {clientId && selectedBlocks.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Select at least one approved service block.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({
  label, value, bold, currency,
}: { label: string; value: string; bold?: boolean; currency?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "font-semibold text-foreground" : "text-foreground"}>
        {value} {currency && bold ? <span className="text-xs text-muted-foreground ml-1">{currency}</span> : null}
      </span>
    </div>
  );
}
