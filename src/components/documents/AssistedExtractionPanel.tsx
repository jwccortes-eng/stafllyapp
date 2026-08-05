/**
 * AssistedExtractionPanel — admin-only suggestion form for document fields.
 *
 * v1: only the expiration date can be confirmed (writes to employee_documents.expires_at
 * via the existing updateDocumentExpiration helper). Other fields are display-only
 * suggestions until the v1.1 extraction schema is approved.
 *
 * "Leer documento (beta)" calls the document-extract edge function which returns
 * suggestions ONLY — nothing is written to the database server-side. The admin
 * must still click "Confirmar fecha" to persist the expiration date.
 *
 * Privacy:
 *  - Document numbers are always masked (last 4 only).
 *  - For w9 / tax_form categories the AI button is hidden.
 *  - The raw document number is never stored in component state.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles, Loader2, Info, Lock, Check,
} from "lucide-react";
import {
  type DocumentExtraction,
  isExtractionAllowed,
  maskDocumentNumber,
} from "@/lib/documents/extraction-types";
import { inferDocumentSide } from "@/lib/documents/document-policy";
import { updateDocumentExpiration } from "@/lib/document-actions";

export interface AssistedExtractionTarget {
  raw_id: string;
  source: "employee_documents" | "employee_onboarding_documents";
  employee_id: string;
  company_id: string;
  name: string;
  category: string;
  current_expires_at: string | null;
  /** VWC Fase 3B: versión observada del documento. */
  version?: number | null;
}

interface Props {
  target: AssistedExtractionTarget;
  /** Called after the expiration has been saved successfully. */
  onSaved?: () => void;
}

interface ExtractionDraft {
  fullName: string;
  docType: string;
  docNumberMasked: string | null;
  issueDate: string;
  expiration: string;
  state: string;
}

const extractionDrafts = new Map<string, ExtractionDraft>();

