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
  MinusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkerStatusTone =
  | "approved"
  | "pending"
  | "in_review"
  | "rejected"
  | "needs_confirmation"
  | "imported"
  | "verified"
  | "not_applicable";

const CONFIG: Record<
  WorkerStatusTone,
  { label: string; Icon: typeof CheckCircle2; className: string }
> = {
  approved: {
    label: "Aprobado",
    Icon: CheckCircle2,
    className: "bg-earning/12 text-earning border-earning/25",
  },
  verified: {
    label: "Verificada",
    Icon: ShieldCheck,
    className: "bg-earning/12 text-earning border-earning/25",
  },
  pending: {
    label: "Pendiente",
    Icon: AlertTriangle,
    className: "bg-warning/12 text-warning border-warning/25",
  },
  in_review: {
    label: "En revisión",
    Icon: Clock,
    className: "bg-info/12 text-info border-info/25",
  },
  rejected: {
    label: "Rechazado",
    Icon: XCircle,
    className: "bg-deduction/12 text-deduction border-deduction/25",
  },
  needs_confirmation: {
    label: "Necesita confirmar",
    Icon: HelpCircle,
    className: "bg-warning/10 text-warning border-warning/20",
  },
  imported: {
    label: "Importado",
    Icon: Download,
    className: "bg-muted text-muted-foreground border-border",
  },
  not_applicable: {
    label: "No aplica",
    Icon: MinusCircle,
    className: "bg-muted/60 text-muted-foreground border-border/60",
  },
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
