/**
 * Scheduling adapter — DOMAIN SIDE. It may know about shifts.
 * It builds standardized DomainChangeEvent envelopes. It does NOT classify,
 * compose, choose channels or deliver anything.
 */
import type {
  ActorRef,
  DomainChangeEvent,
  FieldDelta,
  ScalarOrRef,
} from "../../engine/types";
import type { SchedulingChangeType } from "../../catalog/scheduling.registry";

export interface ShiftSnapshot {
  id: string;
  company_id: string;
  title?: string | null;
  shift_code?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location_id?: string | null;
  job_site_address?: string | null;
  meeting_point?: string | null;
  status?: string | null;
  notes?: string | null;
  special_instructions?: string | null;
}

const FIELD_SPEC: Record<
  string,
  { semantic: FieldDelta["semantic"]; materiality: FieldDelta["materiality"]; label: string; changeType?: SchedulingChangeType }
> = {
  date: { semantic: "date", materiality: "operational", label: "Fecha", changeType: "shift.date_changed" },
  start_time: { semantic: "time", materiality: "operational", label: "Inicio", changeType: "shift.time_changed" },
  end_time: { semantic: "time", materiality: "operational", label: "Fin", changeType: "shift.time_changed" },
  location_id: { semantic: "location", materiality: "operational", label: "Ubicación", changeType: "shift.location_changed" },
  job_site_address: { semantic: "location", materiality: "operational", label: "Dirección", changeType: "shift.location_changed" },
  meeting_point: { semantic: "location", materiality: "operational", label: "Punto de encuentro", changeType: "shift.location_changed" },
  status: { semantic: "status", materiality: "operational", label: "Estado", changeType: "shift.cancelled" },
  notes: { semantic: "text", materiality: "internal", label: "Notas internas" },
  special_instructions: { semantic: "text", materiality: "operational", label: "Instrucciones" },
};

export function shiftLabel(shift: ShiftSnapshot): string {
  return shift.shift_code || shift.title || `Turno ${shift.id.slice(0, 8)}`;
}

export function diffShift(before: ShiftSnapshot, after: ShiftSnapshot): FieldDelta[] {
  const deltas: FieldDelta[] = [];
  for (const [field, spec] of Object.entries(FIELD_SPEC)) {
    const b = (before as Record<string, unknown>)[field] as ScalarOrRef | undefined;
    const a = (after as Record<string, unknown>)[field] as ScalarOrRef | undefined;
    if (b === undefined && a === undefined) continue;
    if ((b ?? null) === (a ?? null)) continue;
    deltas.push({
      field,
      semantic: spec.semantic,
      materiality: spec.materiality,
      label: spec.label,
      before: b ?? null,
      after: a ?? null,
    });
  }
  return deltas;
}

/**
 * Picks the change type for a shift diff. When several apply, the most
 * operationally severe wins; the whole operation stays a single ChangeSet.
 */
export function resolveShiftChangeType(deltas: FieldDelta[], after: ShiftSnapshot): SchedulingChangeType | null {
  const fields = new Set(deltas.map((d) => d.field));
  if (fields.has("status") && String(after.status ?? "").toLowerCase().includes("cancel")) {
    return "shift.cancelled";
  }
  if (fields.has("date")) return "shift.date_changed";
  if (fields.has("location_id") || fields.has("job_site_address") || fields.has("meeting_point")) {
    return "shift.location_changed";
  }
  if (fields.has("start_time") || fields.has("end_time")) return "shift.time_changed";
  return null;
}

export interface BuildShiftEventInput {
  before: ShiftSnapshot;
  after: ShiftSnapshot;
  actor: ActorRef;
  eventId: string;
  correlationId: string;
  occurredAt: string;
  audienceHints: DomainChangeEvent["audienceHints"];
  legacyAudience?: string[];
}

export function buildShiftEvent(input: BuildShiftEventInput): DomainChangeEvent | null {
  const fields = diffShift(input.before, input.after);
  const changeType = resolveShiftChangeType(fields, input.after);
  if (!changeType) return null;

  return {
    eventId: input.eventId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
    schemaVersion: 1,
    domain: "scheduling",
    changeType,
    aggregateType: "shift",
    subject: { type: "shift", id: input.after.id, label: shiftLabel(input.after) },
    actor: input.actor,
    tenantId: input.after.company_id,
    fields,
    audienceHints: input.audienceHints,
    context: {
      shiftCode: input.after.shift_code ?? null,
      shiftDate: input.after.date ?? null,
    },
    legacyAudience: input.legacyAudience,
  };
}
