/**
 * WorkerPreviewCard — "Así lo verá el trabajador" preview.
 *
 * Phase 2: pure visual preview. Does NOT touch the worker portal,
 * does NOT send notifications, does NOT write anything.
 */
import { memo } from "react";
import { Clock, MapPin, Building2, Eye, Hand } from "lucide-react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Props {
  clientName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  jobSiteLabel: string | null;
  meetingPointLabel: string | null;
  meetingTime: string;
  claimable: boolean;
  /** Whether the shift has any pending info to communicate as "por confirmar". */
  hasPending: boolean;
  /** Specific missing pieces, used to render per-line "por confirmar" copy. */
  jobsiteMissing: boolean;
  meetingMissing: boolean;
  clientMissing: boolean;
  timeMissing: boolean;
}

function fmtDateChip(d: string): string {
  if (!d) return "Fecha por confirmar";
  try {
    return format(parse(d, "yyyy-MM-dd", new Date()), "EEE d MMM", { locale: es });
  } catch {
    return d;
  }
}

function WorkerPreviewCardImpl(p: Props) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/20">
        <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
          <Eye className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight">Así lo verá el trabajador</div>
          <p className="text-[10px] text-muted-foreground">Vista previa — no se envía nada todavía.</p>
        </div>
      </div>

      <div className="p-4">
        {/* Worker-style card */}
        <div className="rounded-xl border border-border/40 bg-gradient-to-br from-background to-muted/20 p-3 space-y-2">
          {/* Header: client + date */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className={cn("truncate", p.clientMissing && "italic text-muted-foreground/80")}>
                  {p.clientName || "Cliente por confirmar"}
                </span>
              </div>
              <div className="text-[12px] font-semibold mt-0.5 truncate">
                {fmtDateChip(p.date)}
              </div>
            </div>
            {p.claimable && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold border border-primary/30 shrink-0">
                <Hand className="h-2.5 w-2.5" /> Reclamable
              </span>
            )}
          </div>

          {/* Time block — entrada protagonist, termina aprox. muted */}
          <div className="flex items-baseline gap-2">
            <Clock className="h-3 w-3 text-muted-foreground self-center" />
            {p.timeMissing ? (
              <span className="text-[12px] italic text-muted-foreground">Hora por confirmar</span>
            ) : (
              <>
                <span className="text-base font-bold font-heading leading-none tabular-nums">
                  {p.startTime}
                </span>
                <span className="text-[10px] text-muted-foreground/80">
                  Termina aprox. {p.endTime}
                </span>
              </>
            )}
          </div>

          {p.meetingTime && !p.timeMissing && (
            <div className="text-[10px] text-muted-foreground pl-5">
              Convocatoria: <span className="font-semibold">{p.meetingTime}</span>
            </div>
          )}

          {/* Job site */}
          <div className="flex items-start gap-1.5 text-[11px] pt-1 border-t border-border/30">
            <MapPin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground">Trabajo</div>
              <div
                className={cn(
                  "truncate text-foreground",
                  p.jobsiteMissing && "italic text-muted-foreground",
                )}
              >
                {p.jobSiteLabel || "Ubicación por confirmar"}
              </div>
            </div>
          </div>

          {/* Meeting point */}
          {(p.meetingPointLabel || p.meetingMissing) && (
            <div className="flex items-start gap-1.5 text-[11px]">
              <MapPin className="h-3 w-3 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground">Punto de encuentro</div>
                <div
                  className={cn(
                    "truncate text-foreground",
                    p.meetingMissing && "italic text-muted-foreground",
                  )}
                >
                  {p.meetingPointLabel || "Punto de encuentro por confirmar"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Helper copy */}
        {p.hasPending && (
          <p className="text-[10px] text-muted-foreground leading-snug mt-2">
            {p.claimable
              ? "Puedes reclamar el turno; Stafly te avisará cuando se completen los detalles."
              : "Detalles en construcción. Stafly te avisará cuando estén confirmados."}
          </p>
        )}
      </div>
    </div>
  );
}

export const WorkerPreviewCard = memo(WorkerPreviewCardImpl);
