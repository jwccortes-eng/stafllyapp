/**
 * F1.1 — runs the scenario matrix through the engine. PURE, no I/O.
 */
import { observe } from "../engine/observe";
import { ChangeTypeRegistry } from "../engine/registry";
import { schedulingRegistry } from "../catalog/scheduling.registry";
import { redactRecord } from "../observation/redact";
import type { ObservationRecord } from "../engine/types";
import { SCENARIOS, type Scenario } from "./scenarios";

const registry = new ChangeTypeRegistry(schedulingRegistry);
const EVALUATED_AT = "2026-07-30T12:00:00.000Z";

export interface ScenarioResult {
  scenario: Scenario;
  record: ObservationRecord;
}

export function runScenario(scenario: Scenario, evaluatedAt = EVALUATED_AT): ScenarioResult {
  return { scenario, record: redactRecord(observe(scenario.event, { registry, evaluatedAt })) };
}

export function runAllScenarios(evaluatedAt = EVALUATED_AT): ScenarioResult[] {
  return SCENARIOS.map((s) => runScenario(s, evaluatedAt));
}

/** Generic-message detector used as a quality gate. */
const GENERIC_PATTERNS = [
  /^turno actualizado/i,
  /^hubo cambios/i,
  /revisa la (aplicaci[óo]n|app)/i,
  /^cambios en el turno\.?$/i,
];

export function isGenericMessage(message: string): boolean {
  return GENERIC_PATTERNS.some((p) => p.test(message.trim()));
}

/** A message must state the change, the personal meaning and an action. */
export function messageQualityIssues(message: string): string[] {
  const issues: string[] = [];
  if (isGenericMessage(message)) issues.push("generic");
  if (message.includes("\u0000") || message.includes("undefined")) issues.push("unrendered_token");
  if (/ (—|-)\.|antes de (—|-)/.test(message)) issues.push("dangling_placeholder");
  if (message.trim().length < 40) issues.push("too_short_to_be_actionable");
  return issues;
}
