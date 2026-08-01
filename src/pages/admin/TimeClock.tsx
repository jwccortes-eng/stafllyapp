import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePageView } from "@/hooks/useAuditLog";
import { useIsMobile } from "@/hooks/use-mobile";
import AuditPanel from "@/components/audit/AuditPanel";
import {
  Clock, CalendarRange, Upload, MoreHorizontal,
  AlertTriangle, GitCompareArrows, Settings,
  Monitor, Copy, List,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { APP_BASE_URL } from "@/lib/app-url";
import { Button } from "@/components/ui/button";
import { useClockConfig } from "@/hooks/useClockConfig";
import { ModuleSettingsSheet, type SettingsSection } from "@/components/settings/ModuleSettingsSheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import TimeClockCommandView from "@/components/timeclock/TimeClockCommandView";
import MobileTimeClockView from "./MobileTimeClockView";

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

/**
 * Viewport wrapper. Mobile uses MobileTimeClockView; desktop renders the
 * existing DesktopTimeClockView byte-equivalent. Isolating hook universes
 * prevents Rules of Hooks violations across viewports.
 */
export default function TimeClock() {
  usePageView("Time Clock");
  const isMobile = useIsMobile();
  return isMobile ? <MobileTimeClockView /> : <DesktopTimeClockView />;
}

function DesktopTimeClockView() {
  const [clockSettingsOpen, setClockSettingsOpen] = useState(false);
  const { config: clockConfig, updateConfig: updateClockConfig, loading: clockConfigLoading } = useClockConfig();
  const navigate = useNavigate();

  return (
    <div className={cn(OX_STACK, OX_ENTER)}>
      <OperationalScreenHeader
        title="Fichajes"
        context="Actividad real de hoy. Payroll se calcula con fichajes reales o validaciones aprobadas."
        action={
          <>
            <Button size="sm" className="h-9 gap-1.5" onClick={() => navigate("/app/daily-ops")}>
              <Monitor className="h-4 w-4" />
              Operar el día
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[12px] font-normal text-muted-foreground">
                  Revisar
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => navigate("/app/discrepancies")} className="gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  Discrepancias
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/comparison")} className="gap-2 text-sm">
                  <GitCompareArrows className="h-4 w-4" />
                  Programado vs real
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/reports")} className="gap-2 text-sm">
                  <List className="h-4 w-4" />
                  Timesheets y reportes
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[12px] font-normal text-muted-foreground">
                  Importar
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => navigate("/app/import-timeclock")} className="gap-2 text-sm">
                  <Upload className="h-4 w-4" />
                  Importar horas (Connecteam)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/import-schedule")} className="gap-2 text-sm">
                  <CalendarRange className="h-4 w-4" />
                  Importar programación
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[12px] font-normal text-muted-foreground">
                  Configuración
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setClockSettingsOpen(true)} className="gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  Reglas de fichaje
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/payroll-settings")} className="gap-2 text-sm">
                  <Settings className="h-4 w-4" />
                  Configuración de nómina
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/kiosk")} className="gap-2 text-sm">
                  <Monitor className="h-4 w-4" />
                  Terminales kiosk
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const url = `${APP_BASE_URL}/kiosk`;
                    navigator.clipboard.writeText(url);
                    toast.success("URL del kiosk copiada", { description: url });
                  }}
                  className="gap-2 text-sm"
                >
                  <Copy className="h-4 w-4" />
                  Copiar URL kiosk
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />


      <TimeClockCommandView />

      {/* Audit trail */}
      <div className="mt-8">
        <AuditPanel
          entityType="time_entry"
          title="Actividad de fichajes"
          hideViews
          compact
        />
      </div>

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
