/**
 * operations-intelligence.ts
 *
 * Pure read-side intelligence layer for the Operations Command Center.
 * Computes alerts, coverage and no-show spikes by composing data already
 * persisted in `scheduled_shifts`, `shift_assignments`, `clock_events` and
 * `clock_alerts` — it never writes to payroll, time_entries or reviews.
 *
 * Multi-tenant: every function takes `companyId` and scopes accordingly.
 *
 * Severity vocabulary (matches OPERATIONS_DESIGN_LANGUAGE.md):
 *   - critical: needs immediate human action (red)
 *   - high:     needs action within minutes (orange)
 *   - warning:  needs attention soon (yellow)
 *   - info:     informational only (neutral)
 *
 * Phase 1.5 changes:
 *   - computeCoverageBatch: 3-query batch instead of N×3
 *   - generateAlerts groups understaffed shifts by zone (location/client)
 *   - Late-arrival alerts cluster by shift (not company-wide)
 *   - LOW_COVERAGE_SOON gated by < 120min AND coverage < 80%
 *   - INACTIVE_WORKFORCE: detects employees with no activity in N days
 *   - NO_SHOW_SPIKE de-duplicates employee × shift
 */
import { supabase } from "@/integrations/supabase/client";

export type AlertSeverity = "critical" | "high" | "warning" | "info";

export type AlertKind =
  | "UNDERSTAFFED"
  | "LOW_COVERAGE_SOON"
  | "NO_SHOW_SPIKE"
  | "LATE_ARRIVALS"
  | "OPEN_CLOCK"
  | "INACTIVE_WORKFORCE";

export interface OpsAlert {
  id: string;                  // stable per (kind + scope)
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  zone?: string;               // location / client / borough label
  shiftIds: string[];
  /** Employees specifically referenced (used by LATE_ARRIVALS, INACTIVE). */
  employeeIds?: string[];
  meta?: Record<string, unknown>;
}

export interface ShiftCoverage {
  shiftId: string;
  required: number;
  assigned: number;
  confirmed: number;
  arrived: number;
  coveragePct: number;         // assigned / required (capped at 100)
  effectiveCoveragePct: number;// arrived / required
  understaffed: boolean;
  startsInMinutes: number | null;
}

