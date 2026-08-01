/**
 * F0 — Contención de prioridad de notificaciones (client-side only).
 *
 * NO es la taxonomía definitiva de Smart Notifications (F1+).
 * Solo evita que alertas críticas queden al mismo nivel visual que
 * notificaciones masivas (ej. shift_claimable).
 */

export type NotificationPriority = "critical" | "high" | "normal";

/** Alertas que NUNCA se agrupan ni se silencian. */
export const CRITICAL_NOTIFICATION_TYPES = new Set<string>([
  "no_show_alert",
  "no_clockin_alert",
  "critical_alert",
]);

/** Alertas relevantes pero agrupables. */
export const HIGH_NOTIFICATION_TYPES = new Set<string>([
  "shift_cancelled",
  "shift_updated_reaccept",
  "shift_confirm_urgent",
  "no_clock",
  "clock_request",
]);

export function getNotificationPriority(type: string): NotificationPriority {
  if (CRITICAL_NOTIFICATION_TYPES.has(type)) return "critical";
  if (HIGH_NOTIFICATION_TYPES.has(type)) return "high";
  return "normal";
}

export function isCriticalNotification(type: string): boolean {
  return CRITICAL_NOTIFICATION_TYPES.has(type);
}

const PRIORITY_WEIGHT: Record<NotificationPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

/**
 * Ordena críticas no leídas primero, luego por fecha.
 * No elimina ni oculta ninguna notificación.
 */
export function sortByPriorityThenDate<
  T extends { type: string; created_at: string; read_at: string | null }
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aCritical = isCriticalNotification(a.type) && !a.read_at;
    const bCritical = isCriticalNotification(b.type) && !b.read_at;
    if (aCritical !== bCritical) return aCritical ? -1 : 1;
    const w = PRIORITY_WEIGHT[getNotificationPriority(a.type)] - PRIORITY_WEIGHT[getNotificationPriority(b.type)];
    if (aCritical && bCritical && w !== 0) return w;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ── Coalescencia de ráfagas ──────────────────────────────────────────
export const BURST_WINDOW_MS = 10_000;
export const BURST_THRESHOLD = 3;

export interface BurstWindow {
  start: number;
  count: number;
}

export type BurstDecision =
  | { mode: "individual" }
  | { mode: "grouped"; count: number };

/**
 * Decide cómo presentar una notificación entrante.
 * - Críticas: siempre individuales (nunca agrupadas ni silenciadas).
 * - 3+ en 10s: un único toast agrupado, sin sonido repetido.
 * La notificación siempre se persiste en la campana (esto solo afecta el aviso).
 */
export function evaluateBurst(
  win: BurstWindow,
  type: string,
  now: number
): { window: BurstWindow; decision: BurstDecision; playSound: boolean } {
  if (isCriticalNotification(type)) {
    return { window: win, decision: { mode: "individual" }, playSound: true };
  }

  const next: BurstWindow =
    now - win.start > BURST_WINDOW_MS
      ? { start: now, count: 1 }
      : { start: win.start, count: win.count + 1 };

  if (next.count >= BURST_THRESHOLD) {
    return { window: next, decision: { mode: "grouped", count: next.count }, playSound: false };
  }
  return { window: next, decision: { mode: "individual" }, playSound: true };
}

export function burstToastMessage(count: number): string {
  return `${count} actualizaciones en tu operación`;
}
