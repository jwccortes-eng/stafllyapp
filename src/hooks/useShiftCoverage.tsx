import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ShiftCoverageItem {
  shiftId: string;
  shiftTitle: string;
  shiftCode: string | null;
  date: string;
  clientId: string | null;
  assignedEmployees: { id: string; name: string }[];
  clockedEmployees: { id: string; name: string; hours: number }[];
  missingEmployees: { id: string; name: string }[];
  extraEmployees: { id: string; name: string; hours: number }[];
  coveragePercent: number;
  totalAssigned: number;
  totalClocked: number;
}

export interface CoverageSummary {
  totalShifts: number;
  fullyCovered: number;
  partiallyCovered: number;
  uncovered: number;
  overallPercent: number;
  items: ShiftCoverageItem[];
}

interface UseShiftCoverageOptions {
  companyId: string | null;
  dateFrom: string;
  dateTo: string;
  enabled?: boolean;
}

export function useShiftCoverage({ companyId, dateFrom, dateTo, enabled = true }: UseShiftCoverageOptions) {
  const [data, setData] = useState<CoverageSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async () => {
    if (!companyId || !dateFrom || !dateTo) return null;
    setLoading(true);

    try {
      // Fetch scheduled shifts with assignments
      const { data: shifts } = await supabase
        .from("scheduled_shifts")
        .select("id, title, shift_code, date, client_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date");

      if (!shifts || shifts.length === 0) {
        const empty: CoverageSummary = {
          totalShifts: 0, fullyCovered: 0, partiallyCovered: 0, uncovered: 0,
          overallPercent: 100, items: [],
        };
        setData(empty);
        setLoading(false);
        return empty;
      }

      const shiftIds = shifts.map(s => s.id);

      // Fetch assignments and time_entries in parallel
      const [{ data: assignments }, { data: timeEntries }, { data: employees }] = await Promise.all([
        supabase
          .from("shift_assignments")
          .select("shift_id, employee_id, status")
          .eq("company_id", companyId)
          .in("shift_id", shiftIds)
          .in("status", ["accepted", "pending"]),
        supabase
          .from("time_entries")
          .select("shift_id, employee_id, clock_in, clock_out, status, break_minutes")
          .eq("company_id", companyId)
          .in("shift_id", shiftIds)
          .neq("status", "rejected"),
        supabase
          .from("employees")
          .select("id, first_name, last_name")
          .eq("company_id", companyId),
      ]);

      const empMap = new Map<string, string>();
      (employees ?? []).forEach(e => empMap.set(e.id, `${e.first_name} ${e.last_name}`));

      const items: ShiftCoverageItem[] = shifts.map(shift => {
        const shiftAssignments = (assignments ?? []).filter(a => a.shift_id === shift.id);
        const shiftEntries = (timeEntries ?? []).filter(te => te.shift_id === shift.id);

        const assignedSet = new Set(shiftAssignments.map(a => a.employee_id));
        const clockedSet = new Set(shiftEntries.map(te => te.employee_id));

        const assignedEmployees = shiftAssignments.map(a => ({
          id: a.employee_id,
          name: empMap.get(a.employee_id) ?? "Desconocido",
        }));

        const clockedEmployees = shiftEntries.map(te => {
          let hours = 0;
          if (te.clock_in && te.clock_out) {
            hours = (new Date(te.clock_out).getTime() - new Date(te.clock_in).getTime()) / 3600000;
            hours -= (te.break_minutes ?? 0) / 60;
          }
          return { id: te.employee_id, name: empMap.get(te.employee_id) ?? "Desconocido", hours: Math.round(hours * 100) / 100 };
        });

        // Missing: assigned but didn't clock in
        const missingEmployees = assignedEmployees.filter(e => !clockedSet.has(e.id));

        // Extra: clocked in but wasn't assigned
        const extraEmployees = clockedEmployees.filter(e => !assignedSet.has(e.id));

        const totalAssigned = assignedSet.size;
        const totalClocked = clockedSet.size;
        const coveragePercent = totalAssigned > 0
          ? Math.round((Math.min(totalClocked, totalAssigned) / totalAssigned) * 100)
          : (totalClocked > 0 ? 100 : 0);

        return {
          shiftId: shift.id,
          shiftTitle: shift.title,
          shiftCode: shift.shift_code,
          date: shift.date,
          clientId: shift.client_id,
          assignedEmployees,
          clockedEmployees,
          missingEmployees,
          extraEmployees,
          coveragePercent,
          totalAssigned,
          totalClocked,
        };
      });

      const fullyCovered = items.filter(i => i.coveragePercent >= 100 && i.missingEmployees.length === 0).length;
      const uncovered = items.filter(i => i.totalClocked === 0 && i.totalAssigned > 0).length;
      const partiallyCovered = items.length - fullyCovered - uncovered;

      const totalAssignedAll = items.reduce((s, i) => s + i.totalAssigned, 0);
      const totalClockedAll = items.reduce((s, i) => s + Math.min(i.totalClocked, i.totalAssigned), 0);
      const overallPercent = totalAssignedAll > 0 ? Math.round((totalClockedAll / totalAssignedAll) * 100) : 100;

      const result: CoverageSummary = {
        totalShifts: items.length,
        fullyCovered,
        partiallyCovered,
        uncovered,
        overallPercent,
        items,
      };

      setData(result);
      setLoading(false);
      return result;
    } catch (err) {
      console.error("Coverage analysis error:", err);
      setLoading(false);
      return null;
    }
  }, [companyId, dateFrom, dateTo]);

  useEffect(() => {
    if (enabled) analyze();
  }, [analyze, enabled]);

  return { data, loading, refetch: analyze };
}

/**
 * Get coverage status for a single shift (used by ShiftCard)
 */
export function getShiftCoverageStatus(
  shiftId: string,
  coverageItems: ShiftCoverageItem[] | undefined
): { percent: number; missing: number; extra: number } | null {
  if (!coverageItems) return null;
  const item = coverageItems.find(i => i.shiftId === shiftId);
  if (!item) return null;
  return {
    percent: item.coveragePercent,
    missing: item.missingEmployees.length,
    extra: item.extraEmployees.length,
  };
}
