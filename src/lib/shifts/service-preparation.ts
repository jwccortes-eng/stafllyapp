/**
 * P0 — OPERATION PLANNER EXPERIENCE
 * =================================
 *
 * PREPARACIÓN de un Servicio (0–100) — separada del ESTADO OPERATIVO.
 *
 *   Estado operativo → Borrador / Publicado / Operando / Cerrado
 *   Preparación      → checklist de madurez (0–100)
 *
 * Un Servicio MADURA: no nace completo. Un borrador incompleto no es un error,
 * es un evento en construcción. Esta capa nunca "castiga": responde una sola
 * pregunta — ¿qué me falta para que este evento salga bien?
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro / solo lectura. Sin React, sin BD, sin escrituras.
 *   No toca payroll, time_entries, assignments, attendance, Connecteam export,
 *   Smart Intake, Client Truth, Worker Passport, auth ni RLS.
 *   No inventa reglas: lee lo que ya calcula `getCalendarServiceIdentity`.
 */
import type { CalendarServiceIdentity } from "./calendar-service-identity";

export type PreparationBand = "ready" | "attention" | "later" | "closed";

export interface PreparationItem {
  key:
    | "schedule"
    | "job_site"
    | "headcount"
    | "team"
    | "connecteam"
    | "published";
  label: string;
  /** Frase corta y amable de lo que falta (nunca un regaño). */
  hint: string;
  done: boolean;
  weight: number;
  anchorId?: string;
}

export interface ServicePreparation {
  /** 0–100. Preparación, NO estado. */
  score: number;
  band: PreparationBand;
  /** "Listo" · "Necesita atención" · "Puede esperar" · "Cerrado". */
  bandLabel: string;
  /** Frase de cabecera para el coordinador. */
  headline: string;
  items: PreparationItem[];
  pending: PreparationItem[];
  /** Siguiente paso recomendado (Principio 5). Null si está todo listo. */
  nextAction: { label: string; hint: string; anchorId?: string } | null;
}

const BAND_LABEL: Record<PreparationBand, string> = {
  ready: "Listo",
  attention: "Necesita atención",
  later: "Puede esperar",
  closed: "Cerrado",
};

const NEXT_LABEL: Record<PreparationItem["key"], string> = {
  schedule: "Confirmar horario",
  job_site: "Definir el lugar",
  headcount: "Definir cuántas personas",
  team: "Completar el equipo",
  connecteam: "Completar datos del turno",
  published: "Publicar el servicio",
};

export interface PreparationContext {
  /** Días hasta el servicio (negativo = ya pasó). Modula la prioridad, no el score. */
  daysUntil?: number | null;
}

/**
 * Calcula la preparación por checklist — nunca por "campos obligatorios".
 */
