/**
 * StaflyAlertBanner — banner de aviso canónico.
 *
 * Único formato de alerta en pantalla (informativa, advertencia, crítica).
 * No sustituye a los toasts (`src/lib/feedback/notify.ts`).
 */

import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, Info, OctagonAlert, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAFLY_TEXT, STAFLY_TONE_SOFT, type StaflyTone } from "./tokens";

const DEFAULT_ICON: Partial<Record<StaflyTone, ComponentType<{ className?: string }>>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: OctagonAlert,
};

export interface StaflyAlertBannerProps {
  title: string;
  description?: ReactNode;
  tone?: StaflyTone;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
  className?: string;
}

export function StaflyAlertBanner({
  title,
  description,
  tone = "info",
  icon,
  action,
  className,
}: StaflyAlertBannerProps) {
  const Icon = icon ?? DEFAULT_ICON[tone] ?? Info;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-3 sm:p-4",
        STAFLY_TONE_SOFT[tone],
        className
      )}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        {description && (
          <div className={cn(STAFLY_TEXT.meta, "mt-1 leading-relaxed text-current/80")}>
            {description}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
