import { useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Inbox, AlertTriangle } from "lucide-react";
import { useServiceRequests } from "@/hooks/useServiceRequests";
import { STATUS_LABELS, STATUS_TONE, type ServiceRequestStatus } from "@/lib/service-requests/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { QuickCreateRequestDialog } from "@/components/service-requests/QuickCreateRequestDialog";
import { RequestDetailDrawer } from "@/components/service-requests/RequestDetailDrawer";
import { useCompany } from "@/hooks/useCompany";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUS_TABS: Array<{ value: ServiceRequestStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "approved_for_scheduling", label: "Approved" },
  { value: "converted_to_shift", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "pending_closure_review", label: "Closure" },
];

export default function ServiceRequests() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [status, setStatus] = useState<ServiceRequestStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useServiceRequests({ status });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(r =>
      r.request_code.toLowerCase().includes(q) ||
      (r.client_name_snapshot ?? "").toLowerCase().includes(q) ||
      (r.service_address ?? "").toLowerCase().includes(q) ||
      (r.onsite_contact_name ?? "").toLowerCase().includes(q)
    );
  }, [data, search]);

  if (!selectedCompanyId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Select a company to manage service requests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Helmet>
        <title>Service Requests · Stafly</title>
        <meta name="description" content="Manage client service requests, convert them into shifts and track operational fulfillment." />
      </Helmet>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Service Requests</h1>
          <p className="text-sm text-muted-foreground">
            {selectedCompany?.name} · capture client requests and track fulfillment end-to-end.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1" /> New request
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Tabs value={status} onValueChange={(v) => setStatus(v as any)}>
          <TabsList>
            {STATUS_TABS.map(t => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, client, address…"
            className="pl-8"
          />
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Inbox className="size-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="font-medium">No requests</p>
            <p className="text-sm text-muted-foreground">Capture your first client request to start.</p>
            <Button className="mt-3" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1" /> New request
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Service date</th>
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2 text-right">Requested</th>
                <th className="px-3 py-2 text-right">Shifts</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const needsShift = r.status === "approved_for_scheduling" && r.linked_shifts_count === 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="border-b border-border last:border-0 hover:bg-accent/40 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 font-mono text-xs font-medium">{r.request_code}</td>
                    <td className="px-3 py-2.5">{r.client_name_snapshot ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {r.service_date}
                      {r.start_time && <span className="text-muted-foreground"> · {r.start_time.slice(0, 5)}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[260px]">{r.service_address ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{r.total_requested}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.linked_shifts_count > 0 ? r.linked_shifts_count : <span className="text-muted-foreground">0</span>}
                      {needsShift && (
                        <AlertTriangle className="inline size-3.5 ml-1 text-amber-500" />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium whitespace-nowrap", STATUS_TONE[r.status])}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <QuickCreateRequestDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RequestDetailDrawer
        open={!!selectedId}
        onOpenChange={(v) => { if (!v) setSelectedId(null); }}
        requestId={selectedId}
      />
    </div>
  );
}
