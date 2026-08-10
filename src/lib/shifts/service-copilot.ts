/**
 * P0 — SERVICE COPILOT EXPERIENCE
 * ================================
 *
 * UNA sola pregunta contestada por el sistema: **¿cuál es tu siguiente paso?**
 *
 * Este módulo NO inventa lógica de negocio: recibe las señales que el editor
 * ya calcula (`useShiftFormSignals`, `getServiceLifecycleReadiness`,
 * `computeShiftPendingFlags`) y las ordena en:
 *
 *   1. Readiness  → UN único indicador 0–100 (mismo concepto del calendario)
 *   2. Next step  → UNA sola recomendación, nunca cinco
 *   3. Por qué    → la explicación en lenguaje operativo
 *   4. Checklist  → lectura, no edición
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro, sin React, sin BD, sin escrituras. No toca payroll, time entries,
 *   attendance, scheduled_shifts, shift_assignments, Connecteam, Smart Intake,
 *   Client Truth, Worker Passport, auth ni RLS. Solo reordena lo que ya existe.
 */

import type { PreparationBand } from "./service-preparation";

export type CopilotStage =
  | "definicion"
  | "publicacion"
  | "staffing"
  | "operacion"
  | "tiempo"
  | "pago"
  | "cerrado";

export type ChecklistState = "done" | "pending" | "attention" | "na";

export type ChecklistKey =
  | "client"
  | "date"
  | "venue"
  | "schedule"
  | "staffing"
  | "meeting_point"
  | "info"
  | "published"
  | "clock_in"
  | "clock_out"
  | "hours";

export interface CopilotChecklistItem {
  key: ChecklistKey;
  label: string;
  state: ChecklistState;
  /** Peso dentro del readiness. Los `na` no cuentan para el total. */
  weight: number;
}

/** Contexto operativo del siguiente paso: el usuario nunca debe recordar nada. */
export interface CopilotContextChip {
  label: string;
  value: string;
  tone?: "neutral" | "attention";
}

/**
 * Acción que RESUELVE la recomendación.
 *  - `focus`: la sección vive en este mismo editor.
 *  - `link` : la resolución vive en otra superficie canónica (deep-link).
 * Si no hay acción posible, el copiloto no la ofrece.
 */
export type CopilotAction =
  | { kind: "focus"; anchorId: string; label: string }
  | { kind: "link"; to: string; label: string };

export interface CopilotNextStep {
  /** Acción única y accionable: "Asignar 2 personas", "Publicar Servicio". */
  label: string;
  /** POR QUÉ — el sistema explica, no solo alerta. */
  why: string;
  /** Sección del editor a enfocar (`focusServiceSection`), si aplica. */
  anchorId?: string;
  /** Acción única que resuelve la recomendación. Sin acción → no se ofrece botón. */
  action?: CopilotAction;
  /** Servicio · Cliente · Fecha · Horario · Cobertura. */
  context: CopilotContextChip[];
  /** Etapa a la que pertenece la recomendación. */
  stage: CopilotStage;
}

export interface ServiceCopilotResult {
  /** UN único indicador. No hay score/health/confidence/risk aparte. */
  readiness: number;
  band: PreparationBand;
  bandLabel: string;
  stage: CopilotStage;
  stageLabel: string;
  nextStep: CopilotNextStep;
  checklist: CopilotChecklistItem[];
}

export interface CopilotAttendanceSignals {
  /** Personas con clock in registrado. `null` = todavía no se sabe. */
  clockedIn?: number | null;
  /** Personas con clock out registrado. */
  clockedOut?: number | null;
  /** Horas revisadas/aprobadas para este servicio. */
  hoursReviewed?: boolean | null;
  /** El servicio ya fue enviado/preparado para payroll. */
  payrollPrepared?: boolean | null;
}

