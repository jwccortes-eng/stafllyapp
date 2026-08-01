import type { NotificationFamily } from "./types";

/**
 * Deterministic dedupe key: company + shift + family + subject + time bucket.
 * Example: `co:abc|shift:123|meeting_point|update|w:1700000000`
 */
export function buildDedupeKey(input: {
  companyId: string;
  shiftId?: string | null;
  family: NotificationFamily;
  subject?: string | null;
  occurredAt: string;
  windowSeconds: number;
}): string {
  const ts = Date.parse(input.occurredAt);
  const bucket =
    input.windowSeconds > 0 && Number.isFinite(ts)
      ? Math.floor(ts / 1000 / input.windowSeconds) * input.windowSeconds
      : 0;
  return [
    `co:${input.companyId}`,
    input.shiftId ? `shift:${input.shiftId}` : "shift:none",
    input.family,
    input.subject ? `subj:${input.subject}` : "subj:none",
    `w:${bucket}`,
  ].join("|");
}

/** Human summary of a group, e.g. "Se realizaron 6 cambios en este turno." */
export function describeGroup(count: number, family: NotificationFamily): string {
  return `Se agruparían ${count} eventos de tipo ${family} en un solo aviso.`;
}
