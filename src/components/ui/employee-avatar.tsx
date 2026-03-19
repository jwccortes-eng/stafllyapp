import { cn } from "@/lib/utils";
import defaultAvatarImg from "@/assets/default-avatar.png";

function hashName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type OnlineStatus = "online" | "offline" | "on_shift" | "recently_active" | "not_available";

interface EmployeeAvatarProps {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  gender?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  status?: OnlineStatus | null;
}

const STATUS_COLORS: Record<OnlineStatus, string> = {
  online: "bg-earning",
  on_shift: "bg-primary",
  recently_active: "bg-warning",
  offline: "bg-muted-foreground/40",
  not_available: "bg-destructive",
};

const DOT_SIZES: Record<string, string> = {
  sm: "h-2 w-2 border",
  md: "h-2.5 w-2.5 border-[1.5px]",
  lg: "h-3 w-3 border-2",
  xl: "h-4 w-4 border-2",
};

const sizes: Record<string, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-10 w-10",
  xl: "h-16 w-16",
};

// Skin tones
const SKIN_TONES = ["#FDDBB4", "#E8B88A", "#D4956B", "#C68642", "#8D5524", "#F5CBA7"];
// Hair colors  
const HAIR_COLORS = ["#2C1810", "#4A2C17", "#6B3A2A", "#8B4513", "#D4A76A", "#1A1A2E", "#C0392B", "#E67E22"];
// Background gradients (using pairs)
const BG_PAIRS = [
  ["#667eea", "#764ba2"],
  ["#f093fb", "#f5576c"],
  ["#4facfe", "#00f2fe"],
  ["#43e97b", "#38f9d7"],
  ["#fa709a", "#fee140"],
  ["#a18cd1", "#fbc2eb"],
  ["#ffecd2", "#fcb69f"],
  ["#89f7fe", "#66a6ff"],
  ["#fddb92", "#d1fdff"],
  ["#c471f5", "#fa71cd"],
];
// Accessory colors
const ACCESSORY_COLORS = ["#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6", "#1ABC9C", "#E91E63", "#FF5722"];

// Female hairstyle variations
type HairStyle = "long" | "bob" | "ponytail" | "curly" | "bun" | "short";
const FEMALE_STYLES: HairStyle[] = ["long", "bob", "ponytail", "curly", "bun", "short"];
const MALE_STYLES: HairStyle[] = ["short", "curly", "bun"];

// Accessory types
type Accessory = "none" | "glasses" | "earrings" | "headband";
const ACCESSORIES: Accessory[] = ["none", "glasses", "earrings", "headband", "none", "none"];

