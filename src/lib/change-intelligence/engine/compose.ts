/**
 * L4 — Composition. PURE.
 * Renders before → after from registry templates. No domain wording hardcoded.
 *
 * F1.1: a template clause that depends on a token the event did not provide is
 * dropped instead of rendering a dangling "—". This keeps every simulated
 * message specific and free of empty placeholders.
 */
import type { AudienceRef, ChangeTypeRegistration, DomainChangeEvent, FieldDelta } from "./types";

const MISSING = "\u0000";

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

function renderStrict(template: string, tokens: Record<string, string>): string {
  const raw = template.replace(/\{([^}]+)\}/g, (_m, key: string) => {
    const value = tokens[key.trim()];
    return value === undefined || value === "" ? MISSING : value;
  });

  // Drop parentheticals whose only content was unavailable, then any sentence
  // that still depends on a missing token.
  const cleaned = raw.replace(/\s*\([^)]*\u0000[^)]*\)/g, "");
  const sentences = cleaned
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !sentence.includes(MISSING))
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.join(" ");
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
    if (value === null || value === undefined || value === "") continue;
    tokens[`context.${key}`] = String(value);
  }
  const body = renderStrict(template, tokens);
  return body || null;
}
