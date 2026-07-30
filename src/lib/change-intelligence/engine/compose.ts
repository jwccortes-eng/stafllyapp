/**
 * L4 — Composition. PURE.
 * Renders before → after from registry templates. No domain wording hardcoded.
 */
import type { AudienceRef, ChangeTypeRegistration, DomainChangeEvent, FieldDelta } from "./types";

const labelOf = (value: unknown, fallback: string): string => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

function deltaTokens(deltas: FieldDelta[]): Record<string, string> {
  const tokens: Record<string, string> = {};
  const parts: string[] = [];
  for (const d of deltas) {
    const before = labelOf(d.beforeLabel ?? d.before, "—");
    const after = labelOf(d.afterLabel ?? d.after, "—");
    tokens[`before.${d.field}`] = before;
    tokens[`after.${d.field}`] = after;
    parts.push(`${d.label ?? d.field}: ${before} → ${after}`);
  }
  tokens["diff"] = parts.join(" · ");
  return tokens;
}

export function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, key: string) => tokens[key.trim()] ?? "—");
}

export function compose(
  event: DomainChangeEvent,
  materialDeltas: FieldDelta[],
  registration: ChangeTypeRegistration,
  recipient: AudienceRef,
): string | null {
  const template = registration.templates[recipient.relation];
  if (!template) return null;

  const tokens: Record<string, string> = {
    ...deltaTokens(materialDeltas),
    "subject.label": event.subject.label,
    "subject.id": event.subject.id,
    "recipient.label": recipient.displayLabel ?? recipient.partyId,
  };
  for (const [key, value] of Object.entries(event.context)) {
    tokens[`context.${key}`] = labelOf(value, "—");
  }
  return renderTemplate(template, tokens);
}
