import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Card variants — operational presets layered on top of the existing card.
 *
 * - `default`  → original Stafly card (rounded-2xl, soft shadow). Untouched.
 * - `ops`      → flatter, denser card for the Operations Command Center.
 *                Subtle ring instead of border, less padding spec, sits
 *                naturally next to <OpsKpiStrip /> and <OpsToolbar />.
 * - `ops-flush`→ same as ops but no border/ring — for embedded sub-cards
 *                inside a larger ops surface.
 *
 * Density presets shrink header/content padding for high-density tables
 * and lists.
 */
const cardVariants = cva(
  "text-card-foreground transition-all duration-200",
  {
    variants: {
      variant: {
        default: "rounded-2xl border bg-card shadow-xs",
        ops: "rounded-xl bg-card ring-1 ring-border/70 hover:ring-border shadow-none",
        "ops-flush": "rounded-xl bg-card/60 shadow-none",
      },
      density: {
        default: "",
        ops: "",
        compact: "",
      },
    },
    defaultVariants: {
      variant: "default",
      density: "default",
    },
  },
);

const headerVariants = cva("flex flex-col", {
  variants: {
    density: {
      default: "space-y-1.5 p-6",
      ops: "space-y-1 px-4 py-3",
      compact: "space-y-0.5 px-3 py-2",
    },
  },
  defaultVariants: { density: "default" },
});

const contentVariants = cva("", {
  variants: {
    density: {
      default: "p-6 pt-0",
      ops: "px-4 pb-3 pt-0",
      compact: "px-3 pb-2 pt-0",
    },
  },
  defaultVariants: { density: "default" },
});

const footerVariants = cva("flex items-center", {
  variants: {
    density: {
      default: "p-6 pt-0",
      ops: "px-4 py-3 pt-0",
      compact: "px-3 py-2 pt-0",
    },
  },
  defaultVariants: { density: "default" },
});

interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, density, ...props }, ref) => (
    <div
      ref={ref}
      data-variant={variant ?? "default"}
      data-density={density ?? "default"}
      className={cn(cardVariants({ variant, density }), className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

interface CardSectionProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof headerVariants> {}

const CardHeader = React.forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className, density, ...props }, ref) => (
    <div ref={ref} className={cn(headerVariants({ density }), className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-lg font-semibold font-heading leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className, density, ...props }, ref) => (
    <div ref={ref} className={cn(contentVariants({ density }), className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className, density, ...props }, ref) => (
    <div ref={ref} className={cn(footerVariants({ density }), className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
