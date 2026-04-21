/**
 * OpsAlertsBar — sticky live alerts strip with inline action buttons.
 *
 * Phase 1.5:
 *   - Each alert exposes contextual actions from `getAlertActions(alert)`.
 *   - Top alert is rendered "open" by default with its actions visible.
 *   - Up to 5 alerts visible; the rest are collapsible.
 *   - Actions emit a structured `OpsAlertActionEvent` upward; the parent
 *     decides which dialog to open (replacement / broadcast / etc).
 */
import { useEffect, useState } from "react";
import {
  generateAlerts, summarizeAlerts, type OpsAlert, type AlertSeverity,
} from "@/lib/operations-intelligence";
import {
  getAlertActions, type AlertAction,
} from "@/lib/operations-actions";
import {
  AlertTriangle, Bell, CheckCircle2, ChevronDown, ChevronUp, Flame, Clock,
  UserPlus, Send, Users, Shield, Eye, Zap, Megaphone, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const SEVERITY_STYLES: Record<AlertSeverity, { bar: string; chip: string; iconColor: string; iconName: string }> = {
  critical: { bar: "border-destructive/30 bg-destructive/[0.06]", chip: "bg-destructive/15 text-destructive", iconColor: "text-destructive", iconName: "Flame" },
  high:     { bar: "border-warning/40 bg-warning/[0.07]",         chip: "bg-warning/20 text-warning",         iconColor: "text-warning",     iconName: "AlertTriangle" },
  warning:  { bar: "border-warning/20 bg-warning/[0.04]",         chip: "bg-warning/10 text-warning",         iconColor: "text-warning",     iconName: "Clock" },
  info:     { bar: "border-border bg-muted/30",                    chip: "bg-muted text-muted-foreground",     iconColor: "text-muted-foreground", iconName: "Bell" },
};

const ICON_MAP: Record<string, typeof Flame> = {
  Flame, AlertTriangle, Clock, Bell,
  UserPlus, Send, Users, Shield, Eye, Zap, Megaphone, RefreshCw,
};

export interface OpsAlertActionEvent {
  alert: OpsAlert;
  action: AlertAction;
}

interface OpsAlertsBarProps {
  companyId: string | null;
  /** Triggered when the alert title is clicked (default behavior — focus the affected shift) */
  onAlertClick?: (alert: OpsAlert) => void;
  /** Triggered when an action button is clicked */
  onAction?: (event: OpsAlertActionEvent) => void;
  /** Poll interval in ms. Default 30s. Set 0 to disable. */
  pollMs?: number;
}

const VISIBLE_LIMIT = 5;

export function OpsAlertsBar({ companyId, onAlertClick, onAction, pollMs = 30_000 }: OpsAlertsBarProps) {
  const [alerts, setAlerts] = useState<OpsAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const tick = async () => {
      setLoading(true);
      try {
        const next = await generateAlerts(companyId);
        if (!cancelled) setAlerts(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    tick();
    if (!pollMs) return () => { cancelled = true; };
    const id = setInterval(tick, pollMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [companyId, pollMs]);

  const summary = summarizeAlerts(alerts);

  // ─── Empty state ────────────────────────────────────────────────────────
  if (!alerts.length) {
    return (
      <div className="rounded-xl border border-earning/20 bg-earning/[0.04] px-3 py-2 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-earning shrink-0" />
        <p className="text-xs font-medium text-earning">Todo en orden</p>
        {loading && <span className="text-[10px] text-muted-foreground ml-auto">actualizando...</span>}
      </div>
    );
  }

  const visible = showAll ? alerts : alerts.slice(0, VISIBLE_LIMIT);
  const hidden = alerts.length - visible.length;

  return (
    <div className="space-y-1.5">
      {/* Summary chip row */}
      <div className="flex items-center gap-2 px-1">
        <span className={cn("text-[9px] font-bold uppercase px-2 py-0.5 rounded-full", SEVERITY_STYLES[summary.topSeverity].chip)}>
          {summary.count} {summary.count === 1 ? "alerta" : "alertas"}
        </span>
        {loading && <span className="text-[10px] text-muted-foreground">actualizando...</span>}
      </div>

      {/* Alert cards */}
      <div className="space-y-1.5">
        {visible.map((a, idx) => (
          <AlertCard
            key={a.id}
            alert={a}
            defaultExpanded={idx === 0}
            onAlertClick={onAlertClick}
            onAction={onAction}
          />
        ))}
      </div>

      {hidden > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full text-[10px] text-muted-foreground gap-1"
          onClick={() => setShowAll(true)}
        >
          <ChevronDown className="h-3 w-3" />
          Ver {hidden} {hidden === 1 ? "alerta más" : "alertas más"}
        </Button>
      )}
      {showAll && alerts.length > VISIBLE_LIMIT && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full text-[10px] text-muted-foreground gap-1"
          onClick={() => setShowAll(false)}
        >
          <ChevronUp className="h-3 w-3" /> Colapsar
        </Button>
      )}
    </div>
  );
}

// ─── AlertCard ────────────────────────────────────────────────────────────
interface AlertCardProps {
  alert: OpsAlert;
  defaultExpanded?: boolean;
  onAlertClick?: (alert: OpsAlert) => void;
  onAction?: (event: OpsAlertActionEvent) => void;
}

function AlertCard({ alert, defaultExpanded = false, onAlertClick, onAction }: AlertCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const style = SEVERITY_STYLES[alert.severity];
  const Icon = ICON_MAP[style.iconName] ?? Bell;
  const actions = getAlertActions(alert);

  return (
    <div className={cn("rounded-xl border transition-colors", style.bar)}>
      <div className="px-3 py-2 flex items-center gap-2.5">
        <Icon className={cn("h-4 w-4 shrink-0", style.iconColor)} />

        <button
          type="button"
          onClick={() => onAlertClick?.(alert)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-xs font-semibold text-foreground truncate">{alert.message}</p>
          {alert.zone && (
            <p className="text-[10px] text-muted-foreground truncate">{alert.zone}</p>
          )}
        </button>

        {actions.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? "Colapsar acciones" : "Ver acciones"}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      {expanded && actions.length > 0 && (
        <div className="border-t border-border/40 px-3 py-2 flex flex-wrap gap-1.5">
          {actions.map(action => {
            const ActionIcon = ICON_MAP[action.icon] ?? Zap;
            return (
              <Button
                key={action.id}
                size="sm"
                variant={action.tone === "primary" ? "default" : "outline"}
                className="h-7 text-[10px] gap-1 px-2.5"
                onClick={() => onAction?.({ alert, action })}
              >
                <ActionIcon className="h-3 w-3" />
                {action.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
