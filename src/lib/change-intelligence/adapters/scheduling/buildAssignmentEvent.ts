/**
 * Scheduling adapter — assignment changes (worker added / removed / replacement).
 * A replacement inside one operation is ONE logical ChangeSet, never two waves.
 */
import type { ActorRef, DomainChangeEvent, FieldDelta } from "../../engine/types";
import type { SchedulingChangeType } from "../../catalog/scheduling.registry";
import { shiftLabel, type ShiftSnapshot } from "./buildShiftEvent";

export interface WorkerRef {
  employeeId: string;
  label: string;
}

export interface BuildAssignmentEventInput {
  shift: ShiftSnapshot;
  workerOut?: WorkerRef | null;
  workerIn?: WorkerRef | null;
  actor: ActorRef;
  eventId: string;
  correlationId: string;
  occurredAt: string;
  audienceHints: DomainChangeEvent["audienceHints"];
  legacyAudience?: string[];
}

export function buildAssignmentEvent(input: BuildAssignmentEventInput): DomainChangeEvent | null {
  const { workerIn, workerOut } = input;
  if (!workerIn && !workerOut) return null;

  // Replacement collapses into a single change type (worker_removed carries both
  // sides so the outgoing, incoming and supervisor messages stay consolidated).
  let changeType: SchedulingChangeType;
  if (workerOut && workerIn) changeType = "shift.worker_removed";
  else if (workerIn) changeType = "shift.worker_added";
  else changeType = "shift.worker_removed";

  const fields: FieldDelta[] = [
    {
      field: "assigned_worker",
      semantic: "person",
      materiality: "operational",
      label: "Trabajador asignado",
      before: workerOut?.employeeId ?? null,
      after: workerIn?.employeeId ?? null,
      beforeLabel: workerOut?.label,
      afterLabel: workerIn?.label,
    },
  ];

  return {
    eventId: input.eventId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
    schemaVersion: 1,
    domain: "scheduling",
    changeType,
    aggregateType: "shift",
    subject: { type: "shift", id: input.shift.id, label: shiftLabel(input.shift) },
    actor: input.actor,
    tenantId: input.shift.company_id,
    fields,
    audienceHints: input.audienceHints,
    context: {
      workerInLabel: workerIn?.label ?? null,
      workerOutLabel: workerOut?.label ?? null,
      isReplacement: Boolean(workerIn && workerOut),
      shiftDate: input.shift.date ?? null,
    },
    legacyAudience: input.legacyAudience,
  };
}
