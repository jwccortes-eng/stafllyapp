/**
 * WorkerDocumentsCompliance — drawer/profile section, read-only.
 *
 * Renders for a single worker:
 *  - Required documents checklist (approved / missing)
 *  - All uploaded documents with status, expiration, source
 *  - Signed-URL "View" action (private bucket safe)
 *
 * This is a read-only summary. The existing DocumentsTab inside
 * EmployeeProfileTabs keeps full upload/approve/reject flows untouched.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseISO, isValid, formatDistanceToNowStrict } from "date-fns";
import { enUS } from "date-fns/locale";
import { formatDateUS } from "@/lib/date-format";
import {
  FileText, ShieldCheck, Eye, FileX2, FileClock, CalendarClock, FileWarning, FileMinus,
  Sparkles,
} from "lucide-react";
import {
  normalizeDocuments,
  buildWorkerDocSignals,
  DOC_STATUS_LABEL,
  DOC_SOURCE_LABEL,
  type UnifiedDocumentRow,
  type UnifiedDocStatus,
} from "@/lib/documents-signals";
import {
  getRequiredDocumentsForCompany,
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "@/lib/onboarding/required-documents";
import {
  classifyExpiration,
  expirationPolicyFor,
} from "@/lib/onboarding/document-expiration-policy";
import { resolveEmployeeDocumentUrl } from "@/lib/employee-documents";
import DocumentPreviewDialog from "@/components/documents/DocumentPreviewDialog";

interface Props {
  employee: any;
}

const STATUS_TONE: Record<UnifiedDocStatus, string> = {
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  expired: "border-rose-200 bg-rose-50 text-rose-700",
  expiring_soon: "border-amber-200 bg-amber-50 text-amber-700",
};

const STATUS_ICON: Record<UnifiedDocStatus, React.ComponentType<{ className?: string }>> = {
  approved: ShieldCheck,
  pending: FileClock,
  rejected: FileWarning,
  expired: FileX2,
  expiring_soon: CalendarClock,
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = parseISO(s);
  return isValid(d) ? (formatDateUS(d) || "—") : "—";
}

function relativeTo(s: string | null): string | null {
  if (!s) return null;
  const d = parseISO(s);
  if (!isValid(d)) return null;
  return formatDistanceToNowStrict(d, { addSuffix: true, locale: enUS });
}

export default function WorkerDocumentsCompliance({ employee }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UnifiedDocumentRow[]>([]);
  const [required, setRequired] = useState<DocumentCategory[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!employee?.id || !employee?.company_id) { setLoading(false); return; }
      setLoading(true);
      const sb: any = supabase;

      const hc = (employee.has_car ?? "").toString().toLowerCase().trim();
      const canDrive = hc === "yes" || hc === "sí" || hc === "si" || hc === "true" || !!employee.can_drive;

      const [adminRes, onbRes, req] = await Promise.all([
        sb.from("employee_documents")
          .select("id, employee_id, company_id, name, file_url, file_type, file_size, category, created_at, review_status, reviewed_at, rejection_reason, expires_at")
          .eq("employee_id", employee.id)
          .eq("company_id", employee.company_id)
          .order("created_at", { ascending: false }),
        sb.from("employee_onboarding_documents")
          .select("id, employee_id, company_id, document_type, file_url, file_name, status, uploaded_at, verified_at, notes, created_at")
          .eq("employee_id", employee.id)
          .eq("company_id", employee.company_id)
          .order("created_at", { ascending: false }),
        getRequiredDocumentsForCompany(employee.company_id, { canDrive }),
      ]);

      if (cancelled) return;
      const unified = normalizeDocuments({
        adminDocs: (adminRes?.data as any[]) ?? [],
        onboardingDocs: (onbRes?.data as any[]) ?? [],
      });
      setRows(unified);
      setRequired(req);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [employee?.id, employee?.company_id, employee?.has_car, employee?.can_drive]);

  const signals = buildWorkerDocSignals(
    rows,
    new Map([[employee?.id ?? "_", required]]),
  ).get(employee?.id ?? "_") ?? {
    approvedCount: 0, pendingCount: 0, rejectedCount: 0,
    expiredCount: 0, expiringSoonCount: 0, missingRequiredLabels: [],
  };

  if (loading) {
    return (
      <Card className="border-border/60 shadow-none">
        <div className="p-3 text-[11px] text-muted-foreground">Loading documents…</div>
      </Card>
    );
  }

  const hasIssue =
    signals.missingRequiredLabels.length > 0 ||
    signals.pendingCount > 0 ||
    signals.rejectedCount > 0 ||
    signals.expiredCount > 0 ||
    signals.expiringSoonCount > 0;

  return (
    <Card className={cn("border shadow-none", hasIssue ? "border-amber-200/60 bg-amber-50/20" : "border-emerald-200/60 bg-emerald-50/20")}>
      <div className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className={cn("rounded-md p-1.5 border", hasIssue ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
              <FileText className="h-3.5 w-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
                Documents & Compliance
              </h4>
              <p className="text-[10.5px] text-muted-foreground leading-tight max-w-md">
                Read-only summary. Readiness signal only — payroll calculations are not changed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Pill icon={ShieldCheck} tone="success" value={signals.approvedCount} label="Approved" />
            {signals.pendingCount > 0 && <Pill icon={FileClock} tone="warning" value={signals.pendingCount} label="Pending" />}
            {signals.expiringSoonCount > 0 && <Pill icon={CalendarClock} tone="warning" value={signals.expiringSoonCount} label="Expiring" />}
            {signals.expiredCount > 0 && <Pill icon={FileX2} tone="destructive" value={signals.expiredCount} label="Expired" />}
            {signals.rejectedCount > 0 && <Pill icon={FileWarning} tone="destructive" value={signals.rejectedCount} label="Rejected" />}
          </div>
        </div>

        {/* Required checklist */}
        <div className="rounded-md border border-border/60 bg-card/60 p-2.5 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Required documents
          </div>
          {required.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No required documents defined for this company.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {required.map((cat) => {
                const label = (DOCUMENT_CATEGORIES as any)[cat]?.label ?? cat;
                const missing = signals.missingRequiredLabels.includes(label);
                const Icon = missing ? FileMinus : ShieldCheck;
                return (
                  <li
                    key={cat}
                    className={cn(
                      "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px]",
                      missing
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-emerald-200 bg-emerald-50/70 text-emerald-800",
                    )}
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="font-medium truncate">{label}</span>
                    <span className="ml-auto text-[10px] opacity-75">
                      {missing ? "Missing" : "Approved"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Uploaded documents */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Uploaded documents ({rows.length})
          </div>
          {rows.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No documents uploaded yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((r) => (
                <DocRow key={r.id} row={r} />
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-border/60 bg-background/60 p-2 text-[10.5px] text-muted-foreground italic flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          Approve, reject and upload actions are available in the Documents tab below.
        </div>
      </div>
    </Card>
  );
}

function DocRow({ row }: { row: UnifiedDocumentRow }) {
  const StatusIcon = STATUS_ICON[row.status];
  const onView = async () => {
    const url = await resolveEmployeeDocumentUrl(row.file_path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };
  const expRel = relativeTo(row.expires_at);
  const expState = classifyExpiration(row.category, row.expires_at);
  const policy = expirationPolicyFor(row.category);
  return (
    <li className="flex items-center gap-2 rounded-md border border-border/50 bg-card/70 p-2">
      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11.5px] font-medium truncate">{row.document_type}</span>
          <Badge variant="outline" className={cn("text-[9px] py-0 leading-none", STATUS_TONE[row.status])}>
            <StatusIcon className="h-2.5 w-2.5 mr-1" />
            {DOC_STATUS_LABEL[row.status]}
          </Badge>
          {expState === "missing_expiration" && (
            <Badge variant="outline" className="text-[9px] py-0 leading-none border-amber-200 bg-amber-50 text-amber-700">
              <CalendarClock className="h-2.5 w-2.5 mr-1" />
              {policy === "required" ? "Missing expiration" : "Add expiration"}
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {DOC_SOURCE_LABEL[row.source]}
          {row.created_at && <> · uploaded {fmtDate(row.created_at)}</>}
          {row.expires_at && <> · expires {fmtDate(row.expires_at)}{expRel ? ` (${expRel})` : ""}</>}
        </div>
        {row.rejection_reason && (
          <div className="text-[10px] text-rose-700 mt-0.5">
            <span className="font-semibold">Reason:</span> {row.rejection_reason}
          </div>
        )}
      </div>
      {row.file_path && (
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onView} title="View document">
          <Eye className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );
}

function Pill({
  icon: Icon, tone, value, label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "warning" | "destructive";
  value: number;
  label: string;
}) {
  const cls =
    tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
    tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" :
    "border-rose-200 bg-rose-50 text-rose-700";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium", cls)}>
      <Icon className="h-3 w-3" />
      <span className="font-mono tabular-nums font-semibold">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}
