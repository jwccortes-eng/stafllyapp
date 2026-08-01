/**
 * OX-4.4 — Datos del Centro de Validación.
 *
 * Lectura pura. Nunca escribe. Trae las dos fuentes por separado
 * (`time_entries` = horas reales, `shift_closeout_reports` = evidencia
 * operativa) y las entrega al modelo puro sin mezclarlas.
 *
 * OX-4.4.1 — Añade el contexto humano real que ya existe en la base
 * (persona, avatar, cliente, fecha, quién envió/revisó, comentarios).
 * No crea tablas, no inventa datos: si el dato no está, se omite.
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
  end_time: string | null;
  client_id: string | null;
  shift_admin_id: string | null;
}

function labelOf(shift: ShiftRow | undefined): string | null {
  if (!shift) return null;
  const title = (shift.title ?? "").trim() || "Turno";
  const date = shift.date
    ? new Date(`${shift.date}T00:00:00`).toLocaleDateString("es", { day: "2-digit", month: "short" })
    : null;
  const time = shift.start_time ? String(shift.start_time).slice(0, 5) : null;
  return [title, date && time ? `${date} · ${time}` : date].filter(Boolean).join(" — ");
}

function fullName(p?: { first_name?: string | null; last_name?: string | null } | null): string | null {
  if (!p) return null;
  const n = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return n || null;
}

async function fetchValidationCenter(companyId: string): Promise<ValidationCenterData> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const [entriesRes, closeoutRes] = await Promise.all([
    supabase
      .from("time_entries")
      .select(
        "id, employee_id, shift_id, clock_in, clock_out, break_minutes, status, approved_at, approved_by, notes, entry_source, employees(first_name, last_name, avatar_url, employee_role)",
      )
      .eq("company_id", companyId)
      .gte("clock_in", since)
      .order("clock_in", { ascending: false })
      .limit(400),
    supabase
      .from("shift_closeout_reports")
      .select(
        "id, shift_id, status, review_status, final_approval_status, incident_count, no_show_count, late_count, staff_count_reported, notes, submitted_at, reviewed_at, reviewed_by, submitted_by, submitted_employee_id, role, review_notes, client_feedback, final_approval_notes, final_approved_by, final_approved_at, uniform_ok, updated_at",
      )
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
      .select("id, title, date, start_time, end_time, client_id, shift_admin_id")
      .in("id", shiftIds);
    if (error) throw error;
    for (const s of (data ?? []) as ShiftRow[]) shiftById.set(s.id, s);
  }

  // Clientes de esos turnos: nombre humano, nunca el id.
  const clientIds = Array.from(
    new Set(Array.from(shiftById.values()).map((s) => s.client_id).filter((v): v is string => !!v)),
  );
  const clientById = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data } = await supabase.from("clients").select("id, name").in("id", clientIds);
    for (const c of (data ?? []) as Array<{ id: string; name: string | null }>) {
      if (c.name) clientById.set(c.id, c.name);
    }
  }

  // Personas que participaron en la decisión (usuarios de plataforma).
  const userIds = Array.from(
    new Set(
      [
        ...entries.map((e) => e.approved_by as string | null),
        ...closeouts.flatMap((c) => [
          c.submitted_by as string | null,
          c.reviewed_by as string | null,
          c.final_approved_by as string | null,
        ]),
        ...Array.from(shiftById.values()).map((s) => s.shift_admin_id),
      ].filter((v): v is string => !!v),
    ),
  );
  const userNameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", userIds);
    for (const p of (data ?? []) as Array<{ user_id: string; full_name: string | null }>) {
      if (p.full_name) userNameById.set(p.user_id, p.full_name);
    }
  }

  // Empleado que envió el cierre (capitán), para nombre y avatar reales.
  const submitterEmployeeIds = Array.from(
    new Set(
      closeouts
        .map((c) => c.submitted_employee_id as string | null)
        .filter((v): v is string => !!v),
    ),
  );
  const employeeById = new Map<string, { name: string | null; avatar: string | null }>();
  if (submitterEmployeeIds.length > 0) {
    const { data } = await supabase
      .from("employees")
      .select("id, first_name, last_name, avatar_url")
      .in("id", submitterEmployeeIds);
    for (const e of (data ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
    }>) {
      employeeById.set(e.id, { name: fullName(e), avatar: e.avatar_url ?? null });
    }
  }

  function shiftContext(shiftId: string | null) {
    const s = shiftId ? shiftById.get(shiftId) : undefined;
    return {
      shift_label: shiftId ? labelOf(s) : null,
      shift_title: s?.title ?? null,
      shift_date: s?.date ?? null,
      shift_start_time: s?.start_time ?? null,
      shift_end_time: s?.end_time ?? null,
      client_name: s?.client_id ? (clientById.get(s.client_id) ?? null) : null,
      shift_admin_name: s?.shift_admin_id ? (userNameById.get(s.shift_admin_id) ?? null) : null,
    };
  }

  return {
    hours: entries.map((e) => {
      const emp = e.employees as {
        first_name?: string | null;
        last_name?: string | null;
        avatar_url?: string | null;
        employee_role?: string | null;
      } | null;
      const shiftId = (e.shift_id as string | null) ?? null;
      const ctx = shiftContext(shiftId);
      const approvedBy = e.approved_by as string | null;
      return {
        id: e.id as string,
        employee_id: (e.employee_id as string | null) ?? null,
        worker_name: fullName(emp),
        worker_avatar_url: emp?.avatar_url ?? null,
        worker_role: emp?.employee_role ?? null,
        shift_id: shiftId,
        ...ctx,
        clock_in: (e.clock_in as string | null) ?? null,
        clock_out: (e.clock_out as string | null) ?? null,
        break_minutes: (e.break_minutes as number | null) ?? 0,
        status: (e.status as string | null) ?? "pending",
        approved_at: (e.approved_at as string | null) ?? null,
        approved_by_name: approvedBy ? (userNameById.get(approvedBy) ?? null) : null,
        notes: (e.notes as string | null) ?? null,
        entry_source: (e.entry_source as string | null) ?? null,
      } satisfies HoursEntryInput;
    }),
    closeouts: closeouts.map((c) => {
      const shiftId = (c.shift_id as string | null) ?? null;
      const ctx = shiftContext(shiftId);
      const submitterEmployeeId = c.submitted_employee_id as string | null;
      const submitterEmployee = submitterEmployeeId ? employeeById.get(submitterEmployeeId) : undefined;
      const submittedBy = c.submitted_by as string | null;
      const reviewedBy = c.reviewed_by as string | null;
      const finalBy = c.final_approved_by as string | null;
      return {
        id: c.id as string,
        shift_id: shiftId,
        shift_label: ctx.shift_label,
        shift_title: ctx.shift_title,
        shift_date: ctx.shift_date,
        shift_start_time: ctx.shift_start_time,
        shift_end_time: ctx.shift_end_time,
        client_name: ctx.client_name,
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
        reviewer_name: reviewedBy ? (userNameById.get(reviewedBy) ?? null) : null,
        submitted_by_name:
          submitterEmployee?.name ?? (submittedBy ? (userNameById.get(submittedBy) ?? null) : null),
        submitted_avatar_url: submitterEmployee?.avatar ?? null,
        submitted_role: (c.role as string | null) ?? null,
        review_notes: (c.review_notes as string | null) ?? null,
        client_feedback: (c.client_feedback as string | null) ?? null,
        final_approval_notes: (c.final_approval_notes as string | null) ?? null,
        final_approved_by_name: finalBy ? (userNameById.get(finalBy) ?? null) : null,
        final_approved_at: (c.final_approved_at as string | null) ?? null,
        uniform_ok: (c.uniform_ok as boolean | null) ?? null,
        updated_at: (c.updated_at as string | null) ?? null,
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
