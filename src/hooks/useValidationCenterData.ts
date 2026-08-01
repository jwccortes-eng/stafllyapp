/**
 * OX-4.4 — Datos del Centro de Validación.
 *
 * Lectura pura. Nunca escribe. Trae las dos fuentes por separado
 * (`time_entries` = horas reales, `shift_closeout_reports` = evidencia
 * operativa) y las entrega al modelo puro sin mezclarlas.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  CloseoutInput,
  HoursEntryInput,
} from "@/lib/validation/validation-center-model";

const WINDOW_DAYS = 21;

export interface ValidationCenterData {
  hours: HoursEntryInput[];
  closeouts: CloseoutInput[];
}

interface ShiftRow {
  id: string;
  title: string | null;
  date: string | null;
  start_time: string | null;
}

function labelOf(shift: ShiftRow | undefined): string | null {
  if (!shift) return null;
  const title = (shift.title ?? "").trim() || "Turno";
  const date = shift.date ? new Date(`${shift.date}T00:00:00`).toLocaleDateString("es", { day: "2-digit", month: "short" }) : null;
  const time = shift.start_time ? String(shift.start_time).slice(0, 5) : null;
  return [title, date && time ? `${date} · ${time}` : date].filter(Boolean).join(" — ");
}

async function fetchValidationCenter(companyId: string): Promise<ValidationCenterData> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const [entriesRes, closeoutRes] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, employee_id, shift_id, clock_in, clock_out, break_minutes, status, approved_at, employees(first_name, last_name)")
      .eq("company_id", companyId)
      .gte("clock_in", since)
      .order("clock_in", { ascending: false })
      .limit(400),
    supabase
      .from("shift_closeout_reports")
      .select("id, shift_id, status, review_status, final_approval_status, incident_count, no_show_count, late_count, staff_count_reported, notes, submitted_at, reviewed_at")
      .eq("company_id", companyId)
      .gte("created_at", since)
      .order("submitted_at", { ascending: false })
      .limit(200),
  ]);

  if (entriesRes.error) throw entriesRes.error;
  if (closeoutRes.error) throw closeoutRes.error;

  const entries = (entriesRes.data ?? []) as Array<Record<string, unknown>>;
  const closeouts = (closeoutRes.data ?? []) as Array<Record<string, unknown>>;

  const shiftIds = Array.from(
    new Set(
      [...entries, ...closeouts]
        .map((r) => r.shift_id as string | null)
        .filter((v): v is string => !!v),
    ),
  );

  const shiftById = new Map<string, ShiftRow>();
  if (shiftIds.length > 0) {
    const { data, error } = await supabase
      .from("scheduled_shifts")
      .select("id, title, date, start_time")
      .in("id", shiftIds);
    if (error) throw error;
    for (const s of (data ?? []) as ShiftRow[]) shiftById.set(s.id, s);
  }

  return {
    hours: entries.map((e) => {
      const emp = e.employees as { first_name?: string; last_name?: string } | null;
      const shiftId = (e.shift_id as string | null) ?? null;
      return {
        id: e.id as string,
        employee_id: (e.employee_id as string | null) ?? null,
        worker_name: emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : null,
        shift_id: shiftId,
        shift_label: shiftId ? labelOf(shiftById.get(shiftId)) : null,
        clock_in: (e.clock_in as string | null) ?? null,
        clock_out: (e.clock_out as string | null) ?? null,
        break_minutes: (e.break_minutes as number | null) ?? 0,
        status: (e.status as string | null) ?? "pending",
        approved_at: (e.approved_at as string | null) ?? null,
      } satisfies HoursEntryInput;
    }),
    closeouts: closeouts.map((c) => {
      const shiftId = (c.shift_id as string | null) ?? null;
      return {
        id: c.id as string,
        shift_id: shiftId,
        shift_label: shiftId ? labelOf(shiftById.get(shiftId)) : null,
        status: (c.status as string | null) ?? null,
        review_status: (c.review_status as string | null) ?? null,
        final_approval_status: (c.final_approval_status as string | null) ?? null,
        incident_count: (c.incident_count as number | null) ?? 0,
        no_show_count: (c.no_show_count as number | null) ?? 0,
        late_count: (c.late_count as number | null) ?? 0,
        staff_count_reported: (c.staff_count_reported as number | null) ?? 0,
        notes: (c.notes as string | null) ?? null,
        submitted_at: (c.submitted_at as string | null) ?? null,
        reviewed_at: (c.reviewed_at as string | null) ?? null,
      } satisfies CloseoutInput;
    }),
  };
}

export function useValidationCenterData(companyId: string | null) {
  return useQuery({
    queryKey: ["validation-center", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: () => fetchValidationCenter(companyId as string),
  });
}
