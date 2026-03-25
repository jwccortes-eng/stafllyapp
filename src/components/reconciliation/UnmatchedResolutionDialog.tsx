import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, UserPlus, Link2, FileText, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PayrollTruthRow } from "@/lib/payroll-truth-parser";

export type ResolutionMode = "create" | "link" | "truth_only";

export interface ResolutionResult {
  mode: ResolutionMode;
  employeeId?: string;
  resolvedAt: string;
  resolvedBy: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truthRow: PayrollTruthRow;
  companyId: string;
  periodStatusId: string;
  userId: string;
  onResolved: (result: ResolutionResult) => void;
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

  /** Persist a resolution decision to truth_resolution_log */
  const persistResolution = async (resolvedMode: ResolutionMode, resolvedEmployeeId?: string) => {
    try {
      await supabase.from("truth_resolution_log" as any).insert({
        company_id: companyId,
        period_status_id: periodStatusId,
        truth_employee_name: truthRow.employee,
        truth_total: truthRow.total || 0,
        truth_hours: truthRow.totalPaidHours || truthRow.shiftHours || null,
        resolution_mode: resolvedMode,
        resolved_employee_id: resolvedEmployeeId || null,
        resolved_by: userId,
        truth_raw_json: {
          firstName: truthRow.firstName,
          lastName: truthRow.lastName,
          totalPay: truthRow.totalPay,
          hourlyRate: truthRow.hourlyRate,
          total: truthRow.total,
        },
      } as any);
    } catch (err) {
      console.error("Failed to persist resolution log:", err);
    }
  };

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
          is_active: false, // inactive by default — requires human activation
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
          created_from: "payroll_truth_reconciliation",
          period_status_id: periodStatusId,
          truth_employee_name: truthRow.employee,
          truth_total: truthRow.total,
          truth_hours: truthRow.totalPaidHours || truthRow.shiftHours || null,
          truth_file_name: "payroll_truth",
        },
      });

      // Persist resolution
      await persistResolution("create", newId);

      toast.success(`Empleado ${firstName} ${lastName} creado desde Truth (inactivo por defecto)`);
      onResolved({ mode: "create", employeeId: newId, resolvedAt: new Date().toISOString(), resolvedBy: userId });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Error creando empleado: ${err.message}`);
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

      // Persist resolution
      await persistResolution("link", selectedLinkId);

      const linked = candidates.find(c => c.id === selectedLinkId);
      toast.success(`Vinculado: ${truthRow.employee} → ${linked?.first_name} ${linked?.last_name}`);
      onResolved({ mode: "link", employeeId: selectedLinkId, resolvedAt: new Date().toISOString(), resolvedBy: userId });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Error vinculando: ${err.message}`);
    }
    setSaving(false);
  };

  const handleTruthOnly = async () => {
    setSaving(true);
    try {
      // Audit
      await supabase.from("activity_log").insert({
        user_id: userId,
        company_id: companyId,
        action: "truth_only_closure",
        entity_type: "reconciliation",
        entity_id: periodStatusId,
        details: {
          source: "reconciliation_truth_only",
          period_status_id: periodStatusId,
          truth_employee_name: truthRow.employee,
          truth_total: truthRow.total,
          truth_only_closure: true,
        },
      });

      // Persist resolution
      await persistResolution("truth_only");

      toast.info(`${truthRow.employee} marcado como solo-Truth para este cierre`);
      onResolved({ mode: "truth_only", resolvedAt: new Date().toISOString(), resolvedBy: userId });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Error registrando decisión: ${err.message}`);
    }
    setSaving(false);
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
          {(truthRow.totalPaidHours || truthRow.shiftHours) ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Truth Hours:</span>
              <span className="font-mono">{(truthRow.totalPaidHours || truthRow.shiftHours || 0).toFixed(1)}h</span>
            </div>
          ) : null}
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
                <div className="font-medium text-sm">Crear empleado desde Truth</div>
                <div className="text-xs text-muted-foreground">Crea un nuevo registro (inactivo) con los datos del archivo de nómina</div>
              </div>
            </Button>
            <Button variant="outline" className="justify-start gap-2 h-auto py-3" onClick={() => setMode("link")}>
              <Link2 className="h-4 w-4 text-primary shrink-0" />
              <div className="text-left">
                <div className="font-medium text-sm">Vincular a empleado existente</div>
                <div className="text-xs text-muted-foreground">Asocia esta fila de Truth a un empleado ya registrado y crea alias para futuros cierres</div>
              </div>
            </Button>
            <Button variant="outline" className="justify-start gap-2 h-auto py-3" onClick={() => setMode("truth_only")}>
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="text-left">
                <div className="font-medium text-sm">Marcar solo-Truth para este cierre</div>
                <div className="text-xs text-muted-foreground">No crear ni vincular — usar el monto de Truth directamente sin bloquear cierre</div>
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
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[10px]">Fuente: payroll_truth_reconciliation</Badge>
              <Badge variant="outline" className="text-[10px]">Status: inactivo por defecto</Badge>
            </div>
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
              <p className="mt-2 text-[10px]">Esta decisión queda registrada con auditoría completa (quién, cuándo, para qué periodo).</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {mode === "create" && (
            <Button onClick={handleCreate} disabled={saving || !firstName.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Crear empleado
            </Button>
          )}
          {mode === "link" && (
            <Button onClick={handleLink} disabled={saving || !selectedLinkId} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Vincular
            </Button>
          )}
          {mode === "truth_only" && (
            <Button onClick={handleTruthOnly} disabled={saving} variant="secondary" className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Confirmar solo Truth
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
