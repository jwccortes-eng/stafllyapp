/**
 * OX-4.4 — Puente hacia el Centro de Validación.
 *
 * Las superficies que antes ejecutaban decisiones terminales duplicadas
 * (cierre de turno, cola de payroll, revisión de cierre) muestran ahora
 * resumen + progreso y envían la decisión al centro canónico.
 */
import { useNavigate } from "react-router-dom";
import { ArrowRight, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MT } from "@/lib/mobile/mobile-scale";
import { cn } from "@/lib/utils";

interface ValidationDeepLinkProps {
  shiftId?: string | null;
  /** Qué queda pendiente, en una frase. */
  summary: string;
  /** Detalle opcional del progreso ("3 de 8 aprobadas"). */
  progress?: string | null;
  label?: string;
  className?: string;
}

export function ValidationDeepLink({
  shiftId,
  summary,
  progress,
  label = "Ir al Centro de Validación",
  className,
}: ValidationDeepLinkProps) {
  const navigate = useNavigate();
  const to = shiftId
    ? `/app/validation-center?shiftId=${shiftId}`
    : "/app/validation-center";

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-muted/30 p-3.5 space-y-2.5",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground"
        >
          <Scale className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className={MT.label}>{summary}</p>
          <p className={cn(MT.caption, "text-muted-foreground")}>
            {progress ? `${progress} · ` : ""}
            Las decisiones de horas y cierre se toman en un solo lugar para
            evitar aprobaciones contradictorias.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 w-full sm:w-auto"
        onClick={() => navigate(to)}
      >
        {label}
        <ArrowRight className="h-4 w-4 ml-1.5" />
      </Button>
    </div>
  );
}
