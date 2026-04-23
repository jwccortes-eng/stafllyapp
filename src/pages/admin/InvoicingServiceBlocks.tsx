import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import {
  useBillableServiceBlocks,
  type ServiceBlockStatus,
  type BillableUnit,
  type BillableServiceBlock,
  type GenerationResult,
} from "@/hooks/useBillableServiceBlocks";
import { useBillingClients } from "@/hooks/useBillingClients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Receipt, Sparkles, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Pencil, Loader2, Filter,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_BADGE: Record<ServiceBlockStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-warning/10 text-warning border-warning/30" },
  approved: { label: "Approved", cls: "bg-success/10 text-success border-success/30" },
  adjusted: { label: "Adjusted", cls: "bg-info/10 text-info border-info/30" },
  discarded: { label: "Discarded", cls: "bg-muted text-muted-foreground border-border" },
  invoiced: { label: "Invoiced", cls: "bg-primary/10 text-primary border-primary/30" },
};

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function InvoicingServiceBlocks() {
  const { selectedCompanyId } = useCompany();
  const [tab, setTab] = useState<ServiceBlockStatus>("pending");
  const [dateFrom, setDateFrom] = useState(todayISO(-30));
  const [dateTo, setDateTo] = useState(todayISO(0));
  const [billingClientFilter, setBillingClientFilter] = useState<string>("all");
  const [genOpen, setGenOpen] = useState(false);
  const [editing, setEditing] = useState<BillableServiceBlock | null>(null);
  const [lastResult, setLastResult] = useState<GenerationResult | null>(null);

  const { clients: billingClients } = useBillingClients({ includeInactive: false });

  const { blocks, isLoading, refetch, generate, update, setStatus } =
    useBillableServiceBlocks({
      status: tab,
      date_from: dateFrom,
      date_to: dateTo,
      client_id: billingClientFilter === "all" ? null : billingClientFilter,
    });

  const [counts, setCounts] = useState<Record<ServiceBlockStatus, number>>({
    pending: 0, approved: 0, adjusted: 0, discarded: 0, invoiced: 0,
  });

  useEffect(() => {
    let cancelled = false;
    async function loadCounts() {
      if (!selectedCompanyId) return;
      let q = supabase
        .from("billable_service_blocks")
        .select("source_status")
        .eq("company_id", selectedCompanyId)
        .gte("service_date", dateFrom)
        .lte("service_date", dateTo);
      if (billingClientFilter !== "all") q = q.eq("client_id", billingClientFilter);
      const { data, error } = await q;
      if (cancelled || error || !data) return;
      const next: Record<ServiceBlockStatus, number> = {
        pending: 0, approved: 0, adjusted: 0, discarded: 0, invoiced: 0,
      };
      for (const row of data as { source_status: ServiceBlockStatus }[]) {
        if (next[row.source_status] !== undefined) next[row.source_status] += 1;
      }
      setCounts(next);
    }
    loadCounts();
    return () => { cancelled = true; };
  }, [selectedCompanyId, dateFrom, dateTo, billingClientFilter, blocks.length]);

  const totalAmount = useMemo(
    () => blocks.reduce((s, b) => s + Number(b.amount ?? 0), 0),
    [blocks],
  );

  if (!selectedCompanyId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Receipt}
          title="No company selected"
          description="Select a company to manage billable service blocks."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Service Blocks"
        subtitle="Convert approved operations into billable units, ready to be invoiced."
        icon={Receipt}
        rightSlot={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Dialog open={genOpen} onOpenChange={setGenOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Sparkles className="h-4 w-4" />
                  Generate from operations
                </Button>
              </DialogTrigger>
              <GenerateDialog
                onClose={() => setGenOpen(false)}
                onRun={async (input) => {
                  try {
                    const res = await generate.mutateAsync(input);
                    setLastResult(res);
                    setGenOpen(false);
                  } catch {
                    // toast is already handled in the mutation; keep the dialog open
                  }
                }}
                running={generate.isPending}
              />
            </Dialog>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-surface-1 p-4">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1 min-w-60">
          <Label className="text-xs">Billing client</Label>
          <Select value={billingClientFilter} onValueChange={setBillingClientFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {billingClients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          {blocks.length} blocks · total{" "}
          <span className="font-semibold text-foreground">${totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* Last generation summary */}
      {lastResult && (
        <div className="rounded-lg border border-border/60 bg-surface-1 p-4 space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span>
              <strong>{lastResult.generated}</strong> created ·{" "}
              <strong>{lastResult.updated}</strong> updated ·{" "}
              <strong>{lastResult.skipped.length}</strong> skipped of{" "}
              {lastResult.total_shifts_scanned} shifts.
            </span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setLastResult(null)}>
              Dismiss
            </Button>
          </div>
          {lastResult.skipped.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                <AlertTriangle className="inline h-3 w-3 mr-1 text-warning" />
                View skip reasons ({lastResult.skipped.length})
              </summary>
              <div className="mt-2 max-h-48 overflow-auto rounded border border-border/40 bg-surface-2 p-2 space-y-1">
                {lastResult.skipped.map((s, i) => (
                  <div key={i} className="font-mono text-[11px]">
                    [{s.service_date}] <span className="text-warning">{s.reason}</span>
                    {s.detail ? ` — ${s.detail}` : ""}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as ServiceBlockStatus)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="invoiced">Invoiced</TabsTrigger>
          <TabsTrigger value="discarded">Discarded</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Workers</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12">
                      <Loader2 className="inline h-4 w-4 animate-spin" /> Loading…
                    </TableCell>
                  </TableRow>
                ) : blocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                      No blocks for this filter.
                    </TableCell>
                  </TableRow>
                ) : blocks.map((b) => {
                  const bc = billingClients.find((c) => c.id === b.client_id);
                  const flag = b.rate <= 0 || !b.client_location_id;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(b.service_date + "T00:00:00"), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>{bc?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="max-w-60 truncate" title={b.service_type ?? ""}>
                        {b.service_type ?? <span className="text-muted-foreground">—</span>}
                        {flag && (
                          <span title={b.notes ?? "Needs admin review"}>
                            <AlertTriangle className="inline ml-2 h-3.5 w-3.5 text-warning" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{b.workers_count}</TableCell>
                      <TableCell className="text-right">{Number(b.qty).toFixed(2)}</TableCell>
                      <TableCell className="uppercase text-xs">{b.billable_unit}</TableCell>
                      <TableCell className="text-right">${Number(b.rate).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">${Number(b.amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_BADGE[b.source_status].cls}>
                          {STATUS_BADGE[b.source_status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {b.source_status !== "invoiced" && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(b)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {b.source_status === "pending" && (
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-success"
                                  onClick={() => setStatus.mutate({ id: b.id, status: "approved" })}
                                  title="Approve"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {b.source_status !== "discarded" && (
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                                  onClick={() => setStatus.mutate({ id: b.id, status: "discarded" })}
                                  title="Discard"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <EditBlockSheet
        block={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return;
          await update.mutateAsync({ id: editing.id, patch });
          setEditing(null);
        }}
        saving={update.isPending}
      />
    </div>
  );
}

/* ───────── Generate dialog ───────── */
function GenerateDialog({
  onClose, onRun, running,
}: {
  onClose: () => void;
  onRun: (input: { date_from: string; date_to: string; client_id?: string | null; default_billable_unit?: BillableUnit }) => Promise<void>;
  running: boolean;
}) {
  const [from, setFrom] = useState(todayISO(-14));
  const [to, setTo] = useState(todayISO(0));
  const [unit, setUnit] = useState<BillableUnit>("hour");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Generate service blocks</DialogTitle>
        <DialogDescription>
          Reads approved time entries within the range and creates pending blocks
          where billing mappings are clear. Skipped shifts are reported with reason.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Default billable unit</Label>
          <Select value={unit} onValueChange={(v) => setUnit(v as BillableUnit)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hour">Hour</SelectItem>
              <SelectItem value="day">Day (per worker)</SelectItem>
              <SelectItem value="flat">Flat (per shift)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={running}>Cancel</Button>
        <Button onClick={() => onRun({ date_from: from, date_to: to, default_billable_unit: unit })} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Run generator
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ───────── Edit sheet ───────── */
function EditBlockSheet({
  block, onClose, onSave, saving,
}: {
  block: BillableServiceBlock | null;
  onClose: () => void;
  onSave: (patch: any) => Promise<void>;
  saving: boolean;
}) {
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [unit, setUnit] = useState<BillableUnit>("hour");
  const [serviceType, setServiceType] = useState("");
  const [notes, setNotes] = useState("");

  // sync when block changes
  useMemo(() => {
    if (block) {
      setQty(String(block.qty));
      setRate(String(block.rate));
      setUnit(block.billable_unit);
      setServiceType(block.service_type ?? "");
      setNotes(block.notes ?? "");
    }
  }, [block?.id]); // eslint-disable-line

  return (
    <Sheet open={!!block} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Adjust service block</SheetTitle>
          <SheetDescription>
            {block ? `Service date: ${block.service_date}` : ""}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-180px)] pr-3 mt-4">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Quantity</Label>
                <Input type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Rate</Label>
                <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as BillableUnit)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hour">Hour</SelectItem>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="flat">Flat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Service / description</Label>
              <Input value={serviceType} onChange={(e) => setServiceType(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {block && (
              <div className="rounded-md bg-surface-2 p-3 text-xs text-muted-foreground space-y-1">
                <div>Workers: <strong>{block.workers_count}</strong></div>
                <div>Currency: <strong>{block.currency}</strong></div>
                <div>Source: <strong>{block.source_type}</strong> · {STATUS_BADGE[block.source_status].label}</div>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="flex justify-end gap-2 pt-4 border-t border-border/60">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={() =>
              onSave({
                qty: Number(qty) || 0,
                rate: Number(rate) || 0,
                billable_unit: unit,
                service_type: serviceType.trim() || null,
                description_rendered: serviceType.trim() || null,
                notes: notes.trim() || null,
              })
            }
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
