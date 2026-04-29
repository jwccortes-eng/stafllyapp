/**
 * Mobile Admin tokens — keep continuity across all mobile admin modules.
 * Use these instead of ad-hoc tailwind classes.
 */

// Bottom-nav safe-area padding (AdminBottomNav ~64px + safe-inset)
export const MOBILE_PAGE_PB = "pb-[calc(env(safe-area-inset-bottom,0px)+88px)]";

// Horizontal padding (matches MobileAdminHome)
export const MOBILE_PAGE_PX = "px-5";

// Standard typography helpers
export const TXT_EYEBROW = "text-[11px] uppercase tracking-[0.14em] text-muted-foreground";
export const TXT_TITLE = "text-2xl font-semibold tracking-tight leading-tight";
export const TXT_SUBTITLE = "text-sm text-muted-foreground";
export const TXT_KPI = "text-xl font-semibold tabular-nums";
export const TXT_LABEL = "text-xs text-muted-foreground";
export const TXT_BODY = "text-sm";

// Card surface (matches MobileAdminHome action cards)
export const CARD_SURFACE =
  "rounded-2xl border border-border/50 bg-card shadow-sm";
export const CARD_TAPPABLE = "active:scale-[0.98] transition-all";
