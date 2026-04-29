import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, CalendarDays, Clock, Users, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Admin Bottom Nav — Premium 5-tab pattern (Phase A).
 * Mirrors PortalBottomNav visual language for consistency.
 *
 * Tabs: Ops · Shifts · Time · Workers · More
 *
 * Routes are preserved 1:1 with existing admin pages.
 */
interface BottomTab {
  id: string;
  to?: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
  /** Sub-paths considered "active" for this tab */
  matches?: string[];
}

const TABS: BottomTab[] = [
  { id: "ops",     to: "/app",            icon: LayoutDashboard, label: "Ops",     end: true },
  { id: "shifts",  to: "/app/shifts",     icon: CalendarDays,    label: "Shifts" },
  { id: "time",    to: "/app/timeclock",  icon: Clock,           label: "Time" },
  { id: "workers", to: "/app/employees",  icon: Users,           label: "Workers", matches: ["/app/employees", "/app/workers", "/app/directory"] },
  { id: "more",                            icon: MoreHorizontal,  label: "More" },
];

interface AdminBottomNavProps {
  onOpenMore: () => void;
  moreOpen?: boolean;
  /** Paths that should highlight the "More" tab (anything not covered by primary tabs) */
}

/** Routes the primary tabs cover (used to compute "More" active state) */
const PRIMARY_PATHS = [
  "/app", "/app/shifts", "/app/timeclock",
  "/app/employees", "/app/workers", "/app/directory",
];

export function AdminBottomNav({ onOpenMore, moreOpen = false }: AdminBottomNavProps) {
  const location = useLocation();
  const path = location.pathname;

  const isTabActive = (tab: BottomTab) => {
    if (tab.id === "more") {
      if (moreOpen) return true;
      // Active when on a path NOT covered by any primary tab
      const onPrimary = PRIMARY_PATHS.some(p =>
        p === "/app" ? path === "/app" : (path === p || path.startsWith(p + "/"))
      );
      return !onPrimary && path.startsWith("/app");
    }
    if (!tab.to) return false;
    if (tab.end) return path === tab.to;
    if (tab.matches) {
      return tab.matches.some(m => path === m || path.startsWith(m + "/"));
    }
    return path === tab.to || path.startsWith(tab.to + "/");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom,8px),8px)] pt-2">
      <div className="mx-auto max-w-md bg-card/95 backdrop-blur-2xl border border-border/30 rounded-[20px] shadow-[0_-4px_24px_-10px_rgba(0,0,0,0.1)]">
        <div className="flex items-center justify-around h-[54px] px-1">
          {TABS.map(tab => {
            const active = isTabActive(tab);
            const inner = (
              <>
                <div className={cn(
                  "flex items-center justify-center transition-all duration-200",
                  active ? "text-primary" : "text-muted-foreground/55"
                )}>
                  <tab.icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.5 : 1.75} />
                </div>
                <span className={cn(
                  "text-[9.5px] leading-none transition-colors mt-1",
                  active ? "text-primary font-bold" : "text-muted-foreground/60 font-semibold"
                )}>
                  {tab.label}
                </span>
              </>
            );

            const baseClass = "relative flex flex-col items-center justify-center flex-1 h-full active:scale-[0.92] transition-transform duration-150";
            const indicator = active && <span className="absolute top-0 h-0.5 w-7 rounded-full bg-primary" />;

            if (tab.id === "more") {
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined" && "vibrate" in window.navigator) {
                      try { window.navigator.vibrate(8); } catch { /* noop */ }
                    }
                    onOpenMore();
                  }}
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
                key={tab.id}
                to={tab.to!}
                end={tab.end}
                className={baseClass}
                onClick={() => {
                  if (typeof window !== "undefined" && "vibrate" in window.navigator) {
                    try { window.navigator.vibrate(8); } catch { /* noop */ }
                  }
                }}
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
