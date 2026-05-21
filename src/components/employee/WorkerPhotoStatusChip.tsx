import { Camera, CheckCircle2, Clock, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * WorkerPhotoStatusChip — canonical Spanish-first photo readiness label.
 *
 * Phase 1: read-only. Detection is conservative and lives in the caller
 * (e.g. `isMissingPhoto` in Employees.tsx → "required"). No AI, no upload,
 * no mutation. The chip is a presentational signal only.
 *
 * Future (Phase 2+): wire `pending` / `review` / `invalid` once we have an
 * AI-assisted professional photo enhancement flow with worker + admin
 * approval. Do NOT auto-replace uploaded photos.
 */

export type WorkerPhotoStatus =
  | "required"   // No photo on file — Foto requerida
  | "pending"    // Uploaded, awaiting review — Foto pendiente
  | "approved"   // Approved professional photo — Foto aprobada
  | "review"     // Needs admin review — Revisar foto
  | "invalid";   // Rejected / not valid — Foto no válida

const META: Record<WorkerPhotoStatus, { label: string; Icon: typeof Camera; className: string }> = {
  required: {
    label: "Foto requerida",
    Icon: Camera,
    className: "bg-warning/10 text-warning border-warning/20",
  },
  pending: {
    label: "Foto pendiente",
    Icon: Clock,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
  approved: {
    label: "Foto aprobada",
    Icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  },
  review: {
    label: "Revisar foto",
    Icon: AlertTriangle,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
  invalid: {
    label: "Foto no válida",
    Icon: XCircle,
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

interface Props {
  status: WorkerPhotoStatus;
  size?: "xs" | "sm";
  showIcon?: boolean;
  className?: string;
}

export function WorkerPhotoStatusChip({ status, size = "xs", showIcon = true, className }: Props) {
  const meta = META[status];
  const Icon = meta.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap",
        size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
        meta.className,
        className,
      )}
    >
      {showIcon && <Icon className={cn(size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3")} />}
      {meta.label}
    </span>
  );
}

/**
 * Admin helper copy shown wherever a worker has no professional photo.
 * Friendly, actionable, Spanish-first.
 */
export const WORKER_PHOTO_HELP_COPY =
  "Solicita una foto tipo documento: rostro claro, fondo limpio y buena iluminación.";

/**
 * Future plan (NOT implemented in this sprint):
 * AI-assisted professional photo enhancement.
 *
 *   - crop / center face
 *   - clean background
 *   - improve lighting
 *   - generate professional document-style version
 *   - optional formal attire overlay
 *   - worker + admin approval before replacing the original photo
 *
 * Constraints:
 *   - NEVER auto-replace an uploaded photo.
 *   - NEVER mutate storage without explicit approval.
 *   - Keep an audit trail of original vs generated photo.
 */
