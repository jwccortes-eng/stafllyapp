import { useNavigate, useParams } from "react-router-dom";
import { useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useInvoice, type InvoiceStatus } from "@/hooks/useInvoices";
import { useBillingClients } from "@/hooks/useBillingClients";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, FileText, Loader2, CheckCircle2, Send, XCircle, RotateCcw,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_BADGE: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft:          { label: "Draft",    cls: "bg-muted text-muted-foreground border-border" },
  approved:       { label: "Approved", cls: "bg-info/10 text-info border-info/30" },
  issued:         { label: "Issued",   cls: "bg-info/10 text-info border-info/30" },
  sent:           { label: "Sent",     cls: "bg-primary/10 text-primary border-primary/30" },
  viewed:         { label: "Viewed",   cls: "bg-primary/10 text-primary border-primary/30" },
  partially_paid: { label: "Partial",  cls: "bg-warning/10 text-warning border-warning/30" },
  paid:           { label: "Paid",     cls: "bg-success/10 text-success border-success/30" },
  overdue:        { label: "Overdue",  cls: "bg-destructive/10 text-destructive border-destructive/30" },
  voided:         { label: "Voided",   cls: "bg-muted text-muted-foreground border-border line-through" },
};

export default function InvoicingInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { invoice, lines, isLoading, setStatus } = useInvoice(id);
  const { clients } = useBillingClients({ includeInactive: true });

  const client = useMemo(
    () => clients.find((c) => c.id === invoice?.client_id),
    [clients, invoice?.client_id],
  );

  if (!selectedCompanyId) return null;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-60">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6">
        <EmptyState
          icon={FileText}
          title="Invoice not found"
          description="It may have been deleted or you don't have access."
          actionLabel="Back to invoices"
          onAction={() => navigate("/app/invoicing/invoices")}
        />
      </div>
    );
  }

  const st = STATUS_BADGE[invoice.status];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={`Invoice #${String(invoice.invoice_number).padStart(4, "0")}`}
        subtitle={invoice.subject ?? "Service invoice"}
        icon={FileText}
        rightSlot={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate("/app/invoicing/invoices")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {invoice.status === "draft" && (
              <Button size="sm" onClick={() => setStatus.mutate("issued")}>
                <CheckCircle2 className="h-4 w-4" />
                Finalize
              </Button>
            )}
            {(invoice.status === "issued" || invoice.status === "approved") && (
              <Button size="sm" onClick={() => setStatus.mutate("sent")}>
                <Send className="h-4 w-4" />
                Mark as sent
              </Button>
            )}
            {(invoice.status === "issued" || invoice.status === "sent") && (
              <Button variant="outline" size="sm" onClick={() => setStatus.mutate("draft")}>
                <RotateCcw className="h-4 w-4" />
                Reopen
              </Button>
            )}
            {!["voided", "paid"].includes(invoice.status) && (
              <Button
                variant="outline" size="sm"
                onClick={() => setStatus.mutate("voided")}
                className="text-destructive"
              >
                <XCircle className="h-4 w-4" />
                Void
              </Button>
            )}
          </div>
        }
      />

      {/* Top metadata */}
      <section className="rounded-lg border border-border/60 bg-surface-1 p-5 grid gap-4 md:grid-cols-4">
        <Field label="Status">
          <Badge variant="outline" className={st.cls}>{st.label}</Badge>
        </Field>
        <Field label="Client">{client?.name ?? "—"}</Field>
        <Field label="Invoice date">
          {format(new Date(invoice.invoice_date + "T00:00:00"), "MMM d, yyyy")}
        </Field>
        <Field label="Due date">
          {invoice.due_date
            ? format(new Date(invoice.due_date + "T00:00:00"), "MMM d, yyyy")
            : "—"}
        </Field>
        <Field label="Currency">{invoice.currency}</Field>
        <Field label="Terms">{invoice.terms ?? "—"}</Field>
        <Field label="Created">{format(new Date(invoice.created_at), "MMM d, yyyy HH:mm")}</Field>
        <Field label="Finalized">
          {invoice.finalized_at
            ? format(new Date(invoice.finalized_at), "MMM d, yyyy HH:mm")
            : "—"}
        </Field>
      </section>

      {/* Lines */}
      <section className="rounded-lg border border-border/60 bg-surface-1 overflow-hidden">
        <div className="p-5 border-b border-border/60">
          <h2 className="text-sm font-semibold">Lines</h2>
        </div>
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
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No lines.
                </TableCell>
              </TableRow>
            ) : lines.map((l, idx) => (
              <TableRow key={l.id}>
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell>{l.description}</TableCell>
                <TableCell className="text-right">{Number(l.qty).toFixed(2)}</TableCell>
                <TableCell className="text-right">${Number(l.rate).toFixed(2)}</TableCell>
                <TableCell className="text-right font-medium">
                  ${Number(l.amount).toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* Totals + notes */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-lg border border-border/60 bg-surface-1 p-5 space-y-4">
          {invoice.notes && (
            <div>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Notes</h3>
              <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
          {invoice.payment_instructions && (
            <div>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                Payment instructions
              </h3>
              <p className="text-sm whitespace-pre-wrap">{invoice.payment_instructions}</p>
            </div>
          )}
          {!invoice.notes && !invoice.payment_instructions && (
            <p className="text-sm text-muted-foreground">No notes.</p>
          )}
        </section>

        <section className="rounded-lg border border-border/60 bg-surface-1 p-5 space-y-2">
          <Row label="Subtotal" value={`$${Number(invoice.subtotal).toFixed(2)}`} />
          {Number(invoice.discount_total) !== 0 && (
            <Row label="Discount" value={`-$${Number(invoice.discount_total).toFixed(2)}`} />
          )}
          {Number(invoice.tax_total) !== 0 && (
            <Row label="Tax" value={`$${Number(invoice.tax_total).toFixed(2)}`} />
          )}
          <div className="border-t border-border/60 pt-2">
            <Row label="Total" value={`$${Number(invoice.total).toFixed(2)}`} bold />
            <Row label="Paid" value={`$${Number(invoice.amount_paid).toFixed(2)}`} />
            <Row label="Balance due" value={`$${Number(invoice.balance_due).toFixed(2)}`} bold />
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
        {label}
      </div>
      <div className="text-sm mt-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
