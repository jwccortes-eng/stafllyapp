/**
 * Stafly Mascot — Pure SVG bird character.
 * Replaces all PNG mascot assets across the app.
 *
 * Variants:
 *  - "default"   → Friendly standing bird (dashboard hero, empty states)
 *  - "wave"      → Bird waving (greetings, welcome)
 *  - "checklist" → Bird with clipboard (auth, clock, tasks)
 *  - "paid"      → Bird with coin/check (payments)
 */

interface MascotProps {
  variant?: "default" | "wave" | "checklist" | "paid";
  size?: number;
  className?: string;
}

function WaveAccessory() {
  return (
    <g>
      <path d="M90 44C96 36 100 30 96 24" className="stroke-primary" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M88 50C94 42 102 38 98 28" className="stroke-primary/60" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="96" cy="24" r="3" className="fill-primary" />
      <circle cx="98" cy="28" r="2.5" className="fill-primary/60" />
    </g>
  );
}

function ChecklistAccessory() {
  return (
    <g>
      <rect x="82" y="42" width="22" height="30" rx="3" fill="white" stroke="hsl(225, 20%, 70%)" strokeWidth="1.5" />
      <rect x="86" y="40" width="14" height="5" rx="2" fill="hsl(225, 20%, 60%)" />
      <line x1="87" y1="52" x2="99" y2="52" stroke="hsl(225, 20%, 75%)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="87" y1="57" x2="96" y2="57" stroke="hsl(225, 20%, 75%)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="87" y1="62" x2="98" y2="62" stroke="hsl(225, 20%, 75%)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M85 51L87 53L90 49" stroke="hsl(145, 70%, 45%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function PaidAccessory() {
  return (
    <g>
      <circle cx="92" cy="50" r="12" fill="hsl(45, 90%, 55%)" stroke="hsl(40, 80%, 45%)" strokeWidth="1.5" />
      <circle cx="92" cy="50" r="9" fill="none" stroke="hsl(40, 80%, 45%)" strokeWidth="0.8" opacity="0.5" />
      <text x="92" y="54" textAnchor="middle" fontSize="12" fontWeight="bold" fill="hsl(40, 80%, 30%)" fontFamily="sans-serif">$</text>
      <path d="M106 40L108 36L110 40L108 44Z" fill="hsl(45, 90%, 70%)" opacity="0.7" />
      <path d="M80 34L81 31L82 34L81 37Z" fill="hsl(45, 90%, 70%)" opacity="0.5" />
    </g>
  );
}

function DefaultWing() {
  return (
    <g>
      <path d="M88 60C92 54 96 52 94 46" className="stroke-primary" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M86 64C92 58 98 56 96 48" className="stroke-primary/40" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </g>
  );
}

export function StaflyMascot({ variant = "default", size = 80, className = "" }: MascotProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="60" cy="72" rx="28" ry="32" className="fill-primary/90" />
      <ellipse cx="60" cy="78" rx="18" ry="20" fill="white" opacity="0.25" />
      <circle cx="60" cy="38" r="22" className="fill-primary" />

      <circle cx="52" cy="34" r="4" fill="white" />
      <circle cx="68" cy="34" r="4" fill="white" />
      <circle cx="53" cy="33" r="2" fill="hsl(225, 30%, 15%)" />
      <circle cx="69" cy="33" r="2" fill="hsl(225, 30%, 15%)" />
      <circle cx="54" cy="32" r="0.8" fill="white" />
      <circle cx="70" cy="32" r="0.8" fill="white" />

      <path d="M57 40L60 46L63 40" fill="hsl(32, 100%, 56%)" stroke="hsl(32, 100%, 46%)" strokeWidth="0.5" strokeLinejoin="round" />

      <circle cx="46" cy="40" r="4" fill="hsl(350, 80%, 70%)" opacity="0.3" />
      <circle cx="74" cy="40" r="4" fill="hsl(350, 80%, 70%)" opacity="0.3" />

      <path d="M48 102L44 112M48 102L52 112M48 102L48 112" stroke="hsl(32, 100%, 46%)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M72 102L68 112M72 102L76 112M72 102L72 112" stroke="hsl(32, 100%, 46%)" strokeWidth="2.5" strokeLinecap="round" />

      <path d="M32 80C24 76 20 68 22 60" className="stroke-primary" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.6" />
      <path d="M30 84C22 82 16 74 18 66" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.4" />

      <path d="M54 18C52 10 56 6 60 8" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M60 16C60 8 64 4 68 6" className="stroke-primary" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7" />

      {variant === "wave" && <WaveAccessory />}
      {variant === "checklist" && <ChecklistAccessory />}
      {variant === "paid" && <PaidAccessory />}
      {variant === "default" && <DefaultWing />}
    </svg>
  );
}
