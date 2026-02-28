import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Clock, CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import TodayView from "./TodayView";
import { TimesheetView } from "@/components/timeclock/TimesheetView";

export default function TimeClock() {
  const [activeTab, setActiveTab] = useState("today");

  return (
    <div className="space-y-5">
      <PageHeader
        variant="3"
        title="Time Clock"
        subtitle="Control de asistencia y fichajes"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="today" className="gap-1.5 text-xs">
            <Clock className="h-3.5 w-3.5" />
            Today
          </TabsTrigger>
          <TabsTrigger value="timesheets" className="gap-1.5 text-xs">
            <CalendarRange className="h-3.5 w-3.5" />
            Timesheets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4">
          <TodayView />
        </TabsContent>
        <TabsContent value="timesheets" className="mt-4">
          <TimesheetView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
