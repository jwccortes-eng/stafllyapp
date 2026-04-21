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
 */
import { supabase } from "@/integrations/supabase/client";

export type AlertSeverity = "critical" | "high" | "warning" | "info";

export type AlertKind =
  | "UNDERSTAFFED"
  | "LOW_COVERAGE_SOON"
  | "NO_SHOW_SPIKE"
  | "LATE_ARRIVALS"
  | "OPEN_CLOCK"; // shift ended >30min ago and worker still clocked-in

export interface OpsAlert {
  id: string;                  // stable per (kind + scope)
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  zone?: string;               // location / client / borough label
  shiftIds: string[];
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
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const minutesUntil = (date: string, time: string): number => {
  const target = new Date(`${date}T${time}`).getTime();
  return Math.round((target - Date.now()) / 60_000);
};

// ─── Coverage ───────────────────────────────────────────────────────────────
/**
 * Computes a single shift's staffing coverage. Does not persist anything.
 */
export async function computeCoverage(shiftId: string): Promise<ShiftCoverage | null> {
  const { data: shift } = await supabase
    .from("scheduled_shifts")
    .select("id, slots, date, start_time")
    .eq("id", shiftId)
    .maybeSingle();
  if (!shift) return null;

  const { data: assignments } = await supabase
    .from("shift_assignments")
    .select("id, employee_id, status, response_status")
    .eq("shift_id", shiftId)
    .not("status", "in", "(rejected,removed)");

  const assigned = assignments?.length ?? 0;
  const confirmed = assignments?.filter(a => a.response_status === "accepted").length ?? 0;

  const { data: arrivals } = await supabase
    .from("clock_events")
    .select("employee_id, type")
    .eq("shift_id", shiftId)
    .in("type", ["arrival", "clock_in"]);
  const arrived = new Set((arrivals ?? []).map(e => e.employee_id)).size;

  const required = shift.slots ?? 0;
  const cap = (n: number) => (required > 0 ? Math.min(100, Math.round((n / required) * 100)) : 0);

  return {
    shiftId,
    required,
    assigned,
    confirmed,
    arrived,
    coveragePct: cap(assigned),
    effectiveCoveragePct: cap(arrived),
    understaffed: required > 0 && assigned < required,
    startsInMinutes: minutesUntil(shift.date, shift.start_time),
  };
}

// ─── No-show spike detection ────────────────────────────────────────────────
/**
 * Looks at `clock_alerts` of type no_show / no_clockin in the last `windowHours`
 * for the company. Spikes when the count >= threshold.
 */
export async function detectNoShowSpike(
  companyId: string,
  windowHours = 2,
  threshold = 3,
): Promise<NoShowSpike> {
  const since = new Date(Date.now() - windowHours * 60 * 60_000).toISOString();
  const { data } = await supabase
    .from("clock_alerts")
    .select("id, shift_id, type, created_at")
    .eq("company_id", companyId)
    .in("type", ["no_show", "no_show_alert", "no_clockin", "no_clockin_alert"])
    .gte("created_at", since)
    .is("resolved_at", null);

  const rows = data ?? [];
  return {
    detected: rows.length >= threshold,
    windowHours,
    count: rows.length,
    threshold,
    affectedShiftIds: Array.from(new Set(rows.map(r => r.shift_id).filter(Boolean) as string[])),
  };
}

// ─── Master alert generator ─────────────────────────────────────────────────
/**
 * Builds the live alert list for the company. Keep this lean — the OpsAlertsBar
 * polls it every ~30s. We bias toward fewer, higher-quality alerts.
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
    .in("status", ["scheduled", "in_progress", "active"])
    .gte("date", today)
    .lte("date", horizon)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(50);

  const alerts: OpsAlert[] = [];
  if (!shifts?.length) {
    // Still check no-show spike — it's company-wide
    const spike = await detectNoShowSpike(companyId);
    if (spike.detected) {
      alerts.push({
        id: "no_show_spike",
        kind: "NO_SHOW_SPIKE",
        severity: "critical",
        message: `${spike.count} no-shows en las últimas ${spike.windowHours}h`,
        shiftIds: spike.affectedShiftIds,
      });
    }
    return alerts;
  }

  // Coverage per shift (parallelized)
  const coverages = await Promise.all(shifts.map(s => computeCoverage(s.id)));

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

  // 1) UNDERSTAFFED — anything missing slots
  shifts.forEach((s, i) => {
    const c = coverages[i];
    if (!c || !c.understaffed) return;
    const missing = c.required - c.assigned;
    const startsSoon = (c.startsInMinutes ?? Infinity) < 120;
    alerts.push({
      id: `understaffed:${s.id}`,
      kind: startsSoon ? "LOW_COVERAGE_SOON" : "UNDERSTAFFED",
      severity: startsSoon ? "high" : "warning",
      message:
        startsSoon
          ? `Faltan ${missing} ${missing === 1 ? "persona" : "personas"} (${labelOf(s)} en ${c.startsInMinutes}min)`
          : `Faltan ${missing} ${missing === 1 ? "persona" : "personas"} en ${labelOf(s)}`,
      zone: labelOf(s),
      shiftIds: [s.id],
      meta: { missing, coveragePct: c.coveragePct },
    });
  });

  // 2) LATE_ARRIVALS — pull last hour of late arrivals from clock_events
  const lastHour = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: lateRows } = await supabase
    .from("clock_events")
    .select("employee_id, shift_id, punctuality, created_at")
    .eq("company_id", companyId)
    .in("type", ["arrival", "clock_in"])
    .in("punctuality", ["late", "very_late"])
    .gte("created_at", lastHour);

  if (lateRows && lateRows.length >= 2) {
    alerts.push({
      id: "late_cluster",
      kind: "LATE_ARRIVALS",
      severity: lateRows.length >= 5 ? "high" : "warning",
      message: `${lateRows.length} llegadas tarde en la última hora`,
      shiftIds: Array.from(new Set(lateRows.map(r => r.shift_id).filter(Boolean) as string[])),
    });
  }

  // 3) NO_SHOW_SPIKE — uses the dedicated detector
  const spike = await detectNoShowSpike(companyId);
  if (spike.detected) {
    alerts.push({
      id: "no_show_spike",
      kind: "NO_SHOW_SPIKE",
      severity: "critical",
      message: `${spike.count} no-shows en las últimas ${spike.windowHours}h`,
      shiftIds: spike.affectedShiftIds,
    });
  }

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
