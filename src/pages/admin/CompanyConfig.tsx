import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Settings, MapPin, Clock, CalendarDays, DollarSign, Zap, Shield,
  Loader2, Save, Palette, Upload, X, Lock,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/feedback/notify";
import {
  VersionConflictDialog,
  type VersionConflictInfo,
} from "@/components/data-integrity/VersionConflictDialog";
import {
  isEditableSettingKey,
  versionedCompanyProfileWrite,
  versionedCompanySettingWrite,
} from "@/lib/data/company-config-write";

const SURFACE = "admin/CompanyConfig";

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

/**
 * P0 — VWC Fase 3C.
 * Clase A (PATCH versionado): geofence, tolerancia, auto-cierre, auto-validación.
 * Clase C (configuración financiera bloqueada): semana de corte, overtime,
 * tipos de pago. Se muestran en solo lectura y se gestionan en Payroll.
 */
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

interface CompanyProfileRow {
  id: string;
  name: string;
  logo_url: string | null;
  brand_color: string | null;
  version: number | null;
}

/** Identidad visual: PATCH versionado sobre `name`, `logo_url`, `brand_color`. */
function BrandingCard({
  companyId,
  company,
  onReloadCompany,
  onConflict,
  onSaved,
}: {
  companyId: string;
  company: CompanyProfileRow | null;
  onReloadCompany: () => Promise<CompanyProfileRow | null>;
  onConflict: (info: VersionConflictInfo, retry: (version: number | null) => Promise<void>) => void;
  onSaved: () => void;
}) {
  const [brandColor, setBrandColor] = useState<string>(company?.brand_color ?? "#6366f1");
  const [customColor, setCustomColor] = useState(company?.brand_color ?? "#6366f1");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const logoUrl = company?.logo_url ?? null;

  useEffect(() => {
    setBrandColor(company?.brand_color ?? "#6366f1");
    setCustomColor(company?.brand_color ?? "#6366f1");
  }, [company?.brand_color]);

  /** Escritura única de identidad: PATCH parcial + expected_version. */
  const writeProfile = useCallback(
    async (patch: Record<string, any>, expectedVersion: number | null): Promise<boolean> => {
      const result = await versionedCompanyProfileWrite({
        companyId,
        patch,
        expectedVersion,
        surface: SURFACE,
      });

      if (result.status === "noop") return true;
      if (result.status === "conflict") {
        onConflict(
          {
            patch,
            serverRow: result.row,
            actualVersion: result.actualVersion,
            expectedVersion: result.expectedVersion,
            updatedAt: result.updatedAt,
          },
          async (version) => { await writeProfile(patch, version); },
        );
        return false;
      }
      if (result.status === "error") {
        notifyError({
          title: "No pudimos guardar la identidad visual",
          fact: result.message,
          consequence: "La configuración anterior sigue vigente.",
        });
        return false;
      }
      onSaved();
      return true;
    },
    [companyId, onConflict, onSaved],
  );

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notifyError({ title: "El logo no debe superar 2MB", consequence: "El logo actual se mantiene." });
      return;
    }
    setUploading(true);
    try {
      // El archivo anterior NO se borra: se conserva historia y evitamos
      // referencias rotas si la escritura de metadata falla.
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${companyId}/logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(path, file, { upsert: false, contentType: file.type });

      if (uploadError) {
        notifyError({
          title: "No pudimos subir el logo",
          fact: uploadError.message,
          consequence: "El logo anterior sigue visible. Puedes reintentar.",
          cause: uploadError,
        });
        return;
      }

      const { data: urlData } = supabase.storage.from("company-logos").getPublicUrl(path);
      // Releemos la versión antes de escribir metadata (fallback si el upload
      // tardó y otra persona guardó entre medio).
      const fresh = await onReloadCompany();
      const ok = await writeProfile({ logo_url: urlData.publicUrl }, fresh?.version ?? null);
      if (ok) notifySuccess({ title: "Logo actualizado", consequence: "Ya se ve en el selector de empresa." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    // Sin DELETE destructivo en storage: sólo se desreferencia.
    const ok = await writeProfile({ logo_url: null }, company?.version ?? null);
    if (ok) notifySuccess({ title: "Logo quitado", consequence: "El archivo anterior se conserva en auditoría." });
  };

  const saveBrandColor = async () => {
    if ((company?.brand_color ?? null) === brandColor) {
      notifyInfo({ title: "Sin cambios que guardar" });
      return;
    }
    setSaving(true);
    const ok = await writeProfile({ brand_color: brandColor }, company?.version ?? null);
    if (ok) notifySuccess({ title: "Color de marca guardado" });
    setSaving(false);
  };

  const initials = company?.name?.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Palette className="h-4 w-4" /> Identidad Visual
        </CardTitle>
        <CardDescription className="text-xs">
          Logo y color de marca para identificar tu empresa · versión {company?.version ?? "—"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-8">
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
                  aria-label="Quitar logo"
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
                  aria-label={`Color ${c}`}
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

interface SettingRow { id: string; value: Record<string, any>; version: number | null }

export default function CompanyConfig() {
  const { role } = useAuth();
  const { selectedCompanyId, selectedCompany, refetch } = useCompany();
  const [rows, setRows] = useState<Record<string, SettingRow>>({});
  /** Patches por clave: SÓLO los campos tocados por este operador. */
  const [drafts, setDrafts] = useState<Record<string, Record<string, any>>>({});
  const [company, setCompany] = useState<CompanyProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<VersionConflictInfo | null>(null);
  const retryRef = useRef<((version: number | null) => Promise<void>) | null>(null);
  const conflictKeyRef = useRef<string | null>(null);

  const loadCompany = useCallback(async (): Promise<CompanyProfileRow | null> => {
    if (!selectedCompanyId) return null;
    const { data } = await supabase
      .from("companies")
      .select("id, name, logo_url, brand_color, version")
      .eq("id", selectedCompanyId)
      .maybeSingle();
    const row = (data as any as CompanyProfileRow) ?? null;
    setCompany(row);
    return row;
  }, [selectedCompanyId]);

  const loadSettings = useCallback(async () => {
    if (!selectedCompanyId) return;
    const { data } = await supabase
      .from("company_settings")
      .select("id, key, value, version")
      .eq("company_id", selectedCompanyId);
    const map: Record<string, SettingRow> = {};
    for (const d of (data ?? []) as any[]) {
      map[d.key] = { id: d.id, value: (d.value as Record<string, any>) ?? {}, version: d.version ?? null };
    }
    setRows(map);
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    // Multi-tenant: al cambiar de empresa se descarta cualquier borrador previo.
    setDrafts({});
    setRows({});
    setCompany(null);
    setLoading(true);
    Promise.all([loadSettings(), loadCompany()]).finally(() => setLoading(false));
  }, [selectedCompanyId, loadSettings, loadCompany]);

  const valueOf = (key: string, path: string) => {
    const draft = drafts[key];
    if (draft && path in draft) return draft[path];
    return rows[key]?.value?.[path];
  };

  const updateField = (settingKey: string, fieldPath: string, value: any) => {
    setDrafts(prev => ({
      ...prev,
      [settingKey]: { ...(prev[settingKey] ?? {}), [fieldPath]: value },
    }));
  };

  const dirtyKeys = useMemo(
    () => Object.keys(drafts).filter(k => Object.keys(drafts[k] ?? {}).length > 0),
    [drafts],
  );

  const writeSetting = useCallback(
    async (key: string, patch: Record<string, any>, expectedVersion: number | null): Promise<boolean> => {
      const result = await versionedCompanySettingWrite({
        companyId: selectedCompanyId,
        key,
        patch,
        expectedVersion,
        surface: SURFACE,
      });

      if (result.status === "noop") return true;
      if (result.status === "conflict") {
        conflictKeyRef.current = key;
        retryRef.current = async (version) => { await writeSetting(key, patch, version); };
        setConflict({
          patch,
          serverRow: result.row,
          actualVersion: result.actualVersion,
          expectedVersion: result.expectedVersion,
          updatedAt: result.updatedAt,
        });
        return false;
      }
      if (result.status === "error") {
        notifyError({
          title: "No pudimos guardar la configuración",
          fact: result.message,
          consequence: "La configuración anterior sigue vigente.",
        });
        return false;
      }

      setRows(prev => ({
        ...prev,
        [key]: {
          id: result.row.id ?? prev[key]?.id ?? "",
          value: { ...(prev[key]?.value ?? {}), ...patch },
          version: result.version,
        },
      }));
      setDrafts(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return true;
    },
    [selectedCompanyId],
  );

  const saveAll = async () => {
    if (!selectedCompanyId || dirtyKeys.length === 0) {
      notifyInfo({ title: "Sin cambios que guardar" });
      return;
    }
    setSaving(true);
    let applied = 0;
    for (const key of dirtyKeys) {
      if (!isEditableSettingKey(key)) continue;
      const ok = await writeSetting(key, drafts[key], rows[key]?.version ?? null);
      if (!ok) break;
      applied += 1;
    }
    setSaving(false);
    if (applied > 0) {
      notifySuccess({
        title: "Configuración guardada",
        fact: `${applied} ${applied === 1 ? "bloque actualizado" : "bloques actualizados"}.`,
      });
      await supabase.rpc("log_activity", {
        _action: "update",
        _entity_type: "company_settings",
        _company_id: selectedCompanyId,
        _details: { settings_updated: dirtyKeys },
      });
    }
  };

  const handleReloadVersion = async () => {
    await loadSettings();
    await loadCompany();
    const key = conflictKeyRef.current;
    if (key) {
      setDrafts(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setConflict(null);
    retryRef.current = null;
    conflictKeyRef.current = null;
  };

  const handleKeepMine = async () => {
    const retry = retryRef.current;
    setConflict(null);
    if (!retry) return;
    setSaving(true);
    const key = conflictKeyRef.current;
    if (key) {
      await loadSettings();
      const { data } = await supabase
        .from("company_settings")
        .select("version")
        .eq("company_id", selectedCompanyId!)
        .eq("key", key)
        .maybeSingle();
      await retry((data as any)?.version ?? null);
    } else {
      const fresh = await loadCompany();
      await retry(fresh?.version ?? null);
    }
    setSaving(false);
    retryRef.current = null;
    conflictKeyRef.current = null;
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
          <Button onClick={saveAll} disabled={saving || loading || dirtyKeys.length === 0}>
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando...</>
            ) : (
              <><Save className="h-4 w-4 mr-2" /> Guardar cambios</>
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
          {selectedCompanyId && (
            <BrandingCard
              companyId={selectedCompanyId}
              company={company}
              onReloadCompany={loadCompany}
              onConflict={(info, retry) => {
                conflictKeyRef.current = null;
                retryRef.current = retry;
                setConflict(info);
              }}
              onSaved={async () => { await loadCompany(); refetch(); }}
            />
          )}

          {SETTINGS_CONFIG.map(config => {
            const SectionIcon = config.icon;
            const readOnly = !isEditableSettingKey(config.key);
            const dirty = Object.keys(drafts[config.key] ?? {}).length > 0;

            return (
              <Card key={config.key}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <SectionIcon className="h-4 w-4" />
                    {config.label}
                    {readOnly && (
                      <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                        <Lock className="h-3 w-3" /> Se gestiona en Payroll
                      </Badge>
                    )}
                    {dirty && (
                      <Badge variant="secondary" className="text-[10px] font-normal">Sin guardar</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {config.description}
                    {!readOnly && ` · versión ${rows[config.key]?.version ?? "—"}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {config.fields.map(field => {
                    const value = valueOf(config.key, field.path);
                    return (
                      <div key={field.path} className="flex items-center justify-between gap-4">
                        <Label className="text-sm font-medium min-w-0">{field.label}</Label>
                        <div className="flex items-center gap-2 shrink-0">
                          {field.type === "boolean" ? (
                            <Switch
                              checked={value ?? false}
                              disabled={readOnly}
                              onCheckedChange={(v) => updateField(config.key, field.path, v)}
                            />
                          ) : field.type === "select" ? (
                            <Select
                              value={value ?? ""}
                              disabled={readOnly}
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
                                value={value ?? ""}
                                readOnly={readOnly}
                                disabled={readOnly}
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
                              value={value ?? ""}
                              readOnly={readOnly}
                              disabled={readOnly}
                              onChange={(e) => updateField(config.key, field.path, e.target.value)}
                              className="w-[120px] h-8 text-xs"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <VersionConflictDialog
        open={!!conflict}
        conflict={conflict}
        kind="config"
        entityLabel="esta configuración"
        busy={saving}
        onKeepMine={handleKeepMine}
        onReload={handleReloadVersion}
        onCancel={() => { setConflict(null); retryRef.current = null; conflictKeyRef.current = null; }}
      />
    </div>
  );
}
