/**
 * OX-4.2 — TeamConversationCard.
 *
 * El chat vive dentro del turno: comunicar al equipo no debe sacar al
 * operador de la superficie operativa. Compuesta con OperationalCard según
 * el contrato OX-4 (no es una card nueva de superficie).
 */
import * as React from "react";
import { MessageSquare, Send, Users } from "lucide-react";
import { OperationalCard } from "@/components/ocs";
import { MT } from "@/lib/mobile/mobile-scale";
import { cn } from "@/lib/utils";

export interface TeamConversationCardProps {
  /** Cuántas personas reciben el mensaje. */
  reachable: number;
  /** Cuántas no tienen canal de contacto. */
  unreachable: number;
  /** Abre el canal del turno. */
  onOpenChannel: () => void;
  /** Mensaje masivo por WhatsApp/SMS al equipo contactable. */
  onBroadcast?: () => void;
}

export function TeamConversationCard({
  reachable,
  unreachable,
  onOpenChannel,
  onBroadcast,
}: TeamConversationCardProps) {
  return (
    <OperationalCard
      status={unreachable > 0 ? "warning" : "informational"}
      statusLabel={unreachable > 0 ? `${unreachable} sin canal` : "Equipo contactable"}
      leading={
        <span
          aria-hidden
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          <MessageSquare className="h-4 w-4" />
        </span>
      }
      title="Conversación del turno"
      subtitle="Todo lo que se acuerde queda junto a la operación"
      primary={
        <p className={cn(MT.body)}>
          {reachable > 0
            ? `${reachable} ${reachable === 1 ? "persona puede recibir" : "personas pueden recibir"} avisos ahora.`
            : "Nadie del equipo tiene canal de contacto todavía."}
        </p>
      }
      secondary={
        unreachable > 0
          ? `${unreachable} ${unreachable === 1 ? "persona quedaría fuera" : "personas quedarían fuera"} del aviso.`
          : undefined
      }
      action={{
        label: "Abrir conversación",
        icon: Users,
        onClick: onOpenChannel,
      }}
      actions={
        onBroadcast && reachable > 0
          ? [{ label: "Avisar al equipo", icon: Send, onClick: onBroadcast }]
          : undefined
      }
      variant="standard"
    />
  );
}
