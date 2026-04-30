import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePageView } from "@/hooks/useAuditLog";
import { useIsMobile } from "@/hooks/use-mobile";
import AuditPanel from "@/components/audit/AuditPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Clock, CalendarRange, Upload, MoreHorizontal, List, Calendar as CalendarIcon,
  FileBarChart, AlertTriangle, GitCompareArrows, Download, Settings, RefreshCw,
  Monitor, Copy, Users, ArrowRight,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import TodayView from "./TodayView";
import { TimesheetView } from "@/components/timeclock/TimesheetView";
import { MonthClockView } from "@/components/timeclock/MonthClockView";
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
  const [activeTab, setActiveTab] = useState("live");
  const [timesheetMode, setTimesheetMode] = useState<"list" | "calendar">("list");
  const [clockSettingsOpen, setClockSettingsOpen] = useState(false);
  const { config: clockConfig, updateConfig: updateClockConfig, loading: clockConfigLoading } = useClockConfig();
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader
          variant="3"
          title="Time Clock"
          subtitle="Live attendance, open clocks and worker activity."
        />
        <div className="flex items-center gap-2">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-1.5 hidden sm:flex"
                  onClick={() => navigate("/app/discrepancies")}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Discrepancias
                </Button>
              </TooltipTrigger>
              <TooltipContent>Detectar ausencias, tardanzas y horas extra</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-1.5 hidden sm:flex"
                  onClick={() => navigate("/app/comparison")}
                >
                  <GitCompareArrows className="h-3.5 w-3.5" />
                  Comparar
                </Button>
              </TooltipTrigger>
              <TooltipContent>Programación vs ejecución real</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setClockSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
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
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                Reportes
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate("/app/discrepancies")} className="gap-2 text-sm sm:hidden">
                <AlertTriangle className="h-4 w-4" />
                Reporte de discrepancias
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/app/comparison")} className="gap-2 text-sm sm:hidden">
                <GitCompareArrows className="h-4 w-4" />
                Comparación prog. vs real
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/app/reports")} className="gap-2 text-sm">
                <FileBarChart className="h-4 w-4" />
                Todos los reportes
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                Configuración
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate("/app/payroll-settings")} className="gap-2 text-sm">
                <Settings className="h-4 w-4" />
                Config. de nómina
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/app/kiosk")} className="gap-2 text-sm">
                <Monitor className="h-4 w-4" />
                Terminales kiosk
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const url = `${APP_BASE_URL}/kiosk`;
                navigator.clipboard.writeText(url);
                toast.success("URL del kiosk copiada", { description: url });
              }} className="gap-2 text-sm">
                <Copy className="h-4 w-4" />
                Copiar URL kiosk
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-3">
          <TabsList className="w-auto">
            <TabsTrigger value="live" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Live now
            </TabsTrigger>
            <TabsTrigger value="today" className="gap-1.5 text-xs">
              <CalendarRange className="h-3.5 w-3.5" />
              Today
            </TabsTrigger>
            <TabsTrigger value="timesheets" className="gap-1.5 text-xs">
              <CalendarRange className="h-3.5 w-3.5" />
              Timesheets
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              All workers
            </TabsTrigger>
          </TabsList>

          {activeTab === "timesheets" && (
            <ToggleGroup type="single" value={timesheetMode} onValueChange={(v) => v && setTimesheetMode(v as "list" | "calendar")} size="sm">
              <ToggleGroupItem value="list" aria-label="List view" className="h-8 w-8 p-0">
                <List className="h-3.5 w-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem value="calendar" aria-label="Calendar view" className="h-8 w-8 p-0">
                <CalendarIcon className="h-3.5 w-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        <TabsContent value="live" className="mt-4">
          <TimeClockCommandView />
        </TabsContent>
        <TabsContent value="today" className="mt-4">
          <TodayView />
        </TabsContent>
        <TabsContent value="timesheets" className="mt-4">
          {timesheetMode === "list" ? <TimesheetView /> : <MonthClockView />}
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-8 flex flex-col items-center text-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="font-heading text-lg font-semibold tracking-tight">All workers directory</h3>
              <p className="text-sm text-muted-foreground">
                Time Clock focuses on live attendance and exceptions. To browse the full worker roster,
                use the Workers module — it has search, filters, profiles and data quality.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" className="h-9 text-xs gap-1.5" onClick={() => navigate("/app/workers")}>
                Open Workers
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={() => setActiveTab("today")}>
                <CalendarRange className="h-3.5 w-3.5" />
                View Today entries
              </Button>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={() => setActiveTab("live")}>
                <Clock className="h-3.5 w-3.5" />
                Back to Live now
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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
