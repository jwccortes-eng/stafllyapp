import { APP_VERSION, APP_BUILD_TIME } from "@/lib/pwa-runtime";
import { cn } from "@/lib/utils";

interface BuildVersionBadgeProps {
  className?: string;
}

/**
 * Tiny "v1.2.3 · 2026-04-19" footer used in the worker portal so support can
 * confirm which build a user is actually running. Critical when debugging
 * stale-cache issues on Safari/iOS.
 */
export function BuildVersionBadge({ className }: BuildVersionBadgeProps) {
  const date = APP_BUILD_TIME ? APP_BUILD_TIME.slice(0, 10) : "";
  return (
    <div
      className={cn(
        "text-[10px] text-muted-foreground/70 font-mono tracking-tight select-none",
        className,
      )}
      title={APP_BUILD_TIME || undefined}
    >
      v{APP_VERSION}
      {date && ` · ${date}`}
    </div>
  );
}
