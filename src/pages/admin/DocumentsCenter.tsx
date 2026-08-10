/**
 * DocumentsCenter — /app/documents (Phase 1, read-only).
 *
 * Tenant-scoped roll-up of admin + onboarding documents using the unified
 * `useCompanyDocuments` hook. No writes. View opens via signed URL only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
import { updateDocumentExpiration, fromEmployeeDocument } from "@/lib/document-actions";
import { resolveEmployeeDocumentUrl } from "@/lib/employee-documents";
import DocumentPreviewDialog from "@/components/documents/DocumentPreviewDialog";
import AssistedExtractionPanel from "@/components/documents/AssistedExtractionPanel";
import DocumentReviewActions from "@/components/documents/DocumentReviewActions";
import DocumentHistoryPanel from "@/components/documents/DocumentHistoryPanel";
import { useAuth } from "@/hooks/useAuth";
import { getRequiredDocumentsForCompany } from "@/lib/onboarding/required-documents";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { OperationalWorkspace, WorkspaceSearch, WorkspaceTabs } from "@/components/stafly-ui/OperationalWorkspace";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileQueueRow, MobileQueueDrawer } from "@/components/admin/mobile";
import { Search, Download, ExternalLink, UserSearch, FileText, CalendarClock, Pencil, Eye, ClipboardCheck, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateUS } from "@/lib/date-format";
import { formatExpirationDisplay, isSentinelExpiration } from "@/lib/documents/expiration-display";
import { cn } from "@/lib/utils";
import { logMount, logUnmount } from "@/lib/ctx001-forensics";

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
  const { canAccessAdminForCompany } = useAuth();
  const canReview = canAccessAdminForCompany(selectedCompanyId ?? null);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const initialLoadComplete = useRef(false);
  const initialDocumentId = useRef(searchParams.get("document"));

  useEffect(() => {
    const id = logMount("DocumentsCenter", { documentId: initialDocumentId.current });
    return () => logUnmount("DocumentsCenter", id);
  }, []);

  const { data: requiredCategories = [] } = useQuery({
    queryKey: ["documents-center-required", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () =>
      selectedCompanyId ? await getRequiredDocumentsForCompany(selectedCompanyId) : [],
  });

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
          version: null,
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
          file_type: null,
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

  // Optional per-worker scoping (?employee=<id>) — used when the Worker Profile
  // deep-links "Revisar documentos pendientes" here. Frontend-only filter over
  // the rows already returned by useCompanyDocuments (which is company-scoped).
  const employeeParam = searchParams.get("employee");
  const scopedEmployeeName = useMemo(() => {
    if (!employeeParam) return null;
    const e = employeeMap.get(employeeParam);
    if (!e) return null;
    return `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Worker";
  }, [employeeParam, employeeMap]);

  const clearEmployeeFilter = () => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("employee");
    setSearchParams(sp, { replace: true });
  };

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
    if (employeeParam) {
      base = base.filter((r) => r.employee_id === employeeParam);
    }
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      r.worker_name.toLowerCase().includes(q) ||
      r.document_type.toLowerCase().includes(q),
    );
  }, [rows, missingRows, missingExpirationRows, activeFilter, search, employeeParam]);

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
  const [drawerRow, setDrawerRow] = useState<UnifiedDocumentRow | null>(null);
  const employeeBeforePreviewRef = useRef<string | null>(employeeParam);

  const handleView = (row: UnifiedDocumentRow) => {
    if (!row.file_path) {
      toast({ title: "No file uploaded yet", description: "This is a missing-document placeholder." });
      return;
    }
    employeeBeforePreviewRef.current = employeeParam;
    setPreviewRow(row);
    const sp = new URLSearchParams(searchParams);
    sp.set("document", row.id);
    sp.set("employee", row.employee_id);
    if (search.trim()) sp.set("q", search.trim()); else sp.delete("q");
    setSearchParams(sp, { replace: true });
  };

  const closePreview = () => {
    setPreviewRow(null);
    const sp = new URLSearchParams(searchParams);
    sp.delete("document");
    const priorEmployee = employeeBeforePreviewRef.current;
    if (priorEmployee) sp.set("employee", priorEmployee); else sp.delete("employee");
    setSearchParams(sp, { replace: true });
  };

  // The URL owns the open-document identity. A background refresh may replace
  // rows, but it must never clear the current review while data is in flight.
  const documentParam = searchParams.get("document");
  useEffect(() => {
    if (loading) return;
    initialLoadComplete.current = true;
    if (!documentParam) {
      setPreviewRow(null);
      return;
    }
    const resolved = rows.find((row) => row.id === documentParam);
    if (resolved) setPreviewRow(resolved);
    else setPreviewRow(null); // fail closed when RLS/tenant scope did not return it
  }, [documentParam, loading, rows]);

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
    { key: "all", label: "Todos" },
    { key: "needs_review", label: "Necesitan revisión" },
    { key: "missing", label: "Faltantes" },
    { key: "pending", label: "Pendientes" },
    { key: "expired", label: "Vencidos" },
    { key: "expiring_soon", label: "Por vencer" },
    { key: "missing_expiration", label: "Sin fecha de vencimiento" },
    { key: "rejected", label: "Rechazados" },
    { key: "approved", label: "Aprobados" },
  ];

  return (
    <OperationalWorkspace
      title="Documentos y cumplimiento"
      context="Vista de solo lectura de cada documento subido y de los requisitos que faltan en la empresa."
      search={
        <WorkspaceSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar persona o tipo de documento…"
        />
      }
      action={
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Exportar CSV
        </Button>
      }
      metrics={[
        { label: "Total", value: counts.all, tone: "neutral" as const },
        { label: "Necesitan revisión", value: counts.needs_review, tone: "warning" as const },
        { label: "Requisitos faltantes", value: counts.missing, tone: "warning" as const },
        { label: "Vencidos", value: counts.expired, tone: "critical" as const },
      ]}
      tabs={
        <WorkspaceTabs
          items={FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts[f.key] }))}
          value={activeFilter}
          onChange={(k) => setFilter(k as FilterKey)}
          ariaLabel="Estado del documento"
        />
      }
    >
      <div className="space-y-3 pt-3">
          {/* Scoped-employee chip — shown when we arrived via ?employee=<id>
              (e.g. from Worker Profile "Revisar documentos pendientes"). */}
          {employeeParam && scopedEmployeeName && (
            <div className="flex items-center gap-2 text-xs bg-primary/5 border border-primary/20 rounded-md px-2.5 py-1.5">
              <UserSearch className="h-3.5 w-3.5 text-primary" />
              <span className="text-foreground">
                Mostrando solo documentos de <strong>{scopedEmployeeName}</strong>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 ml-auto text-[10.5px]"
                onClick={clearEmployeeFilter}
              >
                <X className="h-3 w-3 mr-1" />
                Quitar filtro
              </Button>
            </div>
          )}

          {loading && !initialLoadComplete.current && rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center">Cargando documentos…</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Ningún documento coincide"
              description="Ajusta los filtros o el término de búsqueda."
            />
          ) : (
            <>
              {/* Mobile (<md): tappable rows + drawer-per-row.
                  Desktop (md+): existing 7-col table, untouched. */}
              <div className="md:hidden space-y-2">
                {filtered.map((r) => (
                  <MobileQueueRow
                    key={r.id}
                    onClick={() => setDrawerRow(r)}
                    primary={r.document_type}
                    secondary={r.worker_name}
                    topMeta={
                      <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5", STATUS_TONE[r.status])}>
                        {DOC_STATUS_LABEL[r.status]}
                      </Badge>
                    }
                    rightSlot={
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {fmtDate(r.created_at)}
                      </span>
                    }
                  />
                ))}
              </div>

              <div className="hidden md:block rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Persona</TableHead>
                      <TableHead>Tipo de documento</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Vencimiento</TableHead>
                      <TableHead>Origen</TableHead>
                      <TableHead>Subido</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
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
                            {(() => {
                              // "Revisar" for anything not yet approved (opens the
                              // same preview modal + AssistedExtractionPanel with
                              // status chip). "Preview" stays for approved rows.
                              const isReview = r.status !== "approved" && !!r.file_path;
                              return (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => handleView(r)}
                                  disabled={!r.file_path}
                                  title={isReview ? "Abrir para revisar (edición de metadata, no aprueba)" : "Vista previa"}
                                >
                                  {isReview ? (
                                    <ClipboardCheck className="h-3 w-3 mr-1" />
                                  ) : (
                                    <Eye className="h-3 w-3 mr-1" />
                                  )}
                                  {isReview ? "Revisar" : "Preview"}
                                </Button>
                              );
                            })()}
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
                                Perfil
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
      </div>

      <DocumentPreviewDialog
        open={!!previewRow}
        onOpenChange={(o) => { if (!o) closePreview(); }}
        item={previewRow ? {
          file_path: previewRow.file_path,
          id: previewRow.id,
          file_type: previewRow.file_type,
          file_name: previewRow.file_name,
          document_type: previewRow.document_type,
          category: String(previewRow.category),
          worker_name: previewRow.worker_name,
          uploaded_at: previewRow.created_at,
          expires_at: previewRow.expires_at,
          review_status:
            previewRow.status === "approved" ? "approved" :
            previewRow.status === "rejected" ? "rejected" : "pending",
        } : null}
        actions={previewRow && previewRow.source === "admin_upload" && previewRow.rawId ? (
          <div className="space-y-2">
            <DocumentReviewActions
              doc={fromEmployeeDocument({
                id: previewRow.rawId,
                employee_id: previewRow.employee_id,
                company_id: previewRow.company_id,
                name: previewRow.file_name ?? previewRow.document_type,
                file_url: previewRow.file_path,
                file_size: null,
                category: String(previewRow.category),
                created_at: previewRow.created_at ?? new Date().toISOString(),
                review_status: previewRow.status === "approved" ? "approved"
                  : previewRow.status === "rejected" ? "rejected" : "pending",
                reviewed_at: previewRow.reviewed_at,
                rejection_reason: previewRow.rejection_reason ?? null,
                expires_at: previewRow.expires_at,
                version: previewRow.version,
              })}
              requiredCategories={requiredCategories}
              canReview={canReview}
              onChanged={() => { void refresh(); setPreviewRow(null); }}
            />
            <DocumentHistoryPanel documentId={previewRow.rawId} canReview={canReview} />
          </div>
        ) : undefined}
        side={previewRow && previewRow.source === "admin_upload" && previewRow.rawId ? (
          <AssistedExtractionPanel
            target={{
              raw_id: previewRow.rawId,
              source: "employee_documents",
              employee_id: previewRow.employee_id,
              company_id: previewRow.company_id,
              name: previewRow.document_type,
              category: String(previewRow.category),
              current_expires_at: previewRow.expires_at,
              version: previewRow.version,
            }}
            onSaved={() => { void refresh(); }}
          />
        ) : undefined}
      />


      {/* Mobile drawer-per-row (read-only detail + existing CTAs only). */}
      <MobileQueueDrawer
        open={!!drawerRow}
        onOpenChange={(o) => !o && setDrawerRow(null)}
        maxHeightClassName="max-h-[88dvh]"
        headerMeta={drawerRow ? (
          <>
            <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5", STATUS_TONE[drawerRow.status])}>
              {DOC_STATUS_LABEL[drawerRow.status]}
            </Badge>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
              {DOC_SOURCE_LABEL[drawerRow.source]}
            </Badge>
          </>
        ) : undefined}
        title={drawerRow?.document_type}
        description={drawerRow?.worker_name}
        footer={drawerRow ? (
          <div className="flex flex-col gap-2">
            {drawerRow.file_path && (
              <Button
                className="w-full gap-2"
                onClick={() => {
                  const r = drawerRow;
                  setDrawerRow(null);
                  handleView(r);
                }}
              >
                <Eye className="h-4 w-4" />
                Preview document
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              {drawerRow.file_path && (
                <Button
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={() => handleOpenInTab(drawerRow)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in tab
                </Button>
              )}
              <Button asChild variant="outline" className={cn("w-full gap-1.5", !drawerRow.file_path && "col-span-2")}>
                <Link to={`/app/employees/${drawerRow.employee_id}`} onClick={() => setDrawerRow(null)}>
                  <UserSearch className="h-3.5 w-3.5" />
                  Perfil
                </Link>
              </Button>
            </div>
          </div>
        ) : undefined}
      >
        {drawerRow && (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <DocMetaCell label="Vencimiento" value={
                drawerRow.expires_at
                  ? formatExpirationDisplay(drawerRow.expires_at)
                  : (expirationPolicyFor(drawerRow.category) === "required" || expirationPolicyFor(drawerRow.category) === "recommended" ? "Falta" : "—")
              } />
              <DocMetaCell label="Subido" value={fmtDate(drawerRow.created_at)} />
              <DocMetaCell label="Origen" value={DOC_SOURCE_LABEL[drawerRow.source]} />
              <DocMetaCell label="Category" value={String(drawerRow.category)} />
            </div>

            {drawerRow.rejection_reason && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                <p className="font-semibold text-[10px] uppercase tracking-wider mb-1">Reason</p>
                <p>{drawerRow.rejection_reason}</p>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
              Solo lectura. Para editar la fecha de expiración, usa la vista desktop.
            </p>
          </>
        )}
      </MobileQueueDrawer>
    </OperationalWorkspace>
  );
}

function DocMetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-xs font-medium text-foreground truncate">{value}</p>
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

  const sentinel = isSentinelExpiration(row.expires_at);
  const expState = sentinel ? "valid" : classifyExpiration(row.category, row.expires_at);
  const policy = expirationPolicyFor(row.category);
  // v1: only admin documents are editable (onboarding table has no expires_at column).
  const editable = row.source === "admin_upload" && !!row.rawId;

  const display = (() => {
    if (sentinel) return "No requiere vencimiento";
    if (row.expires_at) {
      const d = new Date(row.expires_at);
      if (!isNaN(d.getTime())) return formatDateUS(d) || "—";
    }
    if (policy === "not_applicable") return "—";
    if (policy === "required" || policy === "recommended") return "Falta";
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
        version: row.version,
      },
      value || null,
    );
    setSaving(false);
    if (error) {
      toast({ title: "Could not save expiration", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "Vencimiento actualizado" });
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
        <div className="text-[11px] font-semibold">Editar fecha de vencimiento</div>
        <SmartDateInput value={value} onChange={setValue} allowClear showCalendar />
        <div className="text-[10px] text-muted-foreground">
          Déjalo vacío si el documento no vence.
        </div>
        <div className="flex justify-end gap-1.5 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
