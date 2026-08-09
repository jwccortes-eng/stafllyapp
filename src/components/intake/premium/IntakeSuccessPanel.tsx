/**
 * Smart Intake Premium Experience V1 — pantalla final de éxito.
 *
 * Reemplaza el toast simple cuando el lote terminó en borradores.
 * Presentacional puro: recibe el conteo ya calculado por el panel.
 */

import { Button } from "@/components/ui/button";
import { Check, PartyPopper } from "lucide-react";

export interface IntakeSuccessSummary {
  created: number;
  reusedClients: number;
  reusedVenues: number;
  aliasesLearned: number;
}

export function IntakeSuccessPanel({
  summary,
  onViewDrafts,
  onStartOver,
}: {
  summary: IntakeSuccessSummary;
  onViewDrafts: () => void;
  onStartOver: () => void;
}) {
  const lines = [
    `${summary.created} ${summary.created === 1 ? "Servicio" : "Servicios"}`,
    summary.reusedClients > 0 ? "Cliente reutilizado" : null,
    summary.reusedVenues > 0 ? "Venue reutilizado" : null,
    summary.aliasesLearned > 0 ? "Alias aprendido" : null,
  ].filter(Boolean) as string[];

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center animate-scale-in">
      <PartyPopper className="mx-auto h-7 w-7 text-primary" />
      <h3 className="mt-2 text-base font-semibold text-foreground">Todo listo</h3>
      <p className="mt-1 text-sm text-muted-foreground">Creamos:</p>
      <ul className="mx-auto mt-2 inline-flex flex-col items-start gap-1">
        {lines.map((l) => (
          <li key={l} className="flex items-center gap-2 text-sm text-foreground">
            <Check className="h-4 w-4 text-primary" />
            {l}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Todo quedó como borrador. Nada fue publicado.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button className="min-h-11" onClick={onViewDrafts}>
          Ver borradores
        </Button>
        <Button variant="ghost" className="min-h-11" onClick={onStartOver}>
          Traer más trabajo
        </Button>
      </div>
    </section>
  );
}

export default IntakeSuccessPanel;
