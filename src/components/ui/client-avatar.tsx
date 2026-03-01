import { cn } from "@/lib/utils";

interface ClientAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes: Record<string, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

const textSizes: Record<string, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

// Professional color palette – muted, corporate tones
const PALETTES = [
  { bg: "#1e3a5f", fg: "#e8f0fe" }, // navy
  { bg: "#2d4a3e", fg: "#e0f2e9" }, // forest
  { bg: "#4a3728", fg: "#f5ebe0" }, // walnut
  { bg: "#3b3154", fg: "#ede7f6" }, // plum
  { bg: "#1a3c4d", fg: "#e0f4f4" }, // teal
  { bg: "#4e3629", fg: "#fdf0e6" }, // mahogany
  { bg: "#2c3e50", fg: "#ecf0f1" }, // charcoal
  { bg: "#3e2723", fg: "#efebe9" }, // espresso
  { bg: "#1b5e20", fg: "#e8f5e9" }, // emerald
  { bg: "#4a148c", fg: "#f3e5f5" }, // deep purple
];

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function ClientAvatar({ name, size = "md", className }: ClientAvatarProps) {
  const hash = hashStr(name);
  const palette = PALETTES[hash % PALETTES.length];

  // Extract up to 2 initials from the company name (first letters of first two words)
  const words = name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        "rounded-xl shrink-0 flex items-center justify-center font-bold tracking-wide shadow-sm",
        sizes[size],
        textSizes[size],
        className
      )}
      style={{ backgroundColor: palette.bg, color: palette.fg }}
      title={name}
    >
      {initials}
    </div>
  );
}
