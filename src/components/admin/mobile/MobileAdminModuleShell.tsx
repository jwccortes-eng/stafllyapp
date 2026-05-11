import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STAFLY_BOTTOM_NAV_CLEARANCE } from "@/components/stafly-ui/tokens";

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
    <div className={cn("min-h-full flex flex-col", MOBILE_PAGE_PB, className)}>
      {header}
      {tabs}
      {summary && <div className="mb-3">{summary}</div>}
      {toolbar}
      <div className="flex-1">{children}</div>
    </div>
  );
}
