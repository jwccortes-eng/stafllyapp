import { NavLink, useLocation } from "react-router-dom";
import { Home, CalendarDays, Clock, Wallet, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface PortalBottomNavProps {
  onOpenMore: () => void;
  showEarnings?: boolean;
  showShifts?: boolean;
  showClock?: boolean;
}

interface TabItem {
  id: string;
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
}

export function PortalBottomNav({
  onOpenMore,
  showEarnings = true,
  showShifts = true,
  showClock = true,
}: PortalBottomNavProps) {
  const location = useLocation();

  const tabs: (TabItem | { id: "more" })[] = [
    { id: "home", to: "/portal", icon: Home, label: "Inicio", end: true },
  ];

  if (showShifts) tabs.push({ id: "shifts", to: "/portal/shifts", icon: CalendarDays, label: "Turnos" });
  if (showClock) tabs.push({ id: "clock", to: "/portal/clock", icon: Clock, label: "Reloj" });
  if (showEarnings) tabs.push({ id: "earnings", to: "/portal/payments", icon: Wallet, label: "Pagos" });
  tabs.push({ id: "more" });

  const isActive = (item: TabItem) => {
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[env(safe-area-inset-bottom,8px)] pt-1">
      {/* Floating pill nav */}
      <div className="mx-auto max-w-md bg-card/95 backdrop-blur-2xl border border-border/50 rounded-2xl shadow-[0_-4px_30px_-8px_hsl(var(--primary)/0.12),0_2px_8px_-2px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-around h-[60px] px-1">
          {tabs.map((tab) => {
            if (tab.id === "more") {
              return (
                <button
                  key="more"
                  onClick={onOpenMore}
                  className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-muted-foreground/50 active:scale-90 transition-all duration-150"
                >
                  <div className="flex items-center justify-center h-8 w-8 rounded-xl">
                    <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <span className="text-[10px] font-medium leading-none">Más</span>
                </button>
              );
            }

            const item = tab as TabItem;
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
                    "flex items-center justify-center h-8 w-8 rounded-xl transition-all duration-200",
                    active
                      ? "bg-primary text-primary-foreground shadow-[0_2px_12px_-2px_hsl(var(--primary)/0.5)]"
                      : "text-muted-foreground/50"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-none transition-colors",
                    active ? "text-primary font-semibold" : "text-muted-foreground/50"
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
