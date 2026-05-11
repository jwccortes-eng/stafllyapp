/**
 * StaflyCard — DS1E-a1 base surface.
 *
 * Presentational only. No logic, no queries, no side effects.
 * Standardizes card surfaces (default/soft/interactive) using Stafly tokens.
 *
 * Polymorphic via `as`: "div" | "button" | "a" | Link (react-router).
 * Pass `to` for Link, `href` for "a", `onClick` for "button"/"div".
 */

import { forwardRef, type ElementType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { STAFLY_CARD_BASE, STAFLY_CARD_SOFT } from "./tokens";

export type StaflyCardTone = "default" | "soft" | "interactive";
export type StaflyCardPadding = "none" | "sm" | "md" | "lg";
export type StaflyCardAs = "div" | "button" | "a" | typeof Link;

export interface StaflyCardProps {
  children: ReactNode;
  className?: string;
  tone?: StaflyCardTone;
  padding?: StaflyCardPadding;
  as?: StaflyCardAs;
  to?: string;
  href?: string;
  onClick?: () => void;
  target?: string;
  rel?: string;
  type?: "button" | "submit" | "reset";
  "aria-label"?: string;
}

const TONE_CLASSES: Record<StaflyCardTone, string> = {
  default: STAFLY_CARD_BASE,
  soft: STAFLY_CARD_SOFT,
  interactive: cn(
    STAFLY_CARD_BASE,
    "hover:bg-accent/50 transition-all duration-200 press-scale hover-lift cursor-pointer text-left w-full"
  ),
};

const PADDING_CLASSES: Record<StaflyCardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export const StaflyCard = forwardRef<HTMLElement, StaflyCardProps>(
  function StaflyCard(
    {
      children,
      className,
      tone = "default",
      padding = "md",
      as,
      to,
      href,
      onClick,
      target,
      rel,
      type,
      "aria-label": ariaLabel,
    },
    ref
  ) {
    // Infer element if not specified
    const Tag: ElementType = as ?? (to ? Link : href ? "a" : onClick ? "button" : "div");

    const classes = cn(TONE_CLASSES[tone], PADDING_CLASSES[padding], className);

    const commonProps: Record<string, unknown> = {
      ref,
      className: classes,
      onClick,
      "aria-label": ariaLabel,
    };

    if (Tag === Link) {
      return (
        <Link to={to ?? "#"} className={classes} onClick={onClick} aria-label={ariaLabel}>
          {children}
        </Link>
      );
    }
    if (Tag === "a") {
      return (
        <a {...commonProps} href={href} target={target} rel={rel}>
          {children}
        </a>
      );
    }
    if (Tag === "button") {
      return (
        <button {...commonProps} type={type ?? "button"}>
          {children}
        </button>
      );
    }
    return <div {...commonProps}>{children}</div>;
  }
);
