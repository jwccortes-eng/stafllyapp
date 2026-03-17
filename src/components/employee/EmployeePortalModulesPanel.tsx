import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, Clock, Wallet, CalendarCheck, Megaphone,
  MessageSquare, FileText, Star, BookOpen, Smartphone, RotateCcw,
} from "lucide-react";

const PORTAL_MODULES = [
  { key: "shifts", label: "Turnos", icon: CalendarDays, description: "Ver turnos asignados y disponibles" },
  { key: "clock", label: "Reloj de fichaje", icon: Clock, description: "Marcar entrada y salida" },
  { key: "earnings", label: "Pagos / Nómina", icon: Wallet, description: "Ver resumen de pagos y recibos" },
  { key: "availability", label: "Disponibilidad", icon: CalendarCheck, description: "Gestionar horarios disponibles" },
  { key: "announcements", label: "Anuncios", icon: Megaphone, description: "Noticias de la empresa" },
  { key: "chat", label: "Chat interno", icon: MessageSquare, description: "Mensajes con el equipo" },
  { key: "w9", label: "Formulario W-9", icon: FileText, description: "Información fiscal" },
  { key: "documents", label: "Documentos", icon: FileText, description: "Documentos personales" },
  { key: "reviews", label: "Evaluaciones", icon: Star, description: "Reputación y evaluaciones" },
  { key: "resources", label: "Recursos", icon: BookOpen, description: "Material de apoyo" },
];

const DEFAULT_ENABLED = new Set(["shifts", "clock", "earnings"]);

interface Props {
  employeeId: string;
  companyId: string;
}

interface ModuleState {
  module: string;
  enabled: boolean;
  id?: string;
}

export function EmployeePortalModulesPanel({ employeeId, companyId }: Props) {
  const [modules, setModules] = useState<ModuleState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchModules();
  }, [employeeId]);

  const fetchModules = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employee_portal_modules")
      .select("id, module, enabled")
      .eq("employee_id", employeeId);

    const existing = new Map((data ?? []).map((m) => [m.module, m]));
    const merged = PORTAL_MODULES.map((m) => ({
      module: m.key,
      enabled: existing.get(m.key)?.enabled ?? false,
      id: existing.get(m.key)?.id,
    }));
    setModules(merged);
    setLoading(false);
  };

  const toggleModule = async (moduleKey: string, enabled: boolean) => {
    setSaving(true);
    const existing = modules.find((m) => m.module === moduleKey);

    if (existing?.id) {
      await supabase
        .from("employee_portal_modules")
        .update({ enabled, updated_at: new Date().toISOString() } as any)
        .eq("id", existing.id);
    } else {
      await supabase.from("employee_portal_modules").insert({
        employee_id: employeeId,
        company_id: companyId,
        module: moduleKey,
        enabled,
      } as any);
    }

    setModules((prev) =>
      prev.map((m) => (m.module === moduleKey ? { ...m, enabled } : m))
    );
    setSaving(false);
  };

  const resetToDefaults = async () => {
    setSaving(true);
    // Delete all existing configs so it falls back to defaults
    await supabase
      .from("employee_portal_modules")
      .delete()
      .eq("employee_id", employeeId);

    setModules(PORTAL_MODULES.map((m) => ({
      module: m.key,
      enabled: false,
      id: undefined,
    })));
    toast({ title: "Módulos restablecidos a valores por defecto" });
    setSaving(false);
  };

  const enableAll = async () => {
    setSaving(true);
    for (const mod of PORTAL_MODULES) {
      const existing = modules.find((m) => m.module === mod.key);
      if (existing?.id) {
        await supabase
          .from("employee_portal_modules")
          .update({ enabled: true, updated_at: new Date().toISOString() } as any)
          .eq("id", existing.id);
      } else {
        await supabase.from("employee_portal_modules").insert({
          employee_id: employeeId,
          company_id: companyId,
          module: mod.key,
          enabled: true,
        } as any);
      }
    }
    setModules((prev) => prev.map((m) => ({ ...m, enabled: true })));
    toast({ title: "Todos los módulos activados" });
    setSaving(false);
  };

  const hasCustomConfig = modules.some((m) => m.id);
  const enabledCount = modules.filter((m) => m.enabled).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse bg-muted rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Smartphone className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Acceso Móvil</h3>
            <p className="text-[11px] text-muted-foreground">
              {hasCustomConfig
                ? `${enabledCount} módulos activos`
                : "Usando valores por defecto (Turnos, Reloj, Pagos)"}
            </p>
          </div>
        </div>
        {!hasCustomConfig && (
          <Badge variant="outline" className="text-[10px]">Default</Badge>
        )}
      </div>

      {/* Module list */}
      <div className="space-y-1.5">
        {PORTAL_MODULES.map((mod) => {
          const state = modules.find((m) => m.module === mod.key);
          const isEnabled = state?.enabled ?? DEFAULT_ENABLED.has(mod.key);

          return (
            <div
              key={mod.key}
              className="flex items-center justify-between py-2.5 px-3 rounded-xl border border-border/30 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <mod.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{mod.label}</p>
                  <p className="text-[10px] text-muted-foreground">{mod.description}</p>
                </div>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={(v) => toggleModule(mod.key, v)}
                disabled={saving}
              />
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-border/30">
        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={enableAll} disabled={saving}>
          Activar todos
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={resetToDefaults} disabled={saving}>
          <RotateCcw className="h-3 w-3" />
          Restablecer
        </Button>
      </div>
    </div>
  );
}
