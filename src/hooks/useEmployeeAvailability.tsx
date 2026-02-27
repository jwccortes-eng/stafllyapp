import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface AvailabilityConfig {
  id: string;
  employee_id: string;
  company_id: string;
  default_available: boolean;
  blocked_weekdays: number[]; // 0=Sun,...6=Sat
}

export interface AvailabilityOverride {
  id: string;
  employee_id: string;
  date: string;
  is_available: boolean;
  reason: string | null;
  source: string;
}

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function getWeekdayLabel(day: number): string {
  return WEEKDAY_LABELS[day] ?? String(day);
}

/**
 * Check if an employee is available on a specific date.
 * Priority: override > weekday block > default_available
 */
export function isEmployeeAvailable(
  employeeId: string,
  date: string, // yyyy-MM-dd
  configs: AvailabilityConfig[],
  overrides: AvailabilityOverride[],
): { available: boolean; reason?: string } {
  const config = configs.find(c => c.employee_id === employeeId);
  const override = overrides.find(o => o.employee_id === employeeId && o.date === date);

  // Override takes priority
  if (override) {
    return {
      available: override.is_available,
      reason: override.reason || (override.is_available ? "Disponible (excepción)" : "No disponible (excepción)"),
    };
  }

  if (!config) {
    // No config = available by default
    return { available: true };
  }

  // Check weekday block
  const dayOfWeek = new Date(date + "T12:00:00").getDay(); // 0=Sun
  if (config.blocked_weekdays.includes(dayOfWeek)) {
    return {
      available: false,
      reason: `Bloqueado: ${getWeekdayLabel(dayOfWeek)}`,
    };
  }

  // Default
  return {
    available: config.default_available,
    reason: config.default_available ? undefined : "No disponible por defecto",
  };
}

interface UseEmployeeAvailabilityOptions {
  /** Load overrides for this date range */
  dateFrom?: string;
  dateTo?: string;
  /** Load config for specific employee only */
  employeeId?: string;
}

export function useEmployeeAvailability(options: UseEmployeeAvailabilityOptions = {}) {
  const { selectedCompanyId } = useCompany();
  const [configs, setConfigs] = useState<AvailabilityConfig[]>([]);
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    // Build queries
    let configQuery = supabase
      .from("employee_availability_config")
      .select("*")
      .eq("company_id", selectedCompanyId);
    if (options.employeeId) {
      configQuery = configQuery.eq("employee_id", options.employeeId);
    }

    let overrideQuery = supabase
      .from("employee_availability_overrides")
      .select("*")
      .eq("company_id", selectedCompanyId);
    if (options.employeeId) {
      overrideQuery = overrideQuery.eq("employee_id", options.employeeId);
    }
    if (options.dateFrom) {
      overrideQuery = overrideQuery.gte("date", options.dateFrom);
    }
    if (options.dateTo) {
      overrideQuery = overrideQuery.lte("date", options.dateTo);
    }

    const [configRes, overrideRes] = await Promise.all([
      configQuery.then(r => r),
      overrideQuery.then(r => r),
    ]);

    setConfigs((configRes.data ?? []) as AvailabilityConfig[]);
    setOverrides((overrideRes.data ?? []) as AvailabilityOverride[]);
    setLoading(false);
  }, [selectedCompanyId, options.employeeId, options.dateFrom, options.dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveConfig = async (employeeId: string, data: Partial<AvailabilityConfig>) => {
    if (!selectedCompanyId) return;
    const { error } = await supabase
      .from("employee_availability_config")
      .upsert({
        employee_id: employeeId,
        company_id: selectedCompanyId,
        default_available: data.default_available ?? true,
        blocked_weekdays: data.blocked_weekdays ?? [],
      } as any, { onConflict: "employee_id" });
    if (!error) await fetchData();
    return error;
  };

  const saveOverride = async (employeeId: string, date: string, isAvailable: boolean, reason?: string, source: string = "admin") => {
    if (!selectedCompanyId) return;
    const { error } = await supabase
      .from("employee_availability_overrides")
      .upsert({
        employee_id: employeeId,
        company_id: selectedCompanyId,
        date,
        is_available: isAvailable,
        reason: reason || null,
        source,
      } as any, { onConflict: "employee_id,date" });
    if (!error) await fetchData();
    return error;
  };

  const deleteOverride = async (employeeId: string, date: string) => {
    const { error } = await supabase
      .from("employee_availability_overrides")
      .delete()
      .eq("employee_id", employeeId)
      .eq("date", date);
    if (!error) await fetchData();
    return error;
  };

  return {
    configs,
    overrides,
    loading,
    refetch: fetchData,
    saveConfig,
    saveOverride,
    deleteOverride,
    isAvailable: (employeeId: string, date: string) =>
      isEmployeeAvailable(employeeId, date, configs, overrides),
  };
}
