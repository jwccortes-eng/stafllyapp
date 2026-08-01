/**
 * StatusPill — small presentational pill for normalized worker-facing statuses.
 *
 * Presentation-only. Does NOT compute or change any backend status.
 * Used in worker portal readiness / W-9 / address surfaces only.
 */
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Download,
  ShieldCheck,
  ShieldAlert,
  CalendarX,
  MinusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FAMILY_CLASSES } from "@/lib/status/status-registry";

export type WorkerStatusTone =
  | "approved"
  | "pending"
  | "in_review"
  | "rejected"
  | "needs_confirmation"
  | "imported"
  | "verified"
  | "unverified"
  | "expired"
  | "not_applicable";

// OX-2 — color siempre desde las familias semánticas canónicas.
const CONFIG: Record<
  WorkerStatusTone,
  { label: string; Icon: typeof CheckCircle2; className: string }
> = {
  approved: { label: "Aprobado", Icon: CheckCircle2, className: FAMILY_CLASSES.positive },
  verified: { label: "Verificada", Icon: ShieldCheck, className: FAMILY_CLASSES.positive },
  pending: { label: "Pendiente", Icon: AlertTriangle, className: FAMILY_CLASSES.warning },
  in_review: { label: "En revisión", Icon: Clock, className: FAMILY_CLASSES.progress },
  rejected: { label: "Rechazado", Icon: XCircle, className: FAMILY_CLASSES.critical },
  needs_confirmation: { label: "Necesita confirmar", Icon: HelpCircle, className: FAMILY_CLASSES.warning },
  imported: { label: "Importado", Icon: Download, className: FAMILY_CLASSES.neutral },
  unverified: { label: "Sin verificar", Icon: ShieldAlert, className: FAMILY_CLASSES.warning },
  expired: { label: "Expirado", Icon: CalendarX, className: FAMILY_CLASSES.critical },
  not_applicable: { label: "No aplica", Icon: MinusCircle, className: FAMILY_CLASSES.neutral },
};

interface Props {
  tone: WorkerStatusTone;
  label?: string;
  className?: string;
}

export function StatusPill({ tone, label, className }: Props) {
  const cfg = CONFIG[tone];
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-semibold leading-none",
        cfg.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label ?? cfg.label}
    </span>
  );
}
