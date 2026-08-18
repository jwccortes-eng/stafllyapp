/**
 * PrePublishDialog — premium "Antes de publicar" review modal.
 *
 * Phase 4: UI/confirmation only. Does NOT change save/publish handlers,
 * does NOT send notifications, does NOT write anything new to the DB.
 *
 * Behavior:
 *  - When admin clicks Publish in ShiftFormShell, this modal opens.
 *  - Shows shift summary, list of pending fields, worker-visible preview,
 *    and a stronger notice when the shift is claimable + incomplete.
 *  - When pending fields exist, requires an explicit confirmation checkbox
 *    before the primary CTA is enabled.
 *  - Calling onConfirm delegates to the existing publish handler unchanged.
 */
import { memo, useEffect, useState } from "react";
import { Loader2, Send, AlertCircle, CheckCircle2, Clock, Building2, MapPin, Users, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { PendingFlag } from "@/lib/shifts/pending-flags";
import {
  SERVICE_LOCATION_COPY,
  focusServiceSection,
  type ReadinessBlocker,
} from "@/lib/shifts/service-publish-readiness";
import { WorkerPreviewCard } from "./WorkerPreviewCard";

export interface PrePublishReviewData {
  shiftName: string;
  date: string;
  startTime: string;
  endTime: string;
  meetingTime: string;
  clientName: string | null;
  jobSiteLabel: string | null;
  meetingPointLabel: string | null;
  slotsNum: number;
  assignedCount: number;
  claimable: boolean;
  flags: PendingFlag[];
  hasPending: boolean;
  // Specific pending bits for the WorkerPreviewCard
  clientMissing: boolean;
  timeMissing: boolean;
  jobsiteMissing: boolean;
  meetingMissing: boolean;
  /** Bloqueos canónicos: si existen, la publicación fallará. */
  blockers?: ReadinessBlocker[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: PrePublishReviewData;
  saving?: boolean;
  onConfirm: () => void | Promise<void>;
}

function fmtDate(d: string): string {
  if (!d) return "Fecha por confirmar";
  try {
    return format(parse(d, "yyyy-MM-dd", new Date()), "EEEE d 'de' MMMM yyyy", { locale: es });
  } catch {
    return d;
  }
}

function PrePublishDialogImpl({ open, onOpenChange, data, saving, onConfirm }: Props) {
  const [confirmed, setConfirmed] = useState(false);

  // Reset checkbox each time the dialog opens
  useEffect(() => {
    if (open) setConfirmed(false);
  }, [open]);

  const blockers = data.blockers ?? [];
  const hasBlockers = blockers.length > 0;

  const pendingOnly = data.flags.filter(
    (f) => f.key !== "ready_to_publish" && f.key !== "publishable_with_pending",
  );

  const ctaLabel = hasBlockers
    ? "No se puede publicar todavía"
    : data.hasPending
      ? "Publicar con información pendiente"
      : "Publicar turno";
  const ctaDisabled = !!saving || hasBlockers || (data.hasPending && !confirmed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-0">
        <div className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-heading">Antes de publicar</DialogTitle>
            <DialogDescription className="text-sm">
              Revisa cómo se verá este turno y qué información sigue pendiente.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* A. Shift summary */}
          <section className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold truncate">{data.shiftName}</h3>
              {data.claimable && (
                <Badge variant="outline" className="text-[10px] h-5 gap-1 shrink-0">
                  <Users className="h-2.5 w-2.5" />
                  Reclamable
                </Badge>
              )}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <SummaryRow icon={Clock} label="Fecha" value={fmtDate(data.date)} muted={!data.date} />
              <SummaryRow
                icon={Clock}
                label="Horario"
                value={
                  data.startTime && data.endTime
                    ? `${data.startTime} – ${data.endTime}${data.meetingTime ? ` · convocatoria ${data.meetingTime}` : ""}`
                    : "Por confirmar"
                }
                muted={data.timeMissing}
              />
              <SummaryRow
                icon={Building2}
                label="Cliente"
                value={data.clientName || "Pendiente"}
                muted={data.clientMissing}
              />
              <SummaryRow
                icon={MapPin}
                label={SERVICE_LOCATION_COPY.jobSite}
                value={data.jobSiteLabel || "Pendiente"}
                muted={data.jobsiteMissing}
              />
              <SummaryRow
                icon={MapPin}
                label={SERVICE_LOCATION_COPY.meetingPoint}
                value={data.meetingPointLabel || "—"}
                muted={data.meetingMissing}
              />
              <SummaryRow
                icon={Users}
                label="Cobertura"
                value={`${data.assignedCount} / ${data.slotsNum} ${data.claimable ? "(reclamable)" : ""}`}
              />
            </dl>
          </section>

          {/* B0. Bloqueos reales de publicación */}
          {hasBlockers && (
            <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive">
                No se puede publicar todavía
              </h4>
              <ul className="space-y-1.5">
                {blockers.map((b) => (
                  <li key={b.key} className="flex items-start gap-2 text-sm">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
                    <span className="min-w-0">
                      {b.message}
                      {b.cta && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenChange(false);
                            window.setTimeout(() => focusServiceSection(b.cta!.anchorId), 220);
                          }}
                          className="ml-2 underline font-semibold"
                        >
                          {b.cta.label}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* B. Pending information */}
          {pendingOnly.length > 0 ? (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Información pendiente
              </h4>
              <ul className="space-y-1.5">
                {pendingOnly.map((f) => (
                  <li key={f.key} className="flex items-center gap-2 text-sm">
                    <AlertCircle
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        f.tone === "urgent" ? "text-destructive" : "text-amber-500",
                      )}
                    />
                    <span>{f.label.replace(/^Pendiente:\s*/, "")}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            !hasBlockers && (
              <section className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>Toda la información operativa está completa.</span>
              </section>
            )
          )}

          {/* C. Worker preview */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Eye className="h-3 w-3" /> Así lo verá el trabajador
            </h4>
            <WorkerPreviewCard
              clientName={data.clientName}
              date={data.date}
              startTime={data.startTime}
              endTime={data.endTime}
              jobSiteLabel={data.jobSiteLabel}
              meetingPointLabel={data.meetingPointLabel}
              meetingTime={data.meetingTime}
              claimable={data.claimable}
              hasPending={data.hasPending}
              jobsiteMissing={data.jobsiteMissing}
              meetingMissing={data.meetingMissing}
              clientMissing={data.clientMissing}
              timeMissing={data.timeMissing}
            />
          </section>

          {/* Claimable + pending stronger notice */}
          {data.claimable && data.hasPending && !hasBlockers && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300 flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Los trabajadores podrán reclamar este turno aunque algunos detalles estén por
                confirmar.
              </span>
            </div>
          )}

          {/* D. Safety copy — sólo cuando el servicio realmente puede publicarse.
              Claimable describe staffing, nunca anula la política de compañía. */}
          {!hasBlockers && <p className="text-[11px] text-muted-foreground leading-relaxed">
            Este turno será visible para trabajadores con la información disponible actualmente.
            Los campos pendientes aparecerán como "por confirmar".
          </p>}

          {/* Required checkbox when pending */}
          {data.hasPending && (
            <label className="flex items-start gap-2.5 rounded-lg border border-border/50 p-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs leading-relaxed">
                Entiendo que este turno será visible con información pendiente.
              </span>
            </label>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/40 bg-muted/10 gap-2 flex-col-reverse sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            Volver a editar
          </Button>
          <Button
            size="sm"
            onClick={() => void onConfirm()}
            disabled={ctaDisabled}
            className="gap-1.5 font-semibold w-full sm:w-auto"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {ctaLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</dt>
        <dd className={cn("text-xs truncate", muted && "text-amber-600 dark:text-amber-400")}>
          {value}
        </dd>
      </div>
    </div>
  );
}

export const PrePublishDialog = memo(PrePublishDialogImpl);
