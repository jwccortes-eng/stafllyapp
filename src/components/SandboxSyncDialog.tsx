import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight, Check, X, Minus, LayoutGrid, Settings, Loader2, AlertTriangle,
} from "lucide-react";

interface Company {
  id: string;
  name: string;
  is_sandbox: boolean;
}

interface ModuleDiff {
  module: string;
  sandbox: boolean;
  target: boolean;
  status: "added" | "removed" | "unchanged";
}

interface SettingDiff {
  key: string;
  sandboxValue: any;
  targetValue: any;
  status: "added" | "changed" | "removed" | "unchanged";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sandboxId: string;
  companies: Company[];
  onSynced?: () => void;
}

export default function SandboxSyncDialog({ open, onOpenChange, sandboxId, companies, onSynced }: Props) {
  const { toast } = useToast();
  const [targetId, setTargetId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [moduleDiffs, setModuleDiffs] = useState<ModuleDiff[]>([]);
  const [settingDiffs, setSettingDiffs] = useState<SettingDiff[]>([]);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [selectedSettings, setSelectedSettings] = useState<Set<string>>(new Set());
  const [compared, setCompared] = useState(false);

  const targets = useMemo(
    () => companies.filter(c => c.id !== sandboxId && !c.is_sandbox),
    [companies, sandboxId]
  );

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTargetId("");
      setCompared(false);
      setModuleDiffs([]);
      setSettingDiffs([]);
      setSelectedModules(new Set());
      setSelectedSettings(new Set());
    }
  }, [open]);

  const handleCompare = async () => {
    if (!targetId) return;
    setLoading(true);

    const [
      { data: sbModules },
      { data: tgModules },
      { data: sbSettings },
      { data: tgSettings },
    ] = await Promise.all([
      supabase.from("company_modules").select("module, is_active").eq("company_id", sandboxId),
      supabase.from("company_modules").select("module, is_active").eq("company_id", targetId),
      supabase.from("company_settings").select("key, value").eq("company_id", sandboxId),
      supabase.from("company_settings").select("key, value").eq("company_id", targetId),
    ]);

    // Module diff
    const sbMap = new Map((sbModules ?? []).map(m => [m.module, m.is_active]));
    const tgMap = new Map((tgModules ?? []).map(m => [m.module, m.is_active]));
    const allModules = new Set([...sbMap.keys(), ...tgMap.keys()]);
    const mDiffs: ModuleDiff[] = [];
    const autoSelectModules = new Set<string>();

    allModules.forEach(mod => {
      const sb = sbMap.get(mod) ?? false;
      const tg = tgMap.get(mod) ?? false;
      const status = !tgMap.has(mod) ? "added" : sb !== tg ? (sb ? "added" : "removed") : "unchanged";
      mDiffs.push({ module: mod, sandbox: sbMap.has(mod) ? sb : false, target: tgMap.has(mod) ? tg : false, status });
      if (status !== "unchanged") autoSelectModules.add(mod);
    });

    // Setting diff
    const sbSettMap = new Map((sbSettings ?? []).map(s => [s.key, s.value]));
    const tgSettMap = new Map((tgSettings ?? []).map(s => [s.key, s.value]));
    const allKeys = new Set([...sbSettMap.keys(), ...tgSettMap.keys()]);
    const sDiffs: SettingDiff[] = [];
    const autoSelectSettings = new Set<string>();

    allKeys.forEach(key => {
      const sv = sbSettMap.get(key);
      const tv = tgSettMap.get(key);
      const status = !tgSettMap.has(key) ? "added" : !sbSettMap.has(key) ? "removed" : JSON.stringify(sv) !== JSON.stringify(tv) ? "changed" : "unchanged";
      sDiffs.push({ key, sandboxValue: sv, targetValue: tv, status });
      if (status !== "unchanged") autoSelectSettings.add(key);
    });

    setModuleDiffs(mDiffs);
    setSettingDiffs(sDiffs);
    setSelectedModules(autoSelectModules);
    setSelectedSettings(autoSelectSettings);
    setCompared(true);
    setLoading(false);
  };

  const changedModules = moduleDiffs.filter(d => d.status !== "unchanged");
  const changedSettings = settingDiffs.filter(d => d.status !== "unchanged");
  const hasChanges = changedModules.length > 0 || changedSettings.length > 0;
  const totalSelected = selectedModules.size + selectedSettings.size;

  const handleSync = async () => {
    setSyncing(true);
    try {
      // Sync modules
      for (const mod of changedModules) {
        if (!selectedModules.has(mod.module)) continue;
        if (mod.status === "added") {
          // Upsert module
          const { data: existing } = await supabase
            .from("company_modules")
            .select("id")
            .eq("company_id", targetId)
            .eq("module", mod.module)
            .maybeSingle();
          if (existing) {
            await supabase.from("company_modules").update({ is_active: mod.sandbox } as any).eq("id", existing.id);
          } else {
            await supabase.from("company_modules").insert({ company_id: targetId, module: mod.module, is_active: mod.sandbox } as any);
          }
        } else if (mod.status === "removed") {
          await supabase.from("company_modules").update({ is_active: false } as any).eq("company_id", targetId).eq("module", mod.module);
        }
      }

      // Sync settings
      for (const sett of changedSettings) {
        if (!selectedSettings.has(sett.key)) continue;
        if (sett.status === "removed") continue; // don't delete target settings not in sandbox
        const { data: existing } = await supabase
          .from("company_settings")
          .select("id")
          .eq("company_id", targetId)
          .eq("key", sett.key)
          .maybeSingle();
        if (existing) {
          await supabase.from("company_settings").update({ value: sett.sandboxValue } as any).eq("id", existing.id);
        } else {
          await supabase.from("company_settings").insert({ company_id: targetId, key: sett.key, value: sett.sandboxValue } as any);
        }
      }

      toast({ title: "Sincronización completada", description: `${totalSelected} cambios aplicados.` });
      onSynced?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSyncing(false);
  };

  const toggleModule = (mod: string) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      next.has(mod) ? next.delete(mod) : next.add(mod);
      return next;
    });
  };

  const toggleSetting = (key: string) => {
    setSelectedSettings(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "added") return <Badge className="bg-chart-1/10 text-chart-1 border-0 text-[10px]"><Check className="h-3 w-3 mr-0.5" />Nuevo</Badge>;
    if (status === "removed") return <Badge className="bg-destructive/10 text-destructive border-0 text-[10px]"><X className="h-3 w-3 mr-0.5" />Eliminado</Badge>;
    if (status === "changed") return <Badge className="bg-chart-4/10 text-chart-4 border-0 text-[10px]"><ArrowRight className="h-3 w-3 mr-0.5" />Cambio</Badge>;
    return <Badge variant="outline" className="text-[10px] text-muted-foreground"><Minus className="h-3 w-3 mr-0.5" />Igual</Badge>;
  };

  const targetName = targets.find(t => t.id === targetId)?.name ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Comparar y Sincronizar configuración
          </DialogTitle>
          <DialogDescription>
            Compara la configuración del Sandbox con una empresa y aplica los cambios seleccionados.
          </DialogDescription>
        </DialogHeader>

        {/* Target selector */}
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="shrink-0 text-xs">🧪 Sandbox</Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={targetId} onValueChange={v => { setTargetId(v); setCompared(false); }}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Selecciona empresa destino" /></SelectTrigger>
            <SelectContent>
              {targets.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleCompare} disabled={!targetId || loading} size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Comparar"}
          </Button>
        </div>

        {/* Results */}
        {compared && (
          <ScrollArea className="flex-1 min-h-0">
            {!hasChanges ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Check className="h-10 w-10 text-chart-1 mb-3" />
                <p className="font-semibold">Todo sincronizado</p>
                <p className="text-sm text-muted-foreground">La empresa "{targetName}" tiene la misma configuración que el Sandbox.</p>
              </div>
            ) : (
              <div className="space-y-6 pr-4">
                {/* Modules section */}
                {changedModules.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <LayoutGrid className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-sm">Módulos</h4>
                      <Badge variant="outline" className="text-[10px]">{changedModules.length} diferencias</Badge>
                    </div>
                    <div className="space-y-2">
                      {changedModules.map(d => (
                        <label key={d.module} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors">
                          <Checkbox
                            checked={selectedModules.has(d.module)}
                            onCheckedChange={() => toggleModule(d.module)}
                          />
                          <span className="text-sm font-medium capitalize flex-1">{d.module}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{d.target ? "✅ On" : "❌ Off"}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span className="font-semibold text-foreground">{d.sandbox ? "✅ On" : "❌ Off"}</span>
                          </div>
                          <StatusIcon status={d.status} />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Settings section */}
                {changedSettings.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Settings className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-sm">Configuraciones</h4>
                      <Badge variant="outline" className="text-[10px]">{changedSettings.length} diferencias</Badge>
                    </div>
                    <div className="space-y-2">
                      {changedSettings.map(d => (
                        <label key={d.key} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors">
                          <Checkbox
                            checked={selectedSettings.has(d.key)}
                            onCheckedChange={() => toggleSetting(d.key)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium font-mono">{d.key}</p>
                            {d.status === "changed" && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[10px] text-muted-foreground line-through truncate max-w-[120px]">
                                  {JSON.stringify(d.targetValue).slice(0, 30)}
                                </span>
                                <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                <span className="text-[10px] text-foreground font-semibold truncate max-w-[120px]">
                                  {JSON.stringify(d.sandboxValue).slice(0, 30)}
                                </span>
                              </div>
                            )}
                          </div>
                          <StatusIcon status={d.status} />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        )}

        {/* Footer */}
        {compared && hasChanges && (
          <div className="flex items-center justify-between pt-3 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Se aplicarán {totalSelected} cambios a "{targetName}"</span>
            </div>
            <Button onClick={handleSync} disabled={syncing || totalSelected === 0}>
              {syncing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sincronizando...</> : `Aplicar ${totalSelected} cambios`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
