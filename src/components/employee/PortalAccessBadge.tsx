import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Send, CheckCircle2, AlertTriangle, Clock, WifiOff, MailCheck, MailOpen, Eye } from "lucide-react";
import type { EmployeeInvitation } from "@/hooks/useEmployeeInvitations";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export type PortalAccessState =
  | "active"       // has user_id
  | "invited"      // has invitation record, no user_id
  | "ready"        // has phone + PIN, no user_id, no invitation
  | "incomplete"   // missing phone or PIN
  | "inactive";    // is_active = false

interface EmployeeLike {
  user_id?: string | null;
  is_active?: boolean;
  access_pin?: string | null;
  phone_number?: string | null;
}

export function getPortalAccessState(emp: EmployeeLike, invitation?: EmployeeInvitation | null): PortalAccessState {
  if (emp.is_active === false) return "inactive";
  if (emp.user_id) return "active";
  const hasPhone = !!(emp.phone_number ?? "").replace(/\D/g, "");
  const hasPin = !!(emp.access_pin ?? "").toString().trim();
  if (invitation) return "invited";
  return hasPhone && hasPin ? "ready" : "incomplete";
}

function getMissingItems(emp: EmployeeLike): string[] {
  const items: string[] = [];
  if (!(emp.phone_number ?? "").replace(/\D/g, "")) items.push("teléfono");
  if (!(emp.access_pin ?? "").toString().trim()) items.push("PIN");
  return items;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es });
  } catch { return ""; }
}

const INVITE_STATUS_LABELS: Record<string, { label: string; icon: typeof Clock }> = {
  created: { label: "Creada", icon: Clock },
  sent: { label: "Enviada", icon: Send },
  opened: { label: "Abierta", icon: Eye },
  accepted: { label: "Aceptada", icon: CheckCircle2 },
  expired: { label: "Expirada", icon: AlertTriangle },
  revoked: { label: "Revocada", icon: WifiOff },
  failed: { label: "Fallida", icon: AlertTriangle },
};

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
  invited: {
    label: "Invitado",
    tooltip: "Invitación enviada — pendiente de activación",
    dotClass: "bg-primary animate-pulse",
    badgeClass: "bg-primary/10 text-primary",
    Icon: MailCheck,
  },
  ready: {
    label: "Sin portal",
    tooltip: "Tiene teléfono y PIN — listo para invitar",
    dotClass: "bg-warning",
    badgeClass: "bg-warning/10 text-warning",
    Icon: Send,
  },
  incomplete: {
    label: "Incompleto",
    tooltip: "",
    dotClass: "bg-destructive/60",
    badgeClass: "bg-destructive/10 text-destructive",
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
  invitation?: EmployeeInvitation | null;
  showInviteAction?: boolean;
  onInvite?: () => void;
  compact?: boolean;
  className?: string;
}

export function PortalAccessBadge({
  employee,
  invitation,
  showInviteAction,
  onInvite,
  compact,
  className,
}: PortalAccessBadgeProps) {
  const state = getPortalAccessState(employee, invitation);
  const config = STATE_CONFIG[state];
  const missing = state === "incomplete" ? getMissingItems(employee) : [];

  // Build rich tooltip for invited state
  let tooltipText = config.tooltip;
  if (state === "incomplete") {
    tooltipText = `Falta: ${missing.join(", ")}`;
  } else if (state === "invited" && invitation) {
    const statusInfo = INVITE_STATUS_LABELS[invitation.status];
    const lines: string[] = [];
    lines.push(`Estado: ${statusInfo?.label ?? invitation.status}`);
    lines.push(`Canal: ${invitation.channel}`);
    if (invitation.sent_at) lines.push(`Enviada: ${fmtAgo(invitation.sent_at)}`);
    if (invitation.opened_at) lines.push(`Abierta: ${fmtAgo(invitation.opened_at)}`);
    if (invitation.accepted_at) lines.push(`Aceptada: ${fmtAgo(invitation.accepted_at)}`);
    if (invitation.expires_at) {
      const exp = new Date(invitation.expires_at);
      lines.push(exp < new Date() ? "⚠️ Expirada" : `Expira: ${fmtAgo(invitation.expires_at)}`);
    }
    tooltipText = lines.join("\n");
  }

  // Sub-status for invited employees
  const inviteSubLabel = invitation && state === "invited"
    ? INVITE_STATUS_LABELS[invitation.status]?.label ?? invitation.status
    : null;

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
              {inviteSubLabel && !compact && (
                <span className="text-[8px] opacity-70 ml-0.5">· {inviteSubLabel}</span>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px] max-w-[220px] whitespace-pre-line">
            {tooltipText}
          </TooltipContent>
        </Tooltip>

        {showInviteAction && (state === "ready" || state === "invited") && onInvite && (
          <button
            onClick={(e) => { e.stopPropagation(); onInvite(); }}
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <Send className="h-2.5 w-2.5" /> {state === "invited" ? "Reenviar" : "Invitar"}
          </button>
        )}
      </div>
    </TooltipProvider>
  );
}
