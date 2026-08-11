/**
 * Daily Ops Control Tower v2 — pure derivation helpers.
 *
 * Read-only. Builds the Priority Action Queue and Location Groups from the
 * already-derived TodayOpsShift list. No DB, no payroll, no side effects.
 */
import type { TodayOpsShift } from "@/hooks/useTodayOperations";
import { resolveShiftLocationTruth } from "@/lib/shifts/service-location";

export type ActionKind =
  | "missing_driver"
  | "transport_short"
  | "missing_staff"
  | "missing_clock_in"
  | "missing_clock_out"
  | "missing_location"
  | "pending_closeout"
  | "pending_claims"
  | "extra_worker";

export type ActionUrgency = "critical" | "high" | "info";

export interface ActionItem {
  id: string;            // shiftId:kind
  shiftId: string;
  kind: ActionKind;
  urgency: ActionUrgency;
  title: string;         // shift title/code summary
  subtitle: string;      // location/client context
  count: number;         // affected count
  message: string;       // next action copy (ES)
  shift: TodayOpsShift;
}

const URGENCY_RANK: Record<ActionUrgency, number> = { critical: 0, high: 1, info: 2 };
const KIND_RANK: Record<ActionKind, number> = {
  missing_driver: 0,
  transport_short: 1,
  missing_staff: 2,
  missing_clock_in: 3,
  missing_clock_out: 4,
  extra_worker: 5,
  missing_location: 6,
  pending_closeout: 7,
  pending_claims: 8,
};

function ctx(s: TodayOpsShift): string {
  const parts: string[] = [];
  if (s.job_site_name) parts.push(s.job_site_name);
  else if (s.meeting_point_location_name) parts.push(s.meeting_point_location_name);
  else if (s.client_name) parts.push(s.client_name);
  else if (s.meeting_point) parts.push(s.meeting_point);
  return parts.join(" · ") || "Sin ubicación";
}

function titleOf(s: TodayOpsShift): string {
  // P0 · identidad: el título es humano; la referencia vive en su propio slot.
  return (s.title || "Turno").trim();
}

export function buildActionQueue(shifts: TodayOpsShift[]): ActionItem[] {
  const items: ActionItem[] = [];
  for (const s of shifts) {
    const t = titleOf(s);
    const c = ctx(s);

    // Transport: missing driver before departure
    if (s.transport.missing_driver) {
      items.push({
        id: `${s.id}:missing_driver`,
        shiftId: s.id,
        kind: "missing_driver",
        urgency: "critical",
        title: t,
        subtitle: c,
        count: 1,
        message: "Asigna un conductor antes de la salida.",
        shift: s,
      });
    } else if (s.transport.capacity_short) {
      const deficit = Math.max(0, s.slots - s.transport.capacity_total);
      items.push({
        id: `${s.id}:transport_short`,
        shiftId: s.id,
        kind: "transport_short",
        urgency: "high",
        title: t,
        subtitle: c,
        count: deficit,
        message: `Faltan ${deficit} cupo${deficit === 1 ? "" : "s"} de transporte.`,
        shift: s,
      });
    }

    // Missing staff
    if (s.ops.assigned_active < s.ops.required) {
      const deficit = s.ops.required - s.ops.assigned_active;
      items.push({
        id: `${s.id}:missing_staff`,
        shiftId: s.id,
        kind: "missing_staff",
        urgency: s.publication_status === "published" ? "critical" : "high",
        title: t,
        subtitle: c,
        count: deficit,
        message: `Falta${deficit === 1 ? "" : "n"} ${deficit} persona${deficit === 1 ? "" : "s"} por asignar.`,
        shift: s,
      });
    }

    // Missing clock-in after start
    if (s.ops.not_started > 0 && (s.ops.bucket === "in_progress" || s.ops.alert_level !== "info")) {
      items.push({
        id: `${s.id}:missing_clock_in`,
        shiftId: s.id,
        kind: "missing_clock_in",
        urgency: s.ops.alert_level === "urgent" ? "critical" : "high",
        title: t,
        subtitle: c,
        count: s.ops.not_started,
        message: `${s.ops.not_started} sin fichar tras el inicio.`,
        shift: s,
      });
    }

    // Missing clock-out
    if (s.ops.missing_clock_outs > 0) {
      items.push({
        id: `${s.id}:missing_clock_out`,
        shiftId: s.id,
        kind: "missing_clock_out",
        urgency: "critical",
        title: t,
        subtitle: c,
        count: s.ops.missing_clock_outs,
        message: `${s.ops.missing_clock_outs} sin salida — cierra o revisa.`,
        shift: s,
      });
    }

    // Pending claims (need approval)
    if (s.pending_claims > 0) {
      items.push({
        id: `${s.id}:pending_claims`,
        shiftId: s.id,
        kind: "pending_claims",
        urgency: "info",
        title: t,
        subtitle: c,
        count: s.pending_claims,
        message: `${s.pending_claims} solicitud${s.pending_claims === 1 ? "" : "es"} por revisar.`,
        shift: s,
      });
    }

    // Destino operativo — resolver canónico único (P0 Service Location SSOT).
    // Una dirección de texto libre ES un destino válido; no genera alerta.
    const loc = resolveShiftLocationTruth(s as Parameters<typeof resolveShiftLocationTruth>[0]);
    if (loc.destinationStatus === "MISSING_DESTINATION") {
      items.push({
        id: `${s.id}:missing_location`,
        shiftId: s.id,
        kind: "missing_location",
        urgency: "high",
        title: t,
        subtitle: c,
        count: 1,
        message: "Sin destino: agrega una dirección o un Job Site.",
        shift: s,
      });
    } else if (loc.meetingPointMissing) {
      items.push({
        id: `${s.id}:missing_location`,
        shiftId: s.id,
        kind: "missing_location",
        urgency: "high",
        title: t,
        subtitle: c,
        count: 1,
        message: "Transporte requerido sin punto de encuentro.",
        shift: s,
      });
    }

    // Pending closeout
    if (s.ops.bucket === "needs_closeout") {
      items.push({
        id: `${s.id}:pending_closeout`,
        shiftId: s.id,
        kind: "pending_closeout",
        urgency: "high",
        title: t,
        subtitle: c,
        count: 1,
        message: "Turno terminó — cierra o registra evidencia.",
        shift: s,
      });
    }
  }

  items.sort((a, b) => {
    const u = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (u !== 0) return u;
    const k = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (k !== 0) return k;
    return (a.shift.start_time ?? "").localeCompare(b.shift.start_time ?? "");
  });

  return items;
}

