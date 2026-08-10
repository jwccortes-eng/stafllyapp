import { cn } from "@/lib/utils";
import { clientAccentColor, clientAccentSoft } from "@/lib/clients/client-accent";

interface ClientAvatarProps {
  name: string;
  /**
   * Identidad cromática canónica del Cliente (hash(client_id) → accent token).
   * Cuando se provee, el avatar usa el MISMO color que el resto del ecosistema.
   */
  clientId?: string | null;
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

// Fallback corporativo cuando todavía no se conoce el id del Cliente.
const FALLBACK = { bg: "#2c3e50", fg: "#ecf0f1" };

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function ClientAvatar({ name, clientId, size = "md", className }: ClientAvatarProps) {
  const accent = clientAccentColor(clientId);
  const accentSoft = clientAccentSoft(clientId, 0.16);

  // Extract up to 2 initials from the company name (first letters of first two words)
  const words = name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();

  const style = accent
    ? { backgroundColor: accentSoft, color: accent }
    : { backgroundColor: FALLBACK.bg, color: FALLBACK.fg, opacity: hashStr(name) ? 1 : 1 };

  return (
    <div
      className={cn(
        "rounded-xl shrink-0 flex items-center justify-center font-bold tracking-wide shadow-sm",
        sizes[size],
        textSizes[size],
        className
      )}
      style={style}
      title={name}
    >
      {initials}
    </div>
  );
}
