import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Zap, Bell, MapPin, Clock, CalendarDays, DollarSign, Shield, AlertTriangle,
  Loader2, Save, CheckCircle2, XCircle, History,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface RuleDef {
  key: string;
  label: string;
  description: string;
  icon: typeof Zap;
  category: "alertas" | "automatizacion";
  configFields: ConfigField[];
}

interface ConfigField {
  path: string;
  label: string;
  type: "number" | "boolean" | "select";
  options?: { value: string; label: string }[];
  suffix?: string;
  min?: number;
  max?: number;
}

const RULES: RuleDef[] = [
  {
    key: "recordatorio_turno",
    label: "Recordatorio de Turno",
    description: "Notificar al empleado antes de su turno programado",
    icon: Bell,
    category: "alertas",
    configFields: [
      { path: "hours_before", label: "Horas antes", type: "number", suffix: "hrs", min: 1, max: 24 },
      { path: "channel", label: "Canal", type: "select", options: [
        { value: "push", label: "Push" }, { value: "email", label: "Email" }, { value: "both", label: "Ambos" },
      ]},
    ],
  },
  {
    key: "alerta_no_clock",
    label: "Alerta No-Clock",
    description: "Alertar cuando un empleado no registra entrada a su turno",
    icon: AlertTriangle,
    category: "alertas",
    configFields: [
      { path: "minutes_after", label: "Minutos después", type: "number", suffix: "min", min: 5, max: 120 },
      { path: "notify_admin", label: "Notificar admin", type: "boolean" },
    ],
  },
  {
    key: "alerta_fuera_geofence",
    label: "Alerta Fuera de Geofence",
    description: "Alertar cuando un registro se realiza fuera del área permitida",
    icon: MapPin,
    category: "alertas",
    configFields: [
      { path: "notify_admin", label: "Notificar admin", type: "boolean" },
      { path: "block_entry", label: "Bloquear registro", type: "boolean" },
    ],
  },
  {
    key: "alerta_horas_exceso",
    label: "Alerta Horas Exceso",
    description: "Alertar cuando un empleado supera el límite semanal de horas",
    icon: Clock,
    category: "alertas",
    configFields: [
      { path: "weekly_max_hours", label: "Máximo semanal", type: "number", suffix: "hrs", min: 20, max: 168 },
      { path: "notify_admin", label: "Notificar admin", type: "boolean" },
    ],
  },
  {
    key: "auto_validacion_clock",
    label: "Auto-Validación de Registros",
    description: "Validar automáticamente entradas/salidas que cumplan criterios",
    icon: Shield,
    category: "automatizacion",
    configFields: [
      { path: "validate_geofence", label: "Validar geofence", type: "boolean" },
      { path: "validate_schedule", label: "Validar horario", type: "boolean" },
    ],
  },
  {
    key: "auto_cierre_dia",
    label: "Auto-Cierre de Día",
    description: "Cerrar turnos sin salida después de un periodo configurable",
    icon: CalendarDays,
    category: "automatizacion",
    configFields: [
      { path: "close_after_hours", label: "Cerrar después de", type: "number", suffix: "hrs", min: 1, max: 24 },
    ],
  },
  {
    key: "auto_generar_nomina",
    label: "Auto-Generar Nómina",
    description: "Generar resumen de nómina al cerrar un periodo",
    icon: DollarSign,
    category: "automatizacion",
    configFields: [
      { path: "generate_on_close", label: "Generar al cerrar periodo", type: "boolean" },
    ],
  },
];

interface LogEntry {
  id: string;
  rule_key: string;
  status: string;
  details: any;
  triggered_at: string;
}