function GeneratedAvatar({ firstName, lastName, gender, size }: { firstName: string; lastName: string; gender?: string | null; size: string }) {
  const hash = hashName(`${firstName}${lastName}`);
  const hash2 = hashName(`${lastName}${firstName}`);

  const isFemale = gender?.toLowerCase() === "f" || gender?.toLowerCase() === "female" || gender?.toLowerCase() === "femenino" || gender?.toLowerCase() === "mujer";
  const isMale = gender?.toLowerCase() === "m" || gender?.toLowerCase() === "male" || gender?.toLowerCase() === "masculino" || gender?.toLowerCase() === "hombre";
  // Default to random based on hash if no gender
  const presentAsFemale = isFemale || (!isMale && hash % 2 === 0);

  const skinTone = SKIN_TONES[hash % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[hash2 % HAIR_COLORS.length];
  const bgPair = BG_PAIRS[hash % BG_PAIRS.length];
  const accessory = ACCESSORIES[hash2 % ACCESSORIES.length];
  const accColor = ACCESSORY_COLORS[(hash + hash2) % ACCESSORY_COLORS.length];

  const hairStyle = presentAsFemale
    ? FEMALE_STYLES[hash2 % FEMALE_STYLES.length]
    : MALE_STYLES[hash % MALE_STYLES.length];

  const gradientId = `bg-${hash}`;
  const blushOpacity = presentAsFemale ? 0.25 : 0.12;

  return (
    <div className={cn("rounded-full shrink-0 overflow-hidden", size)}>
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={bgPair[0]} />
            <stop offset="100%" stopColor={bgPair[1]} />
          </linearGradient>
        </defs>

        {/* Background */}
        <circle cx="50" cy="50" r="50" fill={`url(#${gradientId})`} />

        {/* Body/shoulders */}
        <ellipse cx="50" cy="95" rx="30" ry="18" fill={presentAsFemale ? accColor : hairColor} opacity="0.85" />

        {/* Neck */}
        <rect x="43" y="65" width="14" height="12" rx="5" fill={skinTone} />

        {/* Hair behind (long styles) */}
        {presentAsFemale && hairStyle === "long" && (
          <ellipse cx="50" cy="48" rx="26" ry="32" fill={hairColor} />
        )}
        {presentAsFemale && hairStyle === "curly" && (
          <>
            <ellipse cx="50" cy="46" rx="27" ry="30" fill={hairColor} />
            <circle cx="28" cy="50" r="8" fill={hairColor} />
            <circle cx="72" cy="50" r="8" fill={hairColor} />
            <circle cx="30" cy="62" r="6" fill={hairColor} />
            <circle cx="70" cy="62" r="6" fill={hairColor} />
          </>
        )}

        {/* Head */}
        <ellipse cx="50" cy="45" rx="22" ry="24" fill={skinTone} />

        {/* Eyes */}
        <ellipse cx="41" cy="45" rx="2.5" ry="3" fill="#2C1810" />
        <ellipse cx="59" cy="45" rx="2.5" ry="3" fill="#2C1810" />
        <circle cx="40" cy="44" r="0.8" fill="white" />
        <circle cx="58" cy="44" r="0.8" fill="white" />

        {/* Eyebrows */}
        <path d={presentAsFemale ? "M36 39 Q41 36 46 39" : "M35 38 Q41 35 47 38"} stroke="#2C1810" strokeWidth={presentAsFemale ? "1" : "1.5"} fill="none" strokeLinecap="round" />
        <path d={presentAsFemale ? "M54 39 Q59 36 64 39" : "M53 38 Q59 35 65 38"} stroke="#2C1810" strokeWidth={presentAsFemale ? "1" : "1.5"} fill="none" strokeLinecap="round" />

        {/* Nose */}
        <path d="M48 48 Q50 52 52 48" stroke={skinTone} strokeWidth="1.5" fill="none" opacity="0.5" />

        {/* Mouth */}
        <path d={presentAsFemale ? "M44 55 Q50 59 56 55" : "M44 55 Q50 58 56 55"} stroke="#C0392B" strokeWidth={presentAsFemale ? "1.5" : "1.2"} fill={presentAsFemale ? "#E74C3C" : "none"} fillOpacity="0.3" strokeLinecap="round" />

        {/* Blush */}
        <circle cx="35" cy="50" r="4" fill="#FF6B6B" opacity={blushOpacity} />
        <circle cx="65" cy="50" r="4" fill="#FF6B6B" opacity={blushOpacity} />

        {/* Hair front */}
        {presentAsFemale && hairStyle === "long" && (
          <>
            <path d="M28 42 Q30 20 50 18 Q70 20 72 42 Q70 28 50 25 Q30 28 28 42" fill={hairColor} />
            <path d="M28 42 Q26 60 28 75" stroke={hairColor} strokeWidth="8" fill="none" strokeLinecap="round" />
            <path d="M72 42 Q74 60 72 75" stroke={hairColor} strokeWidth="8" fill="none" strokeLinecap="round" />
          </>
        )}
        {presentAsFemale && hairStyle === "bob" && (
          <path d="M28 45 Q28 18 50 16 Q72 18 72 45 Q72 58 65 60 L65 42 Q62 26 50 24 Q38 26 35 42 L35 60 Q28 58 28 45Z" fill={hairColor} />
        )}
        {presentAsFemale && hairStyle === "ponytail" && (
          <>
            <path d="M28 42 Q30 18 50 16 Q70 18 72 42 Q70 26 50 22 Q30 26 28 42" fill={hairColor} />
            <ellipse cx="68" cy="30" rx="6" ry="8" fill={hairColor} transform="rotate(20, 68, 30)" />
            <path d="M68 38 Q75 50 72 65" stroke={hairColor} strokeWidth="6" fill="none" strokeLinecap="round" />
          </>
        )}
        {presentAsFemale && hairStyle === "curly" && (
          <path d="M28 45 Q28 18 50 16 Q72 18 72 45 Q70 28 50 22 Q30 28 28 45" fill={hairColor} />
        )}
        {presentAsFemale && hairStyle === "bun" && (
          <>
            <path d="M28 42 Q30 18 50 16 Q70 18 72 42 Q70 26 50 22 Q30 26 28 42" fill={hairColor} />
            <circle cx="50" cy="14" r="10" fill={hairColor} />
          </>
        )}
        {presentAsFemale && hairStyle === "short" && (
          <path d="M28 42 Q28 18 50 15 Q72 18 72 42 Q70 26 50 22 Q30 26 28 42" fill={hairColor} />
        )}

        {/* Male hair */}
        {!presentAsFemale && hairStyle === "short" && (
          <path d="M28 40 Q28 16 50 14 Q72 16 72 40 Q70 24 50 20 Q30 24 28 40" fill={hairColor} />
        )}
        {!presentAsFemale && hairStyle === "curly" && (
          <>
            <path d="M26 42 Q26 14 50 12 Q74 14 74 42 Q72 22 50 18 Q28 22 26 42" fill={hairColor} />
            <circle cx="30" cy="28" r="4" fill={hairColor} />
            <circle cx="42" cy="18" r="4" fill={hairColor} />
            <circle cx="58" cy="18" r="4" fill={hairColor} />
            <circle cx="70" cy="28" r="4" fill={hairColor} />
          </>
        )}
        {!presentAsFemale && hairStyle === "bun" && (
          <>
            <path d="M28 40 Q30 18 50 16 Q70 18 72 40 Q70 24 50 20 Q30 24 28 40" fill={hairColor} />
            <circle cx="50" cy="12" r="8" fill={hairColor} />
          </>
        )}

        {/* Accessories */}
        {accessory === "glasses" && (
          <>
            <circle cx="41" cy="45" r="7" stroke={accColor} strokeWidth="1.5" fill="none" />
            <circle cx="59" cy="45" r="7" stroke={accColor} strokeWidth="1.5" fill="none" />
            <line x1="48" y1="45" x2="52" y2="45" stroke={accColor} strokeWidth="1.5" />
            <line x1="34" y1="44" x2="28" y2="42" stroke={accColor} strokeWidth="1" />
            <line x1="66" y1="44" x2="72" y2="42" stroke={accColor} strokeWidth="1" />
          </>
        )}
        {accessory === "earrings" && presentAsFemale && (
          <>
            <circle cx="27" cy="52" r="2" fill={accColor} />
            <circle cx="73" cy="52" r="2" fill={accColor} />
          </>
        )}
        {accessory === "headband" && (
          <path d="M28 34 Q50 28 72 34" stroke={accColor} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}

export function EmployeeAvatar({ firstName, lastName, avatarUrl, gender, size = "md", className, status }: EmployeeAvatarProps) {
  const inner = avatarUrl ? (
    <div className={cn("rounded-full shrink-0 overflow-hidden", sizes[size])}>
      <img
        src={avatarUrl}
        alt={`${firstName} ${lastName}`}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </div>
  ) : (
    <div className="shrink-0">
      <GeneratedAvatar firstName={firstName} lastName={lastName} gender={gender} size={sizes[size]} />
    </div>
  );

  if (status && status !== "offline") {
    return (
      <div className={cn("relative shrink-0 inline-flex", className)}>
        {inner}
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-background",
            STATUS_COLORS[status],
            DOT_SIZES[size],
            status === "online" && "animate-pulse"
          )}
          title={status.replace("_", " ")}
        />
      </div>
    );
  }

  return <div className={cn("shrink-0 inline-flex", className)}>{inner}</div>;
}
