import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "./employee-avatar";

export interface AvatarGroupItem {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  gender?: string | null;
}

interface EmployeeAvatarGroupProps {
  employees: AvatarGroupItem[];
  /** Max visible before +N counter */
  max?: number;
  size?: "xs" | "sm" | "md";
  /** Show names beside avatars (only when ≤ max) */
  showNames?: boolean;
  className?: string;
}

const overlapMap: Record<string, string> = {
  xs: "-space-x-1.5",
  sm: "-space-x-2",
  md: "-space-x-2.5",
};

const counterSizes: Record<string, string> = {
  xs: "h-5 w-5 text-[7px]",
  sm: "h-7 w-7 text-[9px]",
  md: "h-8 w-8 text-[10px]",
};

export function EmployeeAvatarGroup({
  employees,
  max = 4,
  size = "sm",
  showNames = false,
  className,
}: EmployeeAvatarGroupProps) {
  if (employees.length === 0) return null;

  const visible = employees.slice(0, max);
  const overflow = employees.length - max;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className={cn("flex", overlapMap[size])}>
        {visible.map((emp, i) => (
          <EmployeeAvatar
            key={i}
            firstName={emp.firstName}
            lastName={emp.lastName}
            avatarUrl={emp.avatarUrl}
            gender={emp.gender}
            size={size}
            className="ring-2 ring-background"
          />
        ))}
        {overflow > 0 && (
          <div
            className={cn(
              "rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground ring-2 ring-background shrink-0",
              counterSizes[size]
            )}
          >
            +{overflow}
          </div>
        )}
      </div>
      {showNames && employees.length <= max && (
        <span className="text-[10px] text-muted-foreground truncate">
          {employees.map(e => e.firstName).join(", ")}
        </span>
      )}
    </div>
  );
}
