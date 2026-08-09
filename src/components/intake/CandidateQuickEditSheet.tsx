/**
 * Smart Service Intake — editor contextual de un candidato.
 *
 * UI pura: recibe el candidato, emite un patch parcial. No escribe en base de
 * datos, no toca el pipeline. En móvil abre desde abajo (una mano, safe-area);
 * en escritorio abre como panel lateral.
 */

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ServiceCandidate } from "@/lib/intake/candidate";

export interface CandidateQuickEditSheetProps {
  candidate: ServiceCandidate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (candidateId: string, patch: Partial<ServiceCandidate>) => void;
}

interface DraftFields {
  serviceDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  serviceType: string;
  requestedWorkers: string;
  notes: string;
}

function toDraft(c: ServiceCandidate): DraftFields {
  return {
    serviceDate: c.serviceDate ?? "",
    startTime: c.startTime ?? "",
    endTime: c.endTime ?? "",
    venue: c.venueCandidate.raw ?? "",
    serviceType: c.serviceType ?? "",
    requestedWorkers: c.requestedWorkers != null ? String(c.requestedWorkers) : "",
    notes: c.notes ?? "",
  };
}

export function CandidateQuickEditSheet({
  candidate,
  open,
  onOpenChange,
  onSave,
}: CandidateQuickEditSheetProps) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<DraftFields | null>(null);

  useEffect(() => {
    if (open && candidate) setDraft(toDraft(candidate));
  }, [open, candidate?.id]);

  if (!candidate || !draft) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side={isMobile ? "bottom" : "right"} />
      </Sheet>
    );
  }

  const set = (key: keyof DraftFields, value: string) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = () => {
    const patch: Partial<ServiceCandidate> = {
      serviceDate: draft.serviceDate || null,
      startTime: draft.startTime || null,
      endTime: draft.endTime || null,
      serviceType: draft.serviceType.trim() || null,
      requestedWorkers: draft.requestedWorkers ? Number(draft.requestedWorkers) : null,
      notes: draft.notes.trim() || null,
    };
    const nextVenue = draft.venue.trim();
    if (nextVenue !== (candidate.venueCandidate.raw ?? "")) {
      patch.venueCandidate = {
        ...candidate.venueCandidate,
        raw: nextVenue,
        // Escribir el lugar a mano invalida la sugerencia previa: no se inventa un id.
        resolvedId: null,
        suggestedId: null,
        suggestedLabel: null,
        requiresConfirmation: false,
        matchOrigin: "none",
      };
    }
    onSave(candidate.id, patch);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className="max-h-[90dvh] w-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:max-w-md"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Ajustar servicio detectado</SheetTitle>
          <SheetDescription>
            Corriges lo que la IA entendió. Nada se crea al guardar.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="qe-date">Fecha</Label>
            <Input
              id="qe-date"
              type="date"
              className="h-12"
              value={draft.serviceDate}
              onChange={(e) => set("serviceDate", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qe-start">Hora inicio</Label>
              <Input
                id="qe-start"
                type="time"
                className="h-12"
                value={draft.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qe-end">Hora fin</Label>
              <Input
                id="qe-end"
                type="time"
                className="h-12"
                value={draft.endTime}
                onChange={(e) => set("endTime", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qe-venue">Lugar</Label>
            <Input
              id="qe-venue"
              className="h-12"
              value={draft.venue}
              placeholder="Nombre del lugar"
              onChange={(e) => set("venue", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qe-type">Tipo de servicio</Label>
              <Input
                id="qe-type"
                className="h-12"
                value={draft.serviceType}
                onChange={(e) => set("serviceType", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qe-workers">Personal</Label>
              <Input
                id="qe-workers"
                type="number"
                inputMode="numeric"
                min={1}
                className="h-12"
                value={draft.requestedWorkers}
                onChange={(e) => set("requestedWorkers", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qe-notes">Notas</Label>
            <Textarea
              id="qe-notes"
              rows={3}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        <div className="sticky bottom-0 mt-6 flex gap-2 bg-background pt-3">
          <Button variant="outline" className="h-12 flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="h-12 flex-1" onClick={handleSave}>
            Guardar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default CandidateQuickEditSheet;
