import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CalendarDays, Clock, DollarSign, MessageCircle, Megaphone,
  FileText, User, BookOpen, KeyRound, Eye, EyeOff, Loader2, Shield, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  isPrivileged: boolean;
  onEmployeeUpdate?: (updates: Partial<EmployeeRecord>) => void;
}

export function EmployeeAccessTab({ employee, companyId, isPrivileged, onEmployeeUpdate }: Props) {
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();

  // PIN state
  const [showPin, setShowPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    fetchModules();
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

    const { error } = await supabase
      .from("employees")
      .update({ access_pin: newPin })
      .eq("id", employee.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "PIN actualizado", description: `Nuevo PIN: ${newPin}` });
      setNewPin("");
    }
    setSavingPin(false);
  };

  const generateRandomPin = () => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    setNewPin(pin);
  };

  if (loading) return <div className="py-8 text-center text-xs text-muted-foreground">Cargando...</div>;

  const enabledCount = Object.values(modules).filter(Boolean).length;

  return (
    <div className="space-y-5">
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
                <p className="text-sm font-medium">PIN actual</p>
                <p className="text-xs text-muted-foreground">Usado para el inicio de sesión del empleado</p>
              </div>
              <div className="flex items-center gap-2">
                {employee.access_pin ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-mono font-bold tracking-widest">
                      {showPin ? employee.access_pin : "••••"}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPin(!showPin)}>
                      {showPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Sin PIN</Badge>
                )}
              </div>
            </div>

            {isPrivileged && (
              <>
                <Separator />
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Nuevo PIN (4 dígitos)</Label>
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

      {/* Portal Module Access */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Módulos del portal
          </h3>
          <Badge variant="outline" className="text-[10px]">
            {enabledCount}/{PORTAL_MODULES.length} activos
          </Badge>
        </div>
        <Card className="rounded-xl border-border/40">
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
      </div>
    </div>
  );
}
