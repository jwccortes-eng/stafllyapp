import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

/**
 * Sheet variants.
 *
 * - `tone="default"` → original Stafly sheet, untouched.
 * - `tone="ops"`     → operations side panel preset:
 *      · wider on desktop (xl:max-w-2xl)
 *      · zero padding (consumers compose with OpsSheetHeader/Body/Footer)
 *      · flat surface, crisper border
 */
const sheetVariants = cva(
  "fixed z-50 bg-background transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 flex flex-col",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm lg:max-w-md xl:max-w-lg",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm lg:max-w-md xl:max-w-lg",
      },
      tone: {
        default: "gap-4 p-6 shadow-lg",
        ops: "gap-0 p-0 shadow-2xl",
      },
    },
    compoundVariants: [
      { side: "right", tone: "ops", className: "sm:max-w-md lg:max-w-lg xl:max-w-2xl border-l border-border/80" },
      { side: "left", tone: "ops", className: "sm:max-w-md lg:max-w-lg xl:max-w-2xl border-r border-border/80" },
    ],
    defaultVariants: {
      side: "right",
      tone: "default",
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Hide the default close button (consumers may render their own header X). */
  hideClose?: boolean;
}

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side = "right", tone = "default", hideClose = false, className, children, ...props }, ref) => (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side, tone }), className)} {...props}>
        {children}
        {!hideClose && (
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-secondary hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  ),
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

/* ──────────────────────────────────────────────────────────────────
 * Operations sheet building blocks
 *
 * Compose with <SheetContent tone="ops" hideClose>:
 *
 *   <SheetContent tone="ops" side="right" hideClose>
 *     <OpsSheetHeader title="..." onClose={...} />
 *     <OpsSheetBody>...</OpsSheetBody>
 *     <OpsSheetFooter>...</OpsSheetFooter>
 *   </SheetContent>
 * ────────────────────────────────────────────────────────────────── */

interface OpsSheetHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  rightSlot?: React.ReactNode;
  onClose?: () => void;
}

const OpsSheetHeader = ({
  title,
  subtitle,
  leading,
  rightSlot,
  onClose,
  className,
  ...props
}: OpsSheetHeaderProps) => (
  <div
    className={cn(
      // Tighter vertical rhythm — px-4 / py-2.5 reads as executive, not chunky.
      "sticky top-0 z-10 flex items-center gap-2.5 border-b border-border/60 bg-background/90 px-4 py-2.5 backdrop-blur-md",
      className,
    )}
    {...props}
  >
    {leading && <div className="shrink-0">{leading}</div>}
    <div className="min-w-0 flex-1">
      <SheetPrimitive.Title className="text-[13.5px] font-semibold font-heading text-foreground leading-tight truncate">
        {title}
      </SheetPrimitive.Title>
      {subtitle && (
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate leading-tight">{subtitle}</div>
      )}
    </div>
    <div className="shrink-0 flex items-center gap-1">
      {rightSlot}
      {onClose !== undefined ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <SheetPrimitive.Close
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </SheetPrimitive.Close>
      )}
    </div>
  </div>
);
OpsSheetHeader.displayName = "OpsSheetHeader";

const OpsSheetBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex-1 overflow-y-auto px-5 py-4 space-y-4", className)}
      {...props}
    />
  ),
);
OpsSheetBody.displayName = "OpsSheetBody";

const OpsSheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border/60 bg-background/95 px-5 py-3 backdrop-blur-md",
      className,
    )}
    {...props}
  />
);
OpsSheetFooter.displayName = "OpsSheetFooter";

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
  // Operations presets
  OpsSheetHeader,
  OpsSheetBody,
  OpsSheetFooter,
};
