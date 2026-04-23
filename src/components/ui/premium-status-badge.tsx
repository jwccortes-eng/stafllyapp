import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  Clock,
  UserPlus,
  FileWarning,
  Car,
  ShieldOff,
  PauseCircle,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

/**
 * PremiumStatusBadge — unified semantic status pill.
 *
 * One canonical set of statuses across Worker Hub, Profile, tables, lists.
 * Subtle, premium, semantic-token driven; never raw colors.
 */

export type PremiumStatus =
  | "active"
  | "pending"
  | "invited"
  | "new"
  | "missing-docs"
  | "driver"
  | "portal-inactive"
  | "inactive"
  | "payroll-issue"
  | "attendance-issue";

const STATUS_META: Record<PremiumStatus, {
  label: string;
  Icon: LucideIcon;
  className: string;
}> = {
  active: {
    label: "Active",
    Icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  },
  pending: {
    label: "Pending",
    Icon: Clock,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
  invited: {
    label: "Invited",
    Icon: UserPlus,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  },
  new: {
    label: "New",
    Icon: UserPlus,
    className: "bg-primary/10 text-primary border-primary/20",
  },
  "missing-docs": {
    label: "Missing docs",
    Icon: FileWarning,
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  driver: {
    label: "Driver",
    Icon: Car,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  },
  "portal-inactive": {
    label: "Portal off",
    Icon: ShieldOff,
    className: "bg-muted text-muted-foreground border-border",
  },
  inactive: {
    label: "Inactive",
    Icon: PauseCircle,
    className: "bg-muted text-muted-foreground border-border",
  },
  "payroll-issue": {
    label: "Payroll issue",
    Icon: AlertTriangle,
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  "attendance-issue": {
    label: "Attendance issue",
    Icon: AlertTriangle,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
};

interface PremiumStatusBadgeProps {
  status: PremiumStatus;
  size?: "sm" | "md";
  showIcon?: boolean;
  /** Override label (rare). */
  label?: ReactNode;
  className?: string;
}

export function PremiumStatusBadge({
  status,
  size = "sm",
  showIcon = true,
  label,
  className,
}: PremiumStatusBadgeProps) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
        meta.className,
        className,
      )}
    >
      {showIcon && <Icon className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} />}
      {label ?? meta.label}
    </span>
  );
}
