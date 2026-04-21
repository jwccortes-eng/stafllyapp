/**
 * AutoDispatchPanel
 *
 * Smart Dispatch surface inside the Operations Command Center.
 *
 * What it does:
 *   • Polls `evaluateDispatchActions(companyId)` every 60s.
 *   • Renders each suggestion as a compact card with a confidence chip
 *     and one-click actions (Execute / Review / Dismiss).
 *   • Persists every fresh suggestion to `dispatch_logs` (learning loop)
 *     and updates the same row on admin decision.
 *   • NEVER mutates shift_assignments directly — Execute opens the existing
 *     `ReplacementSuggestionDialog` (or `OpsBroadcastDialog`) so the admin
 *     keeps full control with a final confirmation step.
 *
 * UI rules (decision chosen for phase 3):
 *   • Card collapsed by default unless there is at least one suggestion.
 *   • Conservative thresholds upstream → expect 0–3 cards typically.
 *   • Sticky header with count + manual refresh.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sparkles, Zap, Send, ChevronDown, ChevronUp,
  RefreshCw, CheckCircle2, X, Eye, AlertTriangle, Loader2, Clock, MapPin,
  Settings2, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import {
  evaluateDispatchActions,
  executeAutoDispatch,
  persistSuggestion,
  markDispatchLog,
  AUTO_DISPATCH_DEFAULTS,
  AUTO_DISPATCH_SETTINGS_KEY,
  type AutoDispatchConfig,
  type AutoDispatchLevel,
  type DispatchSuggestion,
} from "@/lib/auto-dispatch";
import { AutoDispatchSettings } from "@/components/operations/AutoDispatchSettings";
import { AutoDispatchLog } from "@/components/operations/AutoDispatchLog";

interface AutoDispatchPanelProps {
  companyId: string;
  /** Open Replacement dialog with this shift. */
  onExecuteReplace: (shiftId: string, shiftTitle: string) => void;
  /** Open Broadcast dialog targeting this shift + audience. */
  onExecuteBroadcast: (shiftId: string, employeeIds: string[], zone: string | null) => void;
}

const CONFIDENCE_STYLES: Record<DispatchSuggestion["confidenceBucket"], string> = {
  high:   "bg-earning/15 text-earning border-earning/30",
  medium: "bg-warning/15 text-warning border-warning/30",
  low:    "bg-muted/40 text-muted-foreground border-border",
};

const CONFIDENCE_LABEL: Record<DispatchSuggestion["confidenceBucket"], string> = {
  high: "Alta confianza",
  medium: "Confianza media",
  low: "Baja confianza",
};

const POLL_MS = 60_000;

const LEVEL_BADGE: Record<AutoDispatchLevel, { label: string; cls: string; icon: typeof Sparkles }> = {
  off:        { label: "Off",        cls: "bg-muted/40 text-muted-foreground border-border",        icon: ShieldCheck },
  assist:     { label: "Assist",     cls: "bg-info/10 text-info border-info/30",                    icon: Sparkles },
  semi_auto:  { label: "Semi-auto",  cls: "bg-warning/10 text-warning border-warning/30",           icon: Sparkles },
  full_auto:  { label: "Full auto",  cls: "bg-earning/10 text-earning border-earning/30",           icon: Zap },
};

