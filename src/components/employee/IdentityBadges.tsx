/**
 * IdentityBadges — Phase 2A (read-only).
 *
 * Compact chip stack that surfaces identity/placeholder/emergency/payroll-block
 * status for a worker. Pure presentational — no writes, no CTAs.
 *
 * Empty when the worker is a normal verified employee.
 */
import { cn } from "@/lib/utils";
import {
  describeIdentityBadges,
  type IdentityFields,
  type IdentityBadgeSpec,
} from "@/lib/employee-identity";

interface Props {
  employee: IdentityFields | null | undefined;
  size?: "xs" | "sm";
  max?: number;
  className?: string;
}

const TONE_CLASS: Record<IdentityBadgeSpec["tone"], string> = {
  destructive: "border-rose-300/60 bg-rose-50 text-rose-700",
  warning: "border-amber-300/60 bg-amber-50 text-amber-700",
  muted: "border-border/60 bg-muted/40 text-muted-foreground",
};

const SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  xs: "text-[9px] px-1 py-px h-3.5 rounded-sm",
  sm: "text-[10px] px-1.5 py-0.5 h-4 rounded",
};

export function IdentityBadges({ employee, size = "xs", max = 3, className }: Props) {
  const badges = describeIdentityBadges(employee);
  if (badges.length === 0) return null;
  const visible = badges.slice(0, max);
  const overflow = badges.slice(max);
  return (
    <span className={cn("inline-flex items-center gap-1 flex-wrap", className)}>
      {visible.map((b) => (
        <span
          key={b.key}
          title={b.title}
          className={cn(
            "inline-flex items-center border font-semibold leading-none",
            SIZE_CLASS[size],
            TONE_CLASS[b.tone],
          )}
        >
          {b.label}
        </span>
      ))}
      {overflow.length > 0 && (
        <span
          title={overflow.map((b) => b.label).join(" · ")}
          className={cn(
            "inline-flex items-center border font-semibold leading-none",
            SIZE_CLASS[size],
            "border-border/60 bg-muted/40 text-muted-foreground",
          )}
        >
          +{overflow.length}
        </span>
      )}
    </span>
  );
}

export default IdentityBadges;
