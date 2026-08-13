/**
 * EmergencyWorkerDialog — Phase 2C-A
 * ─────────────────────────────────────────────────────────────────────────
 * Admin-only flow for creating an "Emergency Worker" as a temporary,
 * pending-identity record scoped to the currently selected company.
 *
 * Strict boundaries (see Phase 2C-A approval):
 *   • ONLY writes to public.employees.
 *   • NEVER creates an auth.users row.
 *   • NEVER enables portal access.
 *   • NEVER writes time_entries / pay_periods / period_base_pay /
 *     payroll_adjustments / historical_payroll_entries / reconciliation_* /
 *     documents / auth / RLS / payments / bookings / chat / campaigns /
 *     imports / dedup / edge functions.
 *
 * Fixed insert defaults (non-editable):
 *   worker_type='emergency_worker'
 *   identity_status='pending_identity'
 *   requires_identity_resolution=true
 *   payroll_approval_blocked=true
 *   identity_source='emergency'
 *   portal_access_enabled=false
 *   user_id=null
 *   original_placeholder_name=null
 *   company_id=<selectedCompanyId>  (never manually typed)
 *   is_active=true                  (required by existing assignment flow)
 *   added_via='emergency_flow'
 *
 * Cross-tenant safety:
 *   • company_id is bound to the current tenant via useCompany.
 *   • Same-tenant identity trigger (Phase 1) still enforces resolution rules.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { normalizePhone } from "@/lib/phone";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldOff, ShieldAlert, Building2, Search, UserCheck, Globe2, Loader2 } from "lucide-react";
import {
  ACTION_LABELS,
  actionsForMatch,
  classifyPhoneMatches,
  isSearchablePhone,
  personDisplayName,
  type LookupOutcome,
  type PhoneMatch,
} from "@/lib/people/existing-person-flow";

// ── Validation schema (client-side; DB trigger is the hard guard) ─────────
const schema = z.object({
  first_name: z.string().trim().min(1, "Nombre requerido").max(80),
  last_name: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  noPhone: z.boolean().default(false),
  noPhoneReason: z.string().trim().max(300).optional().default(""),
  reason: z.string().trim().min(4, "Motivo de emergencia requerido").max(500),
  authorizedBy: z.string().trim().min(2, "Nombre del admin que autoriza requerido").max(120),
  note: z.string().trim().max(1000).optional().default(""),
  source: z.string().trim().max(160).optional().default(""),
}).superRefine((v, ctx) => {
  if (!v.noPhone) {
    if (!v.phone || v.phone.length < 7) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"],
        message: "Teléfono requerido o marca 'Sin teléfono disponible'." });
    }
  } else if (!v.noPhoneReason || v.noPhoneReason.length < 3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["noPhoneReason"],
      message: "Explica por qué no hay teléfono disponible." });
  }
});

export interface EmergencyWorkerCreated {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string | null;
  worker_type: "emergency_worker";
  identity_status: "pending_identity";
  requires_identity_resolution: true;
  payroll_approval_blocked: true;
  portal_access_enabled: false;
  user_id: null;
  company_id: string;
  is_active: true;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Human-readable shift label for context ("Turno · MM/DD · HH:MM"). */
  shiftLabel: string;
  /** Optional shift id — logged in identity_notes for audit. */
  shiftId?: string | null;
  onCreated?: (worker: EmergencyWorkerCreated) => void;
}

