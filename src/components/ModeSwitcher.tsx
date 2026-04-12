import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LayoutDashboard, User, ArrowLeftRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Mode switcher for users with dual access (admin + employee).
 * Shows current mode and allows switching without re-login.
 */
export function ModeSwitcher({ compact = false }: { compact?: boolean }) {
  const { activeMode, setActiveMode, canAccessAdmin, canAccessPortal } = useAuth();
  const navigate = useNavigate();

  // Only show if user has dual access
  if (!canAccessAdmin || !canAccessPortal) return null;

  const handleSwitch = (mode: 'admin' | 'employee') => {
    if (mode === activeMode) return;
    setActiveMode(mode);
    navigate(mode === 'admin' ? '/app' : '/portal');
  };

  const isAdmin = activeMode === 'admin';

  if (compact) {
    return (
      <button
        onClick={() => handleSwitch(isAdmin ? 'employee' : 'admin')}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
          "hover:bg-primary/10 active:scale-95",
          isAdmin
            ? "text-primary bg-primary/5"
            : "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30"
        )}
        title={`Switch to ${isAdmin ? 'Employee' : 'Admin'} mode`}
      >
        <ArrowLeftRight className="h-3 w-3" />
        <span className="hidden sm:inline">{isAdmin ? 'My Portal' : 'Admin'}</span>
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border",
            "hover:shadow-sm active:scale-[0.98]",
            isAdmin
              ? "bg-primary/5 border-primary/15 text-primary"
              : "bg-emerald-50 border-emerald-200/50 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/30 dark:text-emerald-400"
          )}
        >
          {isAdmin ? (
            <LayoutDashboard className="h-3.5 w-3.5" />
          ) : (
            <User className="h-3.5 w-3.5" />
          )}
          <span>{isAdmin ? 'Admin' : 'Employee'}</span>
          <ArrowLeftRight className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={() => handleSwitch('admin')}
          className={cn("gap-2.5 py-2.5", activeMode === 'admin' && "bg-primary/5")}
        >
          <LayoutDashboard className="h-4 w-4 text-primary" />
          <div className="flex-1">
            <p className="text-xs font-semibold">Admin Panel</p>
            <p className="text-[10px] text-muted-foreground">Management & operations</p>
          </div>
          {activeMode === 'admin' && (
            <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Active</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSwitch('employee')}
          className={cn("gap-2.5 py-2.5", activeMode === 'employee' && "bg-emerald-50 dark:bg-emerald-950/20")}
        >
          <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <div className="flex-1">
            <p className="text-xs font-semibold">My Portal</p>
            <p className="text-[10px] text-muted-foreground">Shifts, hours & payments</p>
          </div>
          {activeMode === 'employee' && (
            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full">Active</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
