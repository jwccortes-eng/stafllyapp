import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, Upload, DollarSign, FileSpreadsheet, BarChart3,
  Users, Tags, Smartphone, Copy, Loader2,
} from "lucide-react";

const ALL_MODULES = [
  { key: "periods", label: "Periodos", icon: CalendarDays, group: "Nómina" },
  { key: "import", label: "Importar", icon: Upload, group: "Nómina" },
  { key: "movements", label: "Novedades", icon: DollarSign, group: "Nómina" },
  { key: "summary", label: "Resumen", icon: FileSpreadsheet, group: "Nómina" },
  { key: "reports", label: "Reportes", icon: BarChart3, group: "Nómina" },
  { key: "employees", label: "Empleados", icon: Users, group: "Catálogos" },
  { key: "concepts", label: "Conceptos", icon: Tags, group: "Catálogos" },
  { key: "invite", label: "Invitar", icon: Smartphone, group: "Catálogos" },
];

interface ModuleRow {
  id?: string;
  module: string;
  is_active: boolean;
}

interface Props {
  companyId: string | null;
  companyName: string;
  isSandbox: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CompanyModulesDialog({ companyId, companyName, isSandbox, open, onOpenChange }: Props) {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [replicating, setReplicating] = useState(false);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && companyId) {
      fetchModules();
      fetchSandbox();
    }
  }, [open, companyId]);

  const fetchSandbox = async () => {
    const { data } = await supabase
      .from("companies")
      .select("id")
      .eq("is_sandbox", true)
      .maybeSingle();
    setSandboxId(data?.id ?? null);
  };

  const fetchModules = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("company_modules")
      .select("id, module, is_active")
      .eq("company_id", companyId);

    // Merge with all modules
    const existing = new Map((data ?? []).map(m => [m.module, m]));
    const merged = ALL_MODULES.map(m => ({
      id: existing.get(m.key)?.id,
      module: m.key,
      is_active: existing.get(m.key)?.is_active ?? false,
    }));
    setModules(merged);
  };

  const toggleModule = async (moduleKey: string, active: boolean) => {
    if (!companyId) return;
    setLoading(true);

    const existing = modules.find(m => m.module === moduleKey);
    if (existing?.id) {
      await supabase
        .from("company_modules")
        .update({ is_active: active, activated_at: active ? new Date().toISOString() : null } as any)
        .eq("id", existing.id);
    } else {
      await supabase
        .from("company_modules")
        .insert({
          company_id: companyId,
          module: moduleKey,
          is_active: active,
          activated_at: active ? new Date().toISOString() : null,
        } as any);
    }

    setModules(prev => prev.map(m => m.module === moduleKey ? { ...m, is_active: active } : m));
    setLoading(false);
  };

  const activateAll = async () => {
    if (!companyId) return;
    setLoading(true);
    for (const mod of ALL_MODULES) {
      const existing = modules.find(m => m.module === mod.key);
      if (existing?.id) {
        await supabase
          .from("company_modules")
          .update({ is_active: true, activated_at: new Date().toISOString() } as any)
          .eq("id", existing.id);
      } else {
        await supabase
          .from("company_modules")
          .insert({
            company_id: companyId,
            module: mod.key,
            is_active: true,
            activated_at: new Date().toISOString(),
          } as any);
      }
    }
    setModules(prev => prev.map(m => ({ ...m, is_active: true })));
    toast({ title: "Todos los módulos activados" });
    setLoading(false);
  };

  const replicateFromSandbox = async () => {
    if (!companyId || !sandboxId || companyId === sandboxId) return;
    setReplicating(true);

    try {
      // Copy concepts from sandbox
      const { data: sandboxConcepts } = await supabase
        .from("concepts")
        .select("name, category, calc_mode, rate_source, default_rate, unit_label, is_active")
        .eq("company_id", sandboxId);

      if (sandboxConcepts && sandboxConcepts.length > 0) {
        // Check existing concepts to avoid duplicates
        const { data: existingConcepts } = await supabase
          .from("concepts")
          .select("name")
          .eq("company_id", companyId);

        const existingNames = new Set((existingConcepts ?? []).map(c => c.name.toLowerCase()));
        const toInsert = sandboxConcepts
          .filter(c => !existingNames.has(c.name.toLowerCase()))
          .map(c => ({ ...c, company_id: companyId }));

        if (toInsert.length > 0) {
          const { error } = await supabase.from("concepts").insert(toInsert as any);
          if (error) throw error;
        }

        toast({
          title: "Datos replicados",
          description: `${toInsert.length} conceptos copiados desde Sandbox. ${sandboxConcepts.length - toInsert.length} ya existían.`,
        });
      } else {
        toast({ title: "Sin datos", description: "El Sandbox no tiene conceptos configurados" });
      }

      // Also activate the same modules
      const { data: sandboxModules } = await supabase
        .from("company_modules")
        .select("module, is_active")
        .eq("company_id", sandboxId);

      if (sandboxModules) {
        for (const sm of sandboxModules) {
          const existing = modules.find(m => m.module === sm.module);
          if (existing?.id) {
            await supabase
              .from("company_modules")
              .update({ is_active: sm.is_active, activated_at: sm.is_active ? new Date().toISOString() : null } as any)
              .eq("id", existing.id);
          } else {
            await supabase
              .from("company_modules")
              .insert({
                company_id: companyId,
                module: sm.module,
                is_active: sm.is_active,
                activated_at: sm.is_active ? new Date().toISOString() : null,
              } as any);
          }
        }
        await fetchModules();
      }
    } catch (err: any) {
      toast({ title: "Error al replicar", description: err.message, variant: "destructive" });
    }

    setReplicating(false);
  };

  const groups = [...new Set(ALL_MODULES.map(m => m.group))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Módulos de {companyName}
            {isSandbox && <Badge className="text-[10px]">Sandbox</Badge>}
          </DialogTitle>
          <DialogDescription>Activa o desactiva los módulos disponibles para esta empresa</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {groups.map(group => (
            <div key={group}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{group}</p>
              <div className="space-y-1.5">
                {ALL_MODULES.filter(m => m.group === group).map(mod => {
                  const state = modules.find(m => m.module === mod.key);
                  const active = state?.is_active ?? false;
                  return (
                    <div key={mod.key} className="flex items-center justify-between py-1.5 px-3 rounded-lg border">
                      <div className="flex items-center gap-2.5">
                        <mod.icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{mod.label}</span>
                      </div>
                      <Switch
                        checked={active}
                        onCheckedChange={(v) => toggleModule(mod.key, v)}
                        disabled={loading}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={activateAll} disabled={loading}>
            Activar todos
          </Button>
          {sandboxId && companyId !== sandboxId && (
            <Button
              variant="outline"
              size="sm"
              onClick={replicateFromSandbox}
              disabled={replicating}
            >
              {replicating ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Replicando...</>
              ) : (
                <><Copy className="h-3.5 w-3.5 mr-1.5" />Replicar desde Sandbox</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
