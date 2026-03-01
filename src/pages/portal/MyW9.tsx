import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileText, CheckCircle, Clock, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const TAX_CLASSIFICATIONS = [
  { value: "individual", label: "Individual / Sole Proprietor" },
  { value: "llc_single", label: "LLC – Single Member" },
  { value: "llc_c", label: "LLC – C Corporation" },
  { value: "llc_s", label: "LLC – S Corporation" },
  { value: "llc_p", label: "LLC – Partnership" },
  { value: "c_corp", label: "C Corporation" },
  { value: "s_corp", label: "S Corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "trust", label: "Trust / Estate" },
  { value: "other", label: "Other" },
];

export default function MyW9() {
  const { employeeId } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [legalName, setLegalName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [taxClass, setTaxClass] = useState("individual");
  const [tin, setTin] = useState("");
  const [addr1, setAddr1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  useEffect(() => {
    if (!employeeId) return;
    loadW9();
  }, [employeeId]);

  async function loadW9() {
    setLoading(true);
    // Get employee's company
    const { data: emp } = await supabase
      .from("employees")
      .select("company_id, first_name, last_name")
      .eq("id", employeeId!)
      .single();

    if (!emp) { setLoading(false); return; }

    const { data } = await supabase
      .from("contractor_w9")
      .select("*")
      .eq("employee_id", employeeId!)
      .eq("company_id", emp.company_id)
      .maybeSingle();

    if (data) {
      setExisting(data);
      setLegalName(data.legal_name || "");
      setBusinessName(data.business_name || "");
      setTaxClass(data.tax_classification || "individual");
      setAddr1(data.address_line1 || "");
      setCity(data.city || "");
      setState(data.state || "");
      setZip(data.zip_code || "");
    } else {
      setLegalName(`${emp.first_name} ${emp.last_name}`);
    }
    setLoading(false);
  }

  async function handleSubmit() {
    if (!legalName.trim()) {
      toast({ title: "Ingresa tu nombre legal", variant: "destructive" });
      return;
    }
    setSaving(true);

    const { data: emp } = await supabase
      .from("employees")
      .select("company_id")
      .eq("id", employeeId!)
      .single();

    const payload: any = {
      company_id: emp!.company_id,
      employee_id: employeeId,
      legal_name: legalName.trim(),
      business_name: businessName.trim() || null,
      tax_classification: taxClass,
      address_line1: addr1.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      zip_code: zip.trim() || null,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      signed_at: new Date().toISOString(),
      signed_by: (await supabase.auth.getUser()).data.user?.id,
    };

    if (tin.trim()) {
      payload.tin_last4 = tin.slice(-4);
      // Only store last 4 digits — full TIN is NOT persisted for security
    }

    let error;
    if (existing) {
      ({ error } = await supabase.from("contractor_w9").update(payload).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("contractor_w9").insert(payload));
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "W-9 enviado correctamente" });
      loadW9();
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const isApproved = existing?.status === "approved";

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-20">
      <Link to="/portal/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Perfil
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Formulario W-9</CardTitle>
          </div>
          {existing && (
            <Badge variant={isApproved ? "default" : "outline"} className="w-fit">
              {isApproved ? "Aprobado" : existing.status === "submitted" ? "En revisión" : "Pendiente"}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nombre legal (como aparece en tu declaración de impuestos) *</Label>
            <Input value={legalName} onChange={e => setLegalName(e.target.value)} disabled={isApproved} />
          </div>

          <div>
            <Label>Business name / DBA (si es diferente)</Label>
            <Input value={businessName} onChange={e => setBusinessName(e.target.value)} disabled={isApproved} />
          </div>

          <div>
            <Label>Clasificación fiscal</Label>
            <Select value={taxClass} onValueChange={setTaxClass} disabled={isApproved}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TAX_CLASSIFICATIONS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>TIN (SSN o EIN)</Label>
            <Input
              value={tin}
              onChange={e => setTin(e.target.value.replace(/[^0-9-]/g, ""))}
              placeholder={existing?.tin_last4 ? `***-**-${existing.tin_last4}` : "XXX-XX-XXXX"}
              maxLength={11}
              type="password"
              disabled={isApproved}
            />
            <p className="text-xs text-muted-foreground mt-1">Tu número se almacena de forma segura</p>
          </div>

          <div>
            <Label>Dirección</Label>
            <Input value={addr1} onChange={e => setAddr1(e.target.value)} placeholder="Street address" disabled={isApproved} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Ciudad</Label>
              <Input value={city} onChange={e => setCity(e.target.value)} disabled={isApproved} />
            </div>
            <div>
              <Label>Estado</Label>
              <Input value={state} onChange={e => setState(e.target.value)} maxLength={2} placeholder="FL" disabled={isApproved} />
            </div>
            <div>
              <Label>ZIP</Label>
              <Input value={zip} onChange={e => setZip(e.target.value)} maxLength={10} disabled={isApproved} />
            </div>
          </div>

          {!isApproved && (
            <Button onClick={handleSubmit} disabled={saving} className="w-full">
              {saving ? "Enviando..." : existing ? "Actualizar y enviar" : "Firmar y enviar W-9"}
            </Button>
          )}

          {isApproved && (
            <div className="flex items-center gap-2 text-sm text-primary bg-primary/10 rounded-lg p-3">
              <CheckCircle className="h-4 w-4" />
              Tu W-9 ha sido aprobado. Contacta a tu administrador si necesitas hacer cambios.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
