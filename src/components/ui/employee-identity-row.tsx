import { cn } from "@/lib/utils";
import { EmployeeAvatar, type OnlineStatus } from "./employee-avatar";

interface EmployeeIdentityRowProps {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  gender?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  /** Secondary line: role, phone, area, etc. */
  secondary?: React.ReactNode;
  /** Right-side content: badges, actions, status */
  trailing?: React.ReactNode;
  status?: OnlineStatus | null;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

const textSizes: Record<string, { name: string; secondary: string }> = {
  xs: { name: "text-[11px]", secondary: "text-[9px]" },
  sm: { name: "text-xs", secondary: "text-[10px]" },
  md: { name: "text-sm", secondary: "text-xs" },
  lg: { name: "text-base", secondary: "text-sm" },
};

export function EmployeeIdentityRow({
  firstName,
  lastName,
  avatarUrl,
  gender,
  size = "sm",
  secondary,
  trailing,
  status,
  onClick,
  className,
  children,
}: EmployeeIdentityRowProps) {
  const ts = textSizes[size];

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 min-w-0",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <EmployeeAvatar
        firstName={firstName}
        lastName={lastName}
        avatarUrl={avatarUrl}
        gender={gender}
        size={size}
        status={status}
      />
      <div className="flex-1 min-w-0">
        <p className={cn("font-semibold truncate leading-tight", ts.name)}>
          {firstName} {lastName}
        </p>
        {secondary && (
          <div className={cn("text-muted-foreground truncate mt-0.5", ts.secondary)}>
            {secondary}
          </div>
        )}
        {children}
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-1">{trailing}</div>}
    </div>
  );
}
