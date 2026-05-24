/**
 * Quick-create shift templates — frontend-only presets (v1).
 *
 * No DB, no RLS, no notifications. Selecting a template patches the
 * existing ShiftFormState via the standard onPatch handler.
 *
 * Safety rules:
 *  - Only safe, editable fields are touched (see SAFE_KEYS).
 *  - Never touch client, locations, meeting point, assigned workers,
 *    publication status, payroll truth, traceability, or pay overrides.
 *  - "Fill empty only" semantics: a template never overwrites a value the
 *    operator has already typed. Calendar-selected date/time are preserved.
 */
import type { ShiftFormState } from "../ShiftFormFields";

export type QuickTemplateId =
  | "meseros"
  | "cocina"
  | "setup"
  | "bartender"
  | "driver"
  | "capitan"
  | "limpieza"
  | "evento";

export interface QuickTemplate {
  id: QuickTemplateId;
  label: string;
  emoji: string;
  hint: string;
  /** Partial patch — only fields listed in SAFE_KEYS are accepted. */
  patch: SafePatch;
}

/** Fields a template is allowed to suggest. Everything else is ignored. */
type SafeKey =
  | "title"
  | "slots"
  | "notes"
  | "specialInstructions"
  | "transportNotes";

type SafePatch = Partial<Pick<ShiftFormState, SafeKey>>;

const SAFE_KEYS: readonly SafeKey[] = [
  "title",
  "slots",
  "notes",
  "specialInstructions",
  "transportNotes",
] as const;

export const QUICK_TEMPLATES: readonly QuickTemplate[] = [
  {
    id: "meseros",
    label: "Meseros",
    emoji: "🍽️",
    hint: "Servicio de mesa para evento",
    patch: {
      title: "Meseros",
      slots: "4",
      notes:
        "Servicio de meseros para evento. Llegar con uniforme completo y zapatos cómodos.",
      specialInstructions:
        "Uniforme: camisa blanca, pantalón negro, zapatos negros cerrados, delantal. Cabello recogido.",
    },
  },
  {
    id: "cocina",
    label: "Cocina",
    emoji: "👨‍🍳",
    hint: "Equipo de cocina / prep",
    patch: {
      title: "Cocina",
      slots: "2",
      notes:
        "Equipo de cocina. Prep, montaje de platos y limpieza de estación.",
      specialInstructions:
        "Uniforme: filipina blanca, pantalón de cocina, zapatos antideslizantes, gorra/red para el cabello.",
    },
  },
  {
    id: "setup",
    label: "Setup / Montaje",
    emoji: "🛠️",
    hint: "Montaje y desmontaje del evento",
    patch: {
      title: "Setup / Montaje",
      slots: "3",
      notes:
        "Montaje del evento: mesas, sillas, decoración y logística previa al servicio.",
      specialInstructions:
        "Ropa de trabajo cómoda, zapatos cerrados. Se permite playera del staff.",
    },
  },
  {
    id: "bartender",
    label: "Bartender",
    emoji: "🍸",
    hint: "Barra y servicio de bebidas",
    patch: {
      title: "Bartender",
      slots: "1",
      notes:
        "Servicio de barra: preparación de bebidas, control de inventario básico y atención al cliente.",
      specialInstructions:
        "Uniforme: camisa negra, pantalón negro, zapatos cerrados. Llevar destapador propio si lo tiene.",
    },
  },
  {
    id: "driver",
    label: "Driver",
    emoji: "🚐",
    hint: "Transporte de equipo o personal",
    patch: {
      title: "Driver",
      slots: "1",
      notes:
        "Transporte de personal o equipo al sitio del evento.",
      specialInstructions:
        "Licencia vigente. Confirmar capacidad del vehículo y combustible antes de salir.",
      transportNotes:
        "Driver dedicado para esta operación. Confirmar punto de salida con el admin del turno.",
    },
  },
  {
    id: "capitan",
    label: "Capitán",
    emoji: "🎖️",
    hint: "Lead operativo del turno",
    patch: {
      title: "Capitán de turno",
      slots: "1",
      notes:
        "Lead operativo del turno. Coordina al equipo, valida asistencia y reporta cierre.",
      specialInstructions:
        "Uniforme formal del staff. Llegar 15 min antes del call time para briefing.",
    },
  },
  {
    id: "limpieza",
    label: "Limpieza",
    emoji: "🧹",
    hint: "Limpieza durante y post-evento",
    patch: {
      title: "Limpieza",
      slots: "2",
      notes:
        "Limpieza de áreas del evento durante y al cierre del servicio.",
      specialInstructions:
        "Ropa de trabajo, zapatos cerrados antideslizantes. Equipo de limpieza provisto en sitio.",
    },
  },
  {
    id: "evento",
    label: "Evento general",
    emoji: "🎪",
    hint: "Staff general multipropósito",
    patch: {
      title: "Staff de evento",
      slots: "5",
      notes:
        "Staff general para apoyo durante el evento. Tareas asignadas por el capitán del turno.",
      specialInstructions:
        "Uniforme del staff o vestimenta neutra (camisa oscura, pantalón oscuro, zapatos cerrados).",
    },
  },
];

/**
 * Build a "fill empty only" patch from a template against the current form state.
 * Fields the operator already filled are never overwritten.
 */
export function buildTemplatePatch(
  current: ShiftFormState,
  template: QuickTemplate,
): SafePatch {
  const out: SafePatch = {};
  for (const key of SAFE_KEYS) {
    const proposed = template.patch[key];
    if (proposed === undefined) continue;

    const existing = current[key];
    const existingEmpty =
      existing === undefined ||
      existing === null ||
      (typeof existing === "string" && existing.trim() === "") ||
      // "slots" default is "1" — treat the default as empty so templates can
      // bump headcount; any other typed value is respected.
      (key === "slots" && existing === "1");

    if (existingEmpty) {
      (out as any)[key] = proposed;
    }
  }
  return out;
}
