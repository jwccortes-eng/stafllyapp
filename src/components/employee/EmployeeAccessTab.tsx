import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CalendarDays, Clock, DollarSign, MessageCircle, Megaphone,
  FileText, User, BookOpen, KeyRound, Loader2, Shield, RefreshCw, CheckCircle2, ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PortalAccessCard } from "./PortalAccessCard";
import type { EmployeeInvitation } from "@/hooks/useEmployeeInvitations";

type EmployeeRecord = Record<string, any>;

const PORTAL_MODULES = [
  { key: "my_shifts", label: "Mis Turnos", icon: CalendarDays, description: "Ver turnos asignados y solicitar nuevos" },
  { key: "my_clock", label: "Reloj / Fichaje", icon: Clock, description: "Registrar entrada y salida" },
  { key: "my_payments", label: "Mis Pagos", icon: DollarSign, description: "Ver historial de pagos y recibos" },
  { key: "my_chat", label: "Chat", icon: MessageCircle, description: "Mensajería interna con la empresa" },
  { key: "my_announcements", label: "Anuncios", icon: Megaphone, description: "Ver comunicados de la empresa" },
  { key: "my_w9", label: "Formulario W-9", icon: FileText, description: "Datos fiscales y documentos" },
  { key: "my_profile", label: "Mi Perfil", icon: User, description: "Editar información personal" },
  { key: "my_resources", label: "Recursos", icon: BookOpen, description: "Documentos y materiales de apoyo" },
];

interface Props {
  employee: EmployeeRecord;
  companyId: string;
  companyName?: string;
  isPrivileged: boolean;
  onEmployeeUpdate?: (updates: Partial<EmployeeRecord>) => void;
  onInvite?: () => void;
  invitation?: EmployeeInvitation | null;
}

