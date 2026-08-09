/**
 * Smart Intake Premium Experience V1 — "Entendí esto", "También recordé" y "Vamos a".
 *
 * Presentacional puro. Lee `buildUnderstanding` (módulo puro) sobre los
 * candidatos que el pipeline canónico ya produjo. No escribe nada.
 */

import { Check, AlertTriangle, Brain, ListChecks, Plus } from "lucide-react";
import type { ServiceCandidate } from "@/lib/intake";
import { buildUnderstanding } from "@/lib/intake/understanding";

export function UnderstoodPanel({ candidates }: { candidates: ServiceCandidate[] }) {
  const { lines, memory, plan, serviceCount } = buildUnderstanding(candidates);
  if (serviceCount === 0) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-2 animate-fade-in">
      <section className="rounded-2xl border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Entendí esto</h3>
        <ul className="mt-2 space-y-1.5">
          {lines.map((l, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {l.tone === "ok" ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className={l.tone === "ok" ? "text-foreground" : "text-muted-foreground"}>
                {l.text}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          No crearé nada hasta que lo confirmes.
        </p>
      </section>

      <div className="space-y-3">
        {memory.length > 0 && (
          <section className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Brain className="h-4 w-4 text-primary" />
              También recordé
            </h3>
            <ul className="mt-2 space-y-1.5">
              {memory.map((m, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {m}
                </li>
              ))}
            </ul>
          </section>
        )}

        {plan.length > 0 && (
          <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ListChecks className="h-4 w-4 text-primary" />
              Vamos a
            </h3>
            <ul className="mt-2 space-y-1.5">
              {plan.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  {p.kind === "reuse" ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  {p.text}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Nunca publicaré nada automáticamente.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

export default UnderstoodPanel;
