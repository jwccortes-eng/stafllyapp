import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Send, CheckCircle2, AlertTriangle, Clock, Wifi, WifiOff } from "lucide-react";

export type PortalAccessState =
  | "active"       // has user_id
  | "ready"        // has phone + PIN, no user_id — ready to invite
  | "incomplete"   // missing phone or PIN
  | "inactive";    // is_active = false

interface EmployeeLike {
  user_id?: string | null;
  is_active?: boolean;
  access_pin?: string | null;
  phone_number?: string | null;
}

export function getPortalAccessState(emp: EmployeeLike): PortalAccessState {
  if (emp.is_active === false) return "inactive";
  if (emp.user_id) return "active";
  const hasPhone = !!(emp.phone_number ?? "").replace(/\D/g, "");
  const hasPin = !!(emp.access_pin ?? "").toString().trim();
  return hasPhone && hasPin ? "ready" : "incomplete";
}

function getMissingItems(emp: EmployeeLike): string[] {
  const items: string[] = [];
  if (!(emp.phone_number ?? "").replace(/\D/g, "")) items.push("teléfono");
  if (!(emp.access_pin ?? "").toString().trim()) items.push("PIN");
  return items;
}

const STATE_CONFIG: Record<PortalAccessState, {
  label: string;
  tooltip: string;
  dotClass: string;
  badgeClass: string;
  Icon: typeof CheckCircle2;
}> = {
  active: {
    label: "Portal activo",
    tooltip: "Empleado ya accedió al portal",
    dotClass: "bg-[hsl(var(--earning))]",
    badgeClass: "bg-[hsl(var(--earning)/0.1)] text-[hsl(var(--earning))]",
    Icon: CheckCircle2,
  },
  ready: {
    label: "Sin portal",
    tooltip: "Tiene teléfono y PIN — listo para invitar",
    dotClass: "bg-primary animate-pulse",
    badgeClass: "bg-primary/10 text-primary",
    Icon: Send,
  },
  incomplete: {
    label: "Incompleto",
    tooltip: "",
    dotClass: "bg-warning animate-pulse",
    badgeClass: "bg-warning/10 text-warning",
    Icon: AlertTriangle,
  },
  inactive: {
    label: "Inactivo",
    tooltip: "Empleado desactivado",
    dotClass: "bg-muted-foreground/40",
    badgeClass: "bg-muted text-muted-foreground",
    Icon: WifiOff,
  },
};

interface PortalAccessBadgeProps {
  employee: EmployeeLike;
  /** Show inline "Invitar" action button for ready state */
  showInviteAction?: boolean;
  onInvite?: () => void;
  /** Compact mode — smaller badge */
  compact?: boolean;
  className?: string;
}

export function PortalAccessBadge({
  employee,
  showInviteAction,
  onInvite,
  compact,
  className,
}: PortalAccessBadgeProps) {
  const state = getPortalAccessState(employee);
  const config = STATE_CONFIG[state];
  const missing = state === "incomplete" ? getMissingItems(employee) : [];
  const tooltipText = state === "incomplete" ? `Falta: ${missing.join(", ")}` : config.tooltip;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex items-center gap-1", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full font-semibold border border-transparent",
              compact ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]",
              config.badgeClass,
            )}>
              <span className={cn("rounded-full shrink-0", compact ? "h-1 w-1" : "h-1.5 w-1.5", config.dotClass)} />
              {config.label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px] max-w-[200px]">
            {tooltipText}
          </TooltipContent>
        </Tooltip>

        {showInviteAction && state === "ready" && onInvite && (
          <button
            onClick={(e) => { e.stopPropagation(); onInvite(); }}
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <Send className="h-2.5 w-2.5" /> Invitar
          </button>
        )}
      </div>
    </TooltipProvider>
  );
}
