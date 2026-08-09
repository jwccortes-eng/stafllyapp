/**
 * Smart Intake Premium Experience V1 — progreso narrativo.
 *
 * Sustituye el spinner genérico. Sin porcentajes: pasos que se completan
 * con ritmo rápido (150–250 ms) mientras el pipeline real trabaja.
 * Puramente visual; no controla ni conoce el pipeline.
 */

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

const STEPS = [
  "Leyendo información",
  "Detectando fechas",
  "Detectando horarios",
  "Detectando servicios",
  "Buscando clientes",
  "Buscando venues",
  "Buscando contactos",
  "Revisando duplicados",
  "Consultando memoria de la empresa",
  "Preparando recomendaciones",
];

export function AnalyzingNarrative({ active }: { active: boolean }) {
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!active) {
      setDone(0);
      return;
    }
    const id = window.setInterval(() => {
      setDone((d) => (d < STEPS.length - 1 ? d + 1 : d));
    }, 220);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 animate-fade-in">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Analizando…
      </p>
      <ul className="mt-3 space-y-1.5">
        {STEPS.slice(0, done + 1).map((step, i) => (
          <li
            key={step}
            className="flex items-center gap-2 text-sm text-muted-foreground animate-fade-in"
          >
            {i < done ? (
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            )}
            {step}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AnalyzingNarrative;
