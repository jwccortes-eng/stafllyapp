import { NavLink, useLocation } from "react-router-dom";
import { Home, CalendarDays, Clock, MessageSquare, User } from "lucide-react";
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
  { id: "chat", to: "/portal/chat", icon: MessageSquare, label: "Mensajes" },
  { id: "profile", to: "/portal/profile", icon: User, label: "Perfil" },
];

export function PortalBottomNav() {
  const location = useLocation();

  const isActive = (item: TabItem) => {
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom,8px),8px)] pt-1.5">
      <div className="mx-auto max-w-md bg-card/95 backdrop-blur-2xl border border-border/40 rounded-2xl shadow-[0_-4px_30px_-8px_hsl(var(--primary)/0.10),0_2px_8px_-2px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around h-[58px] px-0.5">
          {TABS.map((item) => {
            const active = isActive(item);

            return (
              <NavLink
                key={item.id}
                to={item.to}
                end={item.end}
                className="flex flex-col items-center justify-center gap-1 flex-1 py-1.5 active:scale-90 transition-all duration-150"
              >
                <div
                  className={cn(
                    "flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-200",
                    active
                      ? "bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_hsl(var(--primary)/0.45)]"
                      : "text-muted-foreground/60"
                  )}
                >
                  <item.icon className="h-[17px] w-[17px]" strokeWidth={active ? 2.2 : 1.8} />
                </div>
                <span
                  className={cn(
                    "text-[10px] leading-none transition-colors",
                    active
                      ? "text-primary font-semibold"
                      : "text-muted-foreground/60 font-medium"
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
