/**
 * StaflyOverlay — Drawer / Sheet / Modal en un solo contrato.
 *
 * Una sola superficie superpuesta para todo el producto:
 *  - variant="drawer" → panel lateral en desktop, hoja inferior en móvil.
 *  - variant="sheet"  → hoja inferior siempre.
 *  - variant="modal"  → diálogo centrado siempre.
 *
 * La jerarquía interna (título → contexto → contenido → acciones) es idéntica
 * en las cuatro plataformas; solo cambia el acomodo.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { STAFLY_MOBILE_SAFE_BOTTOM } from "./tokens";

export type StaflyOverlayVariant = "drawer" | "sheet" | "modal";
export type StaflyOverlaySize = "sm" | "md" | "lg";

export interface StaflyOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: StaflyOverlayVariant;
  size?: StaflyOverlaySize;
  className?: string;
}

const SIDE_WIDTH: Record<StaflyOverlaySize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-xl",
};

const CENTER_WIDTH: Record<StaflyOverlaySize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

export function StaflyOverlay({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  variant = "drawer",
  size = "md",
  className,
}: StaflyOverlayProps) {
  const isMobile = useIsMobile();
  const asBottom = variant === "sheet" || (variant === "drawer" && isMobile);
  const asCentered = variant === "modal";

  const side = asCentered ? "right" : asBottom ? "bottom" : "right";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          "flex flex-col gap-0 p-0",
          asBottom
            ? "max-h-[88dvh] rounded-t-3xl"
            : asCentered
              ? cn("h-dvh", CENTER_WIDTH[size])
              : cn("w-full", SIDE_WIDTH[size]),
          className
        )}
      >
        <SheetHeader className="space-y-1 border-b border-border/60 px-5 py-4 text-left">
          <SheetTitle className="font-heading text-base font-semibold">
            {title}
          </SheetTitle>
          {description && (
            <SheetDescription className="text-xs text-muted-foreground">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div
            className={cn(
              "flex items-center justify-end gap-2 border-t border-border/60 px-5 pt-3",
              asBottom ? STAFLY_MOBILE_SAFE_BOTTOM : "pb-3"
            )}
          >
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
