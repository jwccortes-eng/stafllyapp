import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Receipt, Search, Loader2, AlertTriangle, ArrowRight, Eye,
  CheckCircle2, XCircle, ArrowLeft, Info,
} from "lucide-react";

/* ───────────────────────── Decision matrix (approved manually) ─────────────────────────
 * Drives default selection + suggested name + reason. Editable per row in the UI.
 * Match by normalized name (uppercase, trimmed) so this is import-source agnostic.
 * ─────────────────────────────────────────────────────────────────────────────────────── */
type Recommendation = "include" | "include_rename" | "review" | "exclude";

interface Decision {
  match: string;             // normalized name to match
  recommendation: Recommendation;
  suggestedName?: string;    // pre-filled in the editable name input
  reason: string;
}

const DECISIONS: Decision[] = [
  // Include directly (active, real clients)
  { match: "EMMINENCE HALL",            recommendation: "include",        suggestedName: "Emminence Hall",        reason: "Top client. Title-case." },
  { match: "ELY PRODUCCION",            recommendation: "include",        suggestedName: "Ely Producción",        reason: "High-volume active." },
  { match: "THE MILENIUM SIMCHA",       recommendation: "include",        suggestedName: "The Milenium Simcha",   reason: "Active." },
  { match: "SPARK NEW YORK",            recommendation: "include",        suggestedName: "Spark New York",        reason: "Active." },
  { match: "CHEF KAUFMAN",              recommendation: "include",        suggestedName: "Chef Kaufman",          reason: "Active." },
  { match: "ZEMER HALL",                recommendation: "include",        suggestedName: "Zemer Hall",            reason: "Active." },
  { match: "OCCASIONS EVENTS",          recommendation: "include",        suggestedName: "Occasions Events",      reason: "Active." },
  { match: "YF PRODUCTIONS",            recommendation: "include",        suggestedName: "YF Productions",        reason: "Active." },
  { match: "USHI EVENTS",               recommendation: "include",        suggestedName: "Ushi Events",           reason: "Active." },
  { match: "VIP PRODUCTION",            recommendation: "include",        suggestedName: "VIP Production",        reason: "Active." },
  { match: "J EVENTS",                  recommendation: "include",        suggestedName: "J Events",              reason: "Active." },
  { match: "RACHEL",                    recommendation: "include",        suggestedName: "Rachel",                reason: "Person-client." },
  { match: "OH EVENTS",                 recommendation: "include",        suggestedName: "OH Events",             reason: "Real client, low volume." },
  { match: "YOSSI TENNEN HOUSE",        recommendation: "include",        suggestedName: "Yossi Tennen House",    reason: "Active." },

  // Include with editable rename suggestion (do NOT auto-apply)
  { match: "NEW CONSTUMER",             recommendation: "include_rename", suggestedName: "New Customer",          reason: "Possible typo of 'Customer'. Confirm before keeping rename." },
  { match: "BANQUIT EVENTS",            recommendation: "include_rename", suggestedName: "Banquet Events",        reason: "Possible typo of 'Banquet'. Confirm before keeping rename." },

  // Excluded by approval
  { match: "MANAGER/QUALITY S",         recommendation: "exclude",                                                reason: "Internal/admin label, not a real client." },
  { match: "EMMINCENCE",                recommendation: "exclude",                                                reason: "Typo of EMMINENCE HALL. Will be consolidated in a separate pass." },
  { match: "PRUEBA 2",                  recommendation: "exclude",                                                reason: "Test data." },

  // To review manually
  { match: "QUALITY STAFF BY KEURY LLC", recommendation: "review",                                                reason: "Self-billing risk: this is the company itself. Confirm before importing." },
  { match: "TABLE 40",                   recommendation: "review",                                                reason: "Low volume, no recent activity. Decide active/inactive or skip." },
  { match: "MAYER CATERING",             recommendation: "review",        suggestedName: "Mayer Catering",        reason: "No activity in 90d. Likely import as inactive." },
  { match: "GREEN EVENTS",               recommendation: "review",        suggestedName: "Green Events",          reason: "No activity in 90d. Likely import as inactive." },
  { match: "21 * PASSOVER",              recommendation: "review",                                                reason: "Special event/category with 0 shifts. Requires manual decision before importing." },
];

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
function decisionFor(name: string): Decision {
  const n = norm(name);
  return (
    DECISIONS.find((d) => d.match === n) ?? {
      match: n,
      recommendation: "review",
      reason: "Not in approved decision matrix — needs manual triage.",
    }
  );
}

