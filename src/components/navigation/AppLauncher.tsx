import { NavLink, useLocation } from "react-router-dom";
import { Pin, PinOff, X, Settings2, LogOut, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavItem } from "./nav-items";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";

interface AppLauncherProps {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  pinnedIds: string[];
  onTogglePin: (id: string) => void;
  maxPins: number;
  onSignOut: () => void;
  variant?: "admin" | "portal";
}

export function AppLauncher({
  open, onClose, items, pinnedIds, onTogglePin, maxPins, onSignOut, variant = "admin",
}: AppLauncherProps) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  if (!open) return null;

  const isActive = (item: NavItem) => {
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  };

  // Group by section
  const sections = new Map<string, NavItem[]>();
  items.forEach(item => {
    if (!sections.has(item.section)) sections.set(item.section, []);
    sections.get(item.section)!.push(item);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={cn(
        "relative w-full max-w-lg max-h-[85vh] mx-3 mb-20 sm:mb-0 overflow-hidden",
        "bg-card border border-border/40 rounded-2xl shadow-2xl",
        "animate-in slide-in-from-bottom-4 fade-in-0 duration-300"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <h2 className="text-base font-bold font-heading">Todas las apps</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Toca <Pin className="inline h-3 w-3 -mt-0.5" /> para fijar en tu dock ({pinnedIds.length}/{maxPins})
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Grid */}
        <div className="px-5 pb-5 overflow-y-auto max-h-[60vh] space-y-5">
          {Array.from(sections.entries()).map(([label, sectionItems]) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-2">
                {label}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {sectionItems.map(item => {
                  const active = isActive(item);
                  const isPinned = pinnedIds.includes(item.id);
                  const canPin = isPinned || pinnedIds.length < maxPins;

                  return (
                    <div key={item.id} className="relative group">
                      <NavLink
                        to={item.to}
                        onClick={onClose}
                        className={cn(
                          "flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl transition-all duration-200 active:scale-95",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-foreground/70 hover:bg-muted/50"
                        )}
                      >
                        <div className={cn(
                          "flex items-center justify-center h-11 w-11 rounded-xl transition-all",
                          active ? "bg-primary text-primary-foreground shadow-md" : "bg-muted/40"
                        )}>
                          <item.icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
                        </div>
                        <span className={cn(
                          "text-[10px] font-medium leading-tight text-center truncate w-full",
                          active && "font-bold"
                        )}>
                          {item.label}
                        </span>
                      </NavLink>

                      {/* Pin button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); if (canPin) onTogglePin(item.id); }}
                        className={cn(
                          "absolute top-1 right-1 h-5 w-5 rounded-full flex items-center justify-center transition-all",
                          "opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
                          isPinned
                            ? "bg-primary text-primary-foreground opacity-100"
                            : canPin
                            ? "bg-muted/60 text-muted-foreground hover:bg-primary/20"
                            : "bg-muted/30 text-muted-foreground/30 cursor-not-allowed"
                        )}
                      >
                        {isPinned ? <PinOff className="h-2.5 w-2.5" /> : <Pin className="h-2.5 w-2.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/30">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted/30"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === "dark" ? "Claro" : "Oscuro"}
          </button>
          <LogoutConfirmDialog onConfirm={() => { onSignOut(); onClose(); }}>
            <button className="flex items-center gap-2 text-xs text-destructive/70 hover:text-destructive transition-colors px-2 py-1.5 rounded-lg hover:bg-destructive/8">
              <LogOut className="h-3.5 w-3.5" />
              Cerrar sesión
            </button>
          </LogoutConfirmDialog>
        </div>
      </div>
    </div>
  );
}
