import { ReactNode } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MobileOperationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sticky header content */
  header: ReactNode;
  /** Main scrollable content */
  children: ReactNode;
  /** Sticky footer (primary actions). Optional. */
  footer?: ReactNode;
  className?: string;
}

/**
 * MobileOperationsSheet — full-height bottom sheet with sticky header/footer.
 * Standardized pattern (extracted from MobileShiftOperationsSheet).
 */
export function MobileOperationsSheet({
  open,
  onOpenChange,
  header,
  children,
  footer,
  className,
}: MobileOperationsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "h-[92dvh] p-0 rounded-t-3xl border-t flex flex-col",
          "max-w-full sm:max-w-full",
          className
        )}
      >
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/60 px-5 py-4 rounded-t-3xl">
          {header}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {children}
        </div>
        {footer && (
          <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t border-border/60 px-5 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
