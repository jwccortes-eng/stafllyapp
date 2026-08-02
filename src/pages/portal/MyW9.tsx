/**
 * /portal/w9 — Worker W-9 Guided Form v1.
 *
 * Safety:
 *  - Raw SSN/EIN lives only in component state during this submission.
 *  - On submit: build PDF client-side with masked TIN, upload to private
 *    `employee-documents` bucket, write contractor_w9 row + employee_documents
 *    row (category='w9', review_status='pending'). Raw TIN is then discarded.
 *  - `contractor_w9` stores ONLY `tin_last4` + `tax_id_type` + masked metadata.
 */
import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, CheckCircle2, ShieldCheck, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TAX_CLASSIFICATIONS,
  LLC_TAX_CLASSES,
  TAX_ID_TYPES,
  w9Schema,
  lastFour,
  maskTin,
  type W9FormValues,
} from "@/lib/w9/w9-types";
import { buildW9PDF } from "@/lib/w9/w9-pdf";

const BUCKET = "employee-documents";

export default function MyW9() {
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<any>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Form state
  const [legalName, setLegalName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [taxClass, setTaxClass] = useState<W9FormValues["tax_classification"]>("individual");
  const [llcClass, setLlcClass] = useState<"C" | "S" | "P" | "">("");
  const [exemptPayee, setExemptPayee] = useState("");
  const [fatca, setFatca] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zip, setZip] = useState("");
  const [accountNumbers, setAccountNumbers] = useState("");
  const [taxIdType, setTaxIdType] = useState<"ssn" | "ein">("ssn");
  const [tin, setTin] = useState("");
  const [certAccepted, setCertAccepted] = useState(false);
  const [signature, setSignature] = useState("");

  useEffect(() => {
    if (!employeeId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  async function load() {
    setLoading(true);
    const { data: emp } = await supabase
      .from("employees")
      .select("company_id, first_name, last_name, companies:companies!employees_company_id_fkey(name)")
      .eq("id", employeeId!)
      .maybeSingle();

    if (!emp) {
      setLoading(false);
      return;
    }
    setCompanyId(emp.company_id);
    setCompanyName((emp as any).companies?.name ?? null);

    const { data } = await supabase
      .from("contractor_w9")
      .select("*")
      .eq("employee_id", employeeId!)
      .eq("company_id", emp.company_id)
      .maybeSingle();

    if (data) {
      setExisting(data);
      setLegalName(data.legal_name || `${emp.first_name} ${emp.last_name}`);
      setBusinessName(data.business_name || "");
      setTaxClass((data.tax_classification as any) || "individual");
      setLlcClass(((data as any).llc_tax_classification as any) || "");
      setExemptPayee((data as any).exempt_payee_code || "");
      setFatca((data as any).fatca_code || "");
      setAddr1(data.address_line1 || "");
      setAddr2(data.address_line2 || "");
      setCity(data.city || "");
      setStateCode(data.state || "");
      setZip(data.zip_code || "");
      setAccountNumbers((data as any).account_numbers || "");
      setTaxIdType(((data as any).tax_id_type as "ssn" | "ein") || "ssn");
    } else {
      setLegalName(`${emp.first_name} ${emp.last_name}`);
    }
    setLoading(false);
  }

  const isApproved = existing?.status === "approved";
  const isLocked = isApproved;

  const status: string = existing?.status ?? "draft";
  const statusLabel =
    status === "approved" ? "Aprobado" :
    status === "submitted" || status === "pending" ? "En revisión" :
    status === "rejected" ? "Rechazado" : "Borrador";
  const statusVariant: "default" | "outline" | "secondary" | "destructive" =
    status === "approved" ? "default" :
    status === "rejected" ? "destructive" :
    status === "submitted" || status === "pending" ? "secondary" : "outline";

  const signedDateUS = useMemo(() => {
    if (!existing?.signed_at) return null;
    const d = new Date(existing.signed_at);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  }, [existing?.signed_at]);

  async function handleSubmit() {
    if (!employeeId || !companyId) return;

    const values: W9FormValues = {
      legal_name: legalName.trim(),
      business_name: businessName.trim() || undefined,
      tax_classification: taxClass,
      llc_tax_classification: taxClass === "llc" ? (llcClass || null) as any : null,
      exempt_payee_code: exemptPayee.trim() || undefined,
      fatca_code: fatca.trim() || undefined,
      address_line1: addr1.trim(),
      address_line2: addr2.trim() || undefined,
      city: city.trim(),
      state: stateCode.trim().toUpperCase(),
      zip_code: zip.trim(),
      account_numbers: accountNumbers.trim() || undefined,
      tax_id_type: taxIdType,
      tin: tin.replace(/\D/g, ""),
      certification_accepted: certAccepted as any,
      signature_name: signature.trim(),
    };

    const parsed = w9Schema.safeParse(values);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      toast({ title: "Revisa el formulario", description: first.message, variant: "destructive" });
      return;
    }
    if (signature.trim().toLowerCase() !== legalName.trim().toLowerCase()) {
      toast({
        title: "La firma no coincide",
        description: "Escribe tu nombre legal exactamente como aparece arriba.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const signedAtIso = new Date().toISOString();

    try {
      // 1) Build PDF in-memory (masked TIN)
      const pdfBlob = buildW9PDF({
        ...parsed.data,
        company_name: companyName,
        signed_at: signedAtIso,
      });

      // 2) Upload PDF to private bucket
      const ts = Date.now();
      const path = `${companyId}/${employeeId}/onboarding/w9/w9_${ts}.pdf`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, pdfBlob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      // 3) Get user id for uploaded_by / signed_by
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;

      // 4) Upsert contractor_w9 (NEVER raw tin — only last4 + type)
      const payload: any = {
        company_id: companyId,
        employee_id: employeeId,
        legal_name: parsed.data.legal_name,
        business_name: parsed.data.business_name || null,
        tax_classification: parsed.data.tax_classification,
        llc_tax_classification: parsed.data.llc_tax_classification || null,
        exempt_payee_code: parsed.data.exempt_payee_code || null,
        fatca_code: parsed.data.fatca_code || null,
        address_line1: parsed.data.address_line1,
        address_line2: parsed.data.address_line2 || null,
        city: parsed.data.city,
        state: parsed.data.state,
        zip_code: parsed.data.zip_code,
        account_numbers: parsed.data.account_numbers || null,
        tax_id_type: parsed.data.tax_id_type,
        tin_last4: lastFour(parsed.data.tin),
        signature_name: parsed.data.signature_name,
        certification_accepted: true,
        signed_at: signedAtIso,
        signed_by: userId,
        submitted_at: signedAtIso,
        status: "submitted",
        w9_file_url: path,
      };

      // VWC Fase 3A · carril 1+3: envío idempotente y versionado del W-9.
      if (!intentKeyRef.current) {
        intentKeyRef.current = `w9-submit-${employeeId}-${crypto.randomUUID()}`;
      }
      const { data: rpcData, error: rpcErr } = await supabase.rpc("submit_contractor_w9", {
        p_company_id: companyId,
        p_employee_id: employeeId,
        p_payload: payload,
        p_expected_version: (existing as any)?.version ?? null,
        p_surface: "portal/MyW9",
        p_intent_key: intentKeyRef.current,
      });
      if (rpcErr) throw rpcErr;
      const res = (rpcData ?? {}) as Record<string, any>;
      if (res.status === "conflict") {
        toast({
          title: "Alguien actualizó tu W-9",
          description: "Recargamos la versión más reciente. Revisa los datos y vuelve a enviarlo.",
          variant: "destructive",
        });
        intentKeyRef.current = null;
        await load();
        return;
      }
      if (res.status !== "applied") {
        throw new Error(res.message || "No se pudo enviar el W-9.");
      }
      intentKeyRef.current = null;


      // 5) Mirror into employee_documents so /app/documents lists it
      const { error: docErr } = await supabase.from("employee_documents").insert({
        company_id: companyId,
        employee_id: employeeId,
        name: `W-9 — ${parsed.data.legal_name} (${ts}).pdf`,
        file_url: path,
        file_type: "application/pdf",
        file_size: pdfBlob.size,
        category: "w9",
        uploaded_by: userId,
        review_status: "pending",
      } as any);
      if (docErr) {
        // Non-fatal: contractor_w9 row is the source of truth, but log.
        console.warn("[w9] employee_documents mirror failed", docErr);
      }

      // 6) Wipe raw TIN from memory ASAP
      setTin("");

      toast({ title: "W-9 enviado para revisión", description: `Firma: ${parsed.data.signature_name}` });
      await load();
    } catch (e: any) {
      console.error("[w9] submit failed", e);
      toast({ title: "Error al enviar W-9", description: e?.message || "Intenta de nuevo", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleViewMyPDF() {
    if (!existing?.w9_file_url) return;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(existing.w9_file_url, 60);
    if (error || !data?.signedUrl) {
      toast({ title: "No se pudo abrir el PDF", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24">
      <Link
        to="/portal/documents"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Documentos
      </Link>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Formulario W-9</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Completa y firma tu W-9 para mantener tu información fiscal actualizada.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusVariant}>{statusLabel}</Badge>
            {signedDateUS && (
              <span className="text-[11px] text-muted-foreground">Firmado el {signedDateUS}</span>
            )}
            {existing?.tin_last4 && (
              <span className="text-[11px] text-muted-foreground font-mono">
                TIN: ***-**-{existing.tin_last4}
              </span>
            )}
          </div>
          {existing?.w9_file_url && (
            <Button variant="outline" size="sm" className="w-fit" onClick={handleViewMyPDF}>
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Ver mi W-9 firmado
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Identity */}
          <section className="space-y-3">
            <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Identidad</h3>
            <div>
              <Label>Nombre legal (como aparece en tu declaración) *</Label>
              <Input value={legalName} onChange={e => setLegalName(e.target.value)} disabled={isLocked} />
            </div>
            <div>
              <Label>Business name / DBA (opcional)</Label>
              <Input value={businessName} onChange={e => setBusinessName(e.target.value)} disabled={isLocked} />
            </div>
            <div>
              <Label>Federal tax classification *</Label>
              <Select value={taxClass} onValueChange={(v: any) => setTaxClass(v)} disabled={isLocked}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAX_CLASSIFICATIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {taxClass === "llc" && (
              <div>
                <Label>LLC tax classification *</Label>
                <Select value={llcClass} onValueChange={(v: any) => setLlcClass(v)} disabled={isLocked}>
                  <SelectTrigger><SelectValue placeholder="Elige C, S, o P" /></SelectTrigger>
                  <SelectContent>
                    {LLC_TAX_CLASSES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Exempt payee code (opcional)</Label>
                <Input value={exemptPayee} onChange={e => setExemptPayee(e.target.value)} maxLength={10} disabled={isLocked} />
              </div>
              <div>
                <Label>FATCA code (opcional)</Label>
                <Input value={fatca} onChange={e => setFatca(e.target.value)} maxLength={10} disabled={isLocked} />
              </div>
            </div>
          </section>

          {/* Address */}
          <section className="space-y-3">
            <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Dirección</h3>
            <div>
              <Label>Address line 1 *</Label>
              <Input value={addr1} onChange={e => setAddr1(e.target.value)} disabled={isLocked} />
            </div>
            <div>
              <Label>Address line 2</Label>
              <Input value={addr2} onChange={e => setAddr2(e.target.value)} disabled={isLocked} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <Label>City *</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} disabled={isLocked} />
              </div>
              <div>
                <Label>State *</Label>
                <Input value={stateCode} onChange={e => setStateCode(e.target.value.toUpperCase())} maxLength={2} placeholder="FL" disabled={isLocked} />
              </div>
              <div>
                <Label>ZIP *</Label>
                <Input value={zip} onChange={e => setZip(e.target.value)} maxLength={10} disabled={isLocked} />
              </div>
            </div>
            <div>
              <Label>Account numbers (opcional)</Label>
              <Input value={accountNumbers} onChange={e => setAccountNumbers(e.target.value)} maxLength={120} disabled={isLocked} />
            </div>
          </section>

          {/* Tax ID */}
          <section className="space-y-3">
            <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Taxpayer Identification Number</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={taxIdType} onValueChange={(v: any) => setTaxIdType(v)} disabled={isLocked}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAX_ID_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{taxIdType === "ssn" ? "SSN *" : "EIN *"}</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  inputMode="numeric"
                  value={tin}
                  onChange={e => setTin(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder={existing?.tin_last4 ? `***-**-${existing.tin_last4}` : "9 dígitos"}
                  maxLength={9}
                  disabled={isLocked}
                />
              </div>
            </div>
            <p className="text-[10.5px] text-muted-foreground/80 flex items-start gap-1.5">
              <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0" />
              Tu número no se guarda en texto plano — solo los últimos 4 dígitos quedan visibles para administradores.
            </p>
            {tin && (
              <p className="text-[11px] font-mono text-muted-foreground">
                Vista previa: {maskTin(tin)}
              </p>
            )}
          </section>

          {/* Certification & signature */}
          {!isLocked && (
            <section className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3">
              <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                Certificación y firma electrónica
              </h3>
              <label className="flex items-start gap-2 text-[12px] leading-snug">
                <Checkbox
                  checked={certAccepted}
                  onCheckedChange={(c) => setCertAccepted(!!c)}
                  className="mt-0.5"
                />
                <span>
                  Certifico bajo pena de perjurio que la información es correcta, que el TIN proporcionado es mío,
                  que no estoy sujeto/a a retención adicional, y que soy ciudadano/a o persona estadounidense.
                </span>
              </label>
              <div>
                <Label>Firma electrónica (escribe tu nombre legal exacto) *</Label>
                <Input
                  value={signature}
                  onChange={e => setSignature(e.target.value)}
                  placeholder={legalName}
                  autoComplete="off"
                />
              </div>
            </section>
          )}

          {isLocked ? (
            <div className="flex items-center gap-2 text-sm text-primary bg-primary/10 rounded-lg p-3">
              <CheckCircle2 className="h-4 w-4" />
              Tu W-9 ha sido aprobado. Contacta a tu administrador si necesitas hacer cambios.
            </div>
          ) : (
            <Button onClick={handleSubmit} disabled={saving} className="w-full">
              {saving ? "Enviando..." : existing ? "Firmar y reenviar W-9" : "Firmar y enviar W-9"}
            </Button>
          )}

          {existing?.status === "rejected" && existing?.rejection_reason && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[12px]">
              <p className="font-semibold text-destructive mb-1">Motivo del rechazo</p>
              <p className="text-foreground/80">{existing.rejection_reason}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
