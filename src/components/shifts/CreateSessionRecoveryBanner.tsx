/**
 * P0.4 — Aviso de sesión de creación sin finalizar.
 *
 * No restaura nada por su cuenta: pone la decisión en manos del operador.
 * Mismo copy en móvil y desktop.
 */
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  companyName?: string | null;
  updatedAt: number;
  onContinue: () => void;
  onDiscard: () => void;
}

export function CreateSessionRecoveryBanner({ companyName, updatedAt, onContinue, onDiscard }: Props) {
  const relative = formatDistanceToNow(new Date(updatedAt), { addSuffix: true, locale: es });

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 rounded-full bg-background inline-flex items-center justify-center shrink-0">
          <RotateCw className="h-4 w-4 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Recuperamos una creación de turno sin finalizar</p>
          {companyName && (
            <p className="text-[14px] text-foreground/80 break-words">{companyName}</p>
          )}
          <p className="text-[13px] text-muted-foreground">Guardado {relative}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-[44px]" onClick={onContinue}>Continuar</Button>
        <Button variant="ghost" className="min-h-[44px]" onClick={onDiscard}>Descartar</Button>
      </div>
    </div>
  );
}
