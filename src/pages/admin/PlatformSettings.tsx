import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, Palette, ShieldCheck, Zap, Save } from "lucide-react";

interface SettingsMap {
  branding: { platform_name: string; tagline: string; primary_color: string };
  limits: { max_employees_per_company: number; max_companies: number; max_admins_per_company: number };
  features: { billing_enabled: boolean; onboarding_wizard: boolean; api_access: boolean };
}

export default function PlatformSettings() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("platform_settings").select("key, value");
      if (data) {
        const map: any = {};
        data.forEach((row: any) => { map[row.key] = row.value; });
        setSettings(map as SettingsMap);
      }
      setLoading(false);
    }
    load();
  }, []);

  const updateSetting = (key: keyof SettingsMap, field: string, value: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [key]: { ...settings[key], [field]: value },
    });
  };

  const save = async (key: keyof SettingsMap) => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("platform_settings")
      .update({ value: settings[key] as any, updated_at: new Date().toISOString() } as any)
      .eq("key", key);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuración guardada" });
      // Log the action
      await supabase.rpc("log_activity", {
        _action: "update",
        _entity_type: "platform_settings",
        _entity_id: key,
        _details: settings[key] as any,
      });
    }
    setSaving(false);
  };

  if (role !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  if (loading || !settings) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Configuración de Plataforma
        </h1>
        <p className="page-subtitle">Configura branding, límites y funcionalidades de Stafly</p>
      </div>

      <Tabs defaultValue="branding" className="space-y-6">
        <TabsList>
          <TabsTrigger value="branding" className="gap-2">
            <Palette className="h-4 w-4" /> Branding
          </TabsTrigger>
          <TabsTrigger value="limits" className="gap-2">
            <ShieldCheck className="h-4 w-4" /> Límites
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-2">
            <Zap className="h-4 w-4" /> Funcionalidades
          </TabsTrigger>
        </TabsList>

        {/* Branding */}
        <TabsContent value="branding">
          <Card>
            <CardHeader>
              <CardTitle>Identidad de marca</CardTitle>
              <CardDescription>Configura el nombre y apariencia de la plataforma</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre de la plataforma</Label>
                  <Input
                    value={settings.branding.platform_name}
                    onChange={e => updateSetting("branding", "platform_name", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tagline</Label>
                  <Input
                    value={settings.branding.tagline}
                    onChange={e => updateSetting("branding", "tagline", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Color primario</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings.branding.primary_color}
                    onChange={e => updateSetting("branding", "primary_color", e.target.value)}
                    className="h-10 w-14 rounded border cursor-pointer"
                  />
                  <Input
                    value={settings.branding.primary_color}
                    onChange={e => updateSetting("branding", "primary_color", e.target.value)}
                    className="w-32"
                  />
                  <div
                    className="h-10 w-20 rounded-lg shadow-sm"
                    style={{ backgroundColor: settings.branding.primary_color }}
                  />
                </div>
              </div>
              <Button onClick={() => save("branding")} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar branding"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Limits */}
        <TabsContent value="limits">
          <Card>
            <CardHeader>
              <CardTitle>Límites de uso</CardTitle>
              <CardDescription>Define los límites máximos por empresa para controlar el crecimiento</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Máx. empleados por empresa</Label>
                  <Input
                    type="number"
                    value={settings.limits.max_employees_per_company}
                    onChange={e => updateSetting("limits", "max_employees_per_company", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Máx. empresas</Label>
                  <Input
                    type="number"
                    value={settings.limits.max_companies}
                    onChange={e => updateSetting("limits", "max_companies", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Máx. admins por empresa</Label>
                  <Input
                    type="number"
                    value={settings.limits.max_admins_per_company}
                    onChange={e => updateSetting("limits", "max_admins_per_company", Number(e.target.value))}
                  />
                </div>
              </div>
              <Button onClick={() => save("limits")} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar límites"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features */}
        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Funcionalidades</CardTitle>
              <CardDescription>Activa o desactiva módulos globales de la plataforma</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Facturación / Billing</p>
                  <p className="text-sm text-muted-foreground">Habilita cobros y suscripciones por empresa</p>
                </div>
                <div className="flex items-center gap-2">
                  {!settings.features.billing_enabled && (
                    <Badge variant="outline" className="text-xs">Próximamente</Badge>
                  )}
                  <Switch
                    checked={settings.features.billing_enabled}
                    onCheckedChange={v => updateSetting("features", "billing_enabled", v)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Onboarding Wizard</p>
                  <p className="text-sm text-muted-foreground">Asistente paso a paso al crear nuevas empresas</p>
                </div>
                <Switch
                  checked={settings.features.onboarding_wizard}
                  onCheckedChange={v => updateSetting("features", "onboarding_wizard", v)}
                />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Acceso API</p>
                  <p className="text-sm text-muted-foreground">Permite a empresas acceder vía API REST</p>
                </div>
                <Switch
                  checked={settings.features.api_access}
                  onCheckedChange={v => updateSetting("features", "api_access", v)}
                />
              </div>
              <Button onClick={() => save("features")} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar funcionalidades"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
