import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * Vertical timeline container. The vertical rail is decorative — actual
 * status dots live inside each `OperationalTimelineRow`.
 */
export function OperationalTimeline({ children, className }: Props) {
  return (
    <div className={cn("relative space-y-2", className)}>
      {children}
    </div>
  );
}
