/**
 * Pure helper — derives a worker-friendly shift display name from
 * operational form data. No DB writes. No side effects.
 *
 * Rule:
 *   - If the user typed a manual title, the manual title wins.
 *   - Otherwise: "<Client> · <Type> · <HH:mm>"
 *     - Client falls back to "Cliente pendiente"
 *     - Type defaults to "Turno"
 *     - Time falls back to "Hora pendiente"
 */
export interface ShiftDisplayInput {
  manualTitle?: string | null;
  clientName?: string | null;
  startTime?: string | null;        // "HH:mm"
  type?: string | null;             // optional role/type label
}

export function buildShiftDisplayName(input: ShiftDisplayInput): string {
  const manual = (input.manualTitle ?? "").trim();
  if (manual) return manual;

  const parts: string[] = [];
  parts.push(input.clientName?.trim() || "Cliente pendiente");
  parts.push(input.type?.trim() || "Turno");
  const t = (input.startTime ?? "").trim();
  parts.push(t || "Hora pendiente");
  return parts.join(" · ");
}

export function isAutoDisplayName(input: ShiftDisplayInput): boolean {
  return !(input.manualTitle ?? "").trim();
}
