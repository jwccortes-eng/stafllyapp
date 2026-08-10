/**
 * NextStepCard — Principio 5: cada acción importante genera la siguiente
 * recomendación. El coordinador nunca tiene que descubrir el problema solo.
 *
 * UI-only: no muta nada, sólo enfoca la sección correspondiente del editor.
 */
import { memo } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusServiceSection } from "@/lib/shifts/service-publish-readiness";
import type { ServicePreparation } from "@/lib/shifts/service-preparation";

interface Props {
  preparation: ServicePreparation;
  className?: string;
}

function NextStepCardImpl({ preparation, className }: Props) {
  const next = preparation.nextAction;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/40 bg-card px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Siguiente paso
        </span>
      </div>
      {next ? (
        <>
          <p className="mt-1.5 text-[12px] font-semibold leading-tight">{next.label}</p>
          <p className="text-[11px] text-muted-foreground">{next.hint}</p>
          {next.anchorId && (
            <button
              type="button"
              onClick={() => focusServiceSection(next.anchorId!)}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80"
            >
              Ir a esa sección <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </>
      ) : (
        <p className="mt-1.5 text-[12px] font-semibold leading-tight">
          Nada pendiente. Este servicio está listo para operar.
        </p>
      )}
    </div>
  );
}

export const NextStepCard = memo(NextStepCardImpl);
