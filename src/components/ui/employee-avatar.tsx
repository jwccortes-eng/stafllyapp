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
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = { sm: "h-7 w-7 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" };

export function EmployeeAvatar({ firstName, lastName, size = "md", className }: EmployeeAvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const color = colors[hashName(`${firstName}${lastName}`) % colors.length];

  return (
    <div className={cn(
      "rounded-full flex items-center justify-center font-semibold text-white shrink-0",
      sizes[size], color, className
    )}>
      {initials}
    </div>
  );
}
