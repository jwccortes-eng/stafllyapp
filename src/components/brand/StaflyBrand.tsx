/**
 * StaflyApps Brand System — Crisp SVG logo that scales to any size.
 * Single source of truth for logo mark + wordmark across the entire app.
 */
import staflySidebarLogo from "@/assets/stafly-sidebar-logo.png";

interface MarkProps {
  className?: string;
  size?: number;
}

/** Isotipo — SVG shield-calendar icon */
export function StaflyMark({ className = "", size = 32 }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="StaflyApps"
    >
      {/* Rounded square background with gradient */}
      <defs>
        <linearGradient id="stafly-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(222, 100%, 59%)" />
          <stop offset="100%" stopColor="hsl(226, 76%, 49%)" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#stafly-grad)" />
      {/* Calendar top bar */}
      <rect x="9" y="10" width="22" height="3" rx="1.5" fill="white" opacity="0.9" />
      {/* Calendar pins */}
      <rect x="14" y="8" width="2.5" height="5" rx="1.25" fill="white" />
      <rect x="23.5" y="8" width="2.5" height="5" rx="1.25" fill="white" />
      {/* Grid dots — representing shifts/schedule */}
      <circle cx="15" cy="20" r="2" fill="white" opacity="0.95" />
      <circle cx="20" cy="20" r="2" fill="white" opacity="0.75" />
      <circle cx="25" cy="20" r="2" fill="white" opacity="0.95" />
      <circle cx="15" cy="26" r="2" fill="white" opacity="0.75" />
      <circle cx="20" cy="26" r="2" fill="white" opacity="0.95" />
      <circle cx="25" cy="26" r="2" fill="white" opacity="0.75" />
      {/* Checkmark accent */}
      <path d="M23 30L25.5 32.5L30 27" stroke="hsl(163, 68%, 50%)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

interface LogoProps {
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
export function StaflyLogo({ className = "", size = 32, markOnly = false, muted = false, variant = "default" }: LogoProps) {
  if (variant === "sidebar") {
    return (
      <div className={`flex items-center ${className}`} style={muted ? { opacity: 0.4 } : undefined}>
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
    <div className={`flex items-center gap-2.5 ${className}`} style={muted ? { opacity: 0.4 } : undefined}>
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
}
