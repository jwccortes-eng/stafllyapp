/**
 * L1 — Detection. PURE. No domain, no transport imports.
 * Filters cosmetic/internal deltas and net-null changes (P1).
 */
import type { FieldDelta } from "./types";

const normalize = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim();

/** A delta is net-null when before and after are equivalent. */
export function isNetNull(delta: FieldDelta): boolean {
  return normalize(delta.before) === normalize(delta.after);
}

export interface DetectionResult {
  materialDeltas: FieldDelta[];
  discarded: Array<{ field: string; reason: string }>;
}

export function detectMaterialDeltas(deltas: FieldDelta[]): DetectionResult {
  const materialDeltas: FieldDelta[] = [];
  const discarded: Array<{ field: string; reason: string }> = [];

  for (const delta of deltas) {
    if (isNetNull(delta)) {
      discarded.push({ field: delta.field, reason: "net_null_change" });
      continue;
    }
    if (delta.materiality === "cosmetic") {
      discarded.push({ field: delta.field, reason: "cosmetic_change" });
      continue;
    }
    if (delta.materiality === "internal") {
      discarded.push({ field: delta.field, reason: "internal_only_change" });
      continue;
    }
    materialDeltas.push(delta);
  }

  return { materialDeltas, discarded };
}