export interface ServiceCopilotInput {
  clientId: string | null | undefined;
  date: string;
  startTime: string;
  endTime: string;
  /** La hora de inicio todavía es aproximada. */
  approxStart?: boolean;
  hasVenue: boolean;
  /** El servicio requiere transporte y por tanto punto de encuentro. */
  meetingRequired: boolean;
  hasMeetingPoint: boolean;
  /** Plazas pedidas por el cliente (0 = todavía sin definir). */
  slots: number;
  assignedCount: number;
  claimable: boolean;
  publicationStatus?: string | null;
  /** Datos completos del turno (título, notas, info del evento). */
  infoComplete: boolean;
  /** Días hasta el servicio; negativo = ya ocurrió. */
  daysUntil?: number | null;
  attendance?: CopilotAttendanceSignals;
  /** Identificadores para construir deep-links resolutivos. */
  shiftId?: string | null;
  serviceRef?: string | null;
  clientName?: string | null;
  /** Anclas opcionales para enfocar la sección correcta del editor. */
  anchors?: Partial<Record<ChecklistKey, string>>;
}

const BAND_LABEL: Record<PreparationBand, string> = {
  ready: "Listo",
  attention: "Necesita atención",
  later: "Puede esperar",
  closed: "Cerrado",
};

export const STAGE_LABEL: Record<CopilotStage, string> = {
  definicion: "Definición",
  publicacion: "Publicación",
  staffing: "Staffing",
  operacion: "Operación",
  tiempo: "Tiempo",
  pago: "Pago",
  cerrado: "Cerrado",
};

const WEIGHT: Record<ChecklistKey, number> = {
  client: 8,
  date: 8,
  venue: 12,
  schedule: 12,
  staffing: 20,
  meeting_point: 5,
  info: 10,
  published: 10,
  clock_in: 5,
  clock_out: 5,
  hours: 5,
};

const LABEL: Record<ChecklistKey, string> = {
  client: "Cliente",
  date: "Fecha",
  venue: "Venue",
  schedule: "Horario",
  staffing: "Staffing",
  meeting_point: "Meeting Point",
  info: "Información",
  published: "Publicado",
  clock_in: "Clock In",
  clock_out: "Clock Out",
  hours: "Horas",
};

function item(key: ChecklistKey, state: ChecklistState): CopilotChecklistItem {
  return { key, label: LABEL[key], state, weight: WEIGHT[key] };
}