export interface NoShowSpike {
  detected: boolean;
  windowHours: number;
  count: number;
  threshold: number;
  affectedShiftIds: string[];
  affectedEmployeeIds: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const minutesUntil = (date: string, time: string): number => {
  const target = new Date(`${date}T${time}`).getTime();
  return Math.round((target - Date.now()) / 60_000);
};

// ─── Coverage (batch-first; single-shift wrapper for back-compat) ───────────
/**
 * Batch coverage for many shifts in 3 queries total. Replaces the N×3 pattern.
 */
export async function computeCoverageBatch(
  shiftIds: string[],
): Promise<Map<string, ShiftCoverage>> {
  const out = new Map<string, ShiftCoverage>();
  if (!shiftIds.length) return out;

  const [shiftsRes, assignsRes, eventsRes] = await Promise.all([
    supabase
      .from("scheduled_shifts")
      .select("id, slots, date, start_time")
      .in("id", shiftIds),
    supabase
      .from("shift_assignments")
      .select("shift_id, employee_id, status, response_status")
      .in("shift_id", shiftIds)
      .not("status", "in", "(rejected,removed)"),
    supabase
      .from("clock_events")
      .select("shift_id, employee_id, type")
      .in("shift_id", shiftIds)
      .in("type", ["arrival", "clock_in"]),
  ]);

  const assignsByShift = new Map<string, { confirmed: number; assigned: number }>();
  (assignsRes.data ?? []).forEach(a => {
    const cur = assignsByShift.get(a.shift_id) ?? { confirmed: 0, assigned: 0 };
    cur.assigned += 1;
    if (a.response_status === "accepted") cur.confirmed += 1;
    assignsByShift.set(a.shift_id, cur);
  });

  const arrivedByShift = new Map<string, Set<string>>();
  (eventsRes.data ?? []).forEach(e => {
    if (!e.shift_id) return;
    const set = arrivedByShift.get(e.shift_id) ?? new Set<string>();
    set.add(e.employee_id);
    arrivedByShift.set(e.shift_id, set);
  });

  for (const s of shiftsRes.data ?? []) {
    const required = s.slots ?? 0;
    const a = assignsByShift.get(s.id) ?? { confirmed: 0, assigned: 0 };
    const arrived = arrivedByShift.get(s.id)?.size ?? 0;
    const cap = (n: number) => (required > 0 ? Math.min(100, Math.round((n / required) * 100)) : 0);
    out.set(s.id, {
      shiftId: s.id,
      required,
      assigned: a.assigned,
      confirmed: a.confirmed,
      arrived,
      coveragePct: cap(a.assigned),
      effectiveCoveragePct: cap(arrived),
      understaffed: required > 0 && a.assigned < required,
      startsInMinutes: minutesUntil(s.date, s.start_time),
    });
  }
  return out;
}

/**
 * Single-shift wrapper — kept so existing call sites keep compiling.
 */
export async function computeCoverage(shiftId: string): Promise<ShiftCoverage | null> {
  const map = await computeCoverageBatch([shiftId]);
  return map.get(shiftId) ?? null;
}

// ─── No-show spike detection ────────────────────────────────────────────────
/**
 * Looks at `clock_alerts` of type no_show / no_clockin in the last `windowHours`
 * for the company. De-duplicates by (employee_id, shift_id). Spikes when the
 * unique count >= threshold.
 */
export async function detectNoShowSpike(
  companyId: string,
  windowHours = 2,
  threshold = 3,
): Promise<NoShowSpike> {
  const since = new Date(Date.now() - windowHours * 60 * 60_000).toISOString();
  const { data } = await supabase
    .from("clock_alerts")
    .select("id, shift_id, employee_id, type, created_at")
    .eq("company_id", companyId)
    .in("type", ["no_show", "no_show_alert", "no_clockin", "no_clockin_alert"])
    .gte("created_at", since)
    .is("resolved_at", null);

  const rows = data ?? [];
  // Dedupe by (employee_id × shift_id)
  const seen = new Set<string>();
  const uniqueShifts = new Set<string>();
  const uniqueEmployees = new Set<string>();
  for (const r of rows) {
    const key = `${r.employee_id}::${r.shift_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.shift_id) uniqueShifts.add(r.shift_id);
    if (r.employee_id) uniqueEmployees.add(r.employee_id);
  }

  return {
    detected: seen.size >= threshold,
    windowHours,
    count: seen.size,
    threshold,
    affectedShiftIds: Array.from(uniqueShifts),
    affectedEmployeeIds: Array.from(uniqueEmployees),
  };
}

// ─── Inactive workforce ─────────────────────────────────────────────────────
/**
 * Detects active employees with no clock_event in the last `days` days. Helps
 * surface dormant workforce for re-engagement messaging. Capped at 200 ids
 * to keep the payload light for the alert bar.
 */
export async function detectInactiveWorkforce(
  companyId: string,
  days = 14,
): Promise<{ count: number; employeeIds: string[] }> {
  const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();

  const [empRes, eventsRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .limit(1000),
    supabase
      .from("clock_events")
      .select("employee_id")
      .eq("company_id", companyId)
      .gte("created_at", since),
  ]);

  const active = new Set((eventsRes.data ?? []).map(e => e.employee_id));
  const inactive = (empRes.data ?? [])
    .map(e => e.id)
    .filter(id => !active.has(id));
  return { count: inactive.length, employeeIds: inactive.slice(0, 200) };
}

// ─── Master alert generator ─────────────────────────────────────────────────
/**
 * Builds the live alert list for the company. Keep this lean — the OpsAlertsBar
 * polls it every ~30s. We bias toward fewer, higher-quality alerts.
 *
 * Phase 1.5: groups understaffing by zone (location/client) so admins act on
 * a region instead of one-shift-at-a-time.
 */
export async function generateAlerts(companyId: string): Promise<OpsAlert[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 10);

  // Pull active+upcoming shifts in a 24h horizon
  const { data: shifts } = await supabase
    .from("scheduled_shifts")
    .select("id, title, slots, date, start_time, end_time, status, client_id, location_id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["scheduled", "in_progress", "active", "published"])
    .gte("date", today)
    .lte("date", horizon)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(50);

  const alerts: OpsAlert[] = [];

  // Always check no_show spike + inactive workforce — they are company-wide
  const [spike, inactive] = await Promise.all([
    detectNoShowSpike(companyId),
    detectInactiveWorkforce(companyId, 14),
  ]);

  if (spike.detected) {
    alerts.push({
      id: "no_show_spike",
      kind: "NO_SHOW_SPIKE",
      severity: "critical",
      message: `${spike.count} no-shows en las últimas ${spike.windowHours}h`,
      shiftIds: spike.affectedShiftIds,
      employeeIds: spike.affectedEmployeeIds,
      meta: { count: spike.count, windowHours: spike.windowHours },
    });
  }

  if (inactive.count >= 5) {
    alerts.push({
      id: "inactive_workforce",
      kind: "INACTIVE_WORKFORCE",
      severity: "info",
      message: `${inactive.count} ${inactive.count === 1 ? "trabajador inactivo" : "trabajadores inactivos"} (14 días)`,
      shiftIds: [],
      employeeIds: inactive.employeeIds,
      meta: { count: inactive.count, days: 14 },
    });
  }

  if (!shifts?.length) {
    const rank: Record<AlertSeverity, number> = { critical: 0, high: 1, warning: 2, info: 3 };
    return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }

  // Coverage in batch
  const coverageMap = await computeCoverageBatch(shifts.map(s => s.id));

  // Resolve location/client labels in batch for nicer messages
  const locIds = Array.from(new Set(shifts.map(s => s.location_id).filter(Boolean) as string[]));
  const cliIds = Array.from(new Set(shifts.map(s => s.client_id).filter(Boolean) as string[]));
  const [locRes, cliRes] = await Promise.all([
    locIds.length
      ? supabase.from("locations").select("id, name").in("id", locIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    cliIds.length
      ? supabase.from("clients").select("id, name").in("id", cliIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const locMap = new Map((locRes.data ?? []).map(l => [l.id, l.name]));
  const cliMap = new Map((cliRes.data ?? []).map(c => [c.id, c.name]));
  const labelOf = (s: typeof shifts[number]) =>
    locMap.get(s.location_id ?? "") ?? cliMap.get(s.client_id ?? "") ?? s.title;
  const zoneKeyOf = (s: typeof shifts[number]) =>
    s.location_id ?? s.client_id ?? `shift::${s.id}`;

  // 1) UNDERSTAFFED — group by zone
  type ZoneBucket = {
    zone: string;
    zoneKey: string;
    totalMissing: number;
    shiftIds: string[];
    soonest: number | null; // minutes until earliest start
  };
  const buckets = new Map<string, ZoneBucket>();

  shifts.forEach(s => {
    const c = coverageMap.get(s.id);
    if (!c || !c.understaffed) return;
    const missing = c.required - c.assigned;
    const key = zoneKeyOf(s);
    const cur = buckets.get(key) ?? {
      zone: labelOf(s),
      zoneKey: key,
      totalMissing: 0,
      shiftIds: [],
      soonest: null,
    };
    cur.totalMissing += missing;
    cur.shiftIds.push(s.id);
    if (c.startsInMinutes != null) {
      cur.soonest = cur.soonest == null ? c.startsInMinutes : Math.min(cur.soonest, c.startsInMinutes);
    }
    buckets.set(key, cur);
  });

  buckets.forEach(b => {
    const startsSoon = b.soonest != null && b.soonest < 120;
    // LOW_COVERAGE_SOON gating: <120 min AND coverage < 80% (we already know
    // it's understaffed, but enforce the explicit threshold for messaging).
    const totalRequired = b.shiftIds.reduce((sum, sid) => sum + (coverageMap.get(sid)?.required ?? 0), 0);
    const totalAssigned = b.shiftIds.reduce((sum, sid) => sum + (coverageMap.get(sid)?.assigned ?? 0), 0);
    const aggCoverage = totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 100;
    const lowCovSoon = startsSoon && aggCoverage < 80;

    const peopleWord = b.totalMissing === 1 ? "persona" : "personas";
    const shiftsWord = b.shiftIds.length === 1 ? "turno" : "turnos";

    alerts.push({
      id: `understaffed:${b.zoneKey}`,
      kind: lowCovSoon ? "LOW_COVERAGE_SOON" : "UNDERSTAFFED",
      severity: lowCovSoon ? "high" : (startsSoon ? "high" : "warning"),
      message: lowCovSoon
        ? `Faltan ${b.totalMissing} ${peopleWord} en ${b.zone} (${b.shiftIds.length} ${shiftsWord} • inicia en ${b.soonest}min)`
        : `Faltan ${b.totalMissing} ${peopleWord} en ${b.zone} (${b.shiftIds.length} ${shiftsWord})`,
      zone: b.zone,
      shiftIds: b.shiftIds,
      meta: {
        totalMissing: b.totalMissing,
        coveragePct: aggCoverage,
        soonestMin: b.soonest,
      },
    });
  });

  // 2) LATE_ARRIVALS — cluster by shift (only alert when >2 in same shift)
  const lastHour = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: lateRows } = await supabase
    .from("clock_events")
    .select("employee_id, shift_id, punctuality, created_at")
    .eq("company_id", companyId)
    .in("type", ["arrival", "clock_in"])
    .in("punctuality", ["late", "very_late"])
    .gte("created_at", lastHour);

  const lateByShift = new Map<string, Set<string>>();
  (lateRows ?? []).forEach(r => {
    if (!r.shift_id) return;
    const set = lateByShift.get(r.shift_id) ?? new Set<string>();
    set.add(r.employee_id);
    lateByShift.set(r.shift_id, set);
  });

  lateByShift.forEach((emps, shiftId) => {
    if (emps.size <= 2) return; // require >2 to alert
    const shift = shifts.find(s => s.id === shiftId);
    const label = shift ? labelOf(shift) : "turno";
    alerts.push({
      id: `late_cluster:${shiftId}`,
      kind: "LATE_ARRIVALS",
      severity: emps.size >= 5 ? "high" : "warning",
      message: `${emps.size} llegadas tarde en ${label}`,
      zone: label,
      shiftIds: [shiftId],
      employeeIds: Array.from(emps),
      meta: { count: emps.size },
    });
  });

  // Stable order: critical → high → warning → info
  const rank: Record<AlertSeverity, number> = { critical: 0, high: 1, warning: 2, info: 3 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Top-line summary for the alert bar pill (color + count). */
export function summarizeAlerts(alerts: OpsAlert[]): {
  topSeverity: AlertSeverity;
  count: number;
  label: string;
} {
  if (!alerts.length) return { topSeverity: "info", count: 0, label: "Todo en orden" };
  const top = alerts[0].severity;
  return {
    topSeverity: top,
    count: alerts.length,
    label: `${alerts.length} ${alerts.length === 1 ? "alerta" : "alertas"} activas`,
  };
}
