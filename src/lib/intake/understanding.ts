/**
 * Smart Intake Premium Experience V1 — capa de LENGUAJE.
 *
 * Módulo PURO y de sólo presentación: traduce el modelo canónico de
 * candidatos (que NO cambia) a frases de coordinador humano.
 *
 * No decide, no escribe, no infiere nada nuevo: sólo lee lo que el
 * pipeline ya resolvió (matchOrigin, resolvedId, duplicateStatus,
 * missingFields) y lo cuenta en palabras.
 */

import type { ServiceCandidate } from "./candidate";

export interface UnderstandingLine {
  tone: "ok" | "warn";
  text: string;
}

export interface UnderstandingSummary {
  /** "Entendí esto" — nunca números crudos de confianza. */
  lines: UnderstandingLine[];
  /** "También recordé" — sólo memoria REAL, vacío si no hay. */
  memory: string[];
  /** "Vamos a" — acciones exactas que ocurrirán al confirmar. */
  plan: Array<{ kind: "reuse" | "create"; text: string }>;
  serviceCount: number;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Entidades ya existentes que el pipeline reconoció (match exacto/diccionario/confirmado). */
function isRecognized(ref: ServiceCandidate["clientCandidate"]): boolean {
  return Boolean(ref.resolvedId) || ref.matchOrigin === "exact" || ref.matchOrigin === "dictionary";
}

function isPending(ref: ServiceCandidate["clientCandidate"]): boolean {
  return Boolean(ref.raw) && !ref.resolvedId && ref.requiresConfirmation;
}

export function buildUnderstanding(candidates: ServiceCandidate[]): UnderstandingSummary {
  const lines: UnderstandingLine[] = [];
  const memory: string[] = [];
  const plan: UnderstandingSummary["plan"] = [];

  const active = candidates.filter((c) => c.reviewStatus !== "excluded");
  if (active.length === 0) {
    return { lines, memory, plan, serviceCount: 0 };
  }

  lines.push({ tone: "ok", text: plural(active.length, "Servicio", "Servicios") });

  const clientNames = new Set<string>();
  const venueNames = new Set<string>();
  const pendingClients = new Set<string>();
  const pendingVenues = new Set<string>();
  const aliases = new Set<string>();

  for (const c of active) {
    const client = c.clientCandidate;
    const venue = c.venueCandidate;
    if (isRecognized(client)) clientNames.add(client.suggestedLabel ?? client.raw);
    else if (isPending(client)) pendingClients.add(client.raw);
    if (isRecognized(venue)) venueNames.add(venue.suggestedLabel ?? venue.raw);
    else if (isPending(venue)) pendingVenues.add(venue.raw);

    if (client.matchOrigin === "dictionary" && client.raw) aliases.add(client.raw);
    if (venue.matchOrigin === "dictionary" && venue.raw) aliases.add(venue.raw);
  }

  if (clientNames.size > 0)
    lines.push({ tone: "ok", text: `${plural(clientNames.size, "Cliente", "Clientes")} que ya conozco` });
  if (venueNames.size > 0)
    lines.push({ tone: "ok", text: `${plural(venueNames.size, "Venue", "Venues")} que ya conozco` });
  if (pendingClients.size > 0)
    lines.push({ tone: "warn", text: `${plural(pendingClients.size, "Cliente", "Clientes")} por confirmar` });
  if (pendingVenues.size > 0)
    lines.push({ tone: "warn", text: `${plural(pendingVenues.size, "Venue", "Venues")} por confirmar` });
  if (aliases.size > 0)
    lines.push({ tone: "ok", text: `${plural(aliases.size, "Alias reconocido", "Alias reconocidos")}` });

  const incomplete = active.filter((c) => c.missingFields.length > 0).length;
  if (incomplete > 0)
    lines.push({ tone: "warn", text: `${incomplete} sin horario o fecha completa` });

  const duplicates = active.filter((c) => c.duplicateStatus !== "no_match").length;
  if (duplicates > 0)
    lines.push({ tone: "warn", text: `${duplicates} que creo que ya existen` });

  // ---- Memoria real (nada inventado) ----
  for (const name of clientNames) memory.push(`${name} ya existe como cliente.`);
  for (const name of venueNames) memory.push(`${name} ya existe como venue.`);
  for (const alias of aliases) memory.push(`El alias "${alias}" ya fue confirmado antes por tu empresa.`);
  if (duplicates > 0)
    memory.push(`Ya habíamos registrado algo muy parecido: revisa ${plural(duplicates, "servicio", "servicios")}.`);

  // ---- Plan ----
  if (clientNames.size > 0) plan.push({ kind: "reuse", text: `Vincular ${plural(clientNames.size, "cliente existente", "clientes existentes")}` });
  if (venueNames.size > 0) plan.push({ kind: "reuse", text: `Usar ${plural(venueNames.size, "venue existente", "venues existentes")}` });
  if (pendingClients.size > 0 || pendingVenues.size > 0)
    plan.push({
      kind: "create",
      text: `Confirmar ${plural(pendingClients.size + pendingVenues.size, "dato", "datos")} contigo antes de crear`,
    });
  const creatable = active.filter((c) => c.reviewStatus !== "created").length;
  if (creatable > 0)
    plan.push({ kind: "create", text: `Crear ${plural(creatable, "servicio en borrador", "servicios en borrador")}` });

  return { lines, memory, plan, serviceCount: active.length };
}

/** Confianza en lenguaje de coordinador. Nunca porcentajes. */
export function confidencePhrase(confidence: number): string {
  if (confidence >= 0.85) return "Estoy bastante seguro.";
  if (confidence >= 0.6) return "Creo que es esto, confírmame.";
  return "Necesito que me confirmes.";
}
