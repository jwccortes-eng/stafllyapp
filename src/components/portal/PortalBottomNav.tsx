import { NavLink, useLocation } from "react-router-dom";
import { Home, CalendarDays, Clock, Wallet, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface PortalBottomNavProps {
  onOpenMore: () => void;
  showEarnings?: boolean; // my_payments
  showShifts?: boolean;   // my_shifts
  showClock?: boolean;    // my_clock
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

  if (showShifts) {
    tabs.push({ id: "shifts", to: "/portal/shifts", icon: CalendarDays, label: "Turnos" });
  }
  if (showClock) {
    tabs.push({ id: "clock", to: "/portal/clock", icon: Clock, label: "Reloj" });
  }
  if (showEarnings) {
    tabs.push({ id: "earnings", to: "/portal/payments", icon: Wallet, label: "Pagos" });
  }
  tabs.push({ id: "more" });

  const isActive = (item: TabItem) => {
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/98 backdrop-blur-xl border-t border-border/50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {tabs.map((tab) => {
          if (tab.id === "more") {
            return (
              <button
                key="more"
                onClick={onOpenMore}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 text-muted-foreground/60 active:scale-90 transition-all"
              >
                <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />
                <span className="text-[10px] font-medium">Más</span>
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
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 active:scale-90 transition-all"
            >
              <div
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-xl transition-all duration-200",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground/60"
                )}
              >
                <item.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors",
                  active ? "text-primary font-semibold" : "text-muted-foreground/60"
                )}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
