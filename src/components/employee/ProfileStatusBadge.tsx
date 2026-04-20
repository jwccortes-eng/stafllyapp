/**
 * Compact badge that surfaces an employee's onboarding readiness.
 * Always uses semantic tokens (no hardcoded colors).
 */
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, FileWarning, Sparkles } from "lucide-react";
import {
  PROFILE_STATUS_LABELS,
  PROFILE_STATUS_TONES,
  type ProfileStatus,
} from "@/lib/onboarding/profile-status";

const ICONS: Record<ProfileStatus, typeof CheckCircle2> = {
  incomplete: AlertCircle,
  pending_documents: FileWarning,
  ready: CheckCircle2,
  active: Sparkles,
};

interface Props {
  status: ProfileStatus;
  size?: "sm" | "xs";
  showIcon?: boolean;
  className?: string;
}

export function ProfileStatusBadge({ status, size = "sm", showIcon = true, className }: Props) {
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-semibold whitespace-nowrap",
        PROFILE_STATUS_TONES[status],
        size === "xs"
          ? "text-[10px] px-1.5 py-0.5"
          : "text-[11px] px-2 py-0.5",
        className,
      )}
      title={PROFILE_STATUS_LABELS[status]}
    >
      {showIcon && <Icon className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />}
      {PROFILE_STATUS_LABELS[status]}
    </span>
  );
}
