import { useEffect, useState, useRef } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Settings, MapPin, Clock, CalendarDays, DollarSign, Zap, Shield,
  Loader2, Save, Palette, Upload, X, ImageIcon,
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
      { path: "enforce", label: "Bloquear fichaje fuera del radio", type: "boolean" },
      { path: "radius_meters", label: "Radio por defecto", type: "number", suffix: "metros", min: 50, max: 5000 },
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

const BRAND_COLORS = [
  "#6366f1", "#3b82f6", "#10b981", "#14b8a6", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#f97316", "#84cc16",
  "#0ea5e9", "#a855f7", "#d946ef", "#059669", "#dc2626",
];

function BrandingCard({ companyId, company, onSaved }: {
  companyId: string; company: any; onSaved: () => void;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(company?.logo_url ?? null);
  const [brandColor, setBrandColor] = useState<string>(company?.brand_color ?? "#6366f1");
  const [customColor, setCustomColor] = useState(company?.brand_color ?? "#6366f1");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLogoUrl(company?.logo_url ?? null);
    setBrandColor(company?.brand_color ?? "#6366f1");
    setCustomColor(company?.brand_color ?? "#6366f1");
  }, [company]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El logo no debe superar 2MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${companyId}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("company-logos")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast.error("Error subiendo logo");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("company-logos").getPublicUrl(path);
    const url = urlData.publicUrl + "?t=" + Date.now();
    setLogoUrl(url);

    await supabase.from("companies").update({ logo_url: url }).eq("id", companyId);
    toast.success("Logo actualizado");
    onSaved();
    setUploading(false);
  };

  const removeLogo = async () => {
    await supabase.from("companies").update({ logo_url: null }).eq("id", companyId);
    setLogoUrl(null);
    toast.success("Logo eliminado");
    onSaved();
  };

  const saveBrandColor = async () => {
    setSaving(true);
    const { error } = await supabase.from("companies").update({ brand_color: brandColor }).eq("id", companyId);
    if (error) toast.error("Error guardando color");
    else { toast.success("Color guardado"); onSaved(); }
    setSaving(false);
  };

  const initials = company?.name?.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Palette className="h-4 w-4" /> Identidad Visual
        </CardTitle>
        <CardDescription className="text-xs">Logo y color de marca para identificar tu empresa</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-8">
          {/* Logo Section */}
          <div className="flex flex-col items-center gap-3">
            <Label className="text-xs font-semibold text-muted-foreground">Logo</Label>
            <div className="relative group">
              <Avatar className="h-20 w-20 rounded-2xl ring-2 ring-border/50">
                {logoUrl ? (
                  <AvatarImage src={logoUrl} alt="Logo" className="rounded-2xl object-cover" />
                ) : null}
                <AvatarFallback
                  className="rounded-2xl text-lg font-bold"
                  style={{ backgroundColor: `${brandColor}15`, color: brandColor }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              {logoUrl && (
                <button
                  onClick={removeLogo}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs gap-1.5"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {uploading ? "Subiendo..." : logoUrl ? "Cambiar" : "Subir logo"}
            </Button>
            <p className="text-[10px] text-muted-foreground">PNG, JPG · Max 2MB</p>
          </div>

          <Separator orientation="vertical" className="hidden sm:block h-auto" />

          {/* Color Section */}
          <div className="flex-1 space-y-4">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Color de marca</Label>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Se usa en el selector de empresa y elementos visuales</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {BRAND_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => { setBrandColor(c); setCustomColor(c); }}
                  className="h-8 w-8 rounded-xl transition-all duration-200 hover:scale-110 ring-offset-2 ring-offset-background"
                  style={{
                    backgroundColor: c,
                    boxShadow: brandColor === c ? `0 0 0 2px ${c}` : undefined,
                    outline: brandColor === c ? `2px solid ${c}` : "1px solid transparent",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs shrink-0">Personalizado:</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => { setCustomColor(e.target.value); setBrandColor(e.target.value); }}
                  className="h-8 w-10 rounded-lg border border-border cursor-pointer"
                />
                <Input
                  value={customColor}
                  onChange={(e) => { setCustomColor(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setBrandColor(e.target.value); }}
                  className="w-[100px] h-8 text-xs font-mono"
                  placeholder="#6366f1"
                />
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/30">
              <Avatar className="h-9 w-9 rounded-lg" style={{ borderColor: `${brandColor}30`, borderWidth: 1.5 }}>
                {logoUrl ? (
                  <AvatarImage src={logoUrl} className="rounded-lg object-cover" />
                ) : null}
                <AvatarFallback
                  className="rounded-lg text-[10px] font-bold"
                  style={{ backgroundColor: `${brandColor}15`, color: brandColor }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xs font-semibold" style={{ color: brandColor }}>{company?.name}</p>
                <p className="text-[10px] text-muted-foreground">Vista previa del selector</p>
              </div>
            </div>

            <Button onClick={saveBrandColor} disabled={saving} size="sm" className="gap-1.5">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Guardar color
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CompanyConfig() {
  const { role, user } = useAuth();
  const { selectedCompanyId, selectedCompany, refetch } = useCompany();
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

  if (role !== "owner" && role !== "developer" && role !== "admin" && role !== "company_owner") {
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
          {/* Branding Card - full width */}
          {selectedCompanyId && (
            <BrandingCard
              companyId={selectedCompanyId}
              company={selectedCompany}
              onSaved={refetch}
            />
          )}

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
