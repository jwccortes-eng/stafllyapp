import { NavLink, useLocation } from "react-router-dom";
import { X, LogOut, Moon, Sun, Pin } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { NavItem } from "./nav-items";

/**
 * MoreSheet — Premium grouped bottom sheet for the admin mobile shell.
 * Replaces AppLauncher in Phase A. Pinned items sit at the top.
 * Routes are preserved; presentation only.
 */
interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  pinnedIds: string[];
  onTogglePin: (id: string) => void;
  maxPins: number;
  onSignOut: () => void;
  badgeCounts?: Record<string, number>;
}

/**
 * Primary tabs already in the bottom nav — exclude these from More.
 */
const PRIMARY_TAB_ROUTES = new Set([
  "/app",            // Ops
  "/app/shifts",     // Shifts
  "/app/timeclock",  // Time
  "/app/employees",  // Workers
]);

/**
 * Mobile section remap: collapse internal section names into a small set of
 * customer-friendly groups. Internal section names not listed fall back to "More".
 * Order of keys here defines vertical order in the sheet.
 */
const SECTION_GROUPS: { label: string; matches: string[] }[] = [
  { label: "Operations", matches: ["Home", "Operations", "Intake"] },
  { label: "People", matches: ["Management"] },
  { label: "Payroll & Billing", matches: ["Payroll", "Tax", "Commercial"] },
  { label: "System", matches: ["Administration"] },
];
const FALLBACK_GROUP = "More";
function groupForSection(section: string): string {
  for (const g of SECTION_GROUPS) if (g.matches.includes(section)) return g.label;
  return FALLBACK_GROUP;
}
const SECTION_ORDER = [...SECTION_GROUPS.map(g => g.label), FALLBACK_GROUP];

export function MoreSheet({
  open, onClose, items, pinnedIds, onTogglePin, maxPins, onSignOut, badgeCounts = {},
}: MoreSheetProps) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const isActive = (item: NavItem) => {
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  };

  // Filter out primary bottom-nav tabs
  const moreItems = items.filter(i => !PRIMARY_TAB_ROUTES.has(i.to));

  // Group by remapped customer-friendly section
  const sections = new Map<string, NavItem[]>();
  moreItems.forEach(item => {
    const key = groupForSection(item.section || FALLBACK_GROUP);
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(item);
  });

  const orderedSections = Array.from(sections.entries()).sort(([a], [b]) => {
    const ai = SECTION_ORDER.indexOf(a);
    const bi = SECTION_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const pinnedItems = pinnedIds
    .map(id => moreItems.find(i => i.id === id))
    .filter(Boolean) as NavItem[];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="p-0 h-[88vh] rounded-t-3xl border-t border-border/40 bg-card/98 backdrop-blur-2xl flex flex-col"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
        </div>

        <SheetHeader className="px-5 pt-2 pb-3 flex-row items-center justify-between space-y-0 shrink-0">
          <div className="text-left">
            <SheetTitle className="text-base font-bold font-heading">All Apps</SheetTitle>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Tap <Pin className="inline h-3 w-3 -mt-0.5" /> to pin ({pinnedIds.length}/{maxPins})
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-6">
          {/* Pinned shortcuts */}
          {pinnedItems.length > 0 && (
            <SectionGrid
              label="Pinned"
              items={pinnedItems}
              isActive={isActive}
              pinnedIds={pinnedIds}
              onTogglePin={onTogglePin}
              maxPins={maxPins}
              onClose={onClose}
              badgeCounts={badgeCounts}
            />
          )}

          {/* Grouped sections */}
          {orderedSections.map(([label, sectionItems]) => (
            <SectionGrid
              key={label}
              label={label}
              items={sectionItems}
              isActive={isActive}
              pinnedIds={pinnedIds}
              onTogglePin={onTogglePin}
              maxPins={maxPins}
              onClose={onClose}
              badgeCounts={badgeCounts}
            />
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/30 shrink-0 pb-[max(env(safe-area-inset-bottom,12px),12px)]">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted/30"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <LogoutConfirmDialog onConfirm={() => { onSignOut(); onClose(); }}>
            <button className="flex items-center gap-2 text-xs text-destructive/70 hover:text-destructive transition-colors px-2 py-1.5 rounded-lg hover:bg-destructive/[0.08]">
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </LogoutConfirmDialog>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface SectionGridProps {
  label: string;
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  pinnedIds: string[];
  onTogglePin: (id: string) => void;
  maxPins: number;
  onClose: () => void;
  badgeCounts: Record<string, number>;
}

function SectionGrid({
  label, items, isActive, pinnedIds, onTogglePin, maxPins, onClose, badgeCounts,
}: SectionGridProps) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/45 mb-2">
        {label}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {items.map(item => {
          const active = isActive(item);
          const isPinned = pinnedIds.includes(item.id);
          const canPin = isPinned || pinnedIds.length < maxPins;
          const count = item.badge ? badgeCounts[item.badge] ?? 0 : 0;

          return (
            <div key={item.id} className="relative group">
              <NavLink
                to={item.to}
                onClick={onClose}
                className={cn(
                  "flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl transition-all duration-200 active:scale-95",
                  active ? "bg-primary/10 text-primary" : "text-foreground/75 hover:bg-muted/40"
                )}
              >
                <div className={cn(
                  "relative flex items-center justify-center h-11 w-11 rounded-xl transition-all",
                  active ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-muted/40"
                )}>
                  <item.icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
                  {count > 0 && (
                    <Badge
                      variant="secondary"
                      className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[9px] font-semibold leading-none flex items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                    >
                      {count > 9 ? "9+" : count}
                    </Badge>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-medium leading-tight text-center truncate w-full",
                  active && "font-bold"
                )}>
                  {item.label}
                </span>
              </NavLink>

              <button
                onClick={(e) => { e.stopPropagation(); if (canPin) onTogglePin(item.id); }}
                className={cn(
                  "absolute top-1 right-1 h-5 w-5 rounded-full flex items-center justify-center transition-all",
                  isPinned
                    ? "bg-primary text-primary-foreground opacity-100"
                    : canPin
                    ? "bg-muted/60 text-muted-foreground opacity-0 group-hover:opacity-100"
                    : "bg-muted/30 text-muted-foreground/30 cursor-not-allowed opacity-0"
                )}
                aria-label={isPinned ? "Unpin" : "Pin"}
              >
                <Pin className="h-2.5 w-2.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
