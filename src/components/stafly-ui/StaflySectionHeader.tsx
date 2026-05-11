/**
 * StaflySectionHeader — DS1E-a2 sub-section header.
 *
 * Presentational only. For intra-page sub-sections.
 * Does NOT replace `PageHeader` (which owns page-level titles).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STAFLY_SECTION_EYEBROW, STAFLY_MUTED_CAPTION } from "./tokens";

export interface StaflySectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function StaflySectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: StaflySectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0 flex-1 space-y-0.5">
        {eyebrow && <p className={STAFLY_SECTION_EYEBROW}>{eyebrow}</p>}
        <h2 className="text-sm font-semibold text-foreground font-heading">{title}</h2>
        {description && <p className={STAFLY_MUTED_CAPTION}>{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
