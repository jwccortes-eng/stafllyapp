/**
 * DocumentPreview — inline preview of an employee document.
 *
 * Resolves the signed URL via the existing helper (private bucket, 1h TTL).
 * Renders <img> for images, <iframe> for PDFs (with iOS fallback button),
 * and an "Open file" button for anything else.
 *
 * Header chips show file name, category, uploaded date, expiration state,
 * review status, worker name. Footer is a slot for parent-owned actions
 * (approve / reject / etc.).
 *
 * No DB writes. No payroll/time/shifts impact. Read-only.
 */

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarClock, ClipboardCopy, ExternalLink, FileText, ImageIcon, Loader2,
  RefreshCw, ShieldAlert, User2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { resolveEmployeeDocumentUrl } from "@/lib/employee-documents";
import { formatDateUS } from "@/lib/date-format";
import {
  classifyExpiration,
  EXPIRATION_STATE_LABEL,
} from "@/lib/onboarding/document-expiration-policy";

export interface DocumentPreviewItem {
  file_path: string;          // storage path (or legacy URL — resolver handles it)
  file_type?: string | null;  // MIME type, optional
  file_name?: string | null;
  document_type?: string | null;
  category?: string | null;
  worker_name?: string | null;
  uploaded_at?: string | null; // ISO
  expires_at?: string | null;  // ISO date
  review_status?: "pending" | "approved" | "rejected" | null;
}

interface Props {
  item: DocumentPreviewItem;
  /** Optional footer slot (approve/reject/correct buttons). */
  actions?: React.ReactNode;
  /** Optional banner slot above the file (e.g. mismatch warnings). */
  banner?: React.ReactNode;
}

const REVIEW_TONE: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
};


function inferKind(item: DocumentPreviewItem): "image" | "pdf" | "other" {
  const mime = (item.file_type ?? "").toLowerCase();
  const name = (item.file_name ?? item.file_path ?? "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|bmp)$/.test(name)) return "image";
  if (mime === "application/pdf" || /\.pdf$/.test(name)) return "pdf";
  return "other";
}

export default function DocumentPreview({ item, actions, banner }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [imgError, setImgError] = useState(false);
  const kind = useMemo(() => inferKind(item), [item]);

  useEffect(() => {
    let cancelled = false;
    setLoadingUrl(true);
    setImgError(false);
    resolveEmployeeDocumentUrl(item.file_path).then((resolved) => {
      if (cancelled) return;
      setUrl(resolved);
      setLoadingUrl(false);
    });
    return () => { cancelled = true; };
  }, [item.file_path]);

  const expState = classifyExpiration(item.category, item.expires_at ?? null);
  const expTone =
    expState === "expired"            ? "border-rose-200 bg-rose-50 text-rose-700" :
    expState === "expiring_soon"      ? "border-amber-200 bg-amber-50 text-amber-700" :
    expState === "missing_expiration" ? "border-amber-200 bg-amber-50 text-amber-700" :
    expState === "valid"              ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                                        "border-muted-foreground/20 bg-muted/30 text-muted-foreground";

  const expDisplay = item.expires_at
    ? (() => {
        const d = new Date(item.expires_at as string);
        return Number.isNaN(d.getTime()) ? "—" : (formatDateUS(d) || "—");
      })()
    : EXPIRATION_STATE_LABEL[expState];

  const uploadedDisplay = item.uploaded_at
    ? (() => {
        const d = new Date(item.uploaded_at as string);
        return Number.isNaN(d.getTime()) ? null : formatDateUS(d);
      })()
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm font-semibold min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{item.file_name || item.document_type || "Documento"}</span>
          </div>
          {item.review_status && (
            <Badge variant="outline" className={REVIEW_TONE[item.review_status] ?? ""}>
              {item.review_status === "pending" ? "Pending review" :
               item.review_status === "approved" ? "Approved" : "Rejected"}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {item.document_type && (
            <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5">
              {item.document_type}
            </span>
          )}
          {item.worker_name && (
            <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5">
              <User2 className="h-3 w-3" /> {item.worker_name}
            </span>
          )}
          {uploadedDisplay && (
            <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5">
              Subido {uploadedDisplay}
            </span>
          )}
          <Badge variant="outline" className={expTone}>
            <CalendarClock className="h-3 w-3 mr-1" />
            {expDisplay}
          </Badge>
        </div>
      </div>

      {banner}

      {/* File */}
      <div className="rounded-md border bg-muted/20 overflow-hidden">
        {loadingUrl ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !url ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2 p-4 text-center">
            <ShieldAlert className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No se pudo abrir el archivo. Puede haber sido eliminado.</p>
          </div>
        ) : kind === "image" && !imgError ? (
          <div className="flex justify-center bg-black/5">
            <img
              src={url}
              alt={item.file_name ?? "Documento"}
              className="max-h-[60vh] max-w-full object-contain"
              onError={() => setImgError(true)}
            />
          </div>
        ) : kind === "pdf" ? (
          <PdfFallbackCard url={url} />

        ) : (
          <div className="flex flex-col items-center justify-center h-64 gap-3 p-4 text-center">
            {kind === "image" ? <ImageIcon className="h-8 w-8 text-muted-foreground" /> : <FileText className="h-8 w-8 text-muted-foreground" />}
            <p className="text-xs text-muted-foreground">
              Vista previa no disponible para este tipo de archivo.
            </p>
            <Button asChild size="sm" variant="outline">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Abrir archivo
              </a>
            </Button>
          </div>
        )}
      </div>

      {/* Open-in-new-tab affordance even when inline preview rendered. */}
      {url && (
        <div className="flex justify-end">
          <Button asChild size="sm" variant="ghost" className="h-7 text-[11px]">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3 mr-1" />
              Abrir en pestaña nueva
            </a>
          </Button>
        </div>
      )}

      {actions && <div className="pt-1">{actions}</div>}
    </div>
  );
}

export function DocumentPreviewSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-[60vh] w-full" />
    </div>
  );
}
