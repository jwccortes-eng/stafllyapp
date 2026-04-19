import { NavLink, useLocation } from "react-router-dom";
import { Home, CalendarDays, Clock, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabItem {
  id: string;
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
}

/**
 * 4-tab bottom nav — premium executive density.
 * Following benchmark: a single primary action zone,
 * Profile/Payments/Availability live in the More sheet.
 */
const TABS: TabItem[] = [
  { id: "home", to: "/portal", icon: Home, label: "Home", end: true },
  { id: "shifts", to: "/portal/shifts", icon: CalendarDays, label: "Shifts" },
  { id: "clock", to: "/portal/clock", icon: Clock, label: "Clock" },
  { id: "more", to: "/portal/more", icon: MoreHorizontal, label: "More" },
];

export function PortalBottomNav() {
  const location = useLocation();

  const isActive = (item: TabItem) => {
    if (item.id === "more") {
      // "More" is active when on profile/payments/availability/announcements
      return ["/portal/profile", "/portal/payments", "/portal/availability", "/portal/announcements", "/portal/resources", "/portal/more"]
        .some(p => location.pathname === p || location.pathname.startsWith(p + "/"));
    }
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom,8px),8px)] pt-2">
      <div className="mx-auto max-w-md bg-card/95 backdrop-blur-2xl border border-border/30 rounded-2xl shadow-[0_-4px_30px_-8px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-around h-[58px] px-1">
          {TABS.map((item) => {
            const active = isActive(item);
            return (
              <NavLink
                key={item.id}
                to={item.to}
                end={item.end}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 active:scale-90 transition-all duration-150"
              >
                <div
                  className={cn(
                    "flex items-center justify-center transition-all duration-200 h-7 w-7 rounded-xl",
                    active
                      ? "text-primary"
                      : "text-muted-foreground/45"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 1.8} />
                </div>
                <span
                  className={cn(
                    "text-[10px] leading-none transition-colors",
                    active
                      ? "text-primary font-bold"
                      : "text-muted-foreground/45 font-medium"
                  )}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