export interface LocationGroup {
  key: string;
  label: string;
  sublabel: string | null;
  shifts: TodayOpsShift[];
  totals: {
    required: number;
    assigned: number;
    confirmed: number;
    clocked_in: number;
    missing_clock_in: number;
    missing_clock_out: number;
    drivers_needed: number;       // shifts that require transport
    drivers_assigned: number;     // sum of drivers across shifts
    urgent: number;
  };
  status: "ok" | "watch" | "critical";
}

export function buildLocationGroups(shifts: TodayOpsShift[]): LocationGroup[] {
  const map = new Map<string, LocationGroup>();
  for (const s of shifts) {
    let key: string;
    let label: string;
    let sublabel: string | null = null;
    if (s.location_id && s.job_site_name) {
      key = `loc:${s.location_id}`;
      label = s.job_site_name;
      sublabel = s.client_name;
    } else if (s.meeting_point_location_id && s.meeting_point_location_name) {
      key = `mp:${s.meeting_point_location_id}`;
      label = s.meeting_point_location_name;
      sublabel = s.client_name;
    } else if (s.client_id && s.client_name) {
      key = `client:${s.client_id}`;
      label = s.client_name;
      sublabel = s.meeting_point ?? null;
    } else if (s.meeting_point?.trim()) {
      const norm = s.meeting_point.trim().toLowerCase();
      key = `mptext:${norm}`;
      label = s.meeting_point.trim();
    } else {
      key = "sin";
      label = "Sin ubicación";
    }

    let g = map.get(key);
    if (!g) {
      g = {
        key,
        label,
        sublabel,
        shifts: [],
        totals: {
          required: 0,
          assigned: 0,
          confirmed: 0,
          clocked_in: 0,
          missing_clock_in: 0,
          missing_clock_out: 0,
          drivers_needed: 0,
          drivers_assigned: 0,
          urgent: 0,
        },
        status: "ok",
      };
      map.set(key, g);
    }
    g.shifts.push(s);
    g.totals.required += s.ops.required;
    g.totals.assigned += s.ops.assigned_active;
    g.totals.confirmed += s.ops.confirmed;
    g.totals.clocked_in += s.ops.clocked_in;
    g.totals.missing_clock_in += s.ops.not_started;
    g.totals.missing_clock_out += s.ops.missing_clock_outs;
    if (s.transport.required) g.totals.drivers_needed += 1;
    g.totals.drivers_assigned += s.transport.drivers_assigned;
    if (s.ops.alert_level === "urgent") g.totals.urgent += 1;
  }

  for (const g of map.values()) {
    if (g.totals.urgent > 0 || g.totals.missing_clock_out > 0) g.status = "critical";
    else if (
      g.totals.assigned < g.totals.required ||
      g.totals.missing_clock_in > 0 ||
      (g.totals.drivers_needed > 0 && g.totals.drivers_assigned === 0)
    )
      g.status = "watch";
    g.shifts.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  }

  return Array.from(map.values()).sort((a, b) => {
    const rank = { critical: 0, watch: 1, ok: 2 } as const;
    return rank[a.status] - rank[b.status] || a.label.localeCompare(b.label);
  });
}

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  missing_driver: "Falta conductor",
  transport_short: "Transporte incompleto",
  missing_staff: "Falta personal",
  missing_clock_in: "Falta clock-in",
  missing_clock_out: "Falta clock-out",
  missing_location: "Ubicación faltante",
  pending_closeout: "Cierre pendiente",
  pending_claims: "Solicitudes por revisar",
  extra_worker: "Extra detectado",
};
