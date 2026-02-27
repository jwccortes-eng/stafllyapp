import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Settings, MapPin, Clock, CalendarDays, DollarSign, Zap, Shield,
  Loader2, Save,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface SettingConfig {
  key: string;
  label: string;
  description: string;
  icon: typeof Settings;
  fields: FieldConfig[];
}

interface FieldConfig {
  path: string;
  label: string;
  type: "number" | "boolean" | "select" | "text";
  options?: { value: string; label: string }[];
  suffix?: string;
  min?: number;
  max?: number;
}

const SETTINGS_CONFIG: SettingConfig[] = [
  {
    key: "geofence",
    label: "Geofence",
    description: "Radio de validación para registros de entrada/salida",
    icon: MapPin,
    fields: [
      { path: "enabled", label: "Geofence activo", type: "boolean" },
      { path: "radius_meters", label: "Radio", type: "number", suffix: "metros", min: 50, max: 5000 },
    ],
  },
  {
    key: "time_tolerance",
    label: "Tolerancia de Tiempo",
    description: "Minutos de tolerancia para registros de reloj",
    icon: Clock,
    fields: [
      { path: "clock_in_minutes", label: "Tolerancia entrada", type: "number", suffix: "min", min: 0, max: 60 },
      { path: "clock_out_minutes", label: "Tolerancia salida", type: "number", suffix: "min", min: 0, max: 60 },
    ],
  },
  {
    key: "pay_week",
    label: "Semana de Corte",
    description: "Día y hora de cierre del periodo de nómina",
    icon: CalendarDays,
    fields: [
      {
        path: "cut_day", label: "Día de corte", type: "select",
        options: [
          { value: "monday", label: "Lunes" },
          { value: "tuesday", label: "Martes" },
          { value: "wednesday", label: "Miércoles" },
          { value: "thursday", label: "Jueves" },
          { value: "friday", label: "Viernes" },
          { value: "saturday", label: "Sábado" },
          { value: "sunday", label: "Domingo" },
        ],
      },
      { path: "cut_time", label: "Hora de corte", type: "text" },
    ],
  },
  {
    key: "overtime",
    label: "Reglas de Overtime",
    description: "Configuración de horas extra y multiplicadores",
    icon: DollarSign,
    fields: [
      { path: "enabled", label: "Overtime activo", type: "boolean" },
      { path: "weekly_threshold_hours", label: "Umbral semanal", type: "number", suffix: "hrs", min: 1, max: 168 },
      { path: "rate_multiplier", label: "Multiplicador", type: "number", suffix: "x", min: 1, max: 5 },
    ],
  },
  {
    key: "auto_close",
    label: "Auto-Cierre de Día",
    description: "Cerrar automáticamente turnos sin salida registrada",
    icon: Zap,
    fields: [
      { path: "enabled", label: "Auto-cierre activo", type: "boolean" },
      { path: "close_after_hours", label: "Cerrar después de", type: "number", suffix: "hrs", min: 1, max: 24 },
    ],
  },
  {
    key: "auto_validation",
    label: "Auto-Validación",
    description: "Validar automáticamente los registros de reloj",
    icon: Shield,
    fields: [
      { path: "enabled", label: "Auto-validación activa", type: "boolean" },
      { path: "validate_geofence", label: "Validar geofence", type: "boolean" },
      { path: "validate_schedule", label: "Validar horario", type: "boolean" },
    ],
  },
  {
    key: "pay_types",
    label: "Tipos de Pago",
    description: "Modalidades de pago disponibles para empleados",
    icon: DollarSign,
    fields: [
      {
        path: "default", label: "Tipo por defecto", type: "select",
        options: [
          { value: "hourly", label: "Por hora" },
          { value: "salary", label: "Salario fijo" },
          { value: "mixed", label: "Mixto" },
        ],
      },
    ],
  },
];

export default function CompanyConfig() {
  const { role, user } = useAuth();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);

    supabase
      .from("company_settings")
      .select("key, value")
      .eq("company_id", selectedCompanyId)
      .then(({ data }) => {
        const map: Record<string, any> = {};
        for (const d of data ?? []) map[d.key] = d.value;
        setSettings(map);
        setLoading(false);
      });
  }, [selectedCompanyId]);

  const updateField = (settingKey: string, fieldPath: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [settingKey]: {
        ...(prev[settingKey] ?? {}),
        [fieldPath]: value,
      },
    }));
  };

  const saveAll = async () => {
    if (!selectedCompanyId || !user) return;
    setSaving(true);

    const upserts = Object.entries(settings).map(([key, value]) => ({
      company_id: selectedCompanyId,
      key,
      value,
      updated_by: user.id,
    }));

    const { error } = await supabase
      .from("company_settings")
      .upsert(upserts as any, { onConflict: "company_id,key" });

    if (error) {
      toast.error("Error al guardar configuración");
    } else {
      toast.success("Configuración guardada");
      await supabase.rpc("log_activity", {
        _action: "update",
        _entity_type: "company_settings",
        _company_id: selectedCompanyId,
        _details: { settings_updated: Object.keys(settings) },
      });
    }
    setSaving(false);
  };

  if (role !== "owner" && role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        variant="3"
        title="Configuración de Empresa"
        subtitle={`${selectedCompany?.name ?? "Empresa"} — Parámetros operativos y reglas de negocio`}
        rightSlot={
          <Button onClick={saveAll} disabled={saving || loading}>
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando...</>
            ) : (
              <><Save className="h-4 w-4 mr-2" /> Guardar todo</>
            )}
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {SETTINGS_CONFIG.map(config => {
            const SectionIcon = config.icon;
            const values = settings[config.key] ?? {};

            return (
              <Card key={config.key}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <SectionIcon className="h-4 w-4" />
                    {config.label}
                  </CardTitle>
                  <CardDescription className="text-xs">{config.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {config.fields.map(field => (
                    <div key={field.path} className="flex items-center justify-between gap-4">
                      <Label className="text-sm font-medium min-w-0">{field.label}</Label>
                      <div className="flex items-center gap-2 shrink-0">
                        {field.type === "boolean" ? (
                          <Switch
                            checked={values[field.path] ?? false}
                            onCheckedChange={(v) => updateField(config.key, field.path, v)}
                          />
                        ) : field.type === "select" ? (
                          <Select
                            value={values[field.path] ?? ""}
                            onValueChange={(v) => updateField(config.key, field.path, v)}
                          >
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options?.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : field.type === "number" ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              value={values[field.path] ?? ""}
                              onChange={(e) => updateField(config.key, field.path, Number(e.target.value))}
                              className="w-[80px] h-8 text-xs text-right"
                              min={field.min}
                              max={field.max}
                            />
                            {field.suffix && (
                              <span className="text-[10px] text-muted-foreground">{field.suffix}</span>
                            )}
                          </div>
                        ) : (
                          <Input
                            value={values[field.path] ?? ""}
                            onChange={(e) => updateField(config.key, field.path, e.target.value)}
                            className="w-[120px] h-8 text-xs"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
