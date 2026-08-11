/**
 * Stafly UI — Mini design system barrel.
 *
 * Single entry point for cross-surface components and tokens.
 * Import from here to avoid reaching into individual files.
 *
 * ── Usage rules ────────────────────────────────────────────────────────────
 *
 * 1. StaflyPageShell
 *    Use as the OUTER container of a route's render tree.
 *    Applies standard horizontal padding + bottom-nav clearance + vertical
 *    rhythm. Only opt-in after the route calls setChromeMode("shell") via
 *    usePortalChrome so EmployeeLayout drops its legacy chrome.
 *    → DON'T wrap legacy routes without chromeMode opt-in.
 *    → DON'T nest shells inside each other.
 *
 * 2. StaflyCard
 *    Use for tappable or static card surfaces (announcements, resources,
 *    settings items, etc.).
 *    Tones: default (surface), soft (nested/secondary), interactive (tap).
 *    → DON'T create new card wrappers without checking this first.
 *    → DON'T use for complex data tables or modal content.
 *
 * 3. StaflySectionHeader
 *    Use for intra-page sub-sections (group labels, category headers).
 *    Does NOT replace PageHeader, which owns the page-level title.
 *    → DON'T use as a page title.
 *
 * 4. usePortalChrome
 *    Portal routes migrating to StaflyPageShell call setChromeMode("shell")
 *    on mount and restore "legacy" on unmount.
 *    → DON'T set shell mode on routes that haven't been audited for
 *      bottom-nav clearance / horizontal padding.
 *
 * 5. Worker History v1
 *    DO NOT modify without explicit approval. It is outside the Stafly
 *    shell/card migration path and must remain stable.
 *
 * ── Adding new exports ───────────────────────────────────────────────────
 * Keep this barrel flat. Re-export types and values only; no new code here.
 */

// Tokens
export {
  STAFLY_PAGE_PX,
  STAFLY_BOTTOM_NAV_CLEARANCE,
  STAFLY_PAGE_PB,
  STAFLY_MOBILE_SAFE_BOTTOM,
  STAFLY_CARD_BASE,
  STAFLY_CARD_SOFT,
  STAFLY_SECTION_EYEBROW,
  STAFLY_TIME_TEXT,
  STAFLY_MUTED_CAPTION,
  STAFLY_ACTION_GRID,
  STAFLY_RADIUS,
  STAFLY_ELEVATION,
  STAFLY_GUTTER,
  STAFLY_STACK,
  STAFLY_ROW_GAP,
  STAFLY_TAP_TARGET,
  STAFLY_TEXT,
  STAFLY_TONE_SOFT,
  STAFLY_TONE_TEXT,
  STAFLY_TONE_DOT,
  STAFLY_STATE,
  STAFLY_BADGE_BASE,
  STAFLY_CHIP_BASE,
} from "./tokens";
export type { StaflyTone } from "./tokens";

// Components
export { StaflyPageShell } from "./StaflyPageShell";
export type {
  StaflyPageShellProps,
  StaflyPageDensity,
} from "./StaflyPageShell";

export { StaflyCard } from "./StaflyCard";
export type {
  StaflyCardProps,
  StaflyCardTone,
  StaflyCardPadding,
  StaflyCardAs,
} from "./StaflyCard";

export { StaflySectionHeader } from "./StaflySectionHeader";
export type { StaflySectionHeaderProps } from "./StaflySectionHeader";

export { ShiftRouteHeader } from "./ShiftRouteHeader";
export type {
  ShiftRouteHeaderProps,
  ShiftRouteHeaderVariant,
  ShiftRouteHeaderDensity,
  ShiftRouteHeaderTone,
} from "./ShiftRouteHeader";

// Hooks
export { usePortalChrome } from "./usePortalChrome";
export type { PortalChromeMode, PortalOutletContext } from "./usePortalChrome";

// ── ONE DESIGN SYSTEM — componentes canónicos (Fase 2) ─────────────────────
// Regla: no crear variantes nuevas. Si algo no encaja, se extiende el canónico.

export { StaflyStatusBadge } from "./StaflyStatusBadge";
export type { StaflyStatusBadgeProps } from "./StaflyStatusBadge";

export { StaflyKpiCard } from "./StaflyKpiCard";
export type { StaflyKpiCardProps } from "./StaflyKpiCard";

export { StaflySummaryStrip } from "./StaflySummaryStrip";
export type { StaflySummaryStripProps } from "./StaflySummaryStrip";

export { StaflyAlertBanner } from "./StaflyAlertBanner";
export type { StaflyAlertBannerProps } from "./StaflyAlertBanner";

export { StaflyEmptyState } from "./StaflyEmptyState";
export type { StaflyEmptyStateProps } from "./StaflyEmptyState";

export { StaflyLoadingState } from "./StaflyLoadingState";
export type { StaflyLoadingStateProps, StaflyLoadingVariant } from "./StaflyLoadingState";

export { StaflySearchBar } from "./StaflySearchBar";
export type { StaflySearchBarProps } from "./StaflySearchBar";

export { StaflyFilterBar } from "./StaflyFilterBar";
export type { StaflyFilterBarProps, StaflyFilterOption } from "./StaflyFilterBar";

export { StaflyActionBar } from "./StaflyActionBar";
export type { StaflyActionBarProps } from "./StaflyActionBar";

export { StaflyOverlay } from "./StaflyOverlay";
export type { StaflyOverlayProps, StaflyOverlayVariant, StaflyOverlaySize } from "./StaflyOverlay";

export { StaflyTimeline } from "./StaflyTimeline";
export type { StaflyTimelineProps, StaflyTimelineItem } from "./StaflyTimeline";
