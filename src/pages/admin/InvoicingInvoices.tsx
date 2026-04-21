import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useInvoices, type InvoiceStatus } from "@/hooks/useInvoices";
import { useBillingClients } from "@/hooks/useBillingClients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  FileText, Plus, Search, Loader2, Trash2, ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_BADGE: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft:          { label: "Draft",          cls: "bg-muted text-muted-foreground border-border" },
  approved:       { label: "Approved",       cls: "bg-info/10 text-info border-info/30" },
  issued:         { label: "Issued",         cls: "bg-info/10 text-info border-info/30" },
  sent:           { label: "Sent",           cls: "bg-primary/10 text-primary border-primary/30" },
  viewed:         { label: "Viewed",         cls: "bg-primary/10 text-primary border-primary/30" },
  partially_paid: { label: "Partial",        cls: "bg-warning/10 text-warning border-warning/30" },
  paid:           { label: "Paid",           cls: "bg-success/10 text-success border-success/30" },
  overdue:        { label: "Overdue",        cls: "bg-destructive/10 text-destructive border-destructive/30" },
  voided:         { label: "Voided",         cls: "bg-muted text-muted-foreground border-border line-through" },
};

export default function InvoicingInvoices() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { clients: billingClients } = useBillingClients({ includeInactive: true });
  const { invoices, isLoading, remove } = useInvoices({
    status: statusFilter,
    client_id: clientFilter === "all" ? null : clientFilter,
  });

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>();
    billingClients.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [billingClients]);

  const filtered = useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter((inv) => {
      const cn = clientNameById.get(inv.client_id) ?? "";
      return (
        String(inv.invoice_number).includes(q) ||
        cn.toLowerCase().includes(q) ||
        (inv.subject ?? "").toLowerCase().includes(q)
      );
    });
  }, [invoices, search, clientNameById]);

  const kpis = useMemo(() => {
    const open = invoices.filter((i) => !["paid", "voided"].includes(i.status));
    const totalOutstanding = open.reduce((s, i) => s + Number(i.balance_due ?? 0), 0);
    const totalPaid = invoices
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + Number(i.total ?? 0), 0);
    const overdue = invoices
      .filter((i) => i.status === "overdue")
      .reduce((s, i) => s + Number(i.balance_due ?? 0), 0);
    return { totalOutstanding, totalPaid, overdue, count: invoices.length };
  }, [invoices]);

  if (!selectedCompanyId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={FileText}
          title="No company selected"
          description="Select a company to view invoices."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Invoices"
        subtitle="Bill your clients with line-itemized service blocks."
        icon={FileText}
        rightSlot={
          <Button onClick={() => navigate("/app/invoicing/invoices/new")} size="sm">
            <Plus className="h-4 w-4" />
            New invoice
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiCard label="Outstanding" value={`$${kpis.totalOutstanding.toFixed(2)}`} tone="primary" />
        <KpiCard label="Overdue" value={`$${kpis.overdue.toFixed(2)}`} tone="destructive" />
        <KpiCard label="Paid (lifetime)" value={`$${kpis.totalPaid.toFixed(2)}`} tone="success" />
        <KpiCard label="Total invoices" value={String(kpis.count)} tone="muted" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-surface-1 p-3">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number, client or subject…"
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_BADGE).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {billingClients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Loader2 className="inline h-4 w-4 animate-spin" /> Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12">
                  <EmptyState
                    icon={FileText}
                    title="No invoices yet"
                    description="Create your first invoice from approved service blocks."
                    action={
                      <Button onClick={() => navigate("/app/invoicing/invoices/new")}>
                        <Plus className="h-4 w-4" />
                        New invoice
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : filtered.map((inv) => {
              const st = STATUS_BADGE[inv.status];
              return (
                <TableRow key={inv.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono font-semibold">
                    <Link to={`/app/invoicing/invoices/${inv.id}`} className="hover:underline">
                      #{String(inv.invoice_number).padStart(4, "0")}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">
                    {format(new Date(inv.invoice_date + "T00:00:00"), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>{clientNameById.get(inv.client_id) ?? "—"}</TableCell>
                  <TableCell className="max-w-60 truncate text-muted-foreground">
                    {inv.subject ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${Number(inv.total).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${Number(inv.balance_due).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => navigate(`/app/invoicing/invoices/${inv.id}`)}
                        title="Open"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                      {inv.status === "draft" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                              title="Delete draft"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete draft invoice?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Service blocks linked to this invoice will be released back to “approved”.
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => remove.mutate(inv.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, tone,
}: { label: string; value: string; tone: "primary" | "success" | "destructive" | "muted" }) {
  const toneCls = {
    primary: "text-primary",
    success: "text-success",
    destructive: "text-destructive",
    muted: "text-foreground",
  }[tone];
  return (
    <div className="rounded-lg border border-border/60 bg-surface-1 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
