import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

/**
 * PremiumAvatar — photo-first identity primitive.
 *
 * - Real photo as protagonist when `avatarUrl` exists.
 * - Elegant initials fallback with deterministic neutral gradient.
 * - Optional status ring (subtle colored ring) and corner badges.
 * - Sizes: xs / sm / md / lg / xl.
 *
 * Designed to coexist with EmployeeAvatar; not a hard replacement.
 */

export type PremiumAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export type PremiumAvatarStatus =
  | "active"
  | "pending"
  | "new"
  | "missing-docs"
  | "driver"
  | "inactive"
  | null
  | undefined;

interface PremiumAvatarProps {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  size?: PremiumAvatarSize;
  status?: PremiumAvatarStatus;
  /** Small badge rendered at bottom-right (e.g. driver, missing-docs). */
  cornerBadge?: ReactNode;
  /** Tooltip shown on hover for the avatar root. */
  tooltip?: ReactNode;
  className?: string;
  onClick?: () => void;
}

const SIZE_MAP: Record<PremiumAvatarSize, string> = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-16 w-16 text-base",
};

const RING_MAP: Record<NonNullable<PremiumAvatarStatus>, string> = {
  active: "ring-2 ring-emerald-500/60 ring-offset-2 ring-offset-background",
  pending: "ring-2 ring-amber-500/60 ring-offset-2 ring-offset-background",
  new: "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
  "missing-docs": "ring-2 ring-destructive/60 ring-offset-2 ring-offset-background",
  driver: "ring-2 ring-sky-500/60 ring-offset-2 ring-offset-background",
  inactive: "ring-2 ring-muted-foreground/30 ring-offset-2 ring-offset-background",
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Neutral, refined gradient pairs (avoid the "AI gradient" feel).
const GRADIENT_PAIRS: Array<[string, string]> = [
  ["from-slate-600", "to-slate-800"],
  ["from-zinc-600", "to-zinc-800"],
  ["from-stone-600", "to-stone-800"],
  ["from-neutral-600", "to-neutral-800"],
  ["from-gray-600", "to-gray-800"],
  ["from-slate-500", "to-zinc-700"],
];

function initialsFor(first?: string | null, last?: string | null, name?: string | null): string {
  if (first || last) {
    const a = (first ?? "").trim().charAt(0);
    const b = (last ?? "").trim().charAt(0);
    return (a + b).toUpperCase() || "?";
  }
  if (name) {
    const parts = name.trim().split(/\s+/);
    const a = parts[0]?.charAt(0) ?? "";
    const b = parts[parts.length - 1]?.charAt(0) ?? "";
    return ((a + (parts.length > 1 ? b : "")).toUpperCase()) || "?";
  }
  return "?";
}

export function PremiumAvatar({
  firstName,
  lastName,
  name,
  avatarUrl,
  size = "md",
  status,
  cornerBadge,
  tooltip,
  className,
  onClick,
}: PremiumAvatarProps) {
  const initials = initialsFor(firstName, lastName, name);
  const seed = `${firstName ?? ""}${lastName ?? ""}${name ?? ""}` || "?";
  const [from, to] = GRADIENT_PAIRS[hashString(seed) % GRADIENT_PAIRS.length];
  const ring = status ? RING_MAP[status] : "";

  const root = (
    <div
      onClick={onClick}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full overflow-visible",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div
        className={cn(
          "rounded-full overflow-hidden flex items-center justify-center font-semibold tracking-wide text-white shadow-sm",
          "bg-gradient-to-br",
          from,
          to,
          SIZE_MAP[size],
          ring,
        )}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name ?? (`${firstName ?? ""} ${lastName ?? ""}`.trim() || "avatar")}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </div>
      {cornerBadge && (
        <span className="absolute -bottom-0.5 -right-0.5 z-10">
          {cornerBadge}
        </span>
      )}
    </div>
  );

  if (!tooltip) return root;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{root}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
