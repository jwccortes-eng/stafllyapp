/**
 * ExportStateBadges — separa visualmente las DOS preguntas del puente Connecteam:
 *
 *   Estado Stafly      → ciclo de vida interno (borrador / publicado / cancelado)
 *   Estado Connecteam  → ¿el archivo tiene la información suficiente?
 *
 * UI-only. No decide nada: recibe el `publication_status` y el status de
 * `validateShiftForExport`. Un borrador completo se muestra como exportable.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ValidationResult } from "@/lib/integrations/connecteam-export";

const STAFLY_LABEL: Record<string, string> = {
  published: "Publicado",
  draft: "Borrador",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  archived: "Archivado",
};

export function staflyStateLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "Sin estado";
  return STAFLY_LABEL[s] ?? status!.trim();
}

const CONNECTEAM_META: Record<
  ValidationResult["status"],
  { label: string; tone: string }
> = {
  ready: { label: "Listo para exportar", tone: "border-earning/40 text-earning" },
  needs_review: { label: "Exportable con avisos", tone: "border-warning/40 text-warning" },
  blocked: { label: "Bloqueado", tone: "border-destructive/40 text-destructive" },
};

export function ExportStateBadges({
  publicationStatus,
  status,
  className,
}: {
  publicationStatus: string | null | undefined;
  status: ValidationResult["status"];
  className?: string;
}) {
  const ct = CONNECTEAM_META[status];
  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap text-[11px]", className)}>
      <span className="text-muted-foreground">Stafly:</span>
      <Badge variant="outline" className="text-[10px] border-border/50 text-foreground">
        {staflyStateLabel(publicationStatus)}
      </Badge>
      <span className="text-muted-foreground">Connecteam:</span>
      <Badge variant="outline" className={cn("text-[10px]", ct.tone)}>
        {ct.label}
      </Badge>
    </div>
  );
}
