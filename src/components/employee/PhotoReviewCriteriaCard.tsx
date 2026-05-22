import { CheckCircle2, XCircle, Copy as CopyIcon, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

/**
 * PhotoReviewCriteriaCard — Admin Photo Review Queue v1
 * ------------------------------------------------------
 * Presentational card shown above the worker list when admins are inside
 * the "Foto requerida" tab (/app/employees?status=no-photo).
 *
 * Purpose:
 *   - Document the ecosystem photo standard in one place.
 *   - Provide a copy-only template admins can paste into WhatsApp/SMS
 *     to request a new professional photo (no DB writes, no automated
 *     notifications, no enforcement).
 *
 * Safety:
 *   - Pure UI. No RLS, no payroll, no time_entries, no shifts,
 *     no portal permissions, no notifications, no AI, no photo deletes.
 *   - "Pedir nueva foto" is intentionally disabled (planned for
 *     Photo Review Status v2).
 *
 * Future (Photo Review Status v2 — NOT in this sprint):
 *   - employees.photo_status, photo_reviewed_at, photo_reviewed_by,
 *     photo_rejection_reason + audit log
 *   - Worker notification flow (WhatsApp/Push)
 *   - Optional deadline/grace period
 *   - AI professional photo assistant (crop face / clean background /
 *     lighting / formal attire) with worker + admin approval before
 *     replacing the original photo.
 */

export type PhotoFilterKey = "all" | "missing" | "unreviewed" | "rejected" | "approved";

interface Props {
  photoFilter: PhotoFilterKey;
  onPhotoFilterChange: (next: PhotoFilterKey) => void;
  counts: { all: number; missing: number; unreviewed: number; rejected: number; approved: number };
}

const ACCEPTED = [
  "Rostro visible",
  "Cabeza y hombros",
  "Fondo limpio",
  "Buena iluminación",
  "Sin filtros fuertes",
];

const NOT_ACCEPTED = [
  "Gatos / mascotas",
  "Paisajes",
  "Logos",
  "Caricaturas",
  "Fotos grupales",
  "Contenido sugestivo",
  "Borrosa o muy oscura",
];

const REQUEST_TEMPLATE =
  "Hola 👋, necesitamos actualizar tu foto profesional en Stafly. " +
  "Por favor sube una foto tipo documento: rostro claro, cabeza y hombros, fondo limpio y buena iluminación. " +
  "Evita paisajes, logos, caricaturas, mascotas o fotos grupales. " +
  "Puedes subirla desde el portal en Actualizar mi información → Foto profesional. ¡Gracias!";

export function PhotoReviewCriteriaCard({ photoFilter, onPhotoFilterChange, counts }: Props) {
  const { toast } = useToast();

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(REQUEST_TEMPLATE);
      toast({
        title: "Mensaje copiado",
        description: "Pégalo en WhatsApp o SMS para pedir una nueva foto.",
      });
    } catch {
      toast({
        title: "No se pudo copiar",
        description: "Selecciona y copia el texto manualmente.",
        variant: "destructive",
      });
    }
  };

  const filterPills: { key: PhotoFilterKey; label: string; count: number }[] = [
    { key: "all", label: "Todas", count: counts.all },
    { key: "missing", label: "Sin foto", count: counts.missing },
    { key: "unreviewed", label: "Subida sin revisar", count: counts.unreviewed },
    { key: "rejected", label: "Rechazadas", count: counts.rejected },
    { key: "approved", label: "Aprobadas", count: counts.approved },
  ];

  return (
    <div className="rounded-2xl border border-warning/25 bg-warning/[0.04] p-3 sm:p-4 space-y-3">
      {/* Header + filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5 text-warning" />
          <span className="text-[10px] uppercase tracking-wide text-warning font-semibold">
            Cola de revisión de fotos
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {filterPills.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onPhotoFilterChange(opt.key)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-semibold border transition inline-flex items-center gap-1",
                photoFilter === opt.key
                  ? "bg-warning text-warning-foreground border-warning"
                  : "bg-card text-muted-foreground border-border hover:text-foreground",
              )}
            >
              {opt.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[9px]",
                  photoFilter === opt.key
                    ? "bg-warning-foreground/15 text-warning-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {opt.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Foto tipo documento: rostro claro, fondo limpio y buena iluminación. La foto profesional
        es requerida para mantener al trabajador listo para nuevas oportunidades, pero
        nunca bloquea el acceso al portal.
      </p>

      {/* Accepted / Not accepted */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700 dark:text-emerald-300">
              Aceptado
            </span>
          </div>
          <ul className="space-y-0.5">
            {ACCEPTED.map((item) => (
              <li key={item} className="text-[11px] text-foreground/80 flex items-start gap-1">
                <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-destructive/20 bg-destructive/[0.05] p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <XCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-[10px] uppercase tracking-wide font-semibold text-destructive">
              No aceptado
            </span>
          </div>
          <ul className="space-y-0.5">
            {NOT_ACCEPTED.map((item) => (
              <li key={item} className="text-[11px] text-foreground/80 flex items-start gap-1">
                <span className="text-destructive mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Admin actions — copy-only, no DB writes */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={handleCopyMessage}>
          <CopyIcon className="h-3 w-3 mr-1.5" />
          Copiar mensaje
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px] opacity-60" disabled title="Próximamente — Photo Review Status v2">
          Pedir nueva foto · próximamente
        </Button>
        <span className="text-[10.5px] text-muted-foreground">
          Abre el perfil del trabajador para revisar la foto subida.
        </span>
      </div>
    </div>
  );
}