export default function AssistedExtractionPanel({ target, onSaved }: Props) {
  const { toast } = useToast();
  const blocked = !isExtractionAllowed(target.category);
  const editable = target.source === "employee_documents";

  // Field state — none of this is persisted in v1 except expiration.
  const initialDraft = extractionDrafts.get(target.raw_id);
  const [fullName, setFullName] = useState(initialDraft?.fullName ?? "");
  const [docType, setDocType] = useState(initialDraft?.docType ?? "");
  const [docNumberMasked, setDocNumberMasked] = useState<string | null>(initialDraft?.docNumberMasked ?? null);
  const [issueDate, setIssueDate] = useState(initialDraft?.issueDate ?? "");
  const [expiration, setExpiration] = useState(initialDraft?.expiration ?? target.current_expires_at ?? "");
  const [state, setState] = useState(initialDraft?.state ?? "");
  const [confidence, setConfidence] = useState<string | null>(null);
  const [source, setSource] = useState<"manual" | "ai" | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [savingExp, setSavingExp] = useState(false);

  useEffect(() => {
    extractionDrafts.set(target.raw_id, {
      fullName, docType, docNumberMasked, issueDate, expiration, state,
    });
  }, [target.raw_id, fullName, docType, docNumberMasked, issueDate, expiration, state]);

  const handleReadWithAI = async () => {
    if (blocked) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        extraction?: DocumentExtraction;
        error?: string;
      }>("document-extract", {
        body: { employee_document_id: target.raw_id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const e = data?.extraction;
      if (!e) throw new Error("Sin resultado.");

      if (e.extracted_full_name) setFullName(e.extracted_full_name);
      if (e.extracted_document_type) setDocType(e.extracted_document_type);
      if (e.extracted_document_number_masked) setDocNumberMasked(e.extracted_document_number_masked);
      if (e.extracted_issue_date) setIssueDate(e.extracted_issue_date);
      if (e.extracted_expiration_date) setExpiration(e.extracted_expiration_date);
      if (e.extracted_state_or_jurisdiction) setState(e.extracted_state_or_jurisdiction);
      setConfidence(e.confidence_level ?? null);
      setSource("ai");

      toast({
        title: "Sugerencias listas",
        description: "Revisa y confirma manualmente. Nada se guardó automáticamente.",
      });
    } catch (err: any) {
      console.warn("document-extract failed:", err);
      toast({
        title: "No pudimos leerlo automáticamente",
        description: "Puedes completar los datos manualmente.",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleConfirmExpiration = async () => {
    if (!editable) return;
    setSavingExp(true);
    const { error } = await updateDocumentExpiration(
      {
        raw_id: target.raw_id,
        source: "employee_documents",
        employee_id: target.employee_id,
        company_id: target.company_id,
        name: target.name,
        category: target.category,
        version: target.version ?? null,
      },
      expiration || null,
    );
    setSavingExp(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "Fecha de vencimiento confirmada" });
    extractionDrafts.delete(target.raw_id);
    onSaved?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Extracción asistida
        </h4>
        {source === "ai" && (
          <Badge variant="outline" className="text-[10px]">
            <Sparkles className="h-2.5 w-2.5 mr-1" /> Sugerencia AI
            {confidence && <span className="ml-1 opacity-70">· {confidence}</span>}
          </Badge>
        )}
      </div>

      <Alert className="py-2 px-3">
        <Info className="h-3.5 w-3.5" />
        <AlertDescription className="text-[11px] leading-snug">
          Estos datos son sugerencias. Solo la fecha de vencimiento confirmada por un administrador
          se guarda. El número de documento siempre se muestra enmascarado.
        </AlertDescription>
      </Alert>

      {!blocked && inferDocumentSide(target.name) === "back" && (
        <Alert className="py-2 px-3">
          <Info className="h-3.5 w-3.5" />
          <AlertDescription className="text-[11px]">
            La extracción funciona mejor con el frente del documento.
          </AlertDescription>
        </Alert>
      )}

      {blocked ? (
        <Alert className="py-2 px-3">
          <Lock className="h-3.5 w-3.5" />
          <AlertDescription className="text-[11px]">
            Categoría sensible — extracción asistida deshabilitada.
          </AlertDescription>
        </Alert>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full h-8 text-[11px]"
          onClick={handleReadWithAI}
          disabled={aiLoading}
        >
          {aiLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          )}
          Leer documento (beta)
        </Button>
      )}

      <div className="space-y-2">
        <Field label="Nombre completo">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label="Tipo de documento">
          <Input value={docType} onChange={(e) => setDocType(e.target.value)} className="h-8 text-xs" placeholder="p. ej. Driver's License" />
        </Field>
        <Field label="Número (enmascarado)">
          <Input
            value={docNumberMasked ?? ""}
            onChange={(e) => setDocNumberMasked(maskDocumentNumber(e.target.value))}
            onBlur={(e) => setDocNumberMasked(maskDocumentNumber(e.target.value))}
            className="h-8 text-xs font-mono"
            placeholder="••• ••• 1234"
          />
        </Field>
        <Field label="Estado / jurisdicción">
          <Input value={state} onChange={(e) => setState(e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label="Fecha de emisión">
          <SmartDateInput value={issueDate} onChange={setIssueDate} allowClear />
        </Field>
        <Field label="Fecha de vencimiento" highlight>
          <SmartDateInput value={expiration} onChange={setExpiration} allowClear showCalendar />
        </Field>
      </div>

      {editable ? (
        <>
          <Button
            type="button"
            size="sm"
            className="w-full h-8 text-[11px]"
            onClick={handleConfirmExpiration}
            disabled={savingExp}
            title="Solo actualiza la fecha de vencimiento. No aprueba el documento."
          >
            {savingExp ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
            Guardar fecha de vencimiento
          </Button>
          <p className="text-[10.5px] text-amber-700/90 leading-snug">
            Guardar cambios <strong>no aprueba</strong> el documento — solo actualiza metadata (fecha de vencimiento).
            El estado permanece <strong>Pendiente de revisión</strong>.
          </p>
        </>
      ) : (
        <p className="text-[10px] text-muted-foreground italic">
          Edición de vencimiento disponible solo para documentos de admin en esta versión.
        </p>
      )}

      <p className="text-[10px] text-muted-foreground/70 leading-snug">
        v1 guarda únicamente la fecha de vencimiento. El resto de los campos quedan como sugerencia
        hasta que se apruebe el esquema de extracción persistente. La aprobación formal (con audit trail)
        aún no está disponible en este modal.
      </p>
    </div>
  );
}

function Field({ label, children, highlight }: { label: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className={`text-[10px] uppercase tracking-wider ${highlight ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
        {label}
      </Label>
      {children}
    </div>
  );
}
