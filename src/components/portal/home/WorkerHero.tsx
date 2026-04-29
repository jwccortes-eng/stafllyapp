/**
 * WorkerHero — premium emotional hero card for the Worker Portal home.
 *
 * Pure presentational. Receives the worker identity + a derived status
 * (on_shift / ready / incomplete) and renders a large avatar, greeting,
 * company pill and an emotional one-liner.
 *
 * No business logic — caller is responsible for resolving status from
 * the live `clockStatus` + `readiness.status` pair.
 */
import { CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDisplayName } from "@/lib/format-helpers";

export type WorkerHeroStatus = "on_shift" | "ready" | "incomplete";

interface Props {
  firstName: string;
  lastName: string;
  greeting: string;
  companyName: string | null;
  avatarUrl: string | null;
  status: WorkerHeroStatus;
}

const STATUS_COPY: Record<WorkerHeroStatus, { label: string; message: string }> = {
  on_shift: {
    label: "On shift",
    message: "You're checked in. We're tracking your time.",
  },
  ready: {
    label: "Ready",
    message: "Everything is ready for your next shift.",
  },
  incomplete: {
    label: "Profile incomplete",
    message: "Complete your profile to stay ready.",
  },
};

const STATUS_PILL: Record<WorkerHeroStatus, string> = {
  on_shift: "bg-[hsl(var(--status-confirmed)/0.14)] text-[hsl(var(--status-confirmed))] border-[hsl(var(--status-confirmed)/0.25)]",
  ready: "bg-primary/12 text-primary border-primary/22",
  incomplete: "bg-warning/12 text-warning border-warning/25",
};

const STATUS_ICON: Record<WorkerHeroStatus, React.ComponentType<{ className?: string }>> = {
  on_shift: Sparkles,
  ready: CheckCircle2,
  incomplete: AlertTriangle,
};

function initialsFor(first: string, last: string): string {
  const a = (first ?? "").trim().charAt(0);
  const b = (last ?? "").trim().charAt(0);
  return (a + b || a || "?").toUpperCase();
}

export function WorkerHero({ firstName, lastName, greeting, companyName, avatarUrl, status }: Props) {
  const StatusIcon = STATUS_ICON[status];
  const copy = STATUS_COPY[status];

  return (
    <section
      aria-label="Worker hero"
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/40 bg-card",
        "shadow-[0_8px_32px_-12px_hsl(var(--primary)/0.18)]",
      )}
    >
      {/* Subtle ambient gradient backdrop */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 opacity-70",
          status === "on_shift"
            ? "bg-gradient-to-br from-[hsl(var(--status-confirmed)/0.10)] via-transparent to-transparent"
            : status === "incomplete"
            ? "bg-gradient-to-br from-warning/10 via-transparent to-transparent"
            : "bg-gradient-to-br from-primary/8 via-transparent to-transparent",
        )}
      />

      <div className="relative px-5 pt-5 pb-5">
        {/* Avatar — protagonista, 96px */}
        <div className="flex justify-center mb-3">
          <div className="relative">
            <div
              className={cn(
                "h-24 w-24 rounded-full overflow-hidden ring-4 ring-background",
                "shadow-[0_12px_28px_-12px_hsl(var(--primary)/0.4)]",
                "border border-border/60",
              )}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${firstName} ${lastName}`}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                  <span className="text-2xl font-bold font-heading text-primary tracking-tight">
                    {initialsFor(firstName, lastName)}
                  </span>
                </div>
              )}
            </div>
            {status === "on_shift" && (
              <span className="absolute bottom-1 right-1 flex h-4 w-4">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--status-confirmed))] opacity-60" />
                <span className="relative inline-flex h-4 w-4 rounded-full bg-[hsl(var(--status-confirmed))] ring-2 ring-card" />
              </span>
            )}
          </div>
        </div>

        {/* Greeting + name */}
        <div className="text-center space-y-1">
          <p className="text-[12px] font-medium text-muted-foreground/80">{greeting},</p>
          <h1 className="text-2xl font-bold font-heading tracking-tight leading-tight text-foreground">
            {firstName || "Welcome"}
          </h1>
        </div>

        {/* Pills row */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2.5">
          {companyName && (
            <span className="inline-flex items-center max-w-[180px] truncate rounded-full bg-muted/60 border border-border/40 px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground">
              {formatDisplayName(companyName)}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold",
              STATUS_PILL[status],
            )}
          >
            <StatusIcon className="h-3 w-3" />
            {copy.label}
          </span>
        </div>

        {/* Emotional one-liner */}
        <p className="text-center text-[12.5px] text-muted-foreground/85 leading-relaxed mt-3 max-w-[280px] mx-auto">
          {copy.message}
        </p>
      </div>
    </section>
  );
}
