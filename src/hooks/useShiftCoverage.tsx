import { useState, useEffect, useCallback } from "react";
import { formatPersonName } from "@/lib/format-helpers";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveShiftAttendanceForAssignment,
  deriveCoverageStatus,
  type ResolvedAttendance,
  type CoverageStatus,
  type TimeEntryLite,
} from "@/lib/attendance-resolver";

export interface AttendanceLine {
  id: string;             // employee id
  name: string;
  resolution: ResolvedAttendance;
}

export interface ExtraLine {
  id: string;             // employee id
  name: string;
  hours: number;
  source: string;
}

export interface ShiftCoverageItem {
  shiftId: string;
  shiftTitle: string;
  shiftCode: string | null;
  date: string;
  clientId: string | null;
  payType: string | null;

  // Per-assignment resolved lines (one per scheduled employee)
  attendanceLines: AttendanceLine[];

  // Aggregates
  scheduledCount: number;
  coveredCount: number;
  clockCount: number;
  manualCount: number;
  daypayCount: number;
  mixedCount: number;
  noShowCount: number;
  pendingReviewCount: number;

  // People who clocked in but were never assigned
  extraEmployees: ExtraLine[];

  coverageStatus: CoverageStatus;
  coveragePercent: number;
}

export interface CoverageSummary {
  totalShifts: number;
  fullyCovered: number;            // status = covered
  coveredWithIncidents: number;    // status = covered_with_incidents
  partiallyCovered: number;        // status = partial
  uncovered: number;               // status = uncovered
  pendingReview: number;           // status = pending_review
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
      const { data: shifts } = await supabase
        .from("scheduled_shifts")
        .select("id, title, shift_code, date, client_id, pay_type, start_time, end_time")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date");

      if (!shifts || shifts.length === 0) {
        const empty: CoverageSummary = {
          totalShifts: 0, fullyCovered: 0, coveredWithIncidents: 0,
          partiallyCovered: 0, uncovered: 0, pendingReview: 0,
          overallPercent: 100, items: [],
        };
        setData(empty);
        setLoading(false);
        return empty;
      }

      const shiftIds = shifts.map(s => s.id);

      const [{ data: assignments }, { data: timeEntries }, { data: employees }] = await Promise.all([
        supabase
          .from("shift_assignments")
          .select("id, shift_id, employee_id, status")
          .eq("company_id", companyId)
          .in("shift_id", shiftIds)
          // Include 'no_show' so the resolver can mark it explicitly.
          // Exclude only rejected/removed (worker is no longer scheduled).
          .not("status", "in", "(rejected,removed)"),
        supabase
          .from("time_entries")
          .select("id, shift_id, employee_id, clock_in, clock_out, status, break_minutes, entry_source")
          .eq("company_id", companyId)
          .in("shift_id", shiftIds)
          .neq("status", "rejected"),
        supabase
          .from("employees")
          .select("id, first_name, last_name")
          .eq("company_id", companyId),
      ]);

      const empMap = new Map<string, string>();
      (employees ?? []).forEach(e => empMap.set(e.id, formatPersonName(`${e.first_name} ${e.last_name}`)));

