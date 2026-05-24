/**
 * QuickCreateReadinessHints — smart, non-blocking readiness guidance for
 * the shift create flow. Derived only from existing formState values.
 *
 * v4 — Separates essential checks from recommendations.
 * Calm language. Never blocks save or publish.
 */
import { useMemo } from "react";
import {
  Calendar,
  Clock,
  Users,
  Building2,
  MapPin,
  ClipboardList,
  Car,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShiftFormState } from "../ShiftFormFields";

interface Props {
  formState: ShiftFormState;
  /** Parsed slots number (already computed upstream). */
  slotsNum: number;
  /** When true, signals this is a draft-save context. */
  isDraftContext?: boolean;
}

interface CheckItem {
  id: string;
  label: string;
  icon: any;
  ok: boolean;
}

export function QuickCreateReadinessHints({
  formState,
  slotsNum,
  isDraftContext = false,
}: Props) {
  const essentialChecks: CheckItem[] = useMemo(
    () => [
      {
        id: "date",
        label: "Fecha",
        icon: Calendar,
        ok: !!formState.date,
      },
      {
        id: "start",
        label: "Entrada",
        icon: Clock,
        ok: !!formState.startTime,
      },
      {
        id: "end",
        label: "Termina aprox.",
        icon: Clock,
        ok: !!formState.endTime,
      },
      {
        id: "slots",
        label: `Personal requerido · ${slotsNum || 0}`,
        icon: Users,
        ok: slotsNum > 0,
      },
      {
        id: "client",
        label: "Cliente",
        icon: Building2,
        ok: !!formState.clientId,
      },
      {
        id: "location",
        label: "Job site / dirección",
        icon: MapPin,
        ok: !!formState.locationId || !!formState.jobSiteLocationId || !!formState.jobSiteAddress.trim(),
      },
    ],
    [formState.date, formState.startTime, formState.endTime, formState.clientId, formState.locationId, formState.jobSiteLocationId, formState.jobSiteAddress, slotsNum],
  );

  const recommendedChecks: CheckItem[] = useMemo(
    () => [
      {
        id: "meeting",
        label: "Punto de encuentro",
        icon: MapPin,
        ok: !!formState.meetingPoint.trim() || !!formState.meetingPointLocationId,
      },
      {
        id: "instructions",
        label: "Instrucciones o notas",
        icon: ClipboardList,
        ok: !!formState.specialInstructions.trim() || !!formState.notes.trim(),
      },
      {
        id: "transport",
        label: "Revisar transporte",
        icon: Car,
        ok: !(slotsNum >= 6 && !formState.transportRequired && !formState.meetingPoint.trim() && !formState.transportNotes.trim()),
      },
    ],
    [formState.meetingPoint, formState.meetingPointLocationId, formState.specialInstructions, formState.notes, formState.transportRequired, formState.transportNotes, slotsNum],
  );

  const essentialDone = essentialChecks.filter((c) => c.ok).length;
  const essentialTotal = essentialChecks.length;
  const allEssentialOk = essentialDone === essentialTotal;

  const recDone = recommendedChecks.filter((c) => c.ok).length;
  const recTotal = recommendedChecks.length;

  return (
    <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {allEssentialOk ? (
            <div className="h-6 w-6 rounded-md bg-[hsl(142_76%_36%/0.12)] flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(142_76%_36%)]" />
            </div>
          ) : (
            <div className="h-6 w-6 rounded-md bg-[hsl(var(--status-pending)/0.12)] flex items-center justify-center shrink-0">
              <AlertCircle className="h-3.5 w-3.5 text-[hsl(var(--status-pending))]" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-tight">
              {allEssentialOk ? "Listo para operar" : "Falta completar"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              {allEssentialOk
                ? `Lo esencial está listo. ${recDone < recTotal ? "Algunos detalles recomendados faltan." : "Todo en orden."}`
                : `${essentialDone} de ${essentialTotal} esenciales completados.`}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded-full border",
            allEssentialOk
              ? "bg-[hsl(142_76%_36%/0.08)] text-[hsl(142_76%_36%)] border-[hsl(142_76%_36%/0.25)]"
              : "bg-[hsl(var(--status-pending)/0.08)] text-[hsl(var(--status-pending))] border-[hsl(var(--status-pending)/0.25)]",
          )}
        >
          {allEssentialOk ? "Listo" : "En progreso"}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* Essential */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
            Esencial
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {essentialChecks.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition-colors",
                    c.ok
                      ? "border-[hsl(142_76%_36%/0.25)] bg-[hsl(142_76%_36%/0.04)] text-foreground"
                      : "border-border/40 bg-muted/20 text-muted-foreground",
                  )}
                >
                  <Icon className={cn("h-3 w-3 shrink-0", c.ok ? "text-[hsl(142_76%_36%)]" : "text-muted-foreground/60")} />
                  <span className="truncate">{c.label}</span>
                  {c.ok && <CheckCircle2 className="h-3 w-3 text-[hsl(142_76%_36%)] ml-auto shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recommended */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
            Recomendado antes de publicar
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {recommendedChecks.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition-colors",
                    c.ok
                      ? "border-[hsl(142_76%_36%/0.25)] bg-[hsl(142_76%_36%/0.04)] text-foreground"
                      : "border-border/40 bg-muted/20 text-muted-foreground",
                  )}
                >
                  <Icon className={cn("h-3 w-3 shrink-0", c.ok ? "text-[hsl(142_76%_36%)]" : "text-muted-foreground/60")} />
                  <span className="truncate">{c.label}</span>
                  {c.ok && <CheckCircle2 className="h-3 w-3 text-[hsl(142_76%_36%)] ml-auto shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Calm context notes */}
        <div className="space-y-1.5 pt-0.5">
          {isDraftContext && (
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3 shrink-0 mt-0.5 opacity-70" />
              <span>
                En borrador, los trabajadores no lo verán todavía. Puedes completar los detalles después.
              </span>
            </div>
          )}
          {allEssentialOk && (
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 shrink-0 mt-0.5 opacity-70" />
              <span>
                Al publicar, el turno seguirá el flujo actual de notificaciones.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
