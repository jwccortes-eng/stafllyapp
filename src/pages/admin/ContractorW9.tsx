import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { formatPersonName } from "@/lib/format-helpers";
import { FileText, Search, Plus, Eye, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface W9Record {
  id: string;
  employee_id: string;
  legal_name: string;
  business_name: string | null;
  tax_classification: string;
  tin_last4: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  status: string;
  signed_at: string | null;
  submitted_at: string | null;
  employee?: { first_name: string; last_name: string };
}

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

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendiente", variant: "outline" },
  submitted: { label: "Enviado", variant: "secondary" },
  approved: { label: "Aprobado", variant: "default" },
  rejected: { label: "Rechazado", variant: "destructive" },
};

export default function ContractorW9() {
  const { selectedCompanyId: companyId } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<W9Record[]>([]);
  const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<W9Record | null>(null);

  // Form state
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formLegalName, setFormLegalName] = useState("");
  const [formBusinessName, setFormBusinessName] = useState("");
  const [formTaxClass, setFormTaxClass] = useState("individual");
  const [formTin, setFormTin] = useState("");
  const [formAddr1, setFormAddr1] = useState("");
  const [formAddr2, setFormAddr2] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formState, setFormState] = useState("");
  const [formZip, setFormZip] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    fetchData();
  }, [companyId]);

  async function fetchData() {
    setLoading(true);
    const [w9Res, empRes] = await Promise.all([
      supabase
        .from("contractor_w9")
        .select("*, employee:employees!contractor_w9_employee_id_fkey(first_name, last_name)")
        .eq("company_id", companyId!) as any,
      supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("first_name"),
    ]);
    setRecords((w9Res.data || []) as W9Record[]);
    setEmployees(empRes.data || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setFormEmployeeId("");
    setFormLegalName("");
    setFormBusinessName("");
    setFormTaxClass("individual");
    setFormTin("");
    setFormAddr1("");
    setFormAddr2("");
    setFormCity("");
    setFormState("");
    setFormZip("");
    setDialogOpen(true);
  }

  function openEdit(r: W9Record) {
    setEditing(r);
    setFormEmployeeId(r.employee_id);
    setFormLegalName(r.legal_name);
    setFormBusinessName(r.business_name || "");
    setFormTaxClass(r.tax_classification);
    setFormTin("");
    setFormAddr1(r.address_line1 || "");
    setFormAddr2("");
    setFormCity(r.city || "");
    setFormState(r.state || "");
    setFormZip(r.zip_code || "");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formEmployeeId || !formLegalName.trim()) {
      toast({ title: "Completa los campos requeridos", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload: any = {
      company_id: companyId,
      employee_id: formEmployeeId,
      legal_name: formLegalName.trim(),
      business_name: formBusinessName.trim() || null,
      tax_classification: formTaxClass,
      address_line1: formAddr1.trim() || null,
      address_line2: formAddr2.trim() || null,
      city: formCity.trim() || null,
      state: formState.trim() || null,
      zip_code: formZip.trim() || null,
    };

    if (formTin.trim()) {
      payload.tin_last4 = formTin.slice(-4);
      // Only store last 4 digits — full TIN is NOT persisted for security
    }

    if (editing) {
      const { error } = await supabase.from("contractor_w9").update(payload).eq("id", editing.id);
      if (error) {
        toast({ title: "Error al actualizar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "W-9 actualizado" });
      }
    } else {
      payload.status = "submitted";
      payload.submitted_at = new Date().toISOString();
      const { error } = await supabase.from("contractor_w9").insert(payload);
      if (error) {
        toast({ title: "Error al crear", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "W-9 registrado" });
      }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchData();
  }

  async function handleApprove(id: string) {
    await supabase.from("contractor_w9").update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id,
    }).eq("id", id);
    toast({ title: "W-9 aprobado" });
    fetchData();
  }

  const filtered = records.filter(r => {
    const name = `${r.employee?.first_name || ""} ${r.employee?.last_name || ""} ${r.legal_name}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  // Employees without W-9
  const existingEmpIds = new Set(records.map(r => r.employee_id));
  const availableEmployees = employees.filter(e => !existingEmpIds.has(e.id));

  return (
    <div className="space-y-6">
      <PageHeader title="Formularios W-9" subtitle="Gestión de información fiscal de contractors" />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nuevo W-9
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Cargando...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="Sin formularios W-9" description="Agrega la información fiscal de tus contractors" />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Nombre legal</TableHead>
                <TableHead>Clasificación</TableHead>
                <TableHead>TIN</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const s = STATUS_MAP[r.status] || STATUS_MAP.pending;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {formatPersonName(`${r.employee?.first_name} ${r.employee?.last_name}`)}
                    </TableCell>
                    <TableCell>{r.legal_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {TAX_CLASSIFICATIONS.find(t => t.value === r.tax_classification)?.label || r.tax_classification}
                    </TableCell>
                    <TableCell>{r.tin_last4 ? `***-**-${r.tin_last4}` : "—"}</TableCell>
                    <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Eye className="h-4 w-4" /></Button>
                      {r.status === "submitted" && (
                      <Button variant="ghost" size="icon" onClick={() => handleApprove(r.id)}>
                          <CheckCircle className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* W-9 Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar W-9" : "Nuevo formulario W-9"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!editing && (
              <div>
                <Label>Empleado / Contractor *</Label>
                <Select value={formEmployeeId} onValueChange={setFormEmployeeId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {availableEmployees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{formatPersonName(`${e.first_name} ${e.last_name}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Nombre legal (como aparece en la declaración) *</Label>
              <Input value={formLegalName} onChange={e => setFormLegalName(e.target.value)} />
            </div>

            <div>
              <Label>Business name / DBA (si es diferente)</Label>
              <Input value={formBusinessName} onChange={e => setFormBusinessName(e.target.value)} />
            </div>

            <div>
              <Label>Clasificación fiscal</Label>
              <Select value={formTaxClass} onValueChange={setFormTaxClass}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAX_CLASSIFICATIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>TIN (SSN o EIN) {editing && "— dejar vacío para mantener"}</Label>
              <Input
                value={formTin}
                onChange={e => setFormTin(e.target.value.replace(/[^0-9-]/g, ""))}
                placeholder="XXX-XX-XXXX"
                maxLength={11}
                type="password"
              />
              <p className="text-xs text-muted-foreground mt-1">Solo se almacenan los últimos 4 dígitos de forma visible</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Dirección</Label>
                <Input value={formAddr1} onChange={e => setFormAddr1(e.target.value)} placeholder="Street address" />
              </div>
              <div>
                <Label>Ciudad</Label>
                <Input value={formCity} onChange={e => setFormCity(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Estado</Label>
                  <Input value={formState} onChange={e => setFormState(e.target.value)} maxLength={2} placeholder="FL" />
                </div>
                <div>
                  <Label>ZIP</Label>
                  <Input value={formZip} onChange={e => setFormZip(e.target.value)} maxLength={10} />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : editing ? "Actualizar" : "Registrar W-9"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
