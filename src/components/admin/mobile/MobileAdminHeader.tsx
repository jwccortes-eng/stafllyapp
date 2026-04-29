import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TXT_EYEBROW, TXT_SUBTITLE, TXT_TITLE, MOBILE_PAGE_PX } from "./mobile-admin-tokens";

interface MobileAdminHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional action buttons rendered on the right side of the title row */
  actions?: ReactNode;
  className?: string;
}

/**
 * MobileAdminHeader — premium header consistent with MobileAdminHome.
 * Frontend-only.
 */
export function MobileAdminHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: MobileAdminHeaderProps) {
  return (
    <div className={cn(MOBILE_PAGE_PX, "pt-5 pb-4", className)}>
      {eyebrow && (
        <div className={cn(TXT_EYEBROW, "mb-1.5 truncate")}>{eyebrow}</div>
      )}
      <div className="flex items-start gap-3">
        <h1 className={cn(TXT_TITLE, "flex-1 min-w-0")}>{title}</h1>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {subtitle && (
        <p className={cn(TXT_SUBTITLE, "mt-1.5")}>{subtitle}</p>
      )}
    </div>
  );
}