const REC_BADGE: Record<Recommendation, { label: string; cls: string }> = {
  include:        { label: "Include",        cls: "bg-success/10 text-success border-success/30" },
  include_rename: { label: "Include · Rename",cls: "bg-info/10 text-info border-info/30" },
  review:         { label: "Review",         cls: "bg-warning/10 text-warning border-warning/30" },
  exclude:        { label: "Exclude",        cls: "bg-muted text-muted-foreground border-border" },
};

interface OpClientRow {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  shifts_90d: number;
  shifts_total: number;
  last_shift: string | null;
  already_mapped: boolean;
}

interface RowState {
  selected: boolean;
  name: string;          // editable final name
  isActive: boolean;     // editable active flag
}

export default function InvoicingClientsImport() {
  const { selectedCompanyId } = useCompany();
  const [search, setSearch] = useState("");
  const [showRecommendedOnly, setShowRecommendedOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["clients-import-audit", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<OpClientRow[]> => {
      const cid = selectedCompanyId!;

      const [opsRes, billingRes, shiftsRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, contact_email, contact_phone, status")
          .eq("company_id", cid)
          .is("deleted_at", null),
        supabase
          .from("billing_clients")
          .select("operational_client_id")
          .eq("company_id", cid),
        supabase
          .from("scheduled_shifts")
          .select("client_id, date")
          .eq("company_id", cid)
          .is("deleted_at", null),
      ]);

      if (opsRes.error) throw opsRes.error;

      const mappedSet = new Set(
        (billingRes.data ?? [])
          .map((b) => b.operational_client_id)
          .filter(Boolean) as string[],
      );

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const tally = new Map<string, { total: number; in90: number; last: string | null }>();
      for (const s of shiftsRes.data ?? []) {
        if (!s.client_id) continue;
        const t = tally.get(s.client_id) ?? { total: 0, in90: 0, last: null };
        t.total += 1;
        if (s.date >= cutoffStr) t.in90 += 1;
        if (!t.last || s.date > t.last) t.last = s.date;
        tally.set(s.client_id, t);
      }

      return (opsRes.data ?? []).map((c) => {
        const t = tally.get(c.id);
        return {
          id: c.id,
          name: c.name,
          contact_email: c.contact_email,
          contact_phone: c.contact_phone,
          status: c.status,
          shifts_90d: t?.in90 ?? 0,
          shifts_total: t?.total ?? 0,
          last_shift: t?.last ?? null,
          already_mapped: mappedSet.has(c.id),
        };
      });
    },
  });

  // Initialize row state once data loads (default selection from decision matrix)
  useEffect(() => {
    if (!data) return;
    setRowState((prev) => {
      const next = { ...prev };
      for (const row of data) {
        if (next[row.id]) continue;
        const d = decisionFor(row.name);
        const isActiveDefault = row.shifts_90d > 0 || row.status === "active";
        next[row.id] = {
          selected:
            !row.already_mapped &&
            (d.recommendation === "include" || d.recommendation === "include_rename"),
          name: d.suggestedName ?? row.name,
          isActive: isActiveDefault,
        };
      }
      return next;
    });
  }, [data]);

  const rows = data ?? [];

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) => x.name.toLowerCase().includes(q));
    }
    if (showRecommendedOnly) {
      r = r.filter((x) => {
        const d = decisionFor(x.name);
        return d.recommendation === "include" || d.recommendation === "include_rename";
      });
    }
    if (!showInactive) {
      r = r.filter((x) => (rowState[x.id]?.isActive ?? true));
    }
    return r.sort((a, b) => b.shifts_90d - a.shifts_90d || a.name.localeCompare(b.name));
  }, [rows, search, showRecommendedOnly, showInactive, rowState]);

  const selectedRows = useMemo(
    () => rows.filter((r) => rowState[r.id]?.selected && !r.already_mapped),
    [rows, rowState],
  );

  const skippedRows = useMemo(() => {
    return rows
      .filter((r) => !rowState[r.id]?.selected || r.already_mapped)
      .map((r) => {
        const d = decisionFor(r.name);
        let reason = d.reason;
        if (r.already_mapped) reason = "Already mapped to a billing client.";
        else if (d.recommendation === "exclude") reason = `Excluded · ${d.reason}`;
        else if (d.recommendation === "review") reason = `Review · ${d.reason}`;
        else reason = `Unselected · ${d.reason}`;
        return { id: r.id, name: r.name, reason };
      });
  }, [rows, rowState]);

  const updateRow = (id: string, patch: Partial<RowState>) =>
    setRowState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  if (!selectedCompanyId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Receipt}
          title="No company selected"
          description="Select a company to import billing clients."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Import Billing Clients"
        subtitle="Convert operational clients into billable clients. Read-only preview — nothing is written until import is enabled."
        icon={Receipt}
        rightSlot={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/invoicing/clients">
                <ArrowLeft className="h-4 w-4" /> Back to Clients
              </Link>
            </Button>
            <Button size="sm" onClick={() => setPreviewOpen(true)} disabled={selectedRows.length === 0}>
              <Eye className="h-4 w-4" />
              Preview import ({selectedRows.length})
            </Button>
          </div>
        }
      />

      {/* Read-only banner */}
      <div className="rounded-xl border border-info/30 bg-info/5 p-3 flex items-start gap-3">
        <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
        <div className="flex-1 text-xs">
          <p className="font-semibold text-foreground">Read-only preview mode</p>
          <p className="text-muted-foreground mt-0.5">
            This wizard previews the exact data that would be inserted into <code>billing_clients</code>.
            The import button is disabled by design — no records are created, modified, or deleted.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-surface-1 p-4">
        <div className="space-y-1 flex-1 min-w-60">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by client name…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="recommended-only"
            checked={showRecommendedOnly}
            onCheckedChange={setShowRecommendedOnly}
          />
          <Label htmlFor="recommended-only" className="text-xs">Recommended only</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-inactive"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive" className="text-xs">Include inactive</Label>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{selectedRows.length}</span> selected ·{" "}
          <span className="font-semibold text-foreground">{skippedRows.length}</span> skipped ·{" "}
          {rows.length} total
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Operational name</TableHead>
              <TableHead>Final name (editable)</TableHead>
              <TableHead className="text-right">Shifts 90d</TableHead>
              <TableHead className="text-right">All-time</TableHead>
              <TableHead>Last shift</TableHead>
              <TableHead>Recommendation</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
                  <Loader2 className="inline h-4 w-4 animate-spin" /> Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  No clients match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const d = decisionFor(r.name);
                const st = rowState[r.id] ?? { selected: false, name: r.name, isActive: true };
                const disabled = r.already_mapped || d.recommendation === "exclude";
                return (
                  <TableRow key={r.id} className={disabled ? "opacity-60" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={st.selected}
                        disabled={disabled}
                        onCheckedChange={(v) => updateRow(r.id, { selected: !!v })}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.name}</TableCell>
                    <TableCell>
                      <Input
                        value={st.name}
                        onChange={(e) => updateRow(r.id, { name: e.target.value })}
                        className="h-8 text-xs"
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.shifts_90d}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.shifts_total}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.last_shift ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={REC_BADGE[d.recommendation].cls} title={d.reason}>
                        {REC_BADGE[d.recommendation].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={st.isActive}
                        onCheckedChange={(v) => updateRow(r.id, { isActive: v })}
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell>
                      {r.already_mapped ? (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                          Mapped
                        </Badge>
                      ) : d.recommendation === "exclude" ? (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> Excluded
                        </span>
                      ) : st.selected ? (
                        <span className="text-xs text-success inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> To import
                        </span>
                      ) : (
                        <span className="text-xs text-warning inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Skipped
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Preview sheet */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Preview · {selectedRows.length} billing clients</SheetTitle>
            <SheetDescription>
              Exact payload that would be inserted into <code>billing_clients</code>. No write happens.
            </SheetDescription>
          </SheetHeader>

          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 mt-4 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">
              Import is intentionally disabled in this build. Coming soon as an idempotent action keyed on{" "}
              <code>operational_client_id</code>.
            </p>
          </div>

          <ScrollArea className="h-[calc(100vh-260px)] mt-4 pr-3">
            <div className="space-y-4">
              {/* Will create */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Will create ({selectedRows.length})
                </h3>
                {selectedRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing selected.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedRows.map((r) => {
                      const st = rowState[r.id]!;
                      const payload = {
                        company_id: selectedCompanyId,
                        name: st.name.trim(),
                        operational_client_id: r.id,
                        email: r.contact_email,
                        phone: r.contact_phone,
                        default_currency: "USD",
                        is_active: st.isActive,
                        notes: `Imported from operational client "${r.name}" on ${new Date().toISOString().slice(0, 10)}`,
                      };
                      return (
                        <pre
                          key={r.id}
                          className="text-[11px] font-mono bg-surface-2 border border-border/40 rounded p-2 overflow-x-auto"
                        >
{JSON.stringify(payload, null, 2)}
                        </pre>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Skipped */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Skipped ({skippedRows.length})
                </h3>
                {skippedRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No skipped rows.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {skippedRows.map((s) => (
                      <li key={s.id} className="flex items-start gap-2 border-b border-border/30 pb-1">
                        <span className="font-mono shrink-0">{s.name}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{s.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </ScrollArea>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/40 pt-4">
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>Close</Button>
            <Button disabled title="Coming soon — import is disabled in preview mode">
              Import {selectedRows.length} (Coming soon)
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
