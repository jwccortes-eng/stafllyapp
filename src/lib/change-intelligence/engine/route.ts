/**
 * L5 — Routing. PURE and SIMULATED ONLY.
 *
 * Returns a channel as a DECISION VALUE. It never performs a delivery and this
 * module imports no transport client of any kind (CA-F1-01).
 */
import type { AudienceRef, Channel, ChangeTypeRegistration, ImpactLevel } from "./types";

const DEFAULT_WINDOWS: Record<ImpactLevel, number> = {
  0: 0,
  1: 86_400, // daily digest
  2: 120,
  3: 45,
};

const PREFERENCE_BY_LEVEL: Record<ImpactLevel, Channel[]> = {
  0: [],
  1: ["inbox"],
  2: ["push", "inbox"],
  3: ["push", "sms", "whatsapp", "email", "inbox"],
};

export interface RouteDecision {
  simulatedChannel: Channel | "none";
  coalescingWindowSeconds: number;
}

export function route(
  recipient: AudienceRef,
  level: ImpactLevel,
  registration: ChangeTypeRegistration,
): RouteDecision {
  const window = registration.coalescingWindowSeconds?.[level] ?? DEFAULT_WINDOWS[level];

  if (level === 0 || recipient.reachability === "unreachable") {
    return { simulatedChannel: "none", coalescingWindowSeconds: window };
  }

  const preferred = PREFERENCE_BY_LEVEL[level];
  const channel = preferred.find((c) => recipient.reachableChannels.includes(c));
  return {
    simulatedChannel: channel ?? "none",
    coalescingWindowSeconds: window,
  };
}
