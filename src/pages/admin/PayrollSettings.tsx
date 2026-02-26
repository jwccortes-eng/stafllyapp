import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { usePayrollConfig, DAY_NAMES, DEFAULT_CONFIG, type PayrollConfig } from "@/hooks/usePayrollConfig";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Settings, CalendarDays, Clock, AlertTriangle,
  Save, RotateCcw, Shield, Globe, Loader2,
} from "lucide-react";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
  "America/Mexico_City",
  "America/Bogota",
  "America/Sao_Paulo",
  "Europe/Madrid",
  "UTC",
];

export default function PayrollSettings() {
  const { user, role, hasActionPermission } = useAuth();
  const { selectedCompany } = useCompany();
  const { config, loading, saveConfig } = usePayrollConfig();
  const [form, setForm] = useState<PayrollConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [applyToOpen, setApplyToOpen] = useState(false);

  const canEdit = role === "owner" || role === "admin" || hasActionPermission("configurar_nomina");

  useEffect(() => {
    if (!loading) setForm(config);
  }, [config, loading]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveConfig(form, user.id);
      toast.success("Configuración de nómina guardada");
    } catch {
      toast.error("Error al guardar la configuración");
    }
    setSaving(false);
  };

  const handleReset = () => setForm(DEFAULT_CONFIG);

  const hasChanges = JSON.stringify(form) !== JSON.stringify(config);

  if (!canEdit) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <Shield className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No tienes permisos para acceder a esta configuración.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Configuración de Nómina
        </h1>
        <p className="page-subtitle">
          Define el ciclo semanal de nómina, cierre esperado y reglas de atraso para {selectedCompany?.name}
        </p>
      </div>

      {/* Week Configuration */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Ciclo semanal
          </CardTitle>
          <CardDescription>Define qué día inicia y termina la semana de nómina</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Día de inicio de semana</Label>
              <Select
                value={String(form.payroll_week_start_day)}
                onValueChange={(v) => setForm(f => ({ ...f, payroll_week_start_day: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((name, i) => (
                    <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">La semana inicia a las 00:00:00</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Día de cierre esperado</Label>
              <Select
                value={String(form.expected_close_day)}
                onValueChange={(v) => setForm(f => ({ ...f, expected_close_day: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((name, i) => (
                    <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl bg-muted/50 p-4">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Ciclo configurado:</span>{" "}
              {DAY_NAMES[form.payroll_week_start_day]} 00:00 → {DAY_NAMES[form.expected_close_day]} {form.expected_close_time}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Close & Overdue */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Cierre y atraso
          </CardTitle>
          <CardDescription>Hora de cierre esperada y días de gracia antes de marcar atraso</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Hora de cierre esperada</Label>
              <Input
                type="time"
                value={form.expected_close_time}
                onChange={(e) => setForm(f => ({ ...f, expected_close_time: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Días de gracia</Label>
              <Input
                type="number"
                min={0}
                max={14}
                value={form.overdue_grace_days}
                onChange={(e) => setForm(f => ({ ...f, overdue_grace_days: Number(e.target.value) }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Un periodo se marca como atrasado si no está cerrado después de {form.overdue_grace_days} día(s) del cierre esperado
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-warning/5 border border-warning/20 p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">Fórmula de atraso</p>
              <p>
                <code className="bg-muted px-1 py-0.5 rounded text-[10px]">overdueDays = floor((now - (expectedClose + graceDays)) / 1 día)</code>
              </p>
              <p className="mt-1">Se alerta cuando <code className="bg-muted px-1 py-0.5 rounded text-[10px]">status ≠ closed|published</code> y <code className="bg-muted px-1 py-0.5 rounded text-[10px]">now &gt; expectedClose + graceDays</code></p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timezone */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Zona horaria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-xs">
            <Select
              value={form.timezone}
              onValueChange={(v) => setForm(f => ({ ...f, timezone: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Todos los cálculos de cierre y atraso usan esta zona horaria</p>
          </div>
        </CardContent>
      </Card>

      {/* Apply to open periods switch */}
      <Card className="rounded-2xl border-warning/20">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Aplicar a periodos abiertos existentes</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Los periodos cerrados y publicados no serán afectados. Solo se recalculan periodos con status "open".
              </p>
            </div>
            <Switch checked={applyToOpen} onCheckedChange={setApplyToOpen} />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || !hasChanges} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar configuración
        </Button>
        <Button variant="outline" onClick={handleReset} className="gap-2" disabled={saving}>
          <RotateCcw className="h-4 w-4" />
          Restaurar valores por defecto
        </Button>
        {hasChanges && (
          <Badge variant="outline" className="text-warning border-warning/30">
            Sin guardar
          </Badge>
        )}
      </div>
    </div>
  );
}
