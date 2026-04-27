/**
 * AddressStatusChip — colored pill that communicates trust level.
 */
import { CheckCircle2, AlertCircle, Pencil, Download, Archive, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AddressValidationStatus } from "@/lib/address";

const STATUS_CONFIG: Record<
  AddressValidationStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  validated: {
    label: "Validada",
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  incomplete: {
    label: "Incompleta",
    icon: AlertCircle,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
  manual: {
    label: "Manual",
    icon: Pencil,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  },
  imported: {
    label: "Importada",
    icon: Download,
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
  },
  legacy: {
    label: "Legacy",
    icon: Archive,
    className: "bg-muted text-muted-foreground border-border",
  },
  empty: {
    label: "Sin dirección",
    icon: Circle,
    className: "bg-muted/40 text-muted-foreground border-border/60",
  },
};

interface Props {
  status: AddressValidationStatus;
  className?: string;
}

export function AddressStatusChip({ status, className }: Props) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        cfg.className,
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}
