import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Clock, CalendarRange, Upload, MoreHorizontal, List, Calendar as CalendarIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import TodayView from "./TodayView";
import { TimesheetView } from "@/components/timeclock/TimesheetView";
import { MonthClockView } from "@/components/timeclock/MonthClockView";

export default function TimeClock() {
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate("/app/import-timeclock")} className="gap-2 text-sm">
              <Upload className="h-4 w-4" />
              Importar horas
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
    </div>
  );
}
