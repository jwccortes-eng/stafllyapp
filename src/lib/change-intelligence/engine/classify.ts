/**
 * L2 — Classification. PURE.
 * Impact level from registry + semantics. No domain branching.
 */
import type {
  ChangeTypeRegistration,
  FieldDelta,
  ImpactLevel,
  AudienceRelation,
} from "./types";

/** Semantics that always carry operational weight when material. */
const HIGH_WEIGHT_SEMANTICS = new Set(["datetime", "date", "time", "location", "money", "status"]);

export interface ClassificationResult {
  level: ImpactLevel;
  suppressionReason: string | null;
}

export function classify(
  materialDeltas: FieldDelta[],
  registration: ChangeTypeRegistration | undefined,
): ClassificationResult {
  if (!registration) {
    return { level: 0, suppressionReason: "change_type_not_registered" };
  }
  if (materialDeltas.length === 0) {
    return { level: 0, suppressionReason: "no_material_delta" };
  }

  let level = registration.defaultLevel;
  const hasHighWeight = materialDeltas.some((d) => HIGH_WEIGHT_SEMANTICS.has(d.semantic));
  if (!hasHighWeight && level > 1) {
    // Only text/quantity changed: never escalate beyond feed level.
    level = 1;
  }

  if (level === 0) {
    return { level: 0, suppressionReason: "level_0_no_operational_reality_change" };
  }
  return { level, suppressionReason: null };
}

/** Level for a given relation; undefined relation is not an audience. */
export function levelForRelation(
  registration: ChangeTypeRegistration,
  relation: AudienceRelation,
): ImpactLevel | undefined {
  return registration.audienceMatrix[relation];
}
