/**
 * WorkerPreferenceBadge — colored badge for a worker_client_preferences.preference_type.
 * Internal admin-only labels. Never shown to workers.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type WorkerPreferenceType =
  | "preferred"
  | "prequalified"
  | "blocked"
  | "not_recommended"
  | "captain_preferred"
  | "driver_preferred";

const LABELS: Record<WorkerPreferenceType, string> = {
  preferred: "Preferred",
  prequalified: "Prequalified",
  blocked: "Blocked",
  not_recommended: "Not recommended",
  captain_preferred: "Captain preferred",
  driver_preferred: "Driver preferred",
};

const STYLES: Record<WorkerPreferenceType, string> = {
  preferred: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  prequalified: "bg-sky-500/10 text-sky-600 border-sky-500/30 dark:text-sky-400",
  captain_preferred: "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-400",
  driver_preferred: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  not_recommended: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  blocked: "bg-destructive/10 text-destructive border-destructive/30",
};

export function WorkerPreferenceBadge({
  type,
  className,
}: {
  type: WorkerPreferenceType;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("text-[10px] capitalize", STYLES[type], className)}>
      {LABELS[type]}
    </Badge>
  );
}

export const PREFERENCE_LABELS = LABELS;
