/**
 * AutoDispatchLog
 *
 * Compact, read-only feed of recent Smart Dispatch decisions for a company.
 * Shows BOTH manual executions and automatic ones (the latter are tagged
 * with a ⚡ badge based on the `AUTO:` outcome marker).
 *
 * Refreshes every 60s and supports a manual reload. Pure logging — no
 * mutations possible from this component.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, RefreshCw, Send, Zap, CheckCircle2, X, ShieldAlert, Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  loadRecentDispatchLogs,
  type DispatchLogEntry,
} from "@/lib/auto-dispatch";

interface AutoDispatchLogProps {
  companyId: string;
  /** When set, the panel can imperatively be told to refresh on event. */
  refreshKey?: number;
}

const STATUS_CONFIG: Record<DispatchLogEntry["status"], { label: string; cls: string }> = {
  suggested:           { label: "Sugerido",   cls: "bg-muted/40 text-muted-foreground border-border" },
  executed:            { label: "Ejecutado",  cls: "bg-earning/10 text-earning border-earning/30" },
  partially_executed:  { label: "Parcial",    cls: "bg-warning/10 text-warning border-warning/30" },
  dismissed:           { label: "Descartado", cls: "bg-muted/40 text-muted-foreground border-border" },
  expired:             { label: "Expirado",   cls: "bg-muted/40 text-muted-foreground border-border" },
};

export function AutoDispatchLog({ companyId, refreshKey }: AutoDispatchLogProps) {
  const [entries, setEntries] = useState<DispatchLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const rows = await loadRecentDispatchLogs(companyId, { limit: 12 });
      setEntries(rows);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh, refreshKey]);

  return (
    <div className="rounded-xl border border-border/50 bg-card/40">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3 w-3" />
          Historial de dispatch
        </div>
        <Button
          variant="ghost" size="sm" className="h-6 w-6 p-0"
          onClick={refresh} title="Actualizar"
        >
          <RefreshCw className={cn("h-3 w-3 text-muted-foreground", loading && "animate-spin")} />
        </Button>
      </div>

      <ScrollArea className="max-h-56">
        <div className="p-2 space-y-1.5">
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-[10px] text-muted-foreground py-6">
              Aún no hay actividad de dispatch.
            </p>
          ) : (
            entries.map(e => <LogRow key={e.id} entry={e} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function LogRow({ entry }: { entry: DispatchLogEntry }) {
  const isReplace = entry.actionType === "REPLACE_WORKERS";
  const Icon = isReplace ? Zap : Send;
  const isAutoFail = (entry.outcome ?? "").startsWith("AUTO_FAIL:");
  const status = STATUS_CONFIG[entry.status];

  return (
    <div className="rounded-lg border border-border/30 bg-background/40 px-2.5 py-1.5">
      <div className="flex items-start gap-2">
        <div className={cn(
          "h-5 w-5 rounded-md flex items-center justify-center shrink-0 mt-0.5",
          isReplace ? "bg-primary/10 text-primary" : "bg-info/10 text-info",
        )}>
          <Icon className="h-2.5 w-2.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <p className="text-[10px] font-semibold truncate">
              {isReplace ? "Reemplazo" : "Broadcast"}
              {entry.zone && <span className="text-muted-foreground"> · {entry.zone}</span>}
            </p>
            {entry.isAuto && (
              <Badge className="h-3.5 px-1 text-[8px] gap-0.5 bg-earning/15 text-earning border-earning/30">
                <Zap className="h-2 w-2" /> auto
              </Badge>
            )}
            {isAutoFail && (
              <Badge className="h-3.5 px-1 text-[8px] gap-0.5 bg-destructive/10 text-destructive border-destructive/30">
                <ShieldAlert className="h-2 w-2" /> falló
              </Badge>
            )}
            <Badge className={cn("h-3.5 px-1 text-[8px] border ml-auto", status.cls)}>
              {entry.status === "executed" && <CheckCircle2 className="h-2 w-2 mr-0.5" />}
              {entry.status === "dismissed" && <X className="h-2 w-2 mr-0.5" />}
              {status.label}
            </Badge>
          </div>
          {entry.outcome && (
            <p className="text-[9px] text-muted-foreground truncate mt-0.5">
              {entry.outcome.replace(/^AUTO(_FAIL)?:\s?/, "")}
            </p>
          )}
          <div className="flex items-center gap-2 text-[8px] text-muted-foreground/70 mt-0.5">
            <span>{Math.round(entry.confidence * 100)}% conf.</span>
            <span>·</span>
            <span>
              {formatDistanceToNow(new Date(entry.decidedAt ?? entry.createdAt), {
                addSuffix: true, locale: es,
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
