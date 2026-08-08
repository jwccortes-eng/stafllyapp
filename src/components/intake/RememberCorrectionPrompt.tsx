/**
 * Smart Service Intake — FASE 5: "¿Recordamos esta corrección?"
 *
 * Única superficie donde el diccionario del tenant APRENDE. Nunca se
 * dispara sola: sólo después de que una persona confirma explícitamente
 * la interpretación correcta de un término dentro de la bandeja.
 *
 * Reglas de superficie:
 *  - no crea servicios, no publica, no toca payroll;
 *  - el aprendizaje es opcional: "Sólo esta vez" es una salida legítima;
 *  - si el término colisiona con otra interpretación, se explica y no se
 *    aplica nada de forma automática.
 */
import { useCallback, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookMarked, Loader2 } from "lucide-react";
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import { canLearnCorrection, type DictionaryRuleType } from "@/lib/intake/dictionary";
import { proposeDictionaryRule } from "@/lib/intake/dictionary-store";

export interface PendingCorrection {
  ruleType: DictionaryRuleType;
  /** Término tal como apareció en la fuente. */
  rawValue: string;
  /** Interpretación confirmada por la persona. */
  resolvedValue: string;
  resolvedEntityId?: string | null;
  resolvedEntityKind?: "location" | "client" | "none";
}

const KIND_COPY: Record<DictionaryRuleType, string> = {
  venue_alias: "este lugar",
  client_alias: "este cliente",
  service_type_alias: "este tipo de servicio",
  role_alias: "este rol",
  abbreviation: "esta abreviación",
  spelling_variant: "esta forma de escribirlo",
};

export function useRememberCorrection(
  companyId: string | null | undefined,
  source: string,
) {
  const [pending, setPending] = useState<PendingCorrection | null>(null);
  const [saving, setSaving] = useState(false);

  const ask = useCallback(
    (correction: PendingCorrection) => {
      if (!companyId) return;
      const verdict = canLearnCorrection({
        rawValue: correction.rawValue,
        resolvedValue: correction.resolvedValue,
      });
      if (!verdict.learnable) return;
      setPending(correction);
    },
    [companyId],
  );

  const close = useCallback(() => {
    if (!saving) setPending(null);
  }, [saving]);

  const confirm = useCallback(async () => {
    if (!companyId || !pending) return;
    setSaving(true);
    try {
      const result = await proposeDictionaryRule({
        companyId,
        ruleType: pending.ruleType,
        inputValue: pending.rawValue,
        resolvedValue: pending.resolvedValue,
        resolvedEntityId: pending.resolvedEntityId ?? null,
        resolvedEntityKind: pending.resolvedEntityKind ?? "none",
        source,
        surface: "service-intake-inbox",
      });

      if (result.status === "created" || result.status === "reinforced") {
        notifySuccess({
          title: "Corrección recordada",
          fact: `A partir de ahora “${pending.rawValue}” se interpreta como “${pending.resolvedValue}” en esta empresa.`,
          consequence: "Se aplicará en texto, imagen, PDF y notas de voz. Nada se comparte con otras empresas.",
        });
      } else if (result.status === "conflict") {
        notifyWarning({
          title: "Ese término ya significa otra cosa",
          fact: result.message,
          consequence: "No cambiamos nada. Revisa el diccionario de la empresa para decidir cuál queda activa.",
        });
      } else {
        notifyInfo({
          title: "No guardamos la corrección",
          fact: result.message,
          consequence: "El servicio que estás revisando no se vio afectado.",
        });
      }
      setPending(null);
    } catch (error) {
      notifyError({
        title: "No pudimos guardar la corrección",
        fact: "El diccionario de la empresa no se actualizó.",
        consequence: "Tu revisión sigue intacta. Puedes reintentar.",
        cause: error,
      });
    } finally {
      setSaving(false);
    }
  }, [companyId, pending, source]);

  const dialog = (
    <Dialog open={!!pending} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookMarked className="h-4 w-4 text-primary" />
            ¿Recordamos esta corrección?
          </DialogTitle>
          <DialogDescription className="text-sm leading-snug">
            {pending
              ? `La próxima vez que llegue “${pending.rawValue}”, Stafly lo interpretará como “${pending.resolvedValue}” para ${KIND_COPY[pending.ruleType]}.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <p className="text-[12px] text-muted-foreground">
          Sólo aplica a esta empresa. No cambia servicios ya creados ni datos de pago,
          y siempre puedes desactivarlo en el diccionario de la empresa.
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full h-11 rounded-xl gap-2" onClick={confirm} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookMarked className="h-4 w-4" />}
            Recordarlo para esta empresa
          </Button>
          <Button variant="ghost" className="w-full h-11 rounded-xl" onClick={close} disabled={saving}>
            Sólo esta vez
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { ask, dialog };
}