export function getServicePreparation(
  identity: CalendarServiceIdentity,
  ctx: PreparationContext = {},
): ServicePreparation {
  const { staffing, time, connecteam, service } = identity;

  const hasJobSite = !staffing.staffBlockers.some((b) => b.code === "staff.missing_job_site");
  const scheduleDone = Boolean(time.start) && !time.approxStart && !time.endMissing;

  const items: PreparationItem[] = [
    {
      key: "schedule",
      label: "Horario confirmado",
      hint: time.start
        ? time.approxStart
          ? "La hora de inicio todavía es aproximada."
          : "Falta la hora de fin."
        : "Todavía no hay horario.",
      done: scheduleDone,
      weight: 20,
      anchorId: staffing.staffBlockers.find((b) => b.field === "start_time")?.action.anchorId,
    },
    {
      key: "job_site",
      label: "Lugar del servicio",
      hint: "El equipo necesita saber dónde se trabaja.",
      done: hasJobSite,
      weight: 20,
      anchorId: staffing.staffBlockers.find((b) => b.code === "staff.missing_job_site")?.action
        .anchorId,
    },
    {
      key: "headcount",
      label: "Cantidad de personal",
      hint: "Aún no sabemos cuántas personas pide el cliente.",
      done: !staffing.pending,
      weight: 15,
      anchorId: staffing.staffBlockers.find((b) => b.code === "staff.pending_headcount")?.action
        .anchorId,
    },
    {
      key: "team",
      label: "Equipo cubierto",
      hint: staffing.pending
        ? "Define la cantidad para saber cuánto falta."
        : `Faltan ${Math.max(0, staffing.missing)} por asignar.`,
      done: staffing.complete,
      weight: 25,
    },
    {
      key: "connecteam",
      label: "Datos completos del turno",
      hint: connecteam.label,
      done: connecteam.ready,
      weight: 10,
      anchorId: connecteam.blockers[0]?.action.anchorId,
    },
    {
      key: "published",
      label: "Publicado",
      hint: "Sigue en construcción: publícalo cuando quieras que el equipo lo vea.",
      done: !service.isDraft && service.code !== "cancelled",
      weight: 10,
    },
  ];

  const total = items.reduce((s, i) => s + i.weight, 0);
  const earned = items.reduce((s, i) => s + (i.done ? i.weight : 0), 0);
  const score = Math.round((earned / total) * 100);

  const pending = items.filter((i) => !i.done);
  const first = pending[0] ?? null;

  const days = ctx.daysUntil ?? null;
  const band: PreparationBand =
    service.code === "archived" || (days !== null && days < 0 && pending.length === 0)
      ? "closed"
      : pending.length === 0
        ? "ready"
        : days !== null && days > 7 && score >= 40
          ? "later"
          : score >= 80
            ? "attention"
            : days !== null && days <= 2
              ? "attention"
              : score >= 60
                ? "attention"
                : "later";

  const headline =
    pending.length === 0
      ? "Todo listo para operar."
      : score >= 60
        ? `Casi listo — ${pending.length} punto${pending.length === 1 ? "" : "s"} por cerrar.`
        : "En construcción — vamos paso a paso.";

  return {
    score,
    band,
    bandLabel: BAND_LABEL[band],
    headline,
    items,
    pending,
    nextAction: first
      ? { label: NEXT_LABEL[first.key], hint: first.hint, anchorId: first.anchorId }
      : null,
  };
}

/** Orden de planificación: primero lo que necesita atención, luego lo demás. */
export const PREPARATION_PRIORITY: Record<PreparationBand, number> = {
  attention: 0,
  later: 1,
  ready: 2,
  closed: 3,
};

// ────────────────────────────────────────────────────────────────────────────
// Puente con el ciclo de vida (editor de Servicio)
// ────────────────────────────────────────────────────────────────────────────

import type { ServiceLifecycleReadiness } from "./service-lifecycle-readiness";

const GATE_ITEM: { gate: "staff" | "publish" | "export_connecteam"; key: PreparationItem["key"]; label: string; weight: number }[] = [
  { gate: "staff", key: "headcount", label: "Listo para staffing", weight: 40 },
  { gate: "export_connecteam", key: "connecteam", label: "Datos completos del turno", weight: 30 },
  { gate: "publish", key: "published", label: "Listo para publicar", weight: 30 },
];

/**
 * Misma preparación, leída desde las compuertas del ciclo de vida — para el
 * editor de Servicio, donde ya existe `getServiceLifecycleReadiness`.
 */
export function getLifecyclePreparation(
  lifecycle: ServiceLifecycleReadiness,
): ServicePreparation {
  const items: PreparationItem[] = GATE_ITEM.map(({ gate, key, label, weight }) => {
    const g = lifecycle.gates[gate];
    return {
      key,
      label,
      hint: g.ready ? g.statusText : (g.blockers[0]?.reason ?? g.statusText),
      done: g.ready,
      weight,
      anchorId: g.blockers[0]?.action.anchorId ?? g.cta?.anchorId,
    };
  });

  const earned = items.reduce((s, i) => s + (i.done ? i.weight : 0), 0);
  const score = Math.round((earned / 100) * 100);
  const pending = items.filter((i) => !i.done);
  const first = pending[0] ?? null;
  const band: PreparationBand = pending.length === 0 ? "ready" : score >= 40 ? "attention" : "later";

  return {
    score,
    band,
    bandLabel: BAND_LABEL[band],
    headline:
      pending.length === 0
        ? "Todo listo para operar."
        : score >= 40
          ? `Casi listo — ${pending.length} punto${pending.length === 1 ? "" : "s"} por cerrar.`
          : "En construcción — vamos paso a paso.",
    items,
    pending,
    nextAction: first
      ? {
          label: lifecycle.gates[GATE_ITEM[items.indexOf(first)].gate].cta?.label ?? NEXT_LABEL[first.key],
          hint: first.hint,
          anchorId: first.anchorId,
        }
      : null,
  };
}
