/**
 * Smart Intake Premium Experience V1 — tarjetas de entrada del asistente.
 *
 * Presentacional puro. Cambia sólo la forma de elegir el canal: el carril
 * canónico y los paneles reutilizados son exactamente los mismos.
 */

import { MessageSquareText, Mic, ImagePlus, FileText } from "lucide-react";

export type AssistantSourceKey = "text" | "audio" | "image" | "files";

const CARDS: Array<{
  key: AssistantSourceKey;
  title: string;
  icon: typeof MessageSquareText;
  emoji: string;
}> = [
  { key: "text", title: "WhatsApp / Texto", icon: MessageSquareText, emoji: "📱" },
  { key: "audio", title: "Nota de voz", icon: Mic, emoji: "🎤" },
  { key: "image", title: "Imagen", icon: ImagePlus, emoji: "📷" },
  { key: "files", title: "PDF / Excel", icon: FileText, emoji: "📄" },
];

const BLURB =
  "Puedes pegar cualquier información. Yo identificaré servicios, clientes, venues y contactos.";

export function AssistantSourceCards({
  value,
  onChange,
}: {
  value: AssistantSourceKey;
  onChange: (key: AssistantSourceKey) => void;
}) {
  return (
    <nav aria-label="Cómo te llegó la información" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map((card) => {
        const active = value === card.key;
        return (
          <button
            key={card.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(card.key)}
            className={`flex min-h-[104px] flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-all duration-200 ${
              active
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <card.icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
              {card.title}
            </span>
            <span className="text-xs leading-snug text-muted-foreground">{BLURB}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default AssistantSourceCards;