export function getServiceCopilot(input: ServiceCopilotInput): ServiceCopilotResult {
  const days = input.daysUntil ?? null;
  const isPast = days !== null && days < 0;
  const published = input.publicationStatus === "published";
  const cancelled = input.publicationStatus === "cancelled";
  const archived = input.publicationStatus === "archived";

  const hasClient = Boolean(input.clientId);
  const hasDate = Boolean(input.date);
  const scheduleDone =
    Boolean(input.startTime) &&
    Boolean(input.endTime) &&
    input.startTime !== input.endTime &&
    !input.approxStart;
  const headcountDefined = input.slots > 0;
  const missingPeople = Math.max(0, input.slots - input.assignedCount);
  const staffingDone = headcountDefined && (input.claimable ? true : missingPeople === 0);
  const meetingDone = !input.meetingRequired || input.hasMeetingPoint;

  const att = input.attendance ?? {};
  const teamSize = input.assignedCount;
  // Los ítems de tiempo solo aplican cuando el servicio ya ocurrió y hay equipo.
  // Solo aplica cuando el Servicio ya ocurrió, hubo equipo y fue publicado:
  // un borrador nunca pide fichaje.
  const timeApplies = isPast && teamSize > 0 && published;
  /** Señales desconocidas ≠ señales en cero: sin datos no se inventan alertas. */
  const attendanceKnown = timeApplies && att.clockedIn != null;
  const clockInDone = attendanceKnown ? (att.clockedIn ?? 0) >= teamSize : false;
  // Sin clock in no existe clock out que exigir.
  const clockOutApplies = attendanceKnown && (att.clockedIn ?? 0) > 0;
  const clockOutDone = clockOutApplies ? (att.clockedOut ?? 0) >= teamSize : false;
  // Las horas solo se revisan cuando el clock out cerró.
  const hoursApplies = clockOutDone;
  const hoursDone = hoursApplies ? Boolean(att.hoursReviewed) : false;

  const checklist: CopilotChecklistItem[] = [
    item("client", hasClient ? "done" : "pending"),
    item("date", hasDate ? "done" : "attention"),
    item("venue", input.hasVenue ? "done" : "pending"),
    item("schedule", scheduleDone ? "done" : "pending"),
    item(
      "staffing",
      staffingDone ? "done" : headcountDefined ? "attention" : "pending",
    ),
    item("meeting_point", !input.meetingRequired ? "na" : meetingDone ? "done" : "pending"),
    item("info", input.infoComplete ? "done" : "pending"),
    item("published", published ? "done" : cancelled ? "na" : "pending"),
    item("clock_in", !attendanceKnown ? "na" : clockInDone ? "done" : "attention"),
    item("clock_out", !clockOutApplies ? "na" : clockOutDone ? "done" : "attention"),
    item("hours", !hoursApplies ? "na" : hoursDone ? "done" : "attention"),
  ];

  const counted = checklist.filter((c) => c.state !== "na");
  const total = counted.reduce((s, c) => s + c.weight, 0) || 1;
  const earned = counted.reduce((s, c) => s + (c.state === "done" ? c.weight : 0), 0);
  const readiness = Math.round((earned / total) * 100);

  const anchor = (k: ChecklistKey) => input.anchors?.[k];
  const focus = (k: ChecklistKey, label: string): CopilotAction | undefined => {
    const id = anchor(k);
    return id ? { kind: "focus", anchorId: id, label } : undefined;
  };
  const link = (to: string, label: string): CopilotAction | undefined =>
    input.shiftId ? { kind: "link", to, label } : undefined;

  // ── CONTEXTO — el usuario nunca debe recordar qué Servicio está mirando.
  const coverage = input.slots > 0
    ? Math.min(100, Math.round((input.assignedCount / input.slots) * 100))
    : 0;
  const context: CopilotContextChip[] = [
    { label: "Servicio", value: input.serviceRef || "Sin referencia" },
    { label: "Cliente", value: input.clientName || "Sin cliente", tone: hasClient ? "neutral" : "attention" },
    { label: "Fecha", value: input.date || "Sin fecha", tone: hasDate ? "neutral" : "attention" },
    {
      label: "Horario",
      value: input.startTime && input.endTime ? `${input.startTime}–${input.endTime}` : "Sin definir",
      tone: scheduleDone ? "neutral" : "attention",
    },
    {
      label: "Cobertura",
      value: headcountDefined
        ? `${input.assignedCount}/${input.slots} · ${coverage}%`
        : "Sin definir",
      tone: staffingDone ? "neutral" : "attention",
    },
  ];

  // ── UNA sola recomendación. Orden de prioridad operativa, sin empates.
  let nextStep: Omit<CopilotNextStep, "context">;

  if (cancelled || archived) {
    nextStep = {
      label: "Sin acciones pendientes",
      why: cancelled
        ? "Este Servicio está cancelado. No requiere trabajo operativo."
        : "Este Servicio está archivado.",
      stage: "cerrado",
    };
  } else if (!hasDate) {
    nextStep = {
      label: "Confirmar fecha",
      why: "Sin fecha el Servicio no puede planificarse ni asignarse.",
      anchorId: anchor("date"),
      action: focus("date", "Ir a la fecha"),
      stage: "definicion",
    };
  } else if (!hasClient) {
    nextStep = {
      label: "Confirmar cliente",
      why: "El cliente define facturación, venue habitual y equipo recomendado.",
      anchorId: anchor("client"),
      action: focus("client", "Elegir cliente"),
      stage: "definicion",
    };
  } else if (!input.hasVenue) {
    nextStep = {
      label: "Confirmar Venue",
      why: "El equipo necesita saber dónde se trabaja antes de aceptar.",
      anchorId: anchor("venue"),
      action: focus("venue", "Elegir Venue"),
      stage: "definicion",
    };
  } else if (!scheduleDone) {
    nextStep = {
      label: "Revisar horario",
      why: input.approxStart
        ? "La hora de inicio todavía es aproximada."
        : !input.endTime
          ? "Falta la hora de fin del Servicio."
          : "La hora de inicio y la de fin no pueden ser la misma.",
      anchorId: anchor("schedule"),
      action: focus("schedule", "Ajustar horario"),
      stage: "definicion",
    };
  } else if (!headcountDefined) {
    nextStep = {
      label: "Definir cuántas personas",
      why: "Todavía no sabemos cuánta gente pide el cliente para este Servicio.",
      anchorId: anchor("staffing"),
      action: focus("staffing", "Definir plazas"),
      stage: "definicion",
    };
  } else if (!meetingDone) {
    nextStep = {
      label: "Completar Meeting Point",
      why: "Este Servicio requiere transporte y el equipo no sabe dónde encontrarse.",
      anchorId: anchor("meeting_point"),
      action: focus("meeting_point", "Ir al Meeting Point"),
      stage: "operacion",
    };
  } else if (!input.infoComplete) {
    nextStep = {
      label: "Completar información",
      why: "Faltan datos del turno para que el Servicio salga completo a la operación.",
      anchorId: anchor("info"),
      action: focus("info", "Completar información"),
      stage: "definicion",
    };
  } else if (!published) {
    nextStep = {
      label: "Publicar Servicio",
      why: "La información está completa. Al publicarlo el equipo puede verlo y aceptarlo.",
      anchorId: anchor("published"),
      action: focus("published", "Ir a publicación"),
      stage: "publicacion",
    };
  } else if (!staffingDone) {
    nextStep = {
      label: missingPeople === 1 ? "Asignar 1 persona" : `Asignar ${missingPeople} personas`,
      why: `Faltan ${missingPeople} ${missingPeople === 1 ? "persona" : "personas"} para completar el staffing (${input.assignedCount}/${input.slots} confirmadas).`,
      anchorId: anchor("staffing"),
      action: focus("staffing", "Asignar equipo"),
      stage: "staffing",
    };
  } else if (!isPast) {
    nextStep = {
      label: "Sin acciones pendientes",
      why: "Todo el equipo está cubierto. El Servicio está listo para operar.",
      stage: "operacion",
    };
  } else if (!attendanceKnown) {
    // Servicio pasado sin señales de fichaje: se revisa en la superficie canónica.
    nextStep = {
      label: "Revisar horas",
      why: "El Servicio ya ocurrió. La revisión de horas se hace en el Centro de Validación.",
      action: link(`/app/payroll-review-queue?shiftId=${input.shiftId}`, "Revisar horas"),
      stage: "tiempo",
    };
  } else if (!clockOutApplies) {
    nextStep = {
      label: "Revisar asistencia",
      why: "El Servicio terminó y nadie registró entrada. Confirma qué pasó antes de tocar horas.",
      action: link(`/app/timeclock?shiftId=${input.shiftId}&date=${input.date}`, "Abrir fichaje"),
      stage: "tiempo",
    };
  } else if (!clockOutDone) {
    nextStep = {
      label: "Cerrar clock-out",
      why: `El Servicio terminó y ${teamSize - (att.clockedOut ?? 0)} persona(s) siguen sin clock out.`,
      action: link(`/app/timeclock?shiftId=${input.shiftId}&date=${input.date}`, "Abrir fichaje"),
      stage: "tiempo",
    };
  } else if (!hoursDone) {
    nextStep = {
      label: "Revisar horas",
      why: "El clock out está completo. Las horas necesitan revisión antes de pago.",
      action: link(`/app/payroll-review-queue?shiftId=${input.shiftId}`, "Revisar horas"),
      stage: "tiempo",
    };
  } else if (!att.payrollPrepared) {
    nextStep = {
      label: "Preparar Payroll",
      why: "Las horas ya fueron revisadas. La decisión final se toma en el Centro de Validación.",
      action: link(`/app/validation-center?shiftId=${input.shiftId}`, "Abrir Centro de Validación"),
      stage: "pago",
    };
  } else {
    nextStep = {
      label: "Sin acciones pendientes",
      why: "Este Servicio completó su ciclo: horas revisadas y payroll preparado.",
      stage: "cerrado",
    };
  }

  const openCount = counted.filter((c) => c.state !== "done").length;
  const band: PreparationBand =
    nextStep.stage === "cerrado"
      ? "closed"
      : openCount === 0
        ? "ready"
        : readiness >= 60 || (days !== null && days <= 2)
          ? "attention"
          : "later";

  return {
    readiness,
    band,
    bandLabel: BAND_LABEL[band],
    stage: nextStep.stage,
    stageLabel: STAGE_LABEL[nextStep.stage],
    nextStep: { ...nextStep, context },
    checklist,
  };
}
