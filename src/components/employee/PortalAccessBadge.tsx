import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Send, CheckCircle2, AlertTriangle, Clock, WifiOff, MailCheck, MailOpen, Eye,
  RotateCw, Link2, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { EmployeeInvitation } from "@/hooks/useEmployeeInvitations";
import { isInviteStatusFailure, isInviteStatusInFlight } from "@/lib/invitation-status";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";

export type PortalAccessState =
  | "active"       // has user_id (accessed portal)
  | "invited"      // has invitation record, no user_id, last attempt healthy
  | "failed"       // has invitation, last attempt failed/bounced
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
  if (invitation) {
    return isInviteStatusFailure(invitation.status) ? "failed" : "invited";
  }
  return hasPhone && hasPin ? "ready" : "incomplete";
}

function getMissingItems(emp: EmployeeLike): string[] {
  const items: string[] = [];
  if (!(emp.phone_number ?? "").replace(/\D/g, "")) items.push("phone");
  if (!(emp.access_pin ?? "").toString().trim()) items.push("PIN");
  return items;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: enUS });
  } catch { return ""; }
}

const INVITE_STATUS_LABELS: Record<string, { label: string; icon: typeof Clock }> = {
  created: { label: "Created", icon: Clock },
  queued: { label: "Queued", icon: Clock },
  processing: { label: "Sending", icon: Clock },
  sent: { label: "Sent", icon: Send },
  provider_accepted: { label: "Sent", icon: Send },
  delivered: { label: "Delivered", icon: MailCheck },
  opened: { label: "Opened", icon: Eye },
  accepted: { label: "Accepted", icon: CheckCircle2 },
  expired: { label: "Expired", icon: AlertTriangle },
  revoked: { label: "Revoked", icon: WifiOff },
  failed: { label: "Failed", icon: AlertTriangle },
  bounced: { label: "Bounced", icon: AlertTriangle },
  dlq: { label: "Failed", icon: AlertTriangle },
  resent: { label: "Resent", icon: Send },
};

const STATE_CONFIG: Record<PortalAccessState, {
  label: string;
  tooltip: string;
  dotClass: string;
  badgeClass: string;
  Icon: typeof CheckCircle2;
}> = {
  active: {
    label: "Portal active",
    tooltip: "Worker has accessed the portal",
    dotClass: "bg-earning",
    badgeClass: "bg-earning/10 text-earning",
    Icon: CheckCircle2,
  },
  invited: {
    label: "Invited",
    tooltip: "Invitation sent — pending activation",
    dotClass: "bg-primary animate-pulse",
    badgeClass: "bg-primary/10 text-primary",
    Icon: MailCheck,
  },
  failed: {
    label: "Invite failed",
    tooltip: "Last invitation attempt failed — re-invite recommended",
    dotClass: "bg-destructive",
    badgeClass: "bg-destructive/10 text-destructive",
    Icon: AlertTriangle,
  },
  ready: {
    label: "No portal",
    tooltip: "Has phone and PIN — ready to invite",
    dotClass: "bg-warning",
    badgeClass: "bg-warning/10 text-warning",
    Icon: Send,
  },
  incomplete: {
    label: "Incomplete",
    tooltip: "",
    dotClass: "bg-destructive/60",
    badgeClass: "bg-destructive/10 text-destructive",
    Icon: AlertTriangle,
  },
  inactive: {
    label: "Inactive",
    tooltip: "Worker is deactivated",
    dotClass: "bg-muted-foreground/40",
    badgeClass: "bg-muted text-muted-foreground",
    Icon: WifiOff,
  },
};

interface PortalAccessBadgeProps {
  employee: EmployeeLike;
  invitation?: EmployeeInvitation | null;
  /** Show inline action affordance (button or menu) next to the badge. */
  showInviteAction?: boolean;
  /** Required when `showInviteAction` is true — opens the Invite dialog. */
  onInvite?: () => void;
  /** Optional — when provided, a "Copy link" item appears (only with active token). */
  onCopyLink?: (token: string) => void;
  compact?: boolean;
  className?: string;
}

