import { NavLink, useLocation } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavItem } from "./nav-items";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface FloatingDockProps {
  items: NavItem[];
  pinnedIds: string[];
  onOpenLauncher: () => void;
  className?: string;
  variant?: "admin" | "portal";
}

export function FloatingDock({ items, pinnedIds, onOpenLauncher, className, variant = "admin" }: FloatingDockProps) {
  const location = useLocation();

  const pinnedItems = pinnedIds
    .map(id => items.find(i => i.id === id))
    .filter(Boolean) as NavItem[];

  const isActive = (item: NavItem) => {
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  };

  return (
    <div className={cn(
      "fixed z-40 left-1/2 -translate-x-1/2",
      variant === "portal" ? "bottom-3" : "bottom-4",
      className
    )}>
      <div className={cn(
        "flex items-center gap-1 px-2 py-1.5 rounded-2xl border shadow-xl",
        "bg-card/95 backdrop-blur-2xl border-border/30 shadow-primary-glow/20",
        "transition-all duration-300"
      )}>
        {pinnedItems.map((item) => {
          const active = isActive(item);
          return (
            <Tooltip key={item.id} delayDuration={300}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.to}
                  className={cn(
                    "relative flex items-center justify-center h-11 w-11 rounded-xl transition-all duration-200 active:scale-90",
                    active
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-105"
                      : "text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground hover:scale-105"
                  )}
                >
                  <item.icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
                  {active && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-foreground" />
                  )}
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs font-medium">
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Divider */}
        <div className="w-px h-7 bg-border/40 mx-0.5" />

        {/* App launcher trigger */}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              onClick={onOpenLauncher}
              className={cn(
                "flex items-center justify-center h-11 w-11 rounded-xl transition-all duration-200 active:scale-90",
                "text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground hover:scale-105"
              )}
            >
              <LayoutGrid className="h-5 w-5" strokeWidth={1.8} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs font-medium">
            Todas las apps
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
