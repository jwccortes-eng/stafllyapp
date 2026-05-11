/**
 * Stafly Design Tokens — DS1A foundation.
 *
 * Single source of truth for cross-surface visual constants.
 * Frontend-only. No logic, no data, no behavior.
 *
 * Usage rules:
 *  - Prefer these tokens over ad-hoc Tailwind strings for page chrome.
 *  - Worker Portal and Admin Mobile must share these (same product, one identity).
 *  - Do NOT inline colors here — keep semantic tokens in index.css / tailwind.config.ts.
 *
 * NOTE: Mirrors values already in `src/components/admin/mobile/mobile-admin-tokens.ts`
 * to guarantee continuity. That file re-exports STAFLY_* aliases below as it migrates.
 */

// ── Layout ──────────────────────────────────────────────────────────────────

/** Standard horizontal page padding for mobile surfaces (worker + admin). */
export const STAFLY_PAGE_PX = "px-5";

/** Bottom-nav safe-area clearance (AdminBottomNav / PortalBottomNav ~64px + safe inset). */
export const STAFLY_BOTTOM_NAV_CLEARANCE =
  "pb-[calc(env(safe-area-inset-bottom,0px)+88px)]";

/** Alias kept for naming parity in DS1A spec. */
export const STAFLY_PAGE_PB = STAFLY_BOTTOM_NAV_CLEARANCE;

/** Inset for sticky-bottom safe areas without the nav clearance (sheets, CTAs). */
export const STAFLY_MOBILE_SAFE_BOTTOM =
  "pb-[calc(env(safe-area-inset-bottom,0px)+12px)]";

// ── Surfaces ────────────────────────────────────────────────────────────────

/** Standard tappable card surface (matches MobileEntityCard / MobileAdminHome). */
export const STAFLY_CARD_BASE =
  "rounded-2xl border border-border/50 bg-card shadow-xs";

/** Softer card variant for nested or secondary surfaces. */
export const STAFLY_CARD_SOFT =
  "rounded-2xl border border-border/40 bg-card/60 shadow-none";

// ── Typography ──────────────────────────────────────────────────────────────

/** Section eyebrow: 11px uppercase tracked, muted. */
export const STAFLY_SECTION_EYEBROW =
  "text-[11px] uppercase tracking-[0.14em] text-muted-foreground";

/** Mono tabular numerals for times and amounts. */
export const STAFLY_TIME_TEXT = "font-mono tabular-nums";

/** Muted caption (secondary metadata). */
export const STAFLY_MUTED_CAPTION = "text-xs text-muted-foreground";

// ── Composition ─────────────────────────────────────────────────────────────

/** Default action grid: 2 columns, 12px gap. Used in home/more/operations sheets. */
export const STAFLY_ACTION_GRID = "grid grid-cols-2 gap-3";
