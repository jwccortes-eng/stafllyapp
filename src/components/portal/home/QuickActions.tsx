/**
 * QuickActions — 2-col grid of premium nav cards for the Worker Home.
 *
 * Pure presentational. Caller passes a list of actions; each must point to
 * an existing route. If a module is disabled, omit the action upstream.
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface QuickAction {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Optional accent token: "primary" | "earning" | "warning" | "muted" */
  accent?: "primary" | "earning" | "warning" | "muted";
  /** Optional small badge displayed next to the label (e.g. "NEW"). */
  badge?: string;
}

const ACCENT: Record<NonNullable<QuickAction["accent"]>, { wrap: string; iconWrap: string; icon: string }> = {
  primary: {
    wrap: "border-primary/20 hover:border-primary/40 hover:bg-primary/[0.04]",
    iconWrap: "bg-primary/10",
    icon: "text-primary",
  },
  earning: {
    wrap: "border-earning/20 hover:border-earning/40 hover:bg-earning/[0.04]",
    iconWrap: "bg-earning/10",
    icon: "text-earning",
  },
  warning: {
    wrap: "border-warning/20 hover:border-warning/40 hover:bg-warning/[0.04]",
    iconWrap: "bg-warning/12",
    icon: "text-warning",
  },
  muted: {
    wrap: "border-border/40 hover:border-border/70 hover:bg-muted/30",
    iconWrap: "bg-muted/60",
    icon: "text-muted-foreground",
  },
};

interface Props {
  actions: QuickAction[];
}

export function QuickActions({ actions }: Props) {
  if (actions.length === 0) return null;

  return (
    <section aria-label="Quick actions" className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Quick actions
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((a) => {
          const tone = ACCENT[a.accent ?? "muted"];
          const Icon = a.icon;
          return (
            <Link
              key={a.id}
              to={a.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3.5",
                "transition-all active:scale-[0.98] shadow-sm",
                tone.wrap,
              )}
            >
              <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", tone.iconWrap)}>
                <Icon className={cn("h-4 w-4", tone.icon)} />
              </div>
              <span className="text-[13px] font-semibold text-foreground leading-tight">
                {a.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
