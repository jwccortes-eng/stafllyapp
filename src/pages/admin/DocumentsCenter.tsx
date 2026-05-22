/**
 * DocumentsCenter — /app/documents (Phase 1, read-only).
 *
 * Tenant-scoped roll-up of admin + onboarding documents using the unified
 * `useCompanyDocuments` hook. No writes. View opens via signed URL only.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/supabase-pagination";
import { useCompany } from "@/hooks/useCompany";
import { useCompanyDocuments } from "@/hooks/useCompanyDocuments";
import {
  DOC_STATUS_LABEL,
  DOC_SOURCE_LABEL,
  type UnifiedDocStatus,
  type UnifiedDocumentRow,
} from "@/lib/documents-signals";
import {
  classifyExpiration,
  expirationPolicyFor,
  EXPIRATION_STATE_LABEL,
} from "@/lib/onboarding/document-expiration-policy";
import { updateDocumentExpiration } from "@/lib/document-actions";
import { resolveEmployeeDocumentUrl } from "@/lib/employee-documents";
import DocumentPreviewDialog from "@/components/documents/DocumentPreviewDialog";
import AssistedExtractionPanel from "@/components/documents/AssistedExtractionPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PremiumPageHeader } from "@/components/ui/premium-page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Search, Download, ExternalLink, UserSearch, FileText, CalendarClock, Pencil, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateUS } from "@/lib/date-format";

type FilterKey = "all" | "needs_review" | "missing" | "pending" | "expired" | "expiring_soon" | "missing_expiration" | "rejected" | "approved";

const STATUS_TONE: Record<UnifiedDocStatus, string> = {
  approved:       "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending:        "border-amber-200 bg-amber-50 text-amber-700",
  rejected:       "border-rose-200 bg-rose-50 text-rose-700",
  expired:        "border-rose-200 bg-rose-50 text-rose-700",
  expiring_soon:  "border-amber-200 bg-amber-50 text-amber-700",
};

export default function DocumentsCenter() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");

  // Workers (for "missing" filter and worker name fallback).
  const { data: employees = [] } = useQuery({
    queryKey: ["documents-center-workers", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      if (!selectedCompanyId) return [] as any[];
      const res = await fetchAllPaginated<any>((from, to) =>
        (supabase as any)
          .from("employees")
          .select("id, first_name, last_name, is_active, has_car, can_drive")
          .eq("company_id", selectedCompanyId)
          .order("id", { ascending: true })
          .range(from, to),
      );
      return res.data ?? [];
    },
  });

  const { rows, signals, loading, refresh } = useCompanyDocuments({
    companyId: selectedCompanyId ?? null,
    employees,
  });

  const filterParam = (searchParams.get("status") as FilterKey) || "all";
  const [activeFilter, setActiveFilter] = useState<FilterKey>(filterParam);
  useEffect(() => { setActiveFilter(filterParam); }, [filterParam]);

  const setFilter = (next: FilterKey) => {
    setActiveFilter(next);
    const sp = new URLSearchParams(searchParams);
    if (next === "all") sp.delete("status"); else sp.set("status", next);
    setSearchParams(sp, { replace: true });
  };

  const employeeMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  // For "missing" filter: synthesize one row per missing required category.
  const missingRows = useMemo(() => {
    const out: UnifiedDocumentRow[] = [];
    for (const [empId, sig] of signals.entries()) {
      if (!sig.missingRequiredLabels.length) continue;
      const e = employeeMap.get(empId);
      if (!e) continue;
      for (const label of sig.missingRequiredLabels) {
        out.push({
          id: `missing-${empId}-${label}`,
          rawId: "",
          source: "admin_upload",
          employee_id: empId,
          company_id: selectedCompanyId ?? "",
          worker_name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "—",
          document_type: label,
          category: "required",
          status: "pending",
          expires_at: null,
          file_path: "",
          bucket: "unknown",
          file_name: null,
          created_at: null,
          reviewed_at: null,
          rejection_reason: "Required document not yet uploaded.",
        });
      }
    }
    return out;
  }, [signals, employeeMap, selectedCompanyId]);

  const missingExpirationRows = useMemo(
    () => rows.filter(
      (r) =>
        r.source === "admin_upload" &&
        !r.expires_at &&
        (expirationPolicyFor(r.category) === "required" ||
          expirationPolicyFor(r.category) === "recommended"),
    ),
    [rows],
  );

  const filtered = useMemo(() => {
    let base: UnifiedDocumentRow[] = rows;
    switch (activeFilter) {
      case "missing":      base = missingRows; break;
      case "pending":      base = rows.filter((r) => r.status === "pending"); break;
      case "expired":      base = rows.filter((r) => r.status === "expired"); break;
      case "expiring_soon":base = rows.filter((r) => r.status === "expiring_soon"); break;
      case "missing_expiration": base = missingExpirationRows; break;
      case "rejected":     base = rows.filter((r) => r.status === "rejected"); break;
      case "approved":     base = rows.filter((r) => r.status === "approved"); break;
      case "needs_review": base = rows.filter((r) => r.status !== "approved"); break;
      case "all":
      default:             base = rows;
    }
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      r.worker_name.toLowerCase().includes(q) ||
      r.document_type.toLowerCase().includes(q),
    );
  }, [rows, missingRows, missingExpirationRows, activeFilter, search]);

  const counts = useMemo(() => ({
    all: rows.length,
    needs_review: rows.filter((r) => r.status !== "approved").length,
    missing: missingRows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    expired: rows.filter((r) => r.status === "expired").length,
    expiring_soon: rows.filter((r) => r.status === "expiring_soon").length,
    missing_expiration: missingExpirationRows.length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    approved: rows.filter((r) => r.status === "approved").length,
  }), [rows, missingRows, missingExpirationRows]);

  const [previewRow, setPreviewRow] = useState<UnifiedDocumentRow | null>(null);

  const handleView = (row: UnifiedDocumentRow) => {
    if (!row.file_path) {
      toast({ title: "No file uploaded yet", description: "This is a missing-document placeholder." });
      return;
    }
    setPreviewRow(row);
  };

  const handleOpenInTab = async (row: UnifiedDocumentRow) => {
    if (!row.file_path) return;
    const url = await resolveEmployeeDocumentUrl(row.file_path);
    if (!url) {
      toast({ title: "Could not open document", description: "The file may have been removed.", variant: "destructive" });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const exportCsv = () => {
    const header = ["worker", "document_type", "status", "expiration", "source", "uploaded_at"];
    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [header.join(",")];
    for (const r of filtered) {
      lines.push([
        r.worker_name,
        r.document_type,
        DOC_STATUS_LABEL[r.status],
        r.expires_at ?? "",
        DOC_SOURCE_LABEL[r.source],
        r.created_at ?? "",
      ].map(escape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `documents_${activeFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fmtDate = (s: string | null) => {
    if (!s) return "—";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "—";
    return formatDateUS(d) || "—";
  };

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "needs_review", label: "Needs review" },
    { key: "missing", label: "Missing" },
    { key: "pending", label: "Pending" },
    { key: "expired", label: "Expired" },
    { key: "expiring_soon", label: "Expiring soon" },
    { key: "missing_expiration", label: "Missing expiration" },
    { key: "rejected", label: "Rejected" },
    { key: "approved", label: "Approved" },
  ];

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <PremiumPageHeader
        icon={FileText}
        title="Documents & Compliance"
        subtitle="Read-only view of every uploaded document and missing required item across the company."
        kpis={[
          { label: "Total", value: counts.all },
          { label: "Needs review", value: counts.needs_review, accent: "warning" },
          { label: "Missing", value: counts.missing, accent: "warning" },
          { label: "Expired", value: counts.expired, accent: "destructive" },
        ]}
      />

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search worker or document type…"
                className="h-9 pl-8 text-sm"
              />
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>

          <Tabs value={activeFilter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/40 p-1">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.key} value={f.key} className="text-[11px] h-7 px-2.5 data-[state=active]:bg-background">
                  {f.label}
                  <span className="ml-1.5 text-[10px] tabular-nums opacity-70">
                    {counts[f.key]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {loading ? (
            <div className="text-sm text-muted-foreground py-10 text-center">Loading documents…</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents match"
              description="Adjust the filters or search term."
            />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Document type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expiration</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.worker_name}</TableCell>
                      <TableCell>{r.document_type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_TONE[r.status]}>
                          {DOC_STATUS_LABEL[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <ExpirationCell row={r} onSaved={refresh} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{DOC_SOURCE_LABEL[r.source]}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => handleView(r)}
                            disabled={!r.file_path}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Preview
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => handleOpenInTab(r)}
                            disabled={!r.file_path}
                            title="Open in new tab"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                            <Link to={`/app/employees/${r.employee_id}`}>
                              <UserSearch className="h-3 w-3 mr-1" />
                              Worker
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── ExpirationCell — admin-editable expiration date ─────────────────────────
function ExpirationCell({
  row,
  onSaved,
}: {
  row: UnifiedDocumentRow;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(row.expires_at ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(row.expires_at ?? ""); }, [row.expires_at]);

  const expState = classifyExpiration(row.category, row.expires_at);
  const policy = expirationPolicyFor(row.category);
  // v1: only admin documents are editable (onboarding table has no expires_at column).
  const editable = row.source === "admin_upload" && !!row.rawId;

  const display = (() => {
    if (row.expires_at) {
      const d = new Date(row.expires_at);
      if (!isNaN(d.getTime())) return formatDateUS(d) || "—";
    }
    if (policy === "not_applicable") return "—";
    if (policy === "required" || policy === "recommended") return "Missing";
    return "—";
  })();

  const tone =
    expState === "expired"            ? "border-rose-200 bg-rose-50 text-rose-700" :
    expState === "expiring_soon"      ? "border-amber-200 bg-amber-50 text-amber-700" :
    expState === "missing_expiration" ? "border-amber-200 bg-amber-50 text-amber-700" :
    expState === "valid"              ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                                        "border-muted-foreground/20 bg-muted/30 text-muted-foreground";

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateDocumentExpiration(
      {
        raw_id: row.rawId,
        source: "employee_documents",
        employee_id: row.employee_id,
        company_id: row.company_id,
        name: row.document_type,
        category: String(row.category),
      },
      value || null,
    );
    setSaving(false);
    if (error) {
      toast({ title: "Could not save expiration", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "Expiration updated" });
    setOpen(false);
    await onSaved();
  };

  const trigger = (
    <div className="inline-flex items-center gap-1.5">
      <Badge variant="outline" className={tone}>
        <CalendarClock className="h-3 w-3 mr-1" />
        {display}
      </Badge>
      <span className="text-[10px] text-muted-foreground/70">{EXPIRATION_STATE_LABEL[expState]}</span>
    </div>
  );

  if (!editable) return trigger;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 hover:opacity-80">
          {trigger}
          <Pencil className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-2" align="start">
        <div className="text-[11px] font-semibold">Edit expiration date</div>
        <SmartDateInput value={value} onChange={setValue} allowClear showCalendar />
        <div className="text-[10px] text-muted-foreground">
          Leave empty if this document has no expiration.
        </div>
        <div className="flex justify-end gap-1.5 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
