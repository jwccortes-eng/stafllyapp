/**
 * OX-4.5 — Estados terminales.
 *
 * Cuando una acción operativa termina, la pantalla NO puede quedar igual.
 * Un estado terminal declara: qué ocurrió, con qué evidencia, cuál es la
 * consecuencia y qué sigue.
 *
 * Puro. No calcula payroll, no estima, no usa horas programadas: sólo
 * formatea hechos que ya ocurrieron y que el llamador le entrega.
 */
import type { StatusKey } from "@/lib/status/status-registry";

export interface TerminalState {
  /** Qué ocurrió. Frase corta en pasado. */
  title: string;
  /** Evidencia del resultado, ya formateada. Se muestra en una línea. */
  facts: string[];
  /** Consecuencia directa del cierre. */
  consequence: string;
  /** Qué sigue, si hay un paso posterior. */
  next: string | null;
  statusKey: StatusKey;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Horas reales ya fichadas. Nunca horas programadas. */
export function realHoursFact(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} ${rounded === 1 ? "hora real" : "horas reales"}`;
}

export function shiftClosedTerminal(input: {
  workers: number;
  realHours: number;
  openIncidents: number;
}): TerminalState {
  return {
    title: "Turno cerrado",
    facts: [
      plural(input.workers, "worker", "workers"),
      realHoursFact(input.realHours),
      plural(input.openIncidents, "incidencia abierta", "incidencias abiertas"),
    ],
    consequence:
      input.openIncidents > 0
        ? "El cierre quedó registrado con incidencias abiertas."
        : "El cierre quedó registrado sin incidencias abiertas.",
    next: "Listo para revisión final en el Centro de Validación.",
    statusKey: "closed",
  };
}

export function hoursApprovedTerminal(input: {
  records: number;
  realHours?: number | null;
}): TerminalState {
  const facts = [plural(input.records, "registro validado", "registros validados")];
  if (typeof input.realHours === "number") facts.push(realHoursFact(input.realHours));
  return {
    title: "Horas aprobadas",
    facts,
    consequence: "Estas horas ya no están pendientes de revisión.",
    next: "Este turno ya puede avanzar hacia payroll.",
    statusKey: "approved",
  };
}

export function teamCompleteTerminal(input: {
  assigned: number;
  required: number;
}): TerminalState {
  return {
    title: "Equipo completo",
    facts: [`${input.assigned} de ${input.required} posiciones cubiertas`],
    consequence: "No quedan posiciones abiertas en este turno.",
    next: "Sigue el check-in del equipo el día del turno.",
    statusKey: "confirmed",
  };
}

export function checkInCompleteTerminal(input: {
  checkedIn: number;
  expected: number;
  atLabel?: string | null;
}): TerminalState {
  const facts = [`${input.checkedIn} de ${input.expected} con check-in`];
  if (input.atLabel) facts.push(input.atLabel);
  return {
    title: "Check-in completo",
    facts,
    consequence: "Todo el equipo quedó registrado en sitio.",
    next: "Las horas reales se acumulan hasta el clock-out.",
    statusKey: "active",
  };
}

export function validationResolvedTerminal(input: {
  label: string;
  decidedBy?: string | null;
  decidedAtLabel?: string | null;
}): TerminalState {
  const facts = [input.label];
  if (input.decidedBy) facts.push(`Decidido por ${input.decidedBy}`);
  if (input.decidedAtLabel) facts.push(input.decidedAtLabel);
  return {
    title: "Validación resuelta",
    facts,
    consequence: "Este item ya no requiere decisión.",
    next: "Queda en el historial de validación.",
    statusKey: "resolved",
  };
}

export function assignmentCompleteTerminal(input: {
  workerName: string;
  shiftLabel?: string | null;
}): TerminalState {
  return {
    title: "Asignación completada",
    facts: [input.workerName, ...(input.shiftLabel ? [input.shiftLabel] : [])],
    consequence: "El worker quedó asignado a este turno.",
    next: "Recibirá el turno en su portal.",
    statusKey: "confirmed",
  };
}

export function companySwitchedTerminal(companyName: string): TerminalState {
  return {
    title: "Cambio completado",
    facts: [companyName],
    consequence: "Los datos de la compañía anterior fueron descartados.",
    next: "Todo lo que veas ahora pertenece a esta compañía.",
    statusKey: "confirmed",
  };
}

export function modeSwitchedTerminal(input: {
  companyName: string;
  modeLabel: string;
}): TerminalState {
  return {
    title: "Cambio completado",
    facts: [input.companyName, input.modeLabel],
    consequence: "Tu sesión y tu compañía activa se mantuvieron.",
    next: "La navegación y los permisos ya son los de este modo.",
    statusKey: "confirmed",
  };
}
