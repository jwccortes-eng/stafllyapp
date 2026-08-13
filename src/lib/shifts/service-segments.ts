/**
 * P1 — SERVICIO vs HORARIO (SEGMENTOS)
 * ====================================
 *
 * Un SERVICIO (evento comercial) puede tener varios HORARIOS internos:
 * Setup · Service · VIP · Breakdown, o varias jornadas de un evento multi-día.
 *
 * Modelo (sin tablas nuevas, sin tocar QK existentes):
 *   - `scheduled_shifts.parent_shift_id` → horario que pertenece a un servicio raíz.
 *   - `scheduled_shifts.segment_label`   → nombre operativo del horario.
 *   - El QK visible del grupo SIEMPRE es el `shift_ref` del servicio raíz.
 *
 * Este módulo es PURO: sin React, sin BD, sin escrituras. No toca payroll,
 * time_entries, clock ni assignments: cada horario conserva su propio ciclo.
 */

export interface SegmentShiftLike {
  id: string;
  parent_shift_id?: string | null;
  segment_label?: string | null;
  title?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  slots?: number | null;
  shift_ref?: string | null;
  client_id?: string | null;
}

/** Etiquetas sugeridas para un horario dentro del mismo evento. */
export const SEGMENT_PRESETS = ["Setup", "Service", "VIP", "Breakdown", "Jornada"] as const;

/** Clave de agrupación: el servicio raíz. */
export function serviceGroupKey(shift: SegmentShiftLike): string {
  return shift.parent_shift_id ?? shift.id;
}

/** ¿Este registro es un horario interno de otro servicio? */
export function isServiceSegment(shift: SegmentShiftLike): boolean {
  return !!shift.parent_shift_id;
}

/**
 * QK visible de un horario: SIEMPRE el del servicio raíz.
 * Si el raíz no está cargado, se devuelve el propio (nunca se inventa nada).
 */
export function serviceRefFor(
  shift: SegmentShiftLike,
  byId: Map<string, SegmentShiftLike> | Record<string, SegmentShiftLike>,
): string | null {
  const key = serviceGroupKey(shift);
  const root = byId instanceof Map ? byId.get(key) : byId[key];
  return (root?.shift_ref ?? shift.shift_ref ?? null) || null;
}

export interface ServiceSegment {
  shift: SegmentShiftLike;
  /** "Setup", "Service"… o el horario cuando no hay etiqueta. */
  label: string;
  timeLabel: string;
  headcount: number | null;
  isRoot: boolean;
}

export interface ServiceGroup {
  key: string;
  root: SegmentShiftLike;
  /** QK del servicio (nunca uno por horario). */
  ref: string | null;
  title: string;
  /** Fechas distintas cubiertas por el evento (evento multi-día). */
  dates: string[];
  segments: ServiceSegment[];
  segmentCount: number;
  /** Suma de plazas solicitadas; null cuando algún horario está pendiente. */
  totalHeadcount: number | null;
  /** true cuando hay más de un horario bajo el mismo QK. */
  isMultiSegment: boolean;
}

function hhmm(t?: string | null): string | null {
  const v = (t ?? "").trim();
  return v ? v.slice(0, 5) : null;
}

export function segmentTimeLabel(shift: SegmentShiftLike): string {
  const s = hhmm(shift.start_time);
  const e = hhmm(shift.end_time);
  if (s && e) return `${s}–${e}`;
  if (s) return s;
  return "Horario pendiente";
}

export function segmentLabel(shift: SegmentShiftLike): string {
  const raw = (shift.segment_label ?? "").trim();
  return raw || segmentTimeLabel(shift);
}

function sortSegments(a: ServiceSegment, b: ServiceSegment): number {
  const da = (a.shift.date ?? "").slice(0, 10);
  const db = (b.shift.date ?? "").slice(0, 10);
  if (da !== db) return da < db ? -1 : 1;
  const sa = hhmm(a.shift.start_time) ?? "99:99";
  const sb = hhmm(b.shift.start_time) ?? "99:99";
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.label.localeCompare(b.label);
}

/**
 * Agrupa una lista de servicios por su evento raíz.
 * Los servicios sin `parent_shift_id` forman un grupo de un solo horario:
 * el comportamiento actual no cambia para nada de lo ya existente.
 */
export function buildServiceGroups(shifts: SegmentShiftLike[]): ServiceGroup[] {
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const buckets = new Map<string, SegmentShiftLike[]>();

  for (const s of shifts) {
    const key = serviceGroupKey(s);
    const list = buckets.get(key);
    if (list) list.push(s);
    else buckets.set(key, [s]);
  }

  const groups: ServiceGroup[] = [];
  for (const [key, list] of buckets) {
    const root = byId.get(key) ?? list.find((s) => !s.parent_shift_id) ?? list[0];
    const segments: ServiceSegment[] = list
      .map((s) => ({
        shift: s,
        label: segmentLabel(s),
        timeLabel: segmentTimeLabel(s),
        headcount: s.slots ?? null,
        isRoot: s.id === key,
      }))
      .sort(sortSegments);

    const dates = [...new Set(segments.map((s) => (s.shift.date ?? "").slice(0, 10)).filter(Boolean))].sort();
    const anyPending = segments.some((s) => s.headcount == null);
    const totalHeadcount = anyPending ? null : segments.reduce((acc, s) => acc + (s.headcount ?? 0), 0);

    groups.push({
      key,
      root,
      ref: root?.shift_ref ?? null,
      title: (root?.title ?? "").trim() || "Servicio",
      dates,
      segments,
      segmentCount: segments.length,
      totalHeadcount,
      isMultiSegment: segments.length > 1,
    });
  }

  return groups;
}

/** Resumen de una línea: "4 horarios · 19 personas" / "2 horarios · 3 días". */
export function describeServiceGroup(group: ServiceGroup): string {
  const parts: string[] = [
    `${group.segmentCount} horario${group.segmentCount === 1 ? "" : "s"}`,
  ];
  if (group.totalHeadcount != null) {
    parts.push(`${group.totalHeadcount} persona${group.totalHeadcount === 1 ? "" : "s"}`);
  } else {
    parts.push("personal pendiente en algún horario");
  }
  if (group.dates.length > 1) parts.push(`${group.dates.length} días`);
  return parts.join(" · ");
}
