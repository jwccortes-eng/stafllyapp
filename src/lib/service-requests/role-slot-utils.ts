/**
 * Helpers for distributing employee assignments across typed role slots
 * (e.g. 10 Waiter slots + 1 Captain slot in a single shift).
 *
 * The scheduler does NOT ask the admin which role each new employee fills:
 * it auto-picks the next slot with remaining capacity in `sort_order`,
 * preserving the staffing plan defined when the shift was converted from
 * a service request.
 */

export interface ShiftRoleSlot {
  id: string;
  shift_id: string;
  role_type: string;
  role_label: string | null;
  quantity: number;
  sort_order: number;
}

export interface ActiveAssignment {
  id: string;
  shift_id: string;
  status: string;
  role_slot_id: string | null;
}

const ACTIVE_STATUSES = new Set(["pending", "confirmed", "review", "needs_reacceptance"]);

/** Count active (non-rejected/non-removed) assignments per slot id. */
export function countAssignmentsBySlot(
  assignments: ActiveAssignment[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of assignments) {
    if (!a.role_slot_id) continue;
    if (!ACTIVE_STATUSES.has(a.status)) continue;
    out.set(a.role_slot_id, (out.get(a.role_slot_id) ?? 0) + 1);
  }
  return out;
}

/**
 * Returns an array of slot ids — one per employee being added — picking the
 * next slot with remaining capacity in `sort_order`. Returns `null` for any
 * employee that does not fit (admin can still assign them; they will be
 * tracked as "extra" / unassigned-to-role).
 *
 * For shifts with no role slots configured (regular manual shifts), every
 * entry resolves to `null`, matching the legacy behaviour.
 */
export function pickRoleSlotsForNewAssignments(
  slots: ShiftRoleSlot[],
  existingAssignments: ActiveAssignment[],
  employeeIds: string[],
): Array<string | null> {
  if (slots.length === 0) return employeeIds.map(() => null);

  const used = countAssignmentsBySlot(existingAssignments);
  const ordered = [...slots].sort((a, b) => a.sort_order - b.sort_order);

  return employeeIds.map(() => {
    for (const slot of ordered) {
      const taken = used.get(slot.id) ?? 0;
      if (taken < slot.quantity) {
        used.set(slot.id, taken + 1);
        return slot.id;
      }
    }
    return null;
  });
}

/** Total capacity across all typed slots in a shift. */
export function totalSlotCapacity(slots: ShiftRoleSlot[]): number {
  return slots.reduce((acc, s) => acc + (s.quantity ?? 0), 0);
}
