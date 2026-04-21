/**
 * OpsAlertsBar — sticky live alerts strip for the Operations Command Center.
 *
 * Shows the top alerts produced by `operations-intelligence.generateAlerts`,
 * polls every 30s, and exposes a click-through to filter the shifts panel by
 * the alert's affected shifts. Color-coded by severity following the Ops
 * Design Language tone vocabulary.
 *
 * Pure presentation + a tiny data hook — no writes anywhere.
 */
import { useEffect, useState } from "react";
import {
  generateAlerts, summarizeAlerts, type OpsAlert, type AlertSeverity,
} from "@/lib/operations-intelligence";
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, Flame, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const SEVERITY_STYLES: Record<AlertSeverity, { bar: string; chip: string; icon: string; iconColor: string }> = {
  critical: {
    bar: "border-destructive/30 bg-destructive/[0.06]",
    chip: "bg-destructive/15 text-destructive",
    icon: "Flame",
    iconColor: "text-destructive",
  },
  high: {
    bar: "border-warning/30 bg-warning/[0.06]",
    chip: "bg-warning/15 text-warning",
    icon: "AlertTriangle",
    iconColor: "text-warning",
  },
  warning: {
    bar: "border-warning/20 bg-warning/[0.04]",
    chip: "bg-warning/10 text-warning",
    icon: "Clock",
    iconColor: "text-warning",
  },
  info: {
    bar: "border-border bg-muted/30",
    chip: "bg-muted text-muted-foreground",
    icon: "Bell",
    iconColor: "text-muted-foreground",
  },
};

const ICON_MAP = { Flame, AlertTriangle, Clock, Bell };

interface OpsAlertsBarProps {
  companyId: string | null;
  /** Called when user taps an alert; receives the affected shift_ids. */
  onAlertClick?: (alert: OpsAlert) => void;
  /** Poll interval in ms. Default 30s. Set 0 to disable. */
  pollMs?: number;
}

export function OpsAlertsBar({ companyId, onAlertClick, pollMs = 30_000 }: OpsAlertsBarProps) {
  const [alerts, setAlerts] = useState<OpsAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
  const top = alerts[0];
  const topStyle = SEVERITY_STYLES[summary.topSeverity];

  // ─── Empty state: keep a slim "all clear" pill ─────────────────────────
  if (!alerts.length) {
    return (
      <div className="rounded-xl border border-earning/20 bg-earning/[0.04] px-3 py-2 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-earning shrink-0" />
        <p className="text-xs font-medium text-earning">Todo en orden</p>
        {loading && <span className="text-[10px] text-muted-foreground ml-auto">actualizando...</span>}
      </div>
    );
  }

  const TopIcon = ICON_MAP[topStyle.icon as keyof typeof ICON_MAP] ?? Bell;

  return (
    <div className={cn("rounded-xl border transition-colors", topStyle.bar)}>
      {/* Header row: clickable to expand */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full px-3 py-2 flex items-center gap-2.5 text-left"
      >
        <TopIcon className={cn("h-4 w-4 shrink-0", topStyle.iconColor)} />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", topStyle.chip)}>
            {summary.count}
          </span>
          <p className="text-xs font-semibold truncate text-foreground">
            {top?.message ?? summary.label}
          </p>
        </div>
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
      </button>

      {/* Expanded list */}
      {expanded && alerts.length > 1 && (
        <div className="border-t border-border/50 px-3 py-2 space-y-1.5">
          {alerts.slice(0, 6).map(a => {
            const s = SEVERITY_STYLES[a.severity];
            const Icon = ICON_MAP[s.icon as keyof typeof ICON_MAP] ?? Bell;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onAlertClick?.(a)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors text-left"
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0", s.iconColor)} />
                <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded", s.chip)}>
                  {a.severity}
                </span>
                <p className="flex-1 text-[11px] text-foreground truncate">{a.message}</p>
                {a.shiftIds.length > 0 && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {a.shiftIds.length} {a.shiftIds.length === 1 ? "turno" : "turnos"}
                  </span>
                )}
              </button>
            );
          })}
          {alerts.length > 6 && (
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              +{alerts.length - 6} alertas adicionales
            </p>
          )}
        </div>
      )}
    </div>
  );
}
