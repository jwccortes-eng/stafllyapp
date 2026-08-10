/**
 * useRecommendationSignals — carga ÚNICA (solo lectura) de las señales que
 * alimentan el motor `rankCandidate`.
 *
 * Antes esta lógica vivía duplicada dentro del hub móvil. Ahora es un helper
 * único que consumen tanto el móvil como el Command Center de Servicios.
 *
 * Solo SELECT. No escribe nada: ni payroll, ni time entries, ni asignaciones.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_SIGNALS,
  type RecommendationSignals,
  type ReviewSignal,
  type WorkerPreferenceRow,
  type WorkerPreferenceType,
} from "@/lib/shifts/worker-recommendation";

interface Options {
  companyId: string | null | undefined;
  shift: {
    id?: string | null;
    date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    client_id?: string | null;
    location_id?: string | null;
  } | null | undefined;
  /** Candidatos elegibles ya filtrados por la superficie que llama. */
  employeeIds: string[];
  /** Cambia para forzar recarga (p. ej. tras guardar una preferencia). */
  refreshKey?: number;
  enabled?: boolean;
}

export function useRecommendationSignals({
  companyId,
  shift,
  employeeIds,
  refreshKey = 0,
  enabled = true,
}: Options): { signals: RecommendationSignals; loading: boolean } {
  const [signals, setSignals] = useState<RecommendationSignals>(EMPTY_SIGNALS);
  const [loading, setLoading] = useState(false);
  const idsKey = employeeIds.length;

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !companyId || employeeIds.length === 0 || !shift?.id || !shift?.date) {
      setSignals(EMPTY_SIGNALS);
      return;
    }
    const empIds = employeeIds;
    const shiftDate = shift.date;
    setLoading(true);

    (async () => {
      const since = new Date();
      since.setFullYear(since.getFullYear() - 1);
      const sinceStr = since.toISOString().slice(0, 10);

      const overrideByEmp = new Map<string, boolean>();
      const configByEmp = new Map<string, { default_available: boolean; blocked_weekdays: number[] | null }>();
      const clientHistoryByEmp = new Map<string, number>();
      const locationHistoryByEmp = new Map<string, number>();
      const reviewByEmp = new Map<string, ReviewSignal>();
      const conflictEmpIds = new Set<string>();
      const preferencesByEmp = new Map<string, WorkerPreferenceRow[]>();

      const queries = [
        supabase
          .from("employee_availability_overrides")
          .select("employee_id, is_available")
          .eq("company_id", companyId)
          .eq("date", shiftDate)
          .in("employee_id", empIds),
        supabase
          .from("employee_availability_config")
          .select("employee_id, default_available, blocked_weekdays")
          .eq("company_id", companyId)
          .in("employee_id", empIds),
        supabase
          .from("employee_review_stats")
          .select("employee_id, avg_overall_score, no_show_flags_90d, low_score_count_30d, total_reviews")
          .eq("company_id", companyId)
          .in("employee_id", empIds),
        supabase
          .from("shift_assignments")
          .select("employee_id, scheduled_shifts!inner(client_id, location_id, date)")
          .eq("company_id", companyId)
          .in("employee_id", empIds)
          .neq("status", "rejected")
          .neq("status", "removed")
          .gte("scheduled_shifts.date", sinceStr)
          .lte("scheduled_shifts.date", shiftDate)
          .limit(2000),
        supabase
          .from("shift_assignments")
          .select("employee_id, shift_id, scheduled_shifts!inner(date, start_time, end_time)")
          .eq("company_id", companyId)
          .in("employee_id", empIds)
          .neq("status", "rejected")
          .neq("status", "removed")
          .eq("scheduled_shifts.date", shiftDate)
          .neq("shift_id", shift.id!)
          .limit(1000),
        (() => {
          const q = supabase
            .from("worker_client_preferences")
            .select("id, employee_id, preference_type, client_id, location_id")
            .eq("company_id", companyId)
            .in("employee_id", empIds)
            .is("archived_at", null);
          const orParts: string[] = [];
          if (shift.client_id) orParts.push(`client_id.eq.${shift.client_id}`);
          if (shift.location_id) orParts.push(`location_id.eq.${shift.location_id}`);
          if (orParts.length === 0) return q.eq("id", "00000000-0000-0000-0000-000000000000");
          return q.or(orParts.join(","));
        })(),
      ];

      const [ovRes, cfgRes, revRes, histRes, sameDayRes, prefRes] = await Promise.allSettled(queries);
      if (cancelled) return;

      if (ovRes.status === "fulfilled" && !ovRes.value.error) {
        for (const row of (ovRes.value.data ?? []) as any[]) {
          overrideByEmp.set(`${shiftDate}:${row.employee_id}`, row.is_available !== false);
        }
      }
      if (cfgRes.status === "fulfilled" && !cfgRes.value.error) {
        for (const row of (cfgRes.value.data ?? []) as any[]) {
          configByEmp.set(row.employee_id, {
            default_available: row.default_available !== false,
            blocked_weekdays: Array.isArray(row.blocked_weekdays) ? row.blocked_weekdays : null,
          });
        }
      }
      if (revRes.status === "fulfilled" && !revRes.value.error) {
        for (const row of (revRes.value.data ?? []) as any[]) {
          reviewByEmp.set(row.employee_id, {
            avg_overall_score: row.avg_overall_score,
            no_show_flags_90d: row.no_show_flags_90d,
            low_score_count_30d: row.low_score_count_30d,
            total_reviews: row.total_reviews,
          });
        }
      }
      if (histRes.status === "fulfilled" && !histRes.value.error) {
        for (const row of (histRes.value.data ?? []) as any[]) {
          const ss = row.scheduled_shifts;
          if (!ss) continue;
          if (shift.client_id && ss.client_id === shift.client_id) {
            clientHistoryByEmp.set(row.employee_id, (clientHistoryByEmp.get(row.employee_id) ?? 0) + 1);
          }
          if (shift.location_id && ss.location_id === shift.location_id) {
            locationHistoryByEmp.set(row.employee_id, (locationHistoryByEmp.get(row.employee_id) ?? 0) + 1);
          }
        }
      }
      if (sameDayRes.status === "fulfilled" && !sameDayRes.value.error) {
        const toMin = (t: string | null | undefined) => {
          if (!t) return null;
          const [h, m] = t.split(":").map(Number);
          return h * 60 + (m || 0);
        };
        const sStart = toMin(shift.start_time);
        const sEndRaw = toMin(shift.end_time);
        const sEnd = sStart != null && sEndRaw != null && sEndRaw <= sStart ? sEndRaw + 24 * 60 : sEndRaw;
        for (const row of (sameDayRes.value.data ?? []) as any[]) {
          const ss = row.scheduled_shifts;
          if (!ss) continue;
          const oStart = toMin(ss.start_time);
          const oEndRaw = toMin(ss.end_time);
          if (oStart == null || oEndRaw == null || sStart == null || sEnd == null) {
            conflictEmpIds.add(row.employee_id);
            continue;
          }
          const oEnd = oEndRaw <= oStart ? oEndRaw + 24 * 60 : oEndRaw;
          if (oStart < sEnd && sStart < oEnd) conflictEmpIds.add(row.employee_id);
        }
      }
      if (prefRes.status === "fulfilled" && !prefRes.value.error) {
        for (const row of (prefRes.value.data ?? []) as any[]) {
          const list = preferencesByEmp.get(row.employee_id) ?? [];
          list.push({
            id: row.id,
            preference_type: row.preference_type as WorkerPreferenceType,
            client_id: row.client_id,
            location_id: row.location_id,
          });
          preferencesByEmp.set(row.employee_id, list);
        }
      }

      setSignals({
        overrideByEmp, configByEmp, clientHistoryByEmp, locationHistoryByEmp,
        reviewByEmp, conflictEmpIds, preferencesByEmp,
      });
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, companyId, shift?.id, shift?.date, shift?.client_id, shift?.location_id, idsKey, refreshKey]);

  return { signals, loading };
}