export default function EmergencyWorkerDialog({
  open, onOpenChange, shiftLabel, shiftId = null, onCreated,
}: Props) {
  const { user, canAccessAdminForCompany } = useAuth();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { toast } = useToast();
  const isAdmin = canAccessAdminForCompany(selectedCompanyId);

  const [form, setForm] = useState({
    first_name: "", last_name: "", phone: "",
    noPhone: false, noPhoneReason: "",
    reason: "", authorizedBy: "", note: "", source: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  // P0 · PERSONA EXISTENTE: nunca se inserta antes de buscar por teléfono.
  const [searching, setSearching] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<LookupOutcome | null>(null);

  useEffect(() => {
    if (!open) {
      setForm({
        first_name: "", last_name: "", phone: "",
        noPhone: false, noPhoneReason: "",
        reason: "", authorizedBy: "", note: "", source: "",
      });
      setErrors({});
      setSaving(false);
      setOutcome(null);
      setSearching(false);
      setActing(null);
    }
  }, [open]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    if (k === "phone" || k === "noPhone") setOutcome(null);
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  const closeWith = (employeeId: string, first: string, last: string | null, phone: string | null) => {
    onCreated?.({
      id: employeeId,
      first_name: first,
      last_name: last,
      phone_number: phone,
    } as unknown as EmergencyWorkerCreated);
    onOpenChange(false);
  };

  /** Paso 1 obligatorio: buscar por teléfono antes de cualquier INSERT. */
  const runLookup = async () => {
    if (!selectedCompanyId) return;
    if (form.noPhone) {
      setOutcome(classifyPhoneMatches([], { hasPhone: false }));
      return;
    }
    if (!isSearchablePhone(form.phone)) {
      setErrors((e) => ({ ...e, phone: "Escribe un teléfono válido para buscar." }));
      return;
    }
    setErrors((e) => ({ ...e, phone: "" }));
    setSearching(true);
    const { data, error } = await (supabase as any).rpc("emergency_worker_phone_lookup", {
      _company_id: selectedCompanyId,
      _phone: form.phone,
    });
    setSearching(false);
    if (error) {
      toast({ title: "No se pudo verificar el teléfono", description: error.message, variant: "destructive" });
      return;
    }
    setOutcome(classifyPhoneMatches((data ?? []) as PhoneMatch[], { hasPhone: true }));
  };

  const runAction = async (action: string, match: PhoneMatch) => {
    if (!selectedCompanyId) return;
    if (action === "assign_to_service") {
      closeWith(match.employee_id, match.first_name ?? "", match.last_name, match.phone_number);
      return;
    }
    if (action === "view_profile" || action === "update_data" || action === "open_canonical") {
      const target = action === "open_canonical" ? match.merged_into_employee_id! : match.employee_id;
      onOpenChange(false);
      navigate(`/app/employees/${target}`);
      return;
    }
    if (action === "reactivate_access") {
      setActing(match.employee_id);
      const { error } = await (supabase as any)
        .from("employees")
        .update({ is_active: true })
        .eq("id", match.employee_id)
        .eq("company_id", selectedCompanyId);
      setActing(null);
      if (error) {
        toast({ title: "No se pudo reactivar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Acceso reactivado", description: `${personDisplayName(match)} vuelve a estar disponible.` });
      await runLookup();
      return;
    }
    if (action === "add_membership") {
      setActing(match.employee_id);
      const { data, error } = await (supabase as any).rpc("emergency_worker_add_company_membership", {
        _company_id: selectedCompanyId,
        _source_employee_id: match.employee_id,
        _note: `emergency flow · shift=${shiftId ?? "unpublished"} · by=${user?.id ?? "unknown"}`,
      });
      setActing(null);
      if (error) {
        toast({ title: "No se pudo agregar a esta empresa", description: error.message, variant: "destructive" });
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      toast({
        title: row?.created ? "Persona agregada a esta empresa" : "Ya existía en esta empresa",
        description: "Misma identidad, sin duplicar teléfono ni perfil.",
      });
      closeWith(row.employee_id, match.first_name ?? "", match.last_name, match.phone_number);
    }
  };

  const submit = async () => {
    setErrors({});
    if (!selectedCompanyId) {
      toast({ title: "Selecciona una empresa", variant: "destructive" });
      return;
    }
    if (!isAdmin) {
      toast({
        title: "Sin permisos",
        description: "Solo admins/supervisores pueden crear trabajadores de emergencia.",
        variant: "destructive",
      });
      return;
    }
    if (!outcome?.canCreateNew) {
      toast({
        title: "Verifica primero el teléfono",
        description: "Busca a la persona antes de crear un registro nuevo.",
        variant: "destructive",
      });
      return;
    }
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const iss of parsed.error.issues) {
        const key = String(iss.path[0] ?? "form");
        if (!fe[key]) fe[key] = iss.message;
      }
      setErrors(fe);
      return;
    }
    const v = parsed.data;
    setSaving(true);

    const stamp = new Date().toISOString();
    const phoneNorm = v.noPhone ? null : normalizePhone(v.phone) || null;
    const noteParts = [
      `[${stamp}] emergency create`,
      `by=${user?.id ?? "unknown"}`,
      `shift=${shiftId ?? "unpublished"}`,
      `reason=${v.reason}`,
      `authorized_by=${v.authorizedBy}`,
      v.source ? `source=${v.source}` : null,
      v.noPhone ? `no_phone_reason=${v.noPhoneReason}` : null,
      v.note ? `note=${v.note}` : null,
    ].filter(Boolean).join(" · ");

    // ── Insert row (hard-coded fixed defaults per approved scope) ────────
    const { data, error } = await (supabase as any)
      .from("employees")
      .insert({
        company_id: selectedCompanyId,       // scoped, never manual
        first_name: v.first_name,
        last_name: v.last_name || "",
        phone_number: phoneNorm,
        is_active: true,
        // Phase 1 identity fields — fixed
        worker_type: "emergency_worker",
        identity_status: "pending_identity",
        requires_identity_resolution: true,
        payroll_approval_blocked: true,
        identity_source: "emergency",
        original_placeholder_name: null,
        identity_notes: noteParts,
        // Explicit portal/user guard rails
        portal_access_enabled: false,
        user_id: null,
        // Audit
        added_via: "emergency_flow",
      })
      .select(
        "id, first_name, last_name, phone_number, worker_type, identity_status, " +
        "requires_identity_resolution, payroll_approval_blocked, " +
        "portal_access_enabled, user_id, company_id, is_active",
      )
      .single();

    setSaving(false);

    if (error || !data) {
      toast({
        title: "No se pudo crear",
        description: error?.message ?? "Error desconocido",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Trabajador de emergencia creado",
      description:
        "Identidad pendiente · sin portal · payroll bloqueado hasta resolución.",
    });
    onCreated?.(data as EmergencyWorkerCreated);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Agregar trabajador de emergencia
          </DialogTitle>
          <DialogDescription className="text-xs">
            Registro temporal <strong>pendiente de identidad</strong>. No podrá
            ser aprobado para payroll hasta resolverse.
          </DialogDescription>
        </DialogHeader>

        {/* Context strip */}
        <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Empresa</span>
            <span className="font-medium">{selectedCompany?.name ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Turno relacionado: </span>
            <span className="font-medium">{shiftLabel || "Sin turno vinculado"}</span>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
              <ShieldAlert className="h-3 w-3 mr-1" /> Emergency
            </Badge>
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
              Pending identity
            </Badge>
            <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px]">
              Payroll bloqueado
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              <ShieldOff className="h-3 w-3 mr-1" /> Sin portal
            </Badge>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="ew-first" className="text-xs">Nombre *</Label>
              <Input id="ew-first" value={form.first_name}
                onChange={(e) => set("first_name", e.target.value.slice(0, 80))}
                className="h-8 text-sm" />
              {errors.first_name && <p className="text-[11px] text-destructive mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <Label htmlFor="ew-last" className="text-xs">Apellido</Label>
              <Input id="ew-last" value={form.last_name}
                onChange={(e) => set("last_name", e.target.value.slice(0, 80))}
                className="h-8 text-sm" />
            </div>
          </div>

          <div>
            <Label htmlFor="ew-phone" className="text-xs">Teléfono</Label>
            <Input id="ew-phone" value={form.phone}
              disabled={form.noPhone}
              onChange={(e) => set("phone", e.target.value.slice(0, 30))}
              className="h-8 text-sm" placeholder="(555) 555-0100" />
            {errors.phone && <p className="text-[11px] text-destructive mt-1">{errors.phone}</p>}
            <div className="flex items-start gap-2 mt-2">
              <Checkbox id="ew-nophone" checked={form.noPhone}
                onCheckedChange={(c) => set("noPhone", !!c)} />
              <div className="flex-1">
                <Label htmlFor="ew-nophone" className="text-xs cursor-pointer">
                  Sin teléfono disponible
                </Label>
                {form.noPhone && (
                  <>
                    <Textarea rows={2} className="text-xs mt-1"
                      placeholder="Motivo (obligatorio): p.ej. entregó documento sin contacto."
                      value={form.noPhoneReason}
                      onChange={(e) => set("noPhoneReason", e.target.value.slice(0, 300))} />
                    {errors.noPhoneReason && (
                      <p className="text-[11px] text-destructive mt-1">{errors.noPhoneReason}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="ew-reason" className="text-xs">Motivo de emergencia *</Label>
            <Textarea id="ew-reason" rows={2} className="text-xs"
              placeholder="Ej: reemplazo de última hora, worker no-show"
              value={form.reason}
              onChange={(e) => set("reason", e.target.value.slice(0, 500))} />
            {errors.reason && <p className="text-[11px] text-destructive mt-1">{errors.reason}</p>}
          </div>

          <div>
            <Label htmlFor="ew-auth" className="text-xs">Autorizado por (admin) *</Label>
            <Input id="ew-auth" value={form.authorizedBy}
              onChange={(e) => set("authorizedBy", e.target.value.slice(0, 120))}
              className="h-8 text-sm" placeholder="Nombre del admin que aprueba" />
            {errors.authorizedBy && <p className="text-[11px] text-destructive mt-1">{errors.authorizedBy}</p>}
          </div>

          <div>
            <Label htmlFor="ew-note" className="text-xs">Nota operacional</Label>
            <Textarea id="ew-note" rows={2} className="text-xs"
              value={form.note}
              onChange={(e) => set("note", e.target.value.slice(0, 1000))} />
          </div>

          <div>
            <Label htmlFor="ew-source" className="text-xs">Fuente / referido (opcional)</Label>
            <Input id="ew-source" value={form.source}
              onChange={(e) => set("source", e.target.value.slice(0, 160))}
              className="h-8 text-sm" placeholder="Ej: referido por otro trabajador" />
          </div>

          <p className="text-[11px] text-muted-foreground leading-snug">
            Se creará una fila en <code>employees</code> con acceso al portal <strong>deshabilitado</strong>,
            sin usuario de autenticación, y con aprobación de payroll <strong>bloqueada</strong>.
            Podrás asignarlo al turno actual desde el flujo estándar.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={submit} disabled={saving || !isAdmin}
            className="bg-amber-600 hover:bg-amber-700 text-white">
            {saving ? "Creando…" : "Crear trabajador de emergencia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