export function EmployeeAccessTab({ employee, companyId, companyName, isPrivileged, onEmployeeUpdate, onInvite, invitation }: Props) {
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [modulesOpen, setModulesOpen] = useState(false);
  const { toast } = useToast();

  // PIN state — Phase 1: never display the stored PIN. Show only "configured / none"
  // and surface the freshly-generated PIN once after a reset (one-time reveal).
  const [newPin, setNewPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [lastGeneratedPin, setLastGeneratedPin] = useState<string | null>(null);
  const [hasPinResolved, setHasPinResolved] = useState<boolean | null>(null);

  useEffect(() => {
    fetchModules();
    let cancelled = false;
    (async () => {
      try {
        const { checkEmployeeHasPin } = await import("@/lib/access-pin");
        const v = await checkEmployeeHasPin(employee.id);
        if (!cancelled) setHasPinResolved(v);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [employee.id, companyId]);

  const fetchModules = async () => {
    const { data } = await supabase
      .from("employee_portal_modules")
      .select("module, enabled")
      .eq("employee_id", employee.id)
      .eq("company_id", companyId);

    const map: Record<string, boolean> = {};
    PORTAL_MODULES.forEach(m => { map[m.key] = true; }); // default all enabled
    (data ?? []).forEach((row: any) => { map[row.module] = row.enabled; });
    setModules(map);
    setLoading(false);
  };

  const toggleModule = async (moduleKey: string, enabled: boolean) => {
    if (!isPrivileged) return;
    setSaving(moduleKey);

    const { error } = await supabase
      .from("employee_portal_modules")
      .upsert({
        employee_id: employee.id,
        company_id: companyId,
        module: moduleKey,
        enabled,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "employee_id,module" });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setModules(prev => ({ ...prev, [moduleKey]: enabled }));
    }
    setSaving(null);
  };

  const handlePinChange = async () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      toast({ title: "PIN inválido", description: "El PIN debe ser exactamente 4 dígitos numéricos", variant: "destructive" });
      return;
    }
    setSavingPin(true);
    try {
      const { setEmployeePin } = await import("@/lib/access-pin");
      await setEmployeePin(employee.id, newPin);

      // Sync auth password if employee has a linked user account
      if (employee.user_id) {
        try {
          await supabase.functions.invoke("admin-reset-password", {
            body: { user_id: employee.user_id, new_password: `SF_${newPin}` },
          });
        } catch (syncErr) {
          console.warn("Auth password sync error:", syncErr);
        }
      }

      toast({ title: "PIN actualizado", description: "Cópialo ahora — no se mostrará de nuevo." });
      setLastGeneratedPin(newPin);
      setHasPinResolved(true);
      onEmployeeUpdate?.({ has_access_pin: true });
      setNewPin("");
    } catch (err: any) {
      const msg = err?.message ?? "Error al guardar PIN";
      const friendly = msg === "forbidden" ? "No tienes permiso para cambiar el PIN de este empleado."
        : msg === "invalid_pin_format" ? "Formato de PIN inválido (4 dígitos)."
        : msg;
      toast({ title: "Error", description: friendly, variant: "destructive" });
    } finally {
      setSavingPin(false);
    }
  };

  const generateRandomPin = async () => {
    setSavingPin(true);
    try {
      const { resetEmployeePin } = await import("@/lib/access-pin");
      const newPinValue = await resetEmployeePin(employee.id);
      setLastGeneratedPin(newPinValue);
      setHasPinResolved(true);
      onEmployeeUpdate?.({ has_access_pin: true });
      toast({ title: "PIN generado", description: "Cópialo ahora — no se mostrará de nuevo." });
    } catch (err: any) {
      const msg = err?.message ?? "No se pudo generar el PIN";
      toast({ title: "Error", description: msg === "forbidden" ? "Sin permiso para resetear PIN." : msg, variant: "destructive" });
    } finally {
      setSavingPin(false);
    }
  };

  if (loading) return <div className="py-8 text-center text-xs text-muted-foreground">Cargando...</div>;

  const enabledCount = Object.values(modules).filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* Portal Access Status Card */}
      <PortalAccessCard employee={employee} companyName={companyName ?? "Stafly Core"} invitation={invitation} onInvite={onInvite} />

      {/* PIN Management */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 flex items-center gap-1.5">
          <KeyRound className="h-3.5 w-3.5" />
          Clave de acceso (PIN)
        </h3>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">PIN del empleado</p>
                <p className="text-xs text-muted-foreground">Usado para el inicio de sesión del empleado</p>
              </div>
              {employee.has_access_pin === true || hasPinResolved === true || !!lastGeneratedPin ? (
                <Badge variant="outline" className="text-[10px] text-[hsl(var(--earning))] border-[hsl(var(--earning))]/30 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> PIN configurado
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">Sin PIN</Badge>
              )}
            </div>

            {/* One-time reveal after reset — does not persist on re-render of stored data */}
            {lastGeneratedPin && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 space-y-1">
                <p className="text-[10px] font-semibold text-warning uppercase tracking-wider">
                  Nuevo PIN (cópialo ahora)
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-mono font-bold tracking-widest">{lastGeneratedPin}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => { navigator.clipboard.writeText(lastGeneratedPin); toast({ title: "PIN copiado" }); }}
                  >
                    Copiar
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">No se mostrará de nuevo. Compártelo ahora con el empleado.</p>
              </div>
            )}

            {isPrivileged && (
              <>
                <Separator />
                {/* Recuperación verificada: el trabajador crea su PIN, nadie más lo ve */}
                <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 space-y-2">
                  <div>
                    <p className="text-xs font-semibold">Enviar recuperación de acceso</p>
                    <p className="text-[11px] text-muted-foreground">
                      Recomendado. Enviamos un código al correo de la persona; ella crea su PIN nuevo y se levanta el bloqueo. Nadie más ve el PIN.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={sendingRecovery}
                    onClick={handleSendRecovery}
                  >
                    {sendingRecovery ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Enviar código de recuperación"}
                  </Button>
                </div>
                <Separator />
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Resetear PIN (4 dígitos)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={newPin}
                      onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="0000"
                      className="h-9 font-mono tracking-widest text-center text-lg"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="h-9" onClick={generateRandomPin} title="Generar PIN aleatorio">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" className="h-9" disabled={savingPin || newPin.length !== 4} onClick={handlePinChange}>
                    {savingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Portal Module Access — compact: summary chip + collapsible toggle list */}
      <div>
        <Collapsible open={modulesOpen} onOpenChange={setModulesOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between rounded-xl border border-border/40 bg-card px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">Módulos del portal</span>
                <Badge variant="outline" className="text-[10px] ml-1">
                  {enabledCount}/{PORTAL_MODULES.length} activos
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {modulesOpen ? "Ocultar" : "Ver módulos del portal"}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${modulesOpen ? "rotate-180" : ""}`} />
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="rounded-xl border-border/40 mt-2">
              <CardContent className="p-0 divide-y divide-border/30">
                {PORTAL_MODULES.map(mod => {
                  const Icon = mod.icon;
                  const enabled = modules[mod.key] ?? true;
                  return (
                    <div key={mod.key} className="flex items-center gap-3 px-4 py-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${enabled ? "bg-primary/10" : "bg-muted"}`}>
                        <Icon className={`h-4 w-4 ${enabled ? "text-primary" : "text-muted-foreground/40"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${!enabled ? "text-muted-foreground/50" : ""}`}>{mod.label}</p>
                        <p className="text-[10px] text-muted-foreground/60 truncate">{mod.description}</p>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={v => toggleModule(mod.key, v)}
                        disabled={!isPrivileged || saving === mod.key}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
