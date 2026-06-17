/**
 * SourceProvenanceBadge — presentational chip indicating the provenance of a
 * derived value (legacy / new DB / mixed / none). Generalization of the
 * pattern introduced in Phase 1B.2 / 1B.3 for WorkerPassport.
 *
 * @status foundation-only — do not wire until E2 approved
 *
 * Pure render. No data fetching, no hooks.
 * See: docs/ECOSYSTEM_PROFILE_STANDARD.md
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProfileSource } from "@/lib/profile-layers";

const SOURCE_LABELS: Record<ProfileSource, string> = {
  legacy: "Fuente: legacy",
  db: "Fuente: nueva DB",
  mixed: "Fuente: mixta",
  none: "Sin datos",
};

const SOURCE_TOOLTIPS: Record<ProfileSource, string> = {
  legacy: "Valor derivado del sistema legacy (shift_reviews / useEmployeeReputation).",
  db: "Valor derivado del sistema nuevo (rep_scores / Reputation DB).",
  mixed: "Coexisten datos del sistema legacy y la nueva DB.",
  none: "Aún no hay datos suficientes para esta métrica.",
};

interface SourceProvenanceBadgeProps {
  source: ProfileSource;
  className?: string;
  /** Optional label override (e.g. "Categorías: legacy"). */
  label?: string;
}

export function SourceProvenanceBadge({
  source,
  className,
  label,
}: SourceProvenanceBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium", className)}
      title={SOURCE_TOOLTIPS[source]}
    >
      {label ?? SOURCE_LABELS[source]}
    </Badge>
  );
}
