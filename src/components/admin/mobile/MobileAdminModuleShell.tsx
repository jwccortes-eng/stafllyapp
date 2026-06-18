import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STAFLY_BOTTOM_NAV_CLEARANCE } from "@/components/stafly-ui/tokens";
import { AdminProductSwitcher } from "@/components/admin/AdminProductSwitcher";

interface MobileAdminModuleShellProps {
  /** MobileAdminHeader */
  header: ReactNode;
  /** MobileAdminTabs (optional) */
  tabs?: ReactNode;
  /** MobileSummaryStrip (optional) */
  summary?: ReactNode;
  /** Search/filter row (optional) */
  toolbar?: ReactNode;
  /** Main scrollable content */
  children: ReactNode;
  className?: string;
}

/**
 * MobileAdminModuleShell — page-level wrapper that guarantees:
 *  - safe-area bottom padding (AdminBottomNav clearance)
 *  - consistent vertical rhythm
 *  - same chrome ordering across modules: header → tabs → summary → toolbar → content
 *  - always-visible product switcher (Admin ↔ Portal ↔ Parceros) since the
 *    mobile admin shell does NOT mount the desktop TopBar / ModeSwitcher.
 *
 * Frontend-only. Renders nothing extra; just composition + spacing.
 */
export function MobileAdminModuleShell({
  header,
  tabs,
  summary,
  toolbar,
  children,
  className,
}: MobileAdminModuleShellProps) {
  return (
    <div className={cn("relative min-h-full flex flex-col", STAFLY_BOTTOM_NAV_CLEARANCE, className)}>
      {/* Always-on product switcher fallback for mobile admin views.
          Absolute so it sits over the header without disrupting per-module layouts. */}
      <div
        className="absolute right-3 z-20"
        style={{ top: "max(env(safe-area-inset-top, 0px) + 0.25rem, 0.75rem)" }}
      >
        <AdminProductSwitcher compact />
      </div>
      {header}
      {tabs}
      {summary && <div className="mb-3">{summary}</div>}
      {toolbar}
      <div className="flex-1">{children}</div>
    </div>
  );
}
