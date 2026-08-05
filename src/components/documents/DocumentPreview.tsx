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
  CalendarClock, ExternalLink, FileText, ImageIcon, Loader2,
  RefreshCw, ShieldAlert, User2,
} from "lucide-react";
import { resolveEmployeeDocumentUrl } from "@/lib/employee-documents";
import { formatDateUS } from "@/lib/date-format";
import {
  classifyExpiration,
  EXPIRATION_STATE_LABEL,
} from "@/lib/onboarding/document-expiration-policy";
import { formatExpirationDisplay, isSentinelExpiration } from "@/lib/documents/expiration-display";

export interface DocumentPreviewItem {
  id?: string;
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


export function inferDocumentPreviewKind(item: DocumentPreviewItem): "image" | "pdf" | "other" {
  const mime = (item.file_type ?? "").toLowerCase();
  const name = (item.file_name ?? item.file_path ?? "").split("?")[0].toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/.test(name)) return "image";
  if (mime.includes("pdf") || /\.pdf$/.test(name)) return "pdf";
  return "other";
}

export default function DocumentPreview({ item, actions, banner }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [embedError, setEmbedError] = useState(false);
  const [renewal, setRenewal] = useState(0);
  const kind = useMemo(() => inferDocumentPreviewKind(item), [item]);

  useEffect(() => {
    let cancelled = false;
    setLoadingUrl(true);
    setImgError(false);
    setEmbedError(false);
    resolveEmployeeDocumentUrl(item.file_path).then((resolved) => {
      if (cancelled) return;
      setUrl(resolved);
      setLoadingUrl(false);
    });
    return () => { cancelled = true; };
  }, [item.file_path, renewal]);

  const renewUrl = () => setRenewal((current) => current + 1);

  // Sentinel dates like 3000-01-01 mean "never expires" — never render 01/01/3000.
  const sentinelExp = isSentinelExpiration(item.expires_at ?? null);
  const expState = sentinelExp
    ? "valid"
    : classifyExpiration(item.category, item.expires_at ?? null);
  const expTone =
    expState === "expired"            ? "border-rose-200 bg-rose-50 text-rose-700" :
    expState === "expiring_soon"      ? "border-amber-200 bg-amber-50 text-amber-700" :
    expState === "missing_expiration" ? "border-amber-200 bg-amber-50 text-amber-700" :
    expState === "valid"              ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                                        "border-muted-foreground/20 bg-muted/30 text-muted-foreground";

  const expDisplay = item.expires_at
    ? formatExpirationDisplay(item.expires_at)
    : EXPIRATION_STATE_LABEL[expState];

  const uploadedDisplay = item.uploaded_at
    ? (() => {
        const d = new Date(item.uploaded_at as string);
        return Number.isNaN(d.getTime()) ? null : formatDateUS(d);
      })()
    : null;

  // Spanish-first status label for the header chip. The DB value stays as
  // "pending" / "approved" / "rejected" — this is only what the admin reads.
  const statusLabelEs: Record<"pending" | "approved" | "rejected", string> = {
    pending: "Pendiente de revisión",
    approved: "Aprobado",
    rejected: "Rechazado",
  };

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
            <Badge
              variant="outline"
              className={REVIEW_TONE[item.review_status] ?? ""}
              title="Estado actual del documento. Guardar cambios en este modal no aprueba el documento."
            >
              Estado actual: {statusLabelEs[item.review_status]}
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
          <Badge variant="outline" className={expTone} title={sentinelExp ? "Este documento fue marcado como sin vencimiento." : undefined}>
            <CalendarClock className="h-3 w-3 mr-1" />
            {expDisplay}
          </Badge>
        </div>
        {item.review_status === "pending" && (
          <p className="text-[10.5px] text-muted-foreground/80 leading-snug">
            Este documento sigue <strong>pendiente de revisión</strong> y aún no cuenta para resolver requisitos.
            Guardar cambios en este modal actualiza metadata (por ejemplo fecha de vencimiento), <strong>no aprueba el documento</strong>.
          </p>
        )}
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
        ) : kind === "pdf" && !embedError ? (
          <div className="relative min-h-[28rem] bg-background">
            <iframe
              src={url}
              title={`Vista previa de ${item.file_name ?? "documento PDF"}`}
              className="h-[60vh] min-h-[28rem] w-full border-0"
              onError={() => setEmbedError(true)}
            />
          </div>

        ) : (
          <div className="flex flex-col items-center justify-center h-64 gap-3 p-4 text-center">
            {kind === "image" ? <ImageIcon className="h-8 w-8 text-muted-foreground" /> : <FileText className="h-8 w-8 text-muted-foreground" />}
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                {kind === "other" ? "Este formato no tiene visor integrado." : "El navegador no pudo mostrar la vista previa."}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {kind === "other"
                  ? `Formato detectado: ${item.file_type || item.file_name?.split(".").pop()?.toUpperCase() || "desconocido"}.`
                  : "El archivo sigue protegido y puede abrirse con su enlace temporal."}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Abrir archivo
              </a>
            </Button>
            {kind !== "other" && (
              <Button size="sm" variant="ghost" onClick={renewUrl}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Renovar vista previa
              </Button>
            )}
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
