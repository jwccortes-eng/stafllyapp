/**
 * PostShiftRatingDialog
 *
 * Wrapper around the existing ReviewFormDialog that orchestrates a post-shift
 * rating session for the workers selected by `pick_workers_to_rate(_shift_id)`
 * (the SQL sampling function). The admin sees the sampled list, can skip
 * individuals, and is taken through one ReviewFormDialog per worker until the
 * batch is complete — exactly how Uber's rating flow works after a trip.
 *
 * Why this wrapper instead of duplicating the form:
 *   - Reuses the full Reviews engine (review_submissions + dimension scores +
 *     review_scores recompute trigger). No new tables, no parallel system.
 *   - Honors the deterministic sampling (low-score / new / random) without
 *     re-implementing it in the client.
 *
 * Auto-mode (`auto`):
 *   When the dialog is opened in auto mode and there is no review_request yet
 *   for the shift, we call `generate_shift_review_requests(_shift_id)` to
 *   materialize the requests. This is the safety net for shifts that were
 *   completed before the trigger was active.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Star, ArrowRight, CheckCircle2, SkipForward, Sparkles } from "lucide-react";
import { ReviewFormDialog } from "@/components/reviews/ReviewFormDialog";
import { cn } from "@/lib/utils";
import { formatPersonName } from "@/lib/format-helpers";

export type PostShiftRatingMode = "auto" | "manual";

interface PostShiftRatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftId: string;
  shiftTitle: string;
  /**
   * "auto"   → use SQL sampling (~25% of assigned workers, deterministic).
   * "manual" → load every assigned worker so admin can rate anyone.
   */
  mode?: PostShiftRatingMode;
  onCompleted?: () => void;
}

interface SampledWorker {
  employeeId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  reason: "new_worker" | "low_score" | "random_sample" | "manual";
  reviewRequestId: string | null;
  status: "pending" | "submitted" | "skipped";
}

const REASON_BADGE: Record<SampledWorker["reason"], { label: string; tone: string }> = {
  new_worker: { label: "Nuevo", tone: "bg-info/15 text-info" },
  low_score: { label: "Bajo score", tone: "bg-warning/15 text-warning" },
  random_sample: { label: "Aleatorio", tone: "bg-muted text-muted-foreground" },
  manual: { label: "Manual", tone: "bg-primary/10 text-primary" },
};

