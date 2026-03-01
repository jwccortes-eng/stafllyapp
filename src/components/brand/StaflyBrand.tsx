/**
 * StaflyApps Brand System — Uses generated brand assets.
 * Single source of truth for logo mark + wordmark across the entire app.
 */
import staflyIcon from "@/assets/stafly-app-icon-new.png";
import staflySidebarLogo from "@/assets/stafly-sidebar-logo.png";

interface MarkProps {
  className?: string;
  size?: number;
}

/** Isotipo — App icon mark */
export function StaflyMark({ className = "", size = 32 }: MarkProps) {
  return (
    <img
      src={staflyIcon}
      alt="StaflyApps"
      width={size}
      height={size}
      className={`rounded-lg shrink-0 ${className}`}
    />
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
    <div className={`flex items-center gap-2 ${className}`} style={muted ? { opacity: 0.4 } : undefined}>
      <StaflyMark size={size} />
      {!markOnly && (
        <span
          className="font-heading font-bold tracking-tight text-foreground select-none"
          style={{ fontSize: size * 0.56, lineHeight: 1 }}
        >
          StaflyApps
        </span>
      )}
    </div>
  );
}
