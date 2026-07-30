/**
 * OAI F1 — cascade resolution (PURE).
 *
 * Precedence: legal/regulatory > client > location > role/service >
 * company policy > operational preference. `unclassified` never wins as a
 * blocking rule; it is reported.
 */
import { CASCADE_ORDER, type RequirementFact, type RequirementSource } from "./types";

export interface CascadeResult {
  winningRequirementCode: string | null;
  winningRequirementSource: RequirementSource | "none";
  subordinateRequirements: string[];
  cascadeConflicts: string[];
  unclassifiedRequirements: string[];
  missingConfiguration: string[];
}

const CONFIGURABLE_LEVELS: RequirementSource[] = ["legal_regulatory", "client", "location"];

export function resolveCascade(
  requirements: RequirementFact[],
  unsatisfiedCodes: ReadonlySet<string>,
): CascadeResult {
  const unclassifiedRequirements = requirements
    .filter((r) => r.source === "unclassified" || r.classification === "unclassified")
    .map((r) => r.code)
    .sort();

  const missingConfiguration = CONFIGURABLE_LEVELS.filter(
    (level) => !requirements.some((r) => r.source === level),
  );

  const blocking = requirements
    .filter((r) => unsatisfiedCodes.has(r.code) && r.source !== "unclassified")
    .sort(
      (a, b) =>
        CASCADE_ORDER.indexOf(a.source) - CASCADE_ORDER.indexOf(b.source) ||
        a.code.localeCompare(b.code),
    );

  const winner = blocking[0] ?? null;

  // A conflict exists when two different levels demand the same requirement code.
  const bySource = new Map<string, Set<RequirementSource>>();
  for (const r of requirements) {
    const set = bySource.get(r.code) ?? new Set<RequirementSource>();
    set.add(r.source);
    bySource.set(r.code, set);
  }
  const cascadeConflicts = [...bySource.entries()]
    .filter(([, sources]) => sources.size > 1)
    .map(([code]) => code)
    .sort();

  return {
    winningRequirementCode: winner?.code ?? null,
    winningRequirementSource: winner?.source ?? "none",
    subordinateRequirements: blocking.slice(1).map((r) => r.code),
    cascadeConflicts,
    unclassifiedRequirements,
    missingConfiguration,
  };
}