export function PostShiftRatingDialog({
  open, onOpenChange, shiftId, shiftTitle, mode = "auto", onCompleted,
}: PostShiftRatingDialogProps) {
  const [loading, setLoading] = useState(false);
  const [workers, setWorkers] = useState<SampledWorker[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // ─── Data load ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "auto") {
        // 1) Ensure review_requests exist for this shift (idempotent SQL fn)
        const { data: existing } = await supabase
          .from("review_requests")
          .select("id, evaluated_entity_id, sampling_reason")
          .eq("source_event_type", "shift_completed")
          .eq("source_event_id", shiftId)
          .eq("evaluated_entity_type", "employee");

        let requestRows = existing ?? [];
        if (!requestRows.length) {
          const { error: genErr } = await supabase.rpc("generate_shift_review_requests", { _shift_id: shiftId } as any);
          if (genErr) throw genErr;
          const { data: refreshed } = await supabase
            .from("review_requests")
            .select("id, evaluated_entity_id, sampling_reason")
            .eq("source_event_type", "shift_completed")
            .eq("source_event_id", shiftId)
            .eq("evaluated_entity_type", "employee");
          requestRows = refreshed ?? [];
        }

        if (!requestRows.length) {
          setWorkers([]);
          return;
        }

        // 2) Resolve already-submitted requests so we don't ask twice
        const { data: subs } = await supabase
          .from("review_submissions")
          .select("review_request_id")
          .in("review_request_id", requestRows.map(r => r.id));
        const submitted = new Set((subs ?? []).map(s => s.review_request_id).filter(Boolean));

        // 3) Hydrate employee names + avatars
        const empIds = Array.from(new Set(requestRows.map(r => r.evaluated_entity_id)));
        const { data: emps } = await supabase
          .from("employees")
          .select("id, first_name, last_name, avatar_url")
          .in("id", empIds);
        const empMap = new Map((emps ?? []).map(e => [e.id, e]));

        const rows: SampledWorker[] = requestRows.map(r => {
          const e = empMap.get(r.evaluated_entity_id);
          const reason = (r.sampling_reason as SampledWorker["reason"]) ?? "random_sample";
          return {
            employeeId: r.evaluated_entity_id,
            firstName: e?.first_name ?? "—",
            lastName: e?.last_name ?? "",
            avatarUrl: e?.avatar_url ?? null,
            reason,
            reviewRequestId: r.id,
            status: submitted.has(r.id) ? "submitted" : "pending",
          };
        });
        setWorkers(rows);
      } else {
        // Manual mode: list ALL assigned workers (no sampling)
        const { data: assigns } = await supabase
          .from("shift_assignments")
          .select("employee_id, employees(id, first_name, last_name, avatar_url)")
          .eq("shift_id", shiftId)
          .not("status", "in", "(rejected,removed)");

        const rows: SampledWorker[] = (assigns ?? []).map((a: any) => ({
          employeeId: a.employee_id,
          firstName: a.employees?.first_name ?? "—",
          lastName: a.employees?.last_name ?? "",
          avatarUrl: a.employees?.avatar_url ?? null,
          reason: "manual",
          reviewRequestId: null,
          status: "pending",
        }));
        setWorkers(rows);
      }
    } catch (err: any) {
      toast.error("Error al cargar empleados", { description: err.message });
      setWorkers([]);
    } finally {
      setLoading(false);
    }
  }, [shiftId, mode]);

  useEffect(() => {
    if (open) {
      setActiveIdx(null);
      load();
    }
  }, [open, load]);

  // ─── Derived progress ──────────────────────────────────────────────────
  const progress = useMemo(() => {
    const done = workers.filter(w => w.status === "submitted").length;
    const skipped = workers.filter(w => w.status === "skipped").length;
    return { done, skipped, total: workers.length, pending: workers.length - done - skipped };
  }, [workers]);

  const activeWorker = activeIdx != null ? workers[activeIdx] : null;

  // ─── Handlers ─────────────────────────────────────────────────────────
  const startNext = () => {
    const idx = workers.findIndex(w => w.status === "pending");
    if (idx >= 0) setActiveIdx(idx);
    else {
      onCompleted?.();
      onOpenChange(false);
    }
  };

  const handleSubmittedOne = () => {
    if (activeIdx == null) return;
    setWorkers(prev => prev.map((w, i) => i === activeIdx ? { ...w, status: "submitted" } : w));
    setActiveIdx(null);
  };

  const handleSkip = (idx: number) => {
    setWorkers(prev => prev.map((w, i) => i === idx ? { ...w, status: "skipped" } : w));
  };

  return (
    <>
      <Dialog open={open && activeIdx == null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md sm:max-w-lg p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="px-5 pt-5 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Calificar turno
            </DialogTitle>
            <DialogDescription className="text-xs">
              <span className="font-semibold text-foreground">{shiftTitle}</span>
              {mode === "auto" && (
                <span className="block mt-0.5">
                  Muestra inteligente: priorizamos nuevos y bajo score.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Progress strip */}
          {!loading && workers.length > 0 && (
            <div className="px-5 py-2 flex items-center gap-3 border-y border-border/30 bg-muted/20">
              <div className="flex-1">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress.total === 0 ? 0 : (progress.done / progress.total) * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-[10px] font-bold text-muted-foreground tabular-nums">
                {progress.done}/{progress.total}
              </p>
            </div>
          )}

          <ScrollArea className="max-h-[55vh]">
            <div className="px-5 py-3 space-y-1.5">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : workers.length === 0 ? (
                <div className="text-center py-10 text-xs text-muted-foreground space-y-1">
                  <Star className="h-6 w-6 mx-auto text-muted-foreground/40" />
                  <p>{mode === "auto" ? "No hay empleados sampleados para este turno." : "No hay empleados asignados."}</p>
                </div>
              ) : (
                workers.map((w, idx) => {
                  const reasonStyle = REASON_BADGE[w.reason];
                  return (
                    <div
                      key={w.employeeId}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors",
                        w.status === "submitted" ? "bg-earning/[0.06]"
                          : w.status === "skipped" ? "bg-muted/30 opacity-60"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <Avatar className="h-8 w-8">
                        {w.avatarUrl && <AvatarImage src={w.avatarUrl} />}
                        <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                          {w.firstName?.[0]}{w.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">
                          {formatPersonName(`${w.firstName} ${w.lastName}`)}
                        </p>
                        <Badge className={cn("text-[8px] h-4 px-1.5 mt-0.5 border-0", reasonStyle.tone)}>
                          {reasonStyle.label}
                        </Badge>
                      </div>

                      {w.status === "submitted" ? (
                        <CheckCircle2 className="h-4 w-4 text-earning shrink-0" />
                      ) : w.status === "skipped" ? (
                        <span className="text-[10px] text-muted-foreground">Omitido</span>
                      ) : (
                        <div className="flex gap-1">
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => handleSkip(idx)}
                            title="Omitir"
                          >
                            <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-2.5 gap-1 text-[10px]"
                            onClick={() => setActiveIdx(idx)}
                          >
                            <Star className="h-3 w-3" />
                            Calificar
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {!loading && workers.length > 0 && progress.pending > 0 && (
            <div className="px-5 py-3 border-t border-border/30">
              <Button size="sm" className="w-full gap-1.5" onClick={startNext}>
                <ArrowRight className="h-3.5 w-3.5" />
                Calificar siguiente ({progress.pending})
              </Button>
            </div>
          )}
          {!loading && workers.length > 0 && progress.pending === 0 && (
            <div className="px-5 py-3 border-t border-border/30">
              <Button
                size="sm"
                className="w-full gap-1.5"
                variant="outline"
                onClick={() => { onCompleted?.(); onOpenChange(false); }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Listo
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Per-worker form, opened in sequence */}
      {activeWorker && (
        <ReviewFormDialog
          open={activeIdx != null}
          onOpenChange={(o) => { if (!o) setActiveIdx(null); }}
          reviewRequest={activeWorker.reviewRequestId ? {
            id: activeWorker.reviewRequestId,
            review_form_type: "admin_to_employee",
            evaluated_entity_type: "employee",
            evaluated_entity_id: activeWorker.employeeId,
            source_event_id: shiftId,
            source_event_type: "shift_completed",
          } : undefined}
          formType="admin_to_employee"
          evaluatedEntityType="employee"
          evaluatedEntityId={activeWorker.employeeId}
          evaluatedName={formatPersonName(`${activeWorker.firstName} ${activeWorker.lastName}`)}
          sourceEventId={shiftId}
          sourceEventType="shift_completed"
          onSubmitted={handleSubmittedOne}
        />
      )}
    </>
  );
}