export function PortalAccessBadge({
  employee,
  invitation,
  showInviteAction,
  onInvite,
  onCopyLink,
  compact,
  className,
}: PortalAccessBadgeProps) {
  const state = getPortalAccessState(employee, invitation);
  const config = STATE_CONFIG[state];
  const missing = state === "incomplete" ? getMissingItems(employee) : [];

  // Build rich tooltip
  let tooltipText = config.tooltip;
  if (state === "incomplete") {
    tooltipText = `Missing: ${missing.join(", ")}`;
  } else if ((state === "invited" || state === "failed") && invitation) {
    const statusInfo = INVITE_STATUS_LABELS[invitation.status];
    const lines: string[] = [];
    lines.push(`Status: ${statusInfo?.label ?? invitation.status}`);
    lines.push(`Channel: ${invitation.channel}`);
    if (invitation.sent_at) lines.push(`Sent: ${fmtAgo(invitation.sent_at)}`);
    if (invitation.delivered_at) lines.push(`Delivered: ${fmtAgo(invitation.delivered_at)}`);
    if (invitation.opened_at) lines.push(`Opened: ${fmtAgo(invitation.opened_at)}`);
    if (invitation.accepted_at) lines.push(`Accepted: ${fmtAgo(invitation.accepted_at)}`);
    if (invitation.bounce_reason) lines.push(`Reason: ${invitation.bounce_reason}`);
    if (invitation.last_error && state === "failed") lines.push(`Error: ${invitation.last_error}`);
    if (invitation.expires_at) {
      const exp = new Date(invitation.expires_at);
      lines.push(exp < new Date() ? "⚠️ Expired" : `Expires: ${fmtAgo(invitation.expires_at)}`);
    }
    tooltipText = lines.join("\n");
  }

  // Sub-status pill
  const inviteSubLabel = invitation && (state === "invited" || state === "failed")
    ? INVITE_STATUS_LABELS[invitation.status]?.label ?? invitation.status
    : null;

  // Determine which actions to expose in the dropdown menu.
  const actionable = showInviteAction && onInvite && state !== "active" && state !== "inactive" && state !== "incomplete";
  const inFlight = invitation && isInviteStatusInFlight(invitation.status);
  const hasToken = !!invitation?.invite_token && !invitation?.accepted_at;
  const isFailed = state === "failed";
  const isInvited = state === "invited";
  const isReady = state === "ready";

  // Primary action label — what the user most likely wants to click.
  const primaryLabel = isFailed ? "Re-invite" : isInvited ? "Resend" : "Invite";
  const PrimaryIcon = isFailed ? RotateCw : isInvited ? RotateCw : Send;

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
          <TooltipContent side="top" className="text-[10px] max-w-[240px] whitespace-pre-line">
            {tooltipText}
          </TooltipContent>
        </Tooltip>

        {actionable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                disabled={!!inFlight}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  isFailed
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                    : isReady
                      ? "bg-primary/15 text-primary hover:bg-primary/25"
                      : "bg-primary/10 text-primary hover:bg-primary/20",
                )}
                title={inFlight ? "Invitation is being sent…" : `Quick actions for ${primaryLabel.toLowerCase()}`}
              >
                <PrimaryIcon className="h-2.5 w-2.5" />
                {inFlight ? "Sending…" : primaryLabel}
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[180px] text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Activation
              </DropdownMenuLabel>

              {/* Primary action — always present in actionable states */}
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onInvite!(); }}
                className={cn("gap-2", isFailed && "text-destructive focus:text-destructive")}
              >
                <PrimaryIcon className="h-3.5 w-3.5" />
                {isFailed ? "Re-invite worker" : isInvited ? "Resend invite" : "Send invite"}
              </DropdownMenuItem>

              {/* Copy link — only when an active token exists */}
              {hasToken && onCopyLink && (
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onCopyLink(invitation!.invite_token!); }}
                  className="gap-2"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Copy invite link
                </DropdownMenuItem>
              )}

              {invitation && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1 text-[10px] text-muted-foreground/70 leading-relaxed whitespace-pre-line">
                    {invitation.sent_at && `Last sent ${fmtAgo(invitation.sent_at)}`}
                    {invitation.bounce_reason && `\n${invitation.bounce_reason}`}
                  </div>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </TooltipProvider>
  );
}
