/**
 * StaflyApps Brand System — Crisp SVG logo that scales to any size.
 * Single source of truth for logo mark + wordmark across the entire app.
 */
import React, { forwardRef } from "react";
import staflySidebarLogo from "@/assets/stafly-sidebar-logo.png";

interface MarkProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number;
}

/** Isotipo — SVG shield-clock icon */
export const StaflyMark = forwardRef<SVGSVGElement, MarkProps>(function StaflyMark(
  { className = "", size = 32, ...rest },
  ref,
) {
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="StaflyApps"
      {...rest}
    >
      {/* Shield shape with gradient */}
      <defs>
        <linearGradient id="stafly-grad" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(210, 100%, 55%)" />
          <stop offset="100%" stopColor="hsl(215, 90%, 42%)" />
        </linearGradient>
      </defs>
      {/* Shield path */}
      <path
        d="M20 2L6 9v10c0 9.5 5.5 17.5 14 20 8.5-2.5 14-10.5 14-20V9L20 2z"
        fill="url(#stafly-grad)"
      />
      {/* Clock circle */}
      <circle cx="20" cy="19" r="8" fill="none" stroke="white" strokeWidth="1.8" opacity="0.9" />
      {/* Clock hands */}
      <line x1="20" y1="19" x2="20" y2="14" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="20" y1="19" x2="24" y2="19" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      {/* Clock center dot */}
      <circle cx="20" cy="19" r="1.2" fill="white" />
      {/* Checkmark accent at bottom */}
      <path d="M16 28l2.5 2.5L23 26" stroke="hsl(158, 64%, 48%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
});

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  size?: number;
  /** Hide wordmark, show only the mark */
  markOnly?: boolean;
  /** Muted style for footer / watermark usage */
  muted?: boolean;
  /** Use dark/sidebar variant */
  variant?: "default" | "sidebar";
}

/** Full logo — Mark + "StaflyApps" wordmark */
export const StaflyLogo = forwardRef<HTMLDivElement, LogoProps>(function StaflyLogo(
  { className = "", size = 32, markOnly = false, muted = false, variant = "default", style, ...rest },
  ref,
) {
  const mergedStyle = { ...(muted ? { opacity: 0.4 } : {}), ...style };

  if (variant === "sidebar") {
    return (
      <div ref={ref} className={`flex items-center ${className}`} style={mergedStyle} {...rest}>
        <img
          src={staflySidebarLogo}
          alt="StaflyApps"
          height={size}
          style={{ height: size, width: "auto" }}
          className="shrink-0"
        />
      </div>
    );
  }

  return (
    <div ref={ref} className={`flex items-center gap-2.5 ${className}`} style={mergedStyle} {...rest}>
      <StaflyMark size={size} />
      {!markOnly && (
        <span
          className="font-heading font-bold tracking-tight text-foreground select-none"
          style={{ fontSize: size * 0.56, lineHeight: 1 }}
        >
          Stafly<span className="text-primary">Apps</span>
        </span>
      )}
    </div>
  );
});
