import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Clock, CalendarDays, CalendarRange, Calendar } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import TodayView from "./TodayView";
import { TimesheetView } from "@/components/timeclock/TimesheetView";
import { DayDetailView } from "@/components/timeclock/DayDetailView";
import { MonthClockView } from "@/components/timeclock/MonthClockView";

export default function TimeClock() {
  const [activeTab, setActiveTab] = useState("today");

  return (
    <div className="space-y-5">
      <PageHeader
        variant="3"
        title="Reloj de Tiempo"
        subtitle="Control de asistencia y fichajes"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="today" className="gap-1.5 text-xs">
            <Clock className="h-3.5 w-3.5" />
            Hoy
          </TabsTrigger>
          <TabsTrigger value="day" className="gap-1.5 text-xs">
            <CalendarDays className="h-3.5 w-3.5" />
            Día
          </TabsTrigger>
          <TabsTrigger value="timesheets" className="gap-1.5 text-xs">
            <CalendarRange className="h-3.5 w-3.5" />
            Timesheets
          </TabsTrigger>
          <TabsTrigger value="month" className="gap-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5" />
            Mes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4">
          <TodayView />
        </TabsContent>
        <TabsContent value="day" className="mt-4">
          <DayDetailView />
        </TabsContent>
        <TabsContent value="timesheets" className="mt-4">
          <TimesheetView />
        </TabsContent>
        <TabsContent value="month" className="mt-4">
          <MonthClockView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
