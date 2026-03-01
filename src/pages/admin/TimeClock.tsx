import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePageView } from "@/hooks/useAuditLog";
import AuditPanel from "@/components/audit/AuditPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Clock, CalendarRange, Upload, MoreHorizontal, List, Calendar as CalendarIcon,
  FileBarChart, AlertTriangle, GitCompareArrows, Download, Settings, RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import TodayView from "./TodayView";
import { TimesheetView } from "@/components/timeclock/TimesheetView";
import { MonthClockView } from "@/components/timeclock/MonthClockView";

export default function TimeClock() {
  usePageView("Time Clock");
  const [activeTab, setActiveTab] = useState("today");
  const [timesheetMode, setTimesheetMode] = useState<"list" | "calendar">("list");
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader
          variant="3"
          title="Time Clock"
          subtitle="Control de asistencia y fichajes"
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-3">
          <TabsList className="w-auto">
            <TabsTrigger value="today" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Today
            </TabsTrigger>
            <TabsTrigger value="timesheets" className="gap-1.5 text-xs">
              <CalendarRange className="h-3.5 w-3.5" />
              Timesheets
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

        <TabsContent value="today" className="mt-4">
          <TodayView />
        </TabsContent>
        <TabsContent value="timesheets" className="mt-4">
          {timesheetMode === "list" ? <TimesheetView /> : <MonthClockView />}
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
    </div>
  );
}
