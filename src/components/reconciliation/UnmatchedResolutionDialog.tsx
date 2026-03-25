import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, UserPlus, Link2, FileText, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PayrollTruthRow } from "@/lib/payroll-truth-parser";

type ResolutionMode = "create" | "link" | "truth_only";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truthRow: PayrollTruthRow;
  companyId: string;
  periodStatusId: string;
  userId: string;
  onResolved: (result: { mode: ResolutionMode; employeeId?: string }) => void;
}

interface ExistingEmployee {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string | null;
  is_active: boolean;
}

export default function UnmatchedResolutionDialog({ open, onOpenChange, truthRow, companyId, periodStatusId, userId, onResolved }: Props) {
  const [mode, setMode] = useState<ResolutionMode | null>(null);
  const [saving, setSaving] = useState(false);

  // Create form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [employerId, setEmployerId] = useState("");
  const [ssnEin, setSsnEin] = useState("");

  // Link state
  const [linkSearch, setLinkSearch] = useState("");
  const [candidates, setCandidates] = useState<ExistingEmployee[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Prefill from truth row
  useEffect(() => {
    if (open && truthRow) {
      setFirstName(truthRow.firstName || "");
      setLastName(truthRow.lastName || "");
      setPhone(truthRow.phoneNumber || "");
      setEmail(truthRow.email || "");
      setEmployerId(truthRow.employerIdentification || "");
      setSsnEin(truthRow.verificationSsnEin || "");
      setMode(null);
      setSelectedLinkId(null);
      setLinkSearch("");
    }
  }, [open, truthRow]);

  // Load candidates for linking
  useEffect(() => {
    if (mode !== "link" || !companyId) return;
    setLoadingCandidates(true);
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name, phone_number, email, is_active")
        .eq("company_id", companyId)
        .order("first_name");
      setCandidates((data || []) as ExistingEmployee[]);
      setLoadingCandidates(false);
    })();
  }, [mode, companyId]);

  const filteredCandidates = candidates.filter(c => {
    if (!linkSearch) return true;
    const q = linkSearch.toLowerCase();
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    return name.includes(q) || (c.phone_number || "").includes(q) || (c.email || "").toLowerCase().includes(q);
  });

  const handleCreate = async () => {
    if (!firstName.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("employees")
        .insert({
          company_id: companyId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: phone.trim() || null,
          email: email.trim() || null,
          employer_identification: employerId.trim() || null,
          verification_ssn_ein: ssnEin.trim() || null,
          employee_role: "general",
          is_active: true,
          created_from_reconciliation: true,
        } as any)
        .select("id")
        .single();

      if (error) throw error;
      const newId = (data as any).id;

      // Audit trail
      await supabase.from("activity_log").insert({
        user_id: userId,
        company_id: companyId,
        action: "create_employee_from_truth",
        entity_type: "employee",
        entity_id: newId,
        details: {
          source: "reconciliation_truth_creation",
          period_status_id: periodStatusId,
          truth_employee_name: truthRow.employee,
          truth_total: truthRow.total,
        },
      });

      toast.success(`Empleada ${firstName} ${lastName} creada desde Truth`);
      onResolved({ mode: "create", employeeId: newId });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Error creando empleada: ${err.message}`);
    }
    setSaving(false);
  };

  const handleLink = async () => {
    if (!selectedLinkId) { toast.error("Selecciona un empleado"); return; }
    setSaving(true);
    try {
      // Create alias for future matching
      const truthName = truthRow.employee.trim();
      if (truthName) {
        await supabase.from("employee_aliases").insert({
          employee_id: selectedLinkId,
          company_id: companyId,
          alias_name: truthName,
          alias_name_normalized: truthName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
          source: "reconciliation_manual_link",
          created_by: userId,
        });
      }

      // Update employer_identification / ssn if provided in truth and missing on employee
      if (truthRow.employerIdentification || truthRow.verificationSsnEin) {
        const updates: Record<string, any> = {};
        if (truthRow.employerIdentification) updates.employer_identification = truthRow.employerIdentification;
        if (truthRow.verificationSsnEin) updates.verification_ssn_ein = truthRow.verificationSsnEin;
        await supabase.from("employees").update(updates).eq("id", selectedLinkId);
      }

      // Audit
      await supabase.from("activity_log").insert({
        user_id: userId,
        company_id: companyId,
        action: "link_employee_from_truth",
        entity_type: "employee",
        entity_id: selectedLinkId,
        details: {
          source: "reconciliation_manual_link",
          period_status_id: periodStatusId,
          truth_employee_name: truthRow.employee,
          truth_total: truthRow.total,
        },
      });

      const linked = candidates.find(c => c.id === selectedLinkId);
      toast.success(`Vinculado: ${truthRow.employee} → ${linked?.first_name} ${linked?.last_name}`);
      onResolved({ mode: "link", employeeId: selectedLinkId });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Error vinculando: ${err.message}`);
    }
    setSaving(false);
  };

  const handleTruthOnly = () => {
    toast.info(`${truthRow.employee} marcado como solo-Truth para este cierre`);
    onResolved({ mode: "truth_only" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Resolver: {truthRow.employee}
          </DialogTitle>
          <DialogDescription>
            Empleado no encontrado en el sistema. Selecciona cómo resolver.
          </DialogDescription>
        </DialogHeader>

        {/* Truth summary */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Truth Total:</span>
            <span className="font-mono font-bold">${truthRow.total?.toFixed(2)}</span>
          </div>
          {truthRow.employerIdentification && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Employer ID:</span>
              <span className="font-mono">{truthRow.employerIdentification}</span>
            </div>
          )}
          {truthRow.verificationSsnEin && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">SSN/EIN:</span>
              <span className="font-mono">***{truthRow.verificationSsnEin.slice(-4)}</span>
            </div>
          )}
        </div>

        {/* Mode selector */}
        {!mode && (
          <div className="grid gap-2">
            <Button variant="outline" className="justify-start gap-2 h-auto py-3" onClick={() => setMode("create")}>
              <UserPlus className="h-4 w-4 text-primary shrink-0" />
              <div className="text-left">
                <div className="font-medium text-sm">Crear empleada desde Truth</div>
                <div className="text-xs text-muted-foreground">Crea un nuevo registro con los datos del archivo de nómina</div>
              </div>
            </Button>
            <Button variant="outline" className="justify-start gap-2 h-auto py-3" onClick={() => setMode("link")}>
              <Link2 className="h-4 w-4 text-primary shrink-0" />
              <div className="text-left">
                <div className="font-medium text-sm">Vincular a empleada existente</div>
                <div className="text-xs text-muted-foreground">Asocia esta fila de Truth a un empleado ya registrado</div>
              </div>
            </Button>
            <Button variant="outline" className="justify-start gap-2 h-auto py-3" onClick={() => setMode("truth_only")}>
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="text-left">
                <div className="font-medium text-sm">Dejar solo en Truth para este cierre</div>
                <div className="text-xs text-muted-foreground">No crear ni vincular — usar el monto de Truth directamente</div>
              </div>
            </Button>
          </div>
        )}

        {/* Create form */}
        {mode === "create" && (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setMode(null)}>← Volver</Button>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nombre *</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Nombre" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Apellido</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Apellido" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Teléfono</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Employer ID</Label>
                <Input value={employerId} onChange={e => setEmployerId(e.target.value)} placeholder="Employer ID" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">SSN/EIN</Label>
                <Input value={ssnEin} onChange={e => setSsnEin(e.target.value)} placeholder="SSN/EIN" className="h-8 text-sm" />
              </div>
            </div>
            <Badge variant="secondary" className="text-[10px]">Fuente: reconciliation_truth_creation</Badge>
          </div>
        )}

        {/* Link form */}
        {mode === "link" && (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setMode(null)}>← Volver</Button>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
                placeholder="Buscar empleado por nombre, teléfono o email..."
                className="pl-8 h-8 text-sm"
              />
            </div>
            {loadingCandidates ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : (
              <ScrollArea className="max-h-48">
                <div className="space-y-1">
                  {filteredCandidates.map(c => (
                    <button
                      key={c.id}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedLinkId === c.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted border border-transparent"
                      }`}
                      onClick={() => setSelectedLinkId(c.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.first_name} {c.last_name}</span>
                        {!c.is_active && <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.phone_number && <span>{c.phone_number} · </span>}
                        {c.email && <span>{c.email}</span>}
                      </div>
                    </button>
                  ))}
                  {filteredCandidates.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No se encontraron empleados</p>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        {/* Truth only confirmation */}
        {mode === "truth_only" && (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setMode(null)}>← Volver</Button>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              El monto de <strong className="text-foreground">${truthRow.total?.toFixed(2)}</strong> se usará directamente para el cierre sin crear ni vincular un registro de empleado en el sistema.
            </div>
          </div>
        )}

        <DialogFooter>
          {mode === "create" && (
            <Button onClick={handleCreate} disabled={saving || !firstName.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Crear empleada
            </Button>
          )}
          {mode === "link" && (
            <Button onClick={handleLink} disabled={saving || !selectedLinkId} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Vincular
            </Button>
          )}
          {mode === "truth_only" && (
            <Button onClick={handleTruthOnly} variant="secondary" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Confirmar solo Truth
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
