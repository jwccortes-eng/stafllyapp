import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, CalendarRange, Upload, MoreHorizontal,
  AlertTriangle, GitCompareArrows, Settings,
  Monitor, Copy, List,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { APP_BASE_URL } from "@/lib/app-url";
import { useClockConfig } from "@/hooks/useClockConfig";
import { ModuleSettingsSheet, type SettingsSection } from "@/components/settings/ModuleSettingsSheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import TimeClockCommandView from "@/components/timeclock/TimeClockCommandView";

/**
 * MobileTimeClockView — /app/timeclock on mobile (390x844).
 *
 * Renders the same Time Command Center as desktop to guarantee parity.
 * The command view is internally responsive (KPI grid collapses to 2 cols,
 * tabs scroll horizontally). No legacy avatar grid.
 *
 * READ-ONLY visual reorganization. No writes, no payroll changes.
 */
const CLOCK_SETTINGS_SECTIONS: SettingsSection[] = [
  {
    title: "Métodos de fichaje",
    description: "Controla cómo los empleados pueden registrar su asistencia",
    fields: [
      { key: "require_photo", label: "Requerir foto al fichar", description: "Solicitar foto en cada clock-in/out", type: "toggle" },
    ],
  },
  {
    title: "Geolocalización",
    description: "Controla la verificación GPS al fichar",
    fields: [
      { key: "gps_enforcement", label: "Modo de geocerca", description: "none = sin verificación, warn = alerta, block = bloquear fichaje", type: "select", options: [
        { value: "none", label: "Sin verificación" },
        { value: "warn", label: "Solo alerta" },
        { value: "block", label: "Bloquear fichaje" },
      ]},
      { key: "gps_radius_meters", label: "Radio GPS", description: "Distancia máxima permitida al punto de trabajo", type: "number", min: 50, max: 5000, suffix: "metros" },
    ],
  },
  {
    title: "Tolerancias",
    fields: [
      { key: "grace_period_minutes", label: "Período de gracia", description: "Minutos después del inicio del turno antes de marcar como tardanza", type: "number", min: 0, max: 60, suffix: "minutos" },
    ],
  },
];

export default function MobileTimeClockView() {
  const [clockSettingsOpen, setClockSettingsOpen] = useState(false);
  const { config: clockConfig, updateConfig: updateClockConfig, loading: clockConfigLoading } = useClockConfig();
  const navigate = useNavigate();

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-start justify-between gap-2">
        <PageHeader
          variant="3"
          title="Centro de Mando de Tiempo"
          subtitle="Asistencia en vivo, abiertos y alertas."
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setClockSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                Operación
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate("/app/discrepancies")} className="gap-2 text-sm">
                <AlertTriangle className="h-4 w-4" /> Discrepancias
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/app/comparison")} className="gap-2 text-sm">
                <GitCompareArrows className="h-4 w-4" /> Comparar prog. vs real
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/app/reports")} className="gap-2 text-sm">
                <List className="h-4 w-4" /> Timesheets &amp; reportes
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                Importar
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate("/app/import-timeclock")} className="gap-2 text-sm">
                <Upload className="h-4 w-4" /> Importar horas (Connecteam)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/app/import-schedule")} className="gap-2 text-sm">
                <CalendarRange className="h-4 w-4" /> Importar programación
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                Kiosk
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate("/app/kiosk")} className="gap-2 text-sm">
                <Monitor className="h-4 w-4" /> Terminales kiosk
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const url = `${APP_BASE_URL}/kiosk`;
                navigator.clipboard.writeText(url);
                toast.success("URL del kiosk copiada", { description: url });
              }} className="gap-2 text-sm">
                <Copy className="h-4 w-4" /> Copiar URL kiosk
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TimeClockCommandView />

      <ModuleSettingsSheet
        open={clockSettingsOpen}
        onOpenChange={setClockSettingsOpen}
        title="Configuración de Fichajes"
        icon={Clock}
        sections={CLOCK_SETTINGS_SECTIONS}
        config={clockConfig as unknown as Record<string, unknown>}
        onUpdate={updateClockConfig}
        loading={clockConfigLoading}
      />
    </div>
  );
}
