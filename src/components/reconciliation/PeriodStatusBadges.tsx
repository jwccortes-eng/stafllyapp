import { Badge } from "@/components/ui/badge";
import { Lock, ShieldAlert } from "lucide-react";

/**
 * Visual badges + lock indicators for the Reconciliation period header.
 * Pure presentational — no business logic, no payroll math.
 */

const STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  // Open / in-progress
  open:           { label: "Abierto",     className: "border-emerald-500/50 text-emerald-700 bg-emerald-500/10" },
  importing:      { label: "Importando",  className: "border-info/40 text-info bg-info/10" },
  normalizing:    { label: "Normalizando",className: "border-info/40 text-info bg-info/10" },
  matching:       { label: "Matching",    className: "border-info/40 text-info bg-info/10" },
  reviewing:      { label: "En revisión", className: "border-amber-500/50 text-amber-700 bg-amber-500/10" },
  review:         { label: "En revisión", className: "border-amber-500/50 text-amber-700 bg-amber-500/10" },
  needs_attention:{ label: "Pendiente",   className: "border-amber-500/60 text-amber-700 bg-amber-500/10" },
  pending:        { label: "Pendiente",   className: "border-amber-500/50 text-amber-700 bg-amber-500/10" },
  draft:          { label: "Borrador",    className: "border-muted text-muted-foreground bg-muted/40" },
  reopened:       { label: "Reabierto",   className: "border-amber-500/50 text-amber-700 bg-amber-500/10" },
  not_closed:     { label: "Sin cerrar",  className: "border-amber-500/50 text-amber-700 bg-amber-500/10" },
  // Closed / final
  approved:       { label: "Aprobado",    className: "border-primary/50 text-primary bg-primary/10" },
  posted:         { label: "Publicado",   className: "border-primary/50 text-primary bg-primary/10" },
  published:      { label: "Publicado",   className: "border-primary/50 text-primary bg-primary/10" },
  closed:         { label: "Cerrado",     className: "border-muted-foreground/40 text-muted-foreground bg-muted/40" },
  locked:         { label: "Cerrado",     className: "border-muted-foreground/40 text-muted-foreground bg-muted/40" },
  paid:           { label: "Pagado",      className: "border-earning/50 text-earning bg-earning/10" },
};

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const meta = STATUS_META[status.toLowerCase()];
  if (!meta) {
    return (
      <Badge variant="outline" className="text-[11px] capitalize">
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`text-[11px] ${meta.className}`}>
      {meta.label}
    </Badge>
  );
}

/**
 * Small lock indicator pinned next to a critical action button to make it
 * visually obvious that the action is gated by a strong confirmation when
 * the active period is in the future. Does not change behavior — the actual
 * confirm prompt lives in `confirmFutureAction` in the parent.
 */
export function FutureLockBadge({
  show,
  label = "Bloqueado: período futuro",
}: {
  show: boolean;
  label?: string;
}) {
  if (!show) return null;
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-amber-500/50 text-amber-700 bg-amber-500/10 text-[10px] font-medium"
    >
      <Lock className="h-3 w-3" />
      Futuro
    </span>
  );
}

/**
 * Full-width banner shown when the admin MANUALLY selects a future period.
 * Makes it explicit that this was a manual override, not the auto-default.
 */
export function ManualFutureNotice({
  show,
  periodLabel,
}: {
  show: boolean;
  periodLabel?: string;
}) {
  if (!show) return null;
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-3">
      <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-semibold text-amber-800 dark:text-amber-200">
          Este período es futuro. No debe usarse para payroll real todavía.
        </p>
        <p className="text-xs text-amber-700/90 dark:text-amber-300/80 mt-0.5">
          Selección manual del administrador
          {periodLabel ? ` · ${periodLabel}` : ""}. La selección automática
          nunca abre periodos futuros — todas las acciones críticas
          (reprocesar, cargar Truth File, reconciliar, aprobar, publicar,
          cerrar) requerirán confirmación adicional.
        </p>
      </div>
    </div>
  );
}
