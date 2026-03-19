import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export type EmployeeOnlineStatus = "online" | "offline" | "on_shift" | "recently_active" | "not_available";

export interface EmployeeStatusRecord {
  employee_id: string;
  status: EmployeeOnlineStatus;
  last_seen_at: string | null;
}

export function useEmployeeStatuses() {
  const { selectedCompanyId } = useCompany();
  const [statuses, setStatuses] = useState<Record<string, EmployeeStatusRecord>>({});

  useEffect(() => {
    if (!selectedCompanyId) return;

    // Initial fetch
    supabase
      .from("employee_status")
      .select("employee_id, status, last_seen_at")
      .eq("company_id", selectedCompanyId)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, EmployeeStatusRecord> = {};
          data.forEach((r: any) => { map[r.employee_id] = r as EmployeeStatusRecord; });
          setStatuses(map);
        }
      });

    // Realtime subscription
    const channel = supabase
      .channel(`employee-status-${selectedCompanyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_status", filter: `company_id=eq.${selectedCompanyId}` },
        (payload: any) => {
          const row = (payload.new || payload.old) as any;
          if (!row?.employee_id) return;
          if (payload.eventType === "DELETE") {
            setStatuses(prev => {
              const next = { ...prev };
              delete next[row.employee_id];
              return next;
            });
          } else {
            setStatuses(prev => ({
              ...prev,
              [row.employee_id]: {
                employee_id: row.employee_id,
                status: row.status,
                last_seen_at: row.last_seen_at,
              },
            }));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedCompanyId]);

  const getStatus = (employeeId: string): EmployeeOnlineStatus =>
    statuses[employeeId]?.status ?? "offline";

  return { statuses, getStatus };
}