export default function Automations() {
  const { role, user } = useAuth();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [rules, setRules] = useState<Record<string, { enabled: boolean; config: any }>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);

    Promise.all([
      supabase
        .from("automation_rules")
        .select("rule_key, enabled, config")
        .eq("company_id", selectedCompanyId),
      supabase
        .from("automation_log")
        .select("*")
        .eq("company_id", selectedCompanyId)
        .order("triggered_at", { ascending: false })
        .limit(20),
    ]).then(([{ data: rulesData }, { data: logsData }]) => {
      const map: Record<string, { enabled: boolean; config: any }> = {};
      for (const r of rulesData ?? []) map[r.rule_key] = { enabled: r.enabled, config: r.config };
      setRules(map);
      setLogs((logsData as LogEntry[]) ?? []);
      setLoading(false);
    });
  }, [selectedCompanyId]);

  const toggleRule = (key: string) => {
    setRules(prev => ({
      ...prev,
      [key]: { ...prev[key], enabled: !(prev[key]?.enabled ?? false) },
    }));
  };

  const updateConfig = (ruleKey: string, fieldPath: string, value: any) => {
    setRules(prev => ({
      ...prev,
      [ruleKey]: {
        ...prev[ruleKey],
        config: { ...(prev[ruleKey]?.config ?? {}), [fieldPath]: value },
      },
    }));
  };

  const saveAll = async () => {
    if (!selectedCompanyId || !user) return;
    setSaving(true);

    const upserts = RULES.map(r => ({
      company_id: selectedCompanyId,
      rule_key: r.key,
      enabled: rules[r.key]?.enabled ?? false,
      config: rules[r.key]?.config ?? {},
      updated_by: user.id,
    }));

    const { error } = await supabase
      .from("automation_rules")
      .upsert(upserts as any, { onConflict: "company_id,rule_key" });

    if (error) {
      toast.error("Error al guardar automatizaciones");
    } else {
      toast.success("Automatizaciones guardadas");
      await supabase.rpc("log_activity", {
        _action: "update",
        _entity_type: "automation_rules",
        _company_id: selectedCompanyId,
        _details: { rules_enabled: RULES.filter(r => rules[r.key]?.enabled).map(r => r.key) },
      });
    }
    setSaving(false);
  };

  const enabledCount = RULES.filter(r => rules[r.key]?.enabled).length;

  if (role !== "owner" && role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  const alertRules = RULES.filter(r => r.category === "alertas");
  const autoRules = RULES.filter(r => r.category === "automatizacion");

  const renderRule = (rule: RuleDef) => {
    const RuleIcon = rule.icon;
    const ruleState = rules[rule.key] ?? { enabled: false, config: {} };

    return (
      <Card key={rule.key} className={ruleState.enabled ? "border-primary/30" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <RuleIcon className="h-4 w-4" />
              {rule.label}
              {ruleState.enabled && (
                <Badge className="text-[9px] bg-earning/10 text-earning border-earning/20">Activa</Badge>
              )}
            </CardTitle>
            <Switch
              checked={ruleState.enabled}
              onCheckedChange={() => toggleRule(rule.key)}
            />
          </div>
          <CardDescription className="text-xs">{rule.description}</CardDescription>
        </CardHeader>
        {ruleState.enabled && (
          <CardContent className="space-y-3 pt-0">
            <Separator />
            {rule.configFields.map(field => (
              <div key={field.path} className="flex items-center justify-between gap-4">
                <Label className="text-xs">{field.label}</Label>
                {field.type === "boolean" ? (
                  <Switch
                    checked={ruleState.config[field.path] ?? false}
                    onCheckedChange={(v) => updateConfig(rule.key, field.path, v)}
                  />
                ) : field.type === "select" ? (
                  <Select
                    value={ruleState.config[field.path] ?? ""}
                    onValueChange={(v) => updateConfig(rule.key, field.path, v)}
                  >
                    <SelectTrigger className="w-[120px] h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={ruleState.config[field.path] ?? ""}
                      onChange={(e) => updateConfig(rule.key, field.path, Number(e.target.value))}
                      className="w-[70px] h-7 text-xs text-right"
                      min={field.min}
                      max={field.max}
                    />
                    {field.suffix && <span className="text-[10px] text-muted-foreground">{field.suffix}</span>}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div>
      <PageHeader
        variant="3"
        title="Automatizaciones"
        subtitle={`${selectedCompany?.name} — ${enabledCount} de ${RULES.length} reglas activas`}
        rightSlot={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowLog(!showLog)}>
              <History className="h-4 w-4 mr-1" />
              {showLog ? "Ocultar log" : "Ver log"}
            </Button>
            <Button onClick={saveAll} disabled={saving || loading}>
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" /> Guardar</>
              )}
            </Button>
          </div>
        }
      />



      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Alertas */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Bell className="h-4 w-4" /> Alertas y Notificaciones
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {alertRules.map(renderRule)}
              </div>
            </div>

            {/* Automatizaciones */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4" /> Procesos Automáticos
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {autoRules.map(renderRule)}
              </div>
            </div>
          </div>

          {/* Log sidebar */}
          {showLog && (
            <div className="lg:col-span-1">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Historial de Ejecución
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {logs.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        Sin ejecuciones registradas
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {logs.map(log => {
                          const ruleDef = RULES.find(r => r.key === log.rule_key);
                          return (
                            <div key={log.id} className="flex items-start gap-2 text-xs">
                              {log.status === "success" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-earning shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                              )}
                              <div>
                                <p className="font-medium">{ruleDef?.label ?? log.rule_key}</p>
                                <p className="text-muted-foreground">
                                  {formatDistanceToNow(parseISO(log.triggered_at), { addSuffix: true, locale: es })}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
