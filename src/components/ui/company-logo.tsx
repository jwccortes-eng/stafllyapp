import { cn } from "@/lib/utils";

interface CompanyLogoProps {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  active?: boolean;
  className?: string;
  /** Shows a subtle pulse glow when active */
  glow?: boolean;
}

const FALLBACK_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#3b82f6", "#84cc16",
];

const SIZES = {
  xs: { box: "h-5 w-5", text: "text-[7px]", ring: "ring-1", glow: 3 },
  sm: { box: "h-7 w-7", text: "text-[9px]", ring: "ring-[1.5px]", glow: 5 },
  md: { box: "h-9 w-9", text: "text-[11px]", ring: "ring-2", glow: 8 },
  lg: { box: "h-11 w-11", text: "text-[13px]", ring: "ring-2", glow: 10 },
  xl: { box: "h-14 w-14", text: "text-[16px]", ring: "ring-[2.5px]", glow: 14 },
  "2xl": { box: "h-20 w-20", text: "text-xl", ring: "ring-[3px]", glow: 20 },
};

function hashString(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getColor(brandColor: string | null | undefined, name: string): string {
  if (brandColor) return brandColor;
  return FALLBACK_COLORS[hashString(name) % FALLBACK_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function CompanyLogo({
  name,
  logoUrl,
  brandColor,
  size = "md",
  active = false,
  className,
  glow = false,
}: CompanyLogoProps) {
  const color = getColor(brandColor, name);
  const s = SIZES[size];
  const initials = getInitials(name);
  const showGlow = glow || active;

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-xl overflow-hidden",
        s.box,
        s.ring,
        "transition-all duration-300",
        className
      )}
      style={{
        ringColor: `${color}40`,
        borderColor: `${color}30`,
        boxShadow: showGlow
          ? `0 0 ${s.glow}px ${color}30, 0 0 ${s.glow * 2.5}px ${color}15, inset 0 1px 0 rgba(255,255,255,0.1)`
          : `inset 0 1px 0 rgba(255,255,255,0.08)`,
        // Use ring via inline style for brand color
        outline: `${showGlow ? 2 : 1.5}px solid ${showGlow ? `${color}50` : `${color}25`}`,
        outlineOffset: "-1px",
      }}
    >
      {/* Gradient background layer */}
      <div
        className="absolute inset-0"
        style={{
          background: logoUrl
            ? "transparent"
            : `linear-gradient(135deg, ${color}18 0%, ${color}08 50%, ${color}15 100%)`,
        }}
      />

      {/* Subtle inner shine */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background: "linear-gradient(160deg, rgba(255,255,255,0.15) 0%, transparent 50%)",
        }}
      />

      {/* Logo image or initials */}
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className="relative z-10 h-full w-full object-contain p-[15%]"
          loading="lazy"
        />
      ) : (
        <span
          className={cn(
            "relative z-10 flex items-center justify-center h-full w-full font-bold tracking-tight",
            s.text
          )}
          style={{ color }}
        >
          {initials}
        </span>
      )}

      {/* Active indicator dot */}
      {active && (
        <span
          className="absolute -bottom-px -right-px z-20 rounded-full ring-2 ring-background"
          style={{
            width: size === "xs" || size === "sm" ? 6 : 8,
            height: size === "xs" || size === "sm" ? 6 : 8,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}60`,
          }}
        />
      )}
    </div>
  );
}
