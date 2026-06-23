import { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * MobileQueueDrawer — bottom sheet for the Mobile Action Queue pattern.
 *
 * UI-only wrapper that standardizes:
 *  - side="bottom" rounded sheet
 *  - max-h on mobile (default 88dvh)
 *  - sticky CTA footer with safe-area padding
 *
 * No business logic, no queries, no routing decisions, no permission checks.
 * Consumers compose their own meta/badges via headerMeta + title + description.
 */
export interface MobileQueueDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional meta row (badges, tone chips) above the title. */
  headerMeta?: ReactNode;
  /** Title text/node. Maps to SheetTitle. */
  title?: ReactNode;
  /** Description / secondary line. Maps to SheetDescription. */
  description?: ReactNode;
  /** Main scrollable content. */
  children?: ReactNode;
  /** Optional sticky CTA(s) pinned to the bottom with safe-area padding. */
  footer?: ReactNode;
  /** Override max height. Default "max-h-[88dvh]". */
  maxHeightClassName?: string;
  className?: string;
}

export function MobileQueueDrawer({
  open,
  onOpenChange,
  headerMeta,
  title,
  description,
  children,
  footer,
  maxHeightClassName = "max-h-[88dvh]",
  className,
}: MobileQueueDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "rounded-t-2xl overflow-y-auto",
          maxHeightClassName,
          className,
        )}
      >
        {(headerMeta || title || description) && (
          <SheetHeader className="text-left space-y-2">
            {headerMeta && (
              <div className="flex items-center gap-2 flex-wrap">{headerMeta}</div>
            )}
            {title && <SheetTitle className="text-base">{title}</SheetTitle>}
            {description && (
              <SheetDescription className="text-xs leading-relaxed">
                {description}
              </SheetDescription>
            )}
          </SheetHeader>
        )}

        {children && <div className="mt-4 space-y-3">{children}</div>}

        {footer && (
          <div className="mt-4 sticky bottom-0 bg-background pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] border-t">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
