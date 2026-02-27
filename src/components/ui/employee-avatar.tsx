import { cn } from "@/lib/utils";

const colors = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
  "bg-violet-500", "bg-teal-500", "bg-indigo-500", "bg-pink-500",
  "bg-cyan-500", "bg-orange-500",
];

function hashName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface EmployeeAvatarProps {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-16 w-16 text-xl",
};

export function EmployeeAvatar({ firstName, lastName, avatarUrl, size = "md", className }: EmployeeAvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const color = colors[hashName(`${firstName}${lastName}`) % colors.length];

  if (avatarUrl) {
    return (
      <div className={cn("rounded-full shrink-0 overflow-hidden", sizes[size], className)}>
        <img
          src={avatarUrl}
          alt={`${firstName} ${lastName}`}
          className="h-full w-full object-cover"
          onError={(e) => {
            // Fallback to initials on error
            (e.target as HTMLImageElement).style.display = "none";
            (e.target as HTMLImageElement).parentElement!.classList.add(color, "flex", "items-center", "justify-center", "font-semibold", "text-white");
            (e.target as HTMLImageElement).parentElement!.textContent = initials;
          }}
        />
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-full flex items-center justify-center font-semibold text-white shrink-0",
      sizes[size], color, className
    )}>
      {initials}
    </div>
  );
}
