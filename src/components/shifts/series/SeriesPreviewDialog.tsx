import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SeriesPreview } from "@/lib/shifts/series-engine";

/**
 * Vista previa OBLIGATORIA de una serie de Servicios.
 *
 * Muestra exactamente qué se creará antes de escribir nada. No inventa datos:
 * lo que falta en la realidad se lista como pendiente y se conserva así.
 */
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preview: SeriesPreview | null;
  /** Nombre de la ruta que abre la vista previa (Crear, Copiar semana, …). */
  routeLabel: string;
  confirmLabel?: string;
  submitting?: boolean;
  onConfirm: () => void;
}

function dayLabel(date: string) {
  try {
    return format(new Date(`${date}T12:00:00`), "EEE d MMM yyyy", { locale: es });
  } catch {
    return date;
  }
}

export function SeriesPreviewDialog({
  open, onOpenChange, preview, routeLabel, confirmLabel, submitting = false, onConfirm,
}: Props) {
  const total = preview?.total ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            {routeLabel} · {total} Servicio{total === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Esto es exactamente lo que se creará. Nada se escribe hasta que confirmes.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[46vh] pr-3">
          <ul className="space-y-2">
            {(preview?.rows ?? []).map((row) => (
              <li
                key={row.sourceRef}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{dayLabel(row.date)}</span>
                  <Badge variant={row.publication === "published" ? "default" : "secondary"}>
                    {row.publication === "published" ? "Publicado" : "Borrador"}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {row.title} · {row.schedule} · {row.headcount} plaza{row.headcount === 1 ? "" : "s"}
                  {row.workersToCopy > 0 ? ` · ${row.workersToCopy} del equipo` : " · sin equipo"}
                </p>
              </li>
            ))}
          </ul>
        </ScrollArea>

        {preview && preview.pending.length > 0 && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Queda pendiente en cada Servicio: {preview.pending.join(", ")}. Se conserva como
            pendiente; no se completa automáticamente.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Volver
          </Button>
          <Button onClick={onConfirm} disabled={submitting || total === 0}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel ?? `Crear ${total} Servicio${total === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
