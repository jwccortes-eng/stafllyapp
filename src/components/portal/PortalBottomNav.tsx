import { NavLink, useLocation } from "react-router-dom";
import { Home, CalendarDays, Clock, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabItem {
  id: string;
  to?: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
}

/**
 * 4-tab bottom nav — premium executive density.
 * Following benchmark: a single primary action zone,
 * Profile / Payments / Availability / Announcements live in the More sheet.
 */
const TABS: TabItem[] = [
  { id: "home", to: "/portal", icon: Home, label: "Home", end: true },
  { id: "shifts", to: "/portal/shifts", icon: CalendarDays, label: "Shifts" },
  { id: "clock", to: "/portal/clock", icon: Clock, label: "Clock" },
  { id: "more", icon: MoreHorizontal, label: "More" },
];

const MORE_PATHS = [
  "/portal/profile",
  "/portal/payments",
  "/portal/availability",
  "/portal/announcements",
  "/portal/resources",
  "/portal/w9",
  "/portal/documents",
];

interface PortalBottomNavProps {
  onOpenMore?: () => void;
  moreOpen?: boolean;
}

export function PortalBottomNav({ onOpenMore, moreOpen = false }: PortalBottomNavProps) {
  const location = useLocation();

  const isActive = (item: TabItem) => {
    if (item.id === "more") {
      return moreOpen || MORE_PATHS.some(p => location.pathname === p || location.pathname.startsWith(p + "/"));
    }
    if (!item.to) return false;
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom,8px),8px)] pt-2">
      <div className="mx-auto max-w-md bg-card/95 backdrop-blur-2xl border border-border/30 rounded-[20px] shadow-[0_-4px_24px_-10px_rgba(0,0,0,0.1)]">
        <div className="flex items-center justify-around h-[54px] px-1">
          {TABS.map((item) => {
            const active = isActive(item);
            const inner = (
              <>
                <div
                  className={cn(
                    "flex items-center justify-center transition-all duration-200",
                    active ? "text-primary" : "text-muted-foreground/50"
                  )}
                >
                  <item.icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.5 : 1.75} />
                </div>
                <span
                  className={cn(
                    "text-[9.5px] leading-none transition-colors mt-1",
                    active ? "text-primary font-bold" : "text-muted-foreground/55 font-semibold"
                  )}
                >
                  {item.label}
                </span>
              </>
            );

            const baseClass = "relative flex flex-col items-center justify-center flex-1 h-full active:scale-[0.92] transition-transform duration-150";

            const indicator = active && (
              <span className="absolute top-0 h-0.5 w-7 rounded-full bg-primary" />
            );

            if (item.id === "more") {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={onOpenMore}
                  className={baseClass}
                  aria-label="More options"
                  aria-expanded={moreOpen}
                >
                  {indicator}
                  {inner}
                </button>
              );
            }

            return (
              <NavLink
                key={item.id}
                to={item.to!}
                end={item.end}
                className={baseClass}
              >
                {indicator}
                {inner}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
