/**
 * Mobile Admin tokens — keep continuity across all mobile admin modules.
 * Use these instead of ad-hoc tailwind classes.
 *
 * DS1B: This file is now a thin compatibility layer over `stafly-ui/tokens.ts`.
 * Prefer importing the STAFLY_* tokens directly. The MOBILE_, CARD_ and TXT_
 * names below remain as deprecated aliases for incremental migration.
 */
import {
  STAFLY_BOTTOM_NAV_CLEARANCE,
  STAFLY_PAGE_PX,
  STAFLY_SECTION_EYEBROW,
  STAFLY_TIME_TEXT,
  STAFLY_MUTED_CAPTION,
  STAFLY_CARD_BASE,
} from "@/components/stafly-ui/tokens";

// Bottom-nav safe-area padding (AdminBottomNav ~64px + safe-inset)
/** @deprecated Use STAFLY_BOTTOM_NAV_CLEARANCE / STAFLY_PAGE_PB. */
export const MOBILE_PAGE_PB = STAFLY_BOTTOM_NAV_CLEARANCE;

// Horizontal padding (matches MobileAdminHome)
/** @deprecated Use STAFLY_PAGE_PX. */
export const MOBILE_PAGE_PX = STAFLY_PAGE_PX;

// Standard typography helpers
/** @deprecated Use STAFLY_SECTION_EYEBROW. */
export const TXT_EYEBROW = STAFLY_SECTION_EYEBROW;
export const TXT_TITLE = "text-2xl font-semibold tracking-tight leading-tight";
export const TXT_SUBTITLE = "text-sm text-muted-foreground";
export const TXT_KPI = "text-xl font-semibold tabular-nums";
/** @deprecated Use STAFLY_MUTED_CAPTION. */
export const TXT_LABEL = STAFLY_MUTED_CAPTION;
export const TXT_BODY = "text-sm";

// Card surface (matches MobileAdminHome action cards)
/** @deprecated Use STAFLY_CARD_BASE. */
export const CARD_SURFACE = STAFLY_CARD_BASE;
export const CARD_TAPPABLE = "active:scale-[0.98] transition-all";
