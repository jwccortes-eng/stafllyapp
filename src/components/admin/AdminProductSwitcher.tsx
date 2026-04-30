import { useNavigate } from "react-router-dom";
import { ChevronDown, LayoutDashboard, User, Radio, ArrowLeftRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface AdminProductSwitcherProps {
  compact?: boolean;
}

/**
 * AdminProductSwitcher — Always-visible switcher for admin views.
 *
 * Guarantees the user is never trapped inside an admin mobile screen
 * (e.g. /app/workers/duplicates) without a way to switch context.
 *
 * Always lists:
 *  - Admin Panel (current — non-clickable indicator)
 *  - My Portal (only if canAccessPortal)
 *  - Parceros Community (always available as a sibling product)
 */
export function AdminProductSwitcher({ compact = false }: AdminProductSwitcherProps) {
  const navigate = useNavigate();
  const { canAccessPortal, setActiveMode } = useAuth();

  const goToPortal = () => {
    setActiveMode("employee");
    navigate("/portal");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-xl bg-muted/50 hover:bg-muted active:scale-[0.97] transition-all text-xs font-semibold text-foreground border border-border/30",
            compact ? "h-8 px-2" : "h-9 px-3"
          )}
          aria-label="Switch product"
        >
          <ArrowLeftRight className={cn("text-muted-foreground", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
          {!compact && <span className="hidden sm:inline">Switch</span>}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          Switch workspace
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Current: Admin */}
        <DropdownMenuItem
          disabled
          className="flex items-start gap-3 py-2.5 opacity-100 focus:bg-transparent"
        >
          <div className="h-9 w-9 rounded-lg bg-primary/12 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-primary/20">
            <LayoutDashboard className="h-[18px] w-[18px] text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold leading-tight text-foreground">Admin Panel</p>
              <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                Here
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              Management & operations
            </p>
          </div>
        </DropdownMenuItem>

        {/* Portal — enabled if user has employee access, disabled hint otherwise */}
        {canAccessPortal ? (
          <DropdownMenuItem
            onClick={goToPortal}
            className="flex items-start gap-3 py-2.5 cursor-pointer focus:bg-accent/50"
          >
            <div className="h-9 w-9 rounded-lg bg-emerald-500/12 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-emerald-500/20">
              <User className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-foreground">My Portal</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Shifts, hours & payments
              </p>
            </div>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled
            className="flex items-start gap-3 py-2.5 opacity-60 focus:bg-transparent cursor-not-allowed"
          >
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-border/40">
              <User className="h-[18px] w-[18px] text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-foreground">My Portal</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Not available for this admin user
              </p>
            </div>
          </DropdownMenuItem>
        )}

        {/* Parceros — always offered as a sibling product */}
        <DropdownMenuItem
          onClick={() => navigate("/parceros")}
          className="flex items-start gap-3 py-2.5 cursor-pointer focus:bg-accent/50"
        >
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 shadow-md"
            style={{
              background:
                "linear-gradient(135deg, hsl(8 95% 64%), hsl(14 100% 70%) 50%, hsl(35 100% 62%))",
            }}
          >
            <Radio className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-foreground">
              Parceros Community
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              Channels, opportunities, flash jobs
            </p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
