import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link2, Save } from "lucide-react";
import { notifySuccess, notifyWarning } from "@/lib/feedback/notify";
import { useConnecteamMapping } from "@/hooks/useConnecteamMapping";
import {
  CONNECTEAM_MAPPING_COPY,
  mappingKey,
  mostReusableSubject,
  suggestJobFromSubject,
  type MappingSubject,
} from "@/lib/integrations/connecteam-mapping";


interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Sujetos disponibles del servicio: venue → cliente → título. */
  subjects: MappingSubject[];
  /** Cuántos servicios de esta vista reutilizarán el destino al guardarlo. */
  impactCount?: number;
}

const KIND_LABEL: Record<MappingSubject["kind"], string> = {
  location: "Lugar",
  client: "Cliente",
  title: "Título del servicio",
};

/**
 * "Resolver ahora" — declara el destino Connecteam (Job / Sub item) del
 * cliente/venue del servicio, sin salir del contexto actual.
 *
 * No crea Jobs en Connecteam: solo declara a qué Job existente pertenece este
 * cliente/venue en la cuenta de ESTA compañía.
 */
export function ConnecteamMappingSheet({ open, onOpenChange, subjects, impactCount }: Props) {
  const { mapping, jobs, subItemsFor, saveMapping, saving } = useConnecteamMapping();

  const [subjectKey, setSubjectKey] = useState<string>("");
  const [job, setJob] = useState("");
  const [subItem, setSubItem] = useState("");

  const subject = useMemo(
    () => subjects.find(s => `${s.kind}:${s.id}` === subjectKey) ?? subjects[0] ?? null,
    [subjects, subjectKey],
  );

  /** Selecciona un sujeto y carga su destino ya declarado (si existe). */
  const selectSubject = (s: MappingSubject) => {
    setSubjectKey(`${s.kind}:${s.id}`);
    const existing = mapping.entries[mappingKey(s.kind, s.id)];
    setJob(existing?.job ?? "");
    setSubItem(existing?.subItem ?? "");
  };

  useEffect(() => {
    if (!open) return;
    // Por defecto, el sujeto MÁS REUTILIZABLE (cliente), no el más específico.
    const first = mostReusableSubject(subjects);
    setSubjectKey(first ? `${first.kind}:${first.id}` : "");
    const existing = first ? mapping.entries[mappingKey(first.kind, first.id)] : undefined;
    setJob(existing?.job ?? "");
    setSubItem(existing?.subItem ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subjects]);

  const suggestion = suggestJobFromSubject(subject);
  const showSuggestion = !!suggestion && suggestion !== job.trim().toUpperCase();



  const handleSave = () => {
    if (!subject) {
      notifyWarning({
        title: "No hay a qué asociar el destino",
        fact: "Este servicio no tiene cliente, lugar ni título.",
        consequence: "Confirma el cliente o el lugar antes de configurar Connecteam.",
      });
      return;
    }
    if (!job.trim()) {
      notifyWarning({
        title: "Falta el Job de Connecteam",
        fact: "El Job debe escribirse exactamente como existe en Connecteam.",
        consequence: "Sin Job la fila caería en \"Select\" y quedaría fuera del reporting.",
      });
      return;
    }
    saveMapping(subject, { job, subItem });
    notifySuccess({
      title: "Destino Connecteam configurado",
      fact: `${subject.label} → Job "${job.trim()}"${subItem.trim() ? ` / Sub item "${subItem.trim()}"` : ""}.`,
      consequence: "Los próximos servicios de este cliente o lugar lo reutilizan automáticamente.",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            {CONNECTEAM_MAPPING_COPY.missingTitle}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {CONNECTEAM_MAPPING_COPY.missingReason} Escribe el Job y el Sub item EXACTOS de tu
            cuenta de Connecteam. Stafly no crea Jobs en Connecteam.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Se recuerda para</Label>
            <div className="flex flex-wrap gap-1.5">
              {subjects.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Confirma primero el cliente o el lugar del servicio.
                </p>
              )}
              {subjects.map(s => {
                const key = `${s.kind}:${s.id}`;
                const active = key === subjectKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSubjectKey(key)}
                    className={`rounded-full border px-3 py-1.5 text-xs min-h-[36px] ${
                      active
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border/50 text-muted-foreground"
                    }`}
                  >
                    {KIND_LABEL[s.kind]}: {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-job" className="text-xs">Job de Connecteam</Label>
            <Input
              id="ct-job"
              value={job}
              onChange={e => setJob(e.target.value)}
              placeholder="Ej. Millennium"
              list="ct-known-jobs"
            />
            <datalist id="ct-known-jobs">
              {jobs.map(j => <option key={j} value={j} />)}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-subitem" className="text-xs">Sub item (opcional)</Label>
            <Input
              id="ct-subitem"
              value={subItem}
              onChange={e => setSubItem(e.target.value)}
              placeholder="Ej. Events"
              list="ct-known-subitems"
            />
            <datalist id="ct-known-subitems">
              {subItemsFor(job).map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          <p className="text-[11px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px] mr-1.5">Solo esta compañía</Badge>
            {CONNECTEAM_MAPPING_COPY.remember}. Nunca se comparte con otras compañías.
          </p>
        </div>

        <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            Guardar destino
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
