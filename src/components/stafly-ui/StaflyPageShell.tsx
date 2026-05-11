/**
 * StaflyPageShell — DS1C thin wrapper.
 *
 * Presentational only. No logic, no queries, no side effects.
 * Standardizes the outer chrome (page padding, bottom-nav clearance,
 * vertical rhythm) for mobile/portal surfaces using Stafly tokens.
 *
 * Use as the OUTER container of a route's render tree. Internal cards,
 * headers, and content stay untouched in DS1C.
 */

import { forwardRef, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  STAFLY_PAGE_PX,
  STAFLY_BOTTOM_NAV_CLEARANCE,
} from "./tokens";

export type StaflyPageDensity = "worker" | "admin" | "compact";

export interface StaflyPageShellProps {
  children: ReactNode;
  className?: string;
  /** Vertical rhythm between top-level blocks. */
  density?: StaflyPageDensity;
  /** Reserve space so PortalBottomNav / AdminBottomNav doesn't cover content. Default true. */
  withBottomNavClearance?: boolean;
  /** Apply standard horizontal page padding (STAFLY_PAGE_PX). Default true. */
  withHorizontalPadding?: boolean;
  /** Element tag. Default "main". */
  as?: "main" | "section" | "div";
}

const DENSITY_SPACING: Record<StaflyPageDensity, string> = {
  worker: "space-y-5",
  admin: "space-y-4",
  compact: "space-y-3",
};

export const StaflyPageShell = forwardRef<HTMLElement, StaflyPageShellProps>(
  function StaflyPageShell(
    {
      children,
      className,
      density = "worker",
      withBottomNavClearance = true,
      withHorizontalPadding = true,
      as = "main",
    },
    ref
  ) {
    const Tag = as as ElementType;
    return (
      <Tag
        ref={ref}
        className={cn(
          "min-h-full w-full max-w-full overflow-x-hidden",
          DENSITY_SPACING[density],
          withHorizontalPadding && STAFLY_PAGE_PX,
          withBottomNavClearance && STAFLY_BOTTOM_NAV_CLEARANCE,
          className
        )}
      >
        {children}
      </Tag>
    );
  }
);
