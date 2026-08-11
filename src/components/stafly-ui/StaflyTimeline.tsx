/**
 * StaflyTimeline — línea de tiempo / feed de actividad canónico.
 *
 * Un solo componente para historiales, auditoría y actividad.
 * `variant="feed"` compacta el ritmo para listas largas.
 */

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STAFLY_TEXT, STAFLY_TONE_DOT, STAFLY_TONE_TEXT, type StaflyTone } from "./tokens";

export interface StaflyTimelineItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  timestamp?: string;
  tone?: StaflyTone;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
}

export interface StaflyTimelineProps {
  items: StaflyTimelineItem[];
  variant?: "timeline" | "feed";
  className?: string;
  emptyLabel?: string;
}

export function StaflyTimeline({
  items,
  variant = "timeline",
  className,
  emptyLabel = "Sin actividad registrada",
}: StaflyTimelineProps) {
  if (items.length === 0) {
    return <p className={cn(STAFLY_TEXT.meta, "py-6 text-center", className)}>{emptyLabel}</p>;
  }

  return (
    <ol className={cn("relative", className)}>
      {items.map((item, index) => {
        const tone = item.tone ?? "neutral";
        const Icon = item.icon;
        const last = index === items.length - 1;
        return (
          <li key={item.id} className="relative flex gap-3 pl-0">
            <div className="flex w-5 shrink-0 flex-col items-center">
              {Icon ? (
                <Icon className={cn("h-4 w-4 mt-1", STAFLY_TONE_TEXT[tone])} />
              ) : (
                <span
                  className={cn("mt-2 h-2 w-2 rounded-full", STAFLY_TONE_DOT[tone])}
                />
              )}
              {!last && <span className="mt-1 w-px flex-1 bg-border" />}
            </div>

            <div
              className={cn(
                "min-w-0 flex-1",
                variant === "feed" ? "pb-3" : "pb-5"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className={STAFLY_TEXT.cardTitle}>{item.title}</p>
                {item.timestamp && (
                  <span className={cn(STAFLY_TEXT.meta, "shrink-0 tabular-nums")}>
                    {item.timestamp}
                  </span>
                )}
              </div>
              {item.description && (
                <div className={cn(STAFLY_TEXT.meta, "mt-0.5 leading-relaxed")}>
                  {item.description}
                </div>
              )}
              {item.action && <div className="mt-2">{item.action}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
