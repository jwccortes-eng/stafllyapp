/**
 * PersonStatusMatrix — visualización canónica de las 4 dimensiones.
 * Cada dimensión se muestra por separado y etiquetada: nunca se mezclan
 * identidad, portal, cumplimiento y asignabilidad en un mismo badge.
 */
import { cn } from "@/lib/utils";
import {
  PERSON_DIMENSION_LABELS,
  type PersonStatus,
  type StatusTone,
} from "@/lib/people/person-status";

const TONE: Record<StatusTone, string> = {
  ok: "border-emerald-300/60 bg-emerald-50 text-emerald-700",
  info: "border-sky-300/60 bg-sky-50 text-sky-700",
  warn: "border-amber-300/60 bg-amber-50 text-amber-700",
  critical: "border-rose-300/60 bg-rose-50 text-rose-700",
  muted: "border-border/60 bg-muted/40 text-muted-foreground",
};

interface Props {
  status: PersonStatus;
  /** `inline` = una línea compacta (selectores). `grid` = ficha de perfil. */
  variant?: "inline" | "grid";
  className?: string;
}

export function PersonStatusMatrix({ status, variant = "grid", className }: Props) {
  const rows = [
    { key: "identity", label: PERSON_DIMENSION_LABELS.identity, d: status.identity },
    { key: "portal", label: PERSON_DIMENSION_LABELS.portal, d: status.portal },
    { key: "compliance", label: PERSON_DIMENSION_LABELS.compliance, d: status.compliance },
    { key: "assignability", label: PERSON_DIMENSION_LABELS.assignability, d: status.assignability },
  ];

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
        {rows.map((r) => (
          <span
            key={r.key}
            title={`${r.label}: ${r.d.label} — ${r.d.description}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-1 py-px text-[9px] font-semibold leading-none",
              TONE[r.d.tone],
            )}
          >
            <span className="opacity-60">{r.label}</span>
            {r.d.label}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {rows.map((r) => (
        <div key={r.key} className="rounded-md border border-border/50 bg-card px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {r.label}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold",
                TONE[r.d.tone],
              )}
            >
              {r.d.label}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {r.key === "assignability"
              ? status.assignability.reasons.length
                ? `Razón: ${status.assignability.reasons.join(" · ")}`
                : r.d.description
              : r.d.description}
          </p>
        </div>
      ))}
    </div>
  );
}

export default PersonStatusMatrix;