export function AutoDispatchPanel({
  companyId, onExecuteReplace, onExecuteBroadcast,
}: AutoDispatchPanelProps) {
  const { user } = useAuth();
  const { config: autoCfg } = useCompanyConfig<AutoDispatchConfig>(
    AUTO_DISPATCH_SETTINGS_KEY, AUTO_DISPATCH_DEFAULTS,
  );
  const [suggestions, setSuggestions] = useState<DispatchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [confirming, setConfirming] = useState<DispatchSuggestion | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  // Map suggestion.id → dispatch_logs.id for outcome updates
  const logIdMapRef = useRef<Map<string, string>>(new Map());

  const isOff = autoCfg.level === "off";
  const isFullAuto = autoCfg.level === "full_auto";

  // ─── Load + persist + (optional) auto-execute ─────────────────────────
  const refresh = useCallback(async () => {
    if (!companyId || isOff) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      // In full_auto mode, run the autonomous loop FIRST. Anything it
      // executes will already have been logged; the subsequent suggestion
      // refresh will naturally not include those shifts (coverage moved).
      if (isFullAuto) {
        try {
          const results = await executeAutoDispatch(companyId);
          const executed = results.filter(r => r.status === "executed");
          if (executed.length > 0) {
            setLogRefreshKey(k => k + 1);
            executed.forEach(r => {
              toast.success(
                r.action === "auto_assign" ? "⚡ Auto-asignación" : "⚡ Auto-broadcast",
                {
                  description: r.action === "auto_assign"
                    ? `Asignado a "${r.suggestion.shiftTitle}"`
                    : `Broadcast enviado a ${r.notifiedEmployeeIds?.length ?? 0} workers`,
                },
              );
            });
          }
        } catch (err) {
          console.warn("[AutoDispatchPanel] auto-execute failed", err);
        }
      }

      const next = await evaluateDispatchActions(companyId);
      setSuggestions(next);
      // Persist each in background (best-effort, doesn't block UI)
      for (const s of next) {
        if (logIdMapRef.current.has(s.id)) continue;
        const id = await persistSuggestion(companyId, s);
        if (id) logIdMapRef.current.set(s.id, id);
      }
    } catch (err) {
      console.warn("[AutoDispatchPanel] refresh failed", err);
    } finally {
      setLoading(false);
    }
  }, [companyId, isOff, isFullAuto]);

  useEffect(() => {
    if (!companyId) return;
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [companyId, refresh]);

  // Realtime: any new dispatch_logs row from this company → refresh log inline
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`dispatch_logs:${companyId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "dispatch_logs",
        filter: `company_id=eq.${companyId}`,
      }, () => setLogRefreshKey(k => k + 1))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId]);

  // Auto-expand when new suggestions arrive
  useEffect(() => {
    if (suggestions.length > 0) setCollapsed(false);
  }, [suggestions.length]);

  // ─── Actions ──────────────────────────────────────────────────────────
  const handleExecute = (s: DispatchSuggestion) => {
    setConfirming(s);
  };

  const handleConfirm = async () => {
    if (!confirming) return;
    const s = confirming;
    setConfirming(null);

    // Open the right downstream flow — actual mutation happens there.
    if (s.type === "REPLACE_WORKERS") {
      onExecuteReplace(s.shiftId, s.shiftTitle);
    } else {
      onExecuteBroadcast(
        s.shiftId,
        s.candidates.map(c => c.employeeId),
        s.zone,
      );
    }

    // Optimistic log update — admin reached the execute step. The downstream
    // dialog handles the final assignment; we only record the decision.
    const logId = logIdMapRef.current.get(s.id);
    if (logId) {
      await markDispatchLog(logId, {
        status: "executed",
        decidedBy: user?.id ?? null,
        executedAssignments: { intent: s.type, candidateIds: s.candidates.map(c => c.employeeId) },
        outcome: "Admin abrió flujo de ejecución",
      });
    }

    // Drop from local list — refresh will rebuild if still relevant
    setSuggestions(prev => prev.filter(x => x.id !== s.id));
    toast.success("Acción enviada", {
      description: s.type === "REPLACE_WORKERS" ? "Revisa y confirma los reemplazos" : "Revisa la lista y envía el broadcast",
    });
  };

  const handleDismiss = async (s: DispatchSuggestion) => {
    setSuggestions(prev => prev.filter(x => x.id !== s.id));
    const logId = logIdMapRef.current.get(s.id);
    if (logId) {
      await markDispatchLog(logId, {
        status: "dismissed",
        decidedBy: user?.id ?? null,
        outcome: "Admin descartó la sugerencia",
      });
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────
  const headerCount = suggestions.length;
  const showCollapsed = collapsed || headerCount === 0;

  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
        <CardHeader
          className="pb-2 cursor-pointer select-none"
          onClick={() => setCollapsed(c => !c)}
        >
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              Smart Dispatch
              {headerCount > 0 && (
                <Badge className="bg-primary text-primary-foreground border-0 text-[10px] h-5 px-1.5">
                  {headerCount}
                </Badge>
              )}
              {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={(e) => { e.stopPropagation(); refresh(); }}
                title="Actualizar"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 text-muted-foreground", loading && "animate-spin")} />
              </Button>
              {showCollapsed
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </CardHeader>

        {!showCollapsed && (
          <CardContent className="pt-0 space-y-2">
            {headerCount === 0 ? (
              <div className="text-center py-5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-earning" />
                Sin acciones recomendadas. Todo bajo control.
              </div>
            ) : (
              suggestions.map(s => (
                <SuggestionCard
                  key={s.id}
                  s={s}
                  onExecute={() => handleExecute(s)}
                  onDismiss={() => handleDismiss(s)}
                />
              ))
            )}
          </CardContent>
        )}
      </Card>

      {/* Confirm modal — last-mile human gate */}
      <Dialog open={!!confirming} onOpenChange={(o) => { if (!o) setConfirming(null); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl">
          {confirming && (
            <>
              <DialogHeader className="px-5 pt-5 pb-2">
                <DialogTitle className="flex items-center gap-2 text-base">
                  {confirming.type === "REPLACE_WORKERS"
                    ? <Zap className="h-4 w-4 text-primary" />
                    : <Send className="h-4 w-4 text-primary" />}
                  Confirmar acción
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Vas a abrir el flujo de ejecución. Podrás revisar y ajustar antes de aplicar cambios.
                </DialogDescription>
              </DialogHeader>

              <div className="px-5 pb-4 space-y-3">
                <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className="truncate">{confirming.shiftTitle}</span>
                    {confirming.zone && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5">
                        <MapPin className="h-2.5 w-2.5" /> {confirming.zone}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <Stat label="Faltan" value={String(confirming.missing)} tone="warning" />
                    <Stat label="Inicia en" value={`${confirming.startsInMinutes}m`} tone="primary" />
                    <Stat label="Confianza" value={`${Math.round(confirming.confidence * 100)}%`} tone={confirming.confidenceBucket === "high" ? "earning" : "muted"} />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{confirming.reason}</p>

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirming(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="flex-1 gap-1.5" onClick={handleConfirm}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Continuar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function SuggestionCard({
  s, onExecute, onDismiss,
}: { s: DispatchSuggestion; onExecute: () => void; onDismiss: () => void }) {
  const isReplace = s.type === "REPLACE_WORKERS";
  const top = s.candidates.slice(0, 3);
  const remaining = Math.max(0, s.candidates.length - top.length);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2.5 transition-colors hover:border-primary/30">
      {/* Header row */}
      <div className="flex items-start gap-2.5">
        <div className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
          isReplace ? "bg-primary/10 text-primary" : "bg-info/10 text-info",
        )}>
          {isReplace ? <Zap className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-bold truncate">
              {isReplace
                ? `Asignar ${s.missing} a ${s.shiftTitle}`
                : `Broadcast: ${s.shiftTitle}`}
            </p>
            <Badge className={cn("text-[9px] h-4 px-1.5 border", CONFIDENCE_STYLES[s.confidenceBucket])}>
              {Math.round(s.confidence * 100)}%
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{s.reason}</p>
        </div>
      </div>

      {/* Meta strip */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap pl-10">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> Inicia en {s.startsInMinutes}m
        </span>
        {s.zone && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {s.zone}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Faltan {s.missing}/{s.required}
        </span>
        <span className="text-muted-foreground/60">· {CONFIDENCE_LABEL[s.confidenceBucket]}</span>
      </div>

      {/* Candidate preview */}
      {top.length > 0 && (
        <div className="flex items-center gap-1.5 pl-10">
          <div className="flex -space-x-2">
            {top.map(c => (
              <Avatar key={c.employeeId} className="h-6 w-6 ring-2 ring-card">
                {c.avatarUrl && <AvatarImage src={c.avatarUrl} />}
                <AvatarFallback className="text-[8px] font-bold bg-primary/10 text-primary">
                  {c.firstName?.[0]}{c.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {top.map(c => c.firstName).join(", ")}
            {remaining > 0 && ` +${remaining}`}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1.5 pl-10">
        <Button size="sm" className="h-7 px-2.5 gap-1 text-[10px] flex-1" onClick={onExecute}>
          {isReplace ? <Zap className="h-3 w-3" /> : <Send className="h-3 w-3" />}
          Ejecutar
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-[10px]" onClick={onExecute}>
          <Eye className="h-3 w-3" /> Revisar
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDismiss} title="Descartar">
          <X className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "warning" | "primary" | "earning" | "muted" }) {
  const toneCls =
    tone === "warning" ? "text-warning"
    : tone === "primary" ? "text-primary"
    : tone === "earning" ? "text-earning"
    : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border/40 bg-card px-2 py-1.5">
      <p className="text-[8px] uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p className={cn("text-sm font-bold tabular-nums leading-tight", toneCls)}>{value}</p>
    </div>
  );
}
