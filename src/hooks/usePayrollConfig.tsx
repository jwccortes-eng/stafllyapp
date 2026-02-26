import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface PayrollConfig {
  payroll_week_start_day: number; // 0=Sun..6=Sat. Default 3 (Wednesday)
  expected_close_day: number;     // Default 2 (Tuesday)
  expected_close_time: string;    // Default "23:59"
  overdue_grace_days: number;     // Default 2
  timezone: string;               // Default "America/New_York"
}

const DEFAULT_CONFIG: PayrollConfig = {
  payroll_week_start_day: 3,
  expected_close_day: 2,
  expected_close_time: "23:59",
  overdue_grace_days: 2,
  timezone: "America/New_York",
};

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export { DAY_NAMES, DAY_NAMES_EN, DEFAULT_CONFIG };

export interface PeriodOverdueInfo {
  periodId: string;
  startDate: string;
  endDate: string;
  status: string;
  expectedClose: Date;
  overdueDays: number;
  isOverdue: boolean;
}

/**
 * Returns the current payroll week boundaries [startDate, endDate]
 * based on the configured week start day.
 */
export function getCurrentPayrollWeek(config: PayrollConfig): { start: Date; end: Date } {
  const now = new Date();
  const currentDay = now.getDay();
  const startDay = config.payroll_week_start_day;

  // Calculate days since the start of the payroll week
  let diff = currentDay - startDay;
  if (diff < 0) diff += 7;

  const start = new Date(now);
  start.setDate(now.getDate() - diff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Calculate expected close datetime for a period based on its end_date and config.
 */
export function getExpectedCloseDateTime(periodEndDate: string, config: PayrollConfig): Date {
  const endDate = new Date(periodEndDate + "T00:00:00");
  const [hours, minutes] = config.expected_close_time.split(":").map(Number);
  endDate.setHours(hours || 23, minutes ?? 59, 59, 0);
  return endDate;
}

/**
 * Calculate overdue info for a period.
 */
export function calculateOverdue(
  period: { id: string; start_date: string; end_date: string; status: string },
  config: PayrollConfig
): PeriodOverdueInfo {
  const expectedClose = getExpectedCloseDateTime(period.end_date, config);
  const deadline = new Date(expectedClose.getTime() + config.overdue_grace_days * 24 * 60 * 60 * 1000);
  const now = new Date();

  const isClosedOrPaid = period.status === "closed" || period.status === "published";
  const isPastDeadline = now > deadline;
  const isOverdue = !isClosedOrPaid && isPastDeadline;

  let overdueDays = 0;
  if (isOverdue) {
    overdueDays = Math.floor((now.getTime() - deadline.getTime()) / (24 * 60 * 60 * 1000));
  }

  return {
    periodId: period.id,
    startDate: period.start_date,
    endDate: period.end_date,
    status: period.status,
    expectedClose,
    overdueDays,
    isOverdue,
  };
}

export function usePayrollConfig() {
  const { selectedCompanyId } = useCompany();
  const [config, setConfig] = useState<PayrollConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("company_settings")
      .select("value")
      .eq("company_id", selectedCompanyId)
      .eq("key", "payroll_config")
      .maybeSingle();

    if (data?.value && typeof data.value === "object") {
      setConfig({ ...DEFAULT_CONFIG, ...(data.value as Record<string, unknown>) } as PayrollConfig);
    } else {
      setConfig(DEFAULT_CONFIG);
    }
    setLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = useCallback(async (newConfig: PayrollConfig, userId: string) => {
    if (!selectedCompanyId) return;

    const jsonValue = JSON.parse(JSON.stringify(newConfig));

    // Upsert the config
    const { error } = await supabase
      .from("company_settings")
      .upsert({
        company_id: selectedCompanyId,
        key: "payroll_config",
        value: jsonValue,
        updated_by: userId,
      } as any, { onConflict: "company_id,key" });

    if (error) throw error;

    // Audit log
    const oldJson = JSON.parse(JSON.stringify(config));
    await supabase.rpc("log_activity_detailed", {
      _action: "update",
      _entity_type: "payroll_config",
      _entity_id: selectedCompanyId,
      _company_id: selectedCompanyId,
      _details: JSON.parse("{}"),
      _old_data: oldJson,
      _new_data: jsonValue,
    });

    setConfig(newConfig);
  }, [selectedCompanyId, config]);

  const currentWeek = useMemo(() => getCurrentPayrollWeek(config), [config]);

  return { config, loading, saveConfig, refetch: fetchConfig, currentWeek };
}
