/**
 * Stafly Brand System — Pure SVG, no PNGs.
 * Single source of truth for logo mark + wordmark across the entire app.
 */

interface MarkProps {
  className?: string;
  size?: number;
}

/** Isotipo — Bird wing mark inside a rounded square */
export function StaflyMark({ className = "", size = 32 }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Stafly"
    >
      {/* Rounded square background */}
      <rect width="48" height="48" rx="12" fill="currentColor" className="text-primary" />
      {/* Stylised bird / wing — two arcs forming an abstract "S" wing */}
      <path
        d="M14 32C14 32 18 20 24 16C30 12 36 14 36 14"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 28C12 28 20 24 26 22C32 20 38 22 38 22"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <path
        d="M16 34C16 34 22 30 28 28C34 26 38 28 38 28"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.45"
      />
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
}

/** Full logo — Mark + "stafly" wordmark */
export function StaflyLogo({ className = "", size = 32, markOnly = false, muted = false }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`} style={muted ? { opacity: 0.4 } : undefined}>
      <StaflyMark size={size} />
      {!markOnly && (
        <span
          className="font-heading font-bold tracking-tight text-foreground select-none"
          style={{ fontSize: size * 0.56, lineHeight: 1 }}
        >
          stafly
        </span>
      )}
    </div>
  );
}