      const items: ShiftCoverageItem[] = shifts.map(shift => {
        const shiftAssignments = (assignments ?? []).filter(a => a.shift_id === shift.id);
        const shiftEntries = (timeEntries ?? []).filter(te => te.shift_id === shift.id) as TimeEntryLite[];

        // Resolve every scheduled assignment
        const attendanceLines: AttendanceLine[] = shiftAssignments.map(a => {
          const entries = shiftEntries.filter(te => te.employee_id === a.employee_id);
          const resolution = resolveShiftAttendanceForAssignment({
            shift: {
              id: shift.id,
              date: shift.date,
              start_time: shift.start_time,
              end_time: shift.end_time,
              pay_type: shift.pay_type,
            },
            assignment: { id: a.id, shift_id: a.shift_id, employee_id: a.employee_id, status: a.status },
            entries,
          });
          return {
            id: a.employee_id,
            name: empMap.get(a.employee_id) ?? "Desconocido",
            resolution,
          };
        });

        // Build aggregates
        let coveredCount = 0, clockCount = 0, manualCount = 0, daypayCount = 0, mixedCount = 0;
        let noShowCount = 0, pendingReviewCount = 0;

        for (const line of attendanceLines) {
          if (line.resolution.is_counted_as_covered) coveredCount += 1;
          switch (line.resolution.resolved_status) {
            case "worked_clock": clockCount += 1; break;
            case "worked_manual": manualCount += 1; break;
            case "worked_daypay": daypayCount += 1; break;
            case "worked_mixed": mixedCount += 1; break;
            case "no_show": noShowCount += 1; break;
            case "pending_review": pendingReviewCount += 1; break;
          }
        }

        // Extras: clocked in but no assignment
        const assignedSet = new Set(shiftAssignments.map(a => a.employee_id));
        const extraByEmp = new Map<string, ExtraLine>();
        for (const te of shiftEntries) {
          if (assignedSet.has(te.employee_id)) continue;
          const minutes =
            te.clock_in && te.clock_out
              ? Math.max(
                  0,
                  Math.round(
                    (new Date(te.clock_out).getTime() - new Date(te.clock_in).getTime()) / 60000
                      - (te.break_minutes ?? 0),
                  ),
                )
              : 0;
          const prev = extraByEmp.get(te.employee_id);
          extraByEmp.set(te.employee_id, {
            id: te.employee_id,
            name: empMap.get(te.employee_id) ?? "Desconocido",
            hours: Math.round(((prev?.hours ?? 0) + minutes / 60) * 100) / 100,
            source: te.entry_source ?? "clock",
          });
        }
        const extraEmployees = Array.from(extraByEmp.values());

        const counts = {
          scheduled_count: attendanceLines.length,
          covered_count: coveredCount,
          manual_resolved_count: manualCount,
          daypay_resolved_count: daypayCount,
          clock_count: clockCount,
          mixed_count: mixedCount,
          no_show_count: noShowCount,
          pending_review_count: pendingReviewCount,
          extra_count: extraEmployees.length,
        };
        const coverageStatus = deriveCoverageStatus(counts);
        const coveragePercent =
          attendanceLines.length > 0
            ? Math.round((coveredCount / attendanceLines.length) * 100)
            : extraEmployees.length > 0 ? 100 : 0;

        return {
          shiftId: shift.id,
          shiftTitle: shift.title,
          shiftCode: shift.shift_code,
          date: shift.date,
          clientId: shift.client_id,
          payType: shift.pay_type ?? null,
          attendanceLines,
          scheduledCount: attendanceLines.length,
          coveredCount,
          clockCount,
          manualCount,
          daypayCount,
          mixedCount,
          noShowCount,
          pendingReviewCount,
          extraEmployees,
          coverageStatus,
          coveragePercent,
        };
      });

      const fullyCovered = items.filter(i => i.coverageStatus === "covered").length;
      const coveredWithIncidents = items.filter(i => i.coverageStatus === "covered_with_incidents").length;
      const partiallyCovered = items.filter(i => i.coverageStatus === "partial").length;
      const uncovered = items.filter(i => i.coverageStatus === "uncovered").length;
      const pendingReview = items.filter(i => i.coverageStatus === "pending_review").length;

      const totalScheduled = items.reduce((s, i) => s + i.scheduledCount, 0);
      const totalCovered = items.reduce((s, i) => s + i.coveredCount, 0);
      const overallPercent = totalScheduled > 0 ? Math.round((totalCovered / totalScheduled) * 100) : 100;

      const result: CoverageSummary = {
        totalShifts: items.length,
        fullyCovered,
        coveredWithIncidents,
        partiallyCovered,
        uncovered,
        pendingReview,
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
 * Get coverage status for a single shift (used by ShiftCard).
 * Returns the rich coverage status + counts; legacy callers can read
 * `percent`, `missing`, `extra` for backwards compat.
 */
export function getShiftCoverageStatus(
  shiftId: string,
  coverageItems: ShiftCoverageItem[] | undefined,
): {
  percent: number;
  missing: number;
  extra: number;
  status: CoverageStatus;
  noShow: number;
  pending: number;
} | null {
  if (!coverageItems) return null;
  const item = coverageItems.find(i => i.shiftId === shiftId);
  if (!item) return null;
  // "missing" historically = scheduled minus covered (i.e. anyone not yet
  // confirmed as worked). Keep that semantic for ShiftCard badges.
  return {
    percent: item.coveragePercent,
    missing: Math.max(0, item.scheduledCount - item.coveredCount),
    extra: item.extraEmployees.length,
    status: item.coverageStatus,
    noShow: item.noShowCount,
    pending: item.pendingReviewCount,
  };
}
