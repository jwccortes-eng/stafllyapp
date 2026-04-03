import { NavLink, useLocation } from "react-router-dom";
import { Home, CalendarDays, Clock, Wallet, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabItem {
  id: string;
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
}

const TABS: TabItem[] = [
  { id: "home", to: "/portal", icon: Home, label: "Inicio", end: true },
  { id: "shifts", to: "/portal/shifts", icon: CalendarDays, label: "Turnos" },
  { id: "clock", to: "/portal/clock", icon: Clock, label: "Reloj" },
  { id: "earnings", to: "/portal/payments", icon: Wallet, label: "Pagos" },
  { id: "profile", to: "/portal/profile", icon: User, label: "Perfil" },
];

export function PortalBottomNav() {
  const location = useLocation();

  const isActive = (item: TabItem) => {
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom,8px),8px)] pt-2">
      <div className="mx-auto max-w-md bg-card/95 backdrop-blur-2xl border border-border/30 rounded-2xl shadow-[0_-4px_30px_-8px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-around h-[60px] px-1">
          {TABS.map((item) => {
            const active = isActive(item);
            const isClockTab = item.id === "clock";

            return (
              <NavLink
                key={item.id}
                to={item.to}
                end={item.end}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 active:scale-90 transition-all duration-150"
              >
                <div
                  className={cn(
                    "flex items-center justify-center transition-all duration-200",
                    isClockTab
                      ? cn(
                          "h-11 w-11 rounded-2xl -mt-3",
                          active
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                            : "bg-primary/10 text-primary"
                        )
                      : cn(
                          "h-7 w-7 rounded-xl",
                          active
                            ? "bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_hsl(var(--primary)/0.4)]"
                            : "text-muted-foreground/50"
                        )
                  )}
                >
                  <item.icon className={cn("h-[17px] w-[17px]", isClockTab && "h-5 w-5")} strokeWidth={active ? 2.2 : 1.8} />
                </div>
                <span
                  className={cn(
                    "text-[10px] leading-none transition-colors",
                    isClockTab && "mt-0.5",
                    active
                      ? "text-primary font-bold"
                      : "text-muted-foreground/50 font-medium"
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
