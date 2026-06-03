/**
 * Quick-create shift templates — frontend-only presets (v2).
 *
 * v2 adds staffing-operation templates with smart time/transport defaults
 * tuned for real catering/event operations (Quality Staff baseline).
 *
 * Safety rules (unchanged from v1):
 *  - Only fields in SAFE_KEYS may be patched.
 *  - "Fill empty only" — never overwrites operator input.
 *  - Never touches client, locations, meeting point, assigned workers,
 *    publication status, payroll truth, traceability, or pay overrides.
 *  - `recommendation` is a soft hint surfaced in the UI, NEVER auto-written
 *    into any field.
 */
import type { ShiftFormState } from "../ShiftFormFields";

export type QuickTemplateId =
  // v2 operation templates
  | "event_regular"
  | "weekend_job"
  | "event_by_hour"
  | "event_by_day"
  | "setup"
  | "kitchen_floor_mixed"
  // legacy role-only templates (kept for back-compat in any caller)
  | "meseros"
  | "cocina"
  | "setup_legacy"
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
  /** Optional soft hint shown under the template in the form. Not auto-written. */
  recommendation?: string;
  /** Partial patch — only fields listed in SAFE_KEYS are accepted. */
  patch: SafePatch;
}

/** Fields a template is allowed to suggest. Everything else is ignored. */
type SafeKey =
  | "title"
  | "slots"
  | "notes"
  | "specialInstructions"
  | "transportNotes"
  | "startTime"
  | "endTime"
  | "meetingTime"
  | "transportRequired"
  | "payType"
  | "dayType";

type SafePatch = Partial<Pick<ShiftFormState, SafeKey>>;

const SAFE_KEYS: readonly SafeKey[] = [
  "title",
  "slots",
  "notes",
  "specialInstructions",
  "transportNotes",
  "startTime",
  "endTime",
  "meetingTime",
  "transportRequired",
  "payType",
  "dayType",
] as const;

/** Default value markers — a field is considered "empty" if it still holds
 *  the form's default. Templates may override defaults without surprising
 *  the operator. */
const DEFAULT_MARKERS: Partial<Record<SafeKey, string>> = {
  slots: "1",
  startTime: "08:00",
  endTime: "17:00",
  // meetingTime default is "" so the generic empty-check covers it.
};

// ---------------------------------------------------------------------------
// v2 — Staffing operation templates (primary)
// ---------------------------------------------------------------------------

export const OPERATION_TEMPLATES: readonly QuickTemplate[] = [
  {
    id: "event_regular",
    label: "Evento regular",
    emoji: "🎉",
    hint: "Evento estándar de tarde-noche",
    recommendation: "Convocatoria 10 minutos antes de la entrada.",
    patch: {
      title: "Evento",
      slots: "4",
      startTime: "17:00",
      endTime: "23:30",
      meetingTime: "16:50",
      payType: "hourly",
      notes:
        "Evento regular. Llegar con uniforme completo. Confirmar punto de encuentro con el capitán.",
      specialInstructions:
        "Uniforme: camisa blanca, pantalón negro, zapatos negros cerrados, delantal. Cabello recogido.",
    },
  },
  {
    id: "weekend_job",
    label: "Weekend Job",
    emoji: "📅",
    hint: "Trabajo de día completo (viernes/sábado/domingo)",
    recommendation:
      "Hora de salida puede quedar pendiente. Transporte sugerido activado.",
    patch: {
      title: "Weekend Job",
      slots: "6",
      startTime: "09:00",
      meetingTime: "07:00",
      // intentionally no endTime → operator decides / leaves pending
      payType: "daily",
      dayType: "full_day",
      transportRequired: true,
      transportNotes:
        "Confirmar punto de salida con admin. Capacidad y vehículos por confirmar.",
      notes:
        "Weekend job. Día completo. Hora de salida puede ajustarse en sitio.",
      specialInstructions:
        "Ropa de trabajo cómoda. Llevar agua y snack. Uniforme según indicación del capitán.",
    },
  },
  {
    id: "event_by_hour",
    label: "Evento por hora",
    emoji: "⏱️",
    hint: "Pago por hora trabajada",
    recommendation: "Confirma hora de entrada y salida antes de publicar.",
    patch: {
      title: "Evento por hora",
      slots: "3",
      startTime: "17:00",
      endTime: "22:00",
      meetingTime: "16:50",
      payType: "hourly",
      notes:
        "Evento con pago por hora. Confirmar entrada/salida exactas con el capitán.",
    },
  },
  {
    id: "event_by_day",
    label: "Evento por día",
    emoji: "🗓️",
    hint: "Pago por día (day rate)",
    recommendation:
      "Day rate: la hora de salida es referencia, no afecta el pago.",
    patch: {
      title: "Evento por día",
      slots: "4",
      startTime: "09:00",
      meetingTime: "08:30",
      payType: "daily",
      dayType: "full_day",
      notes:
        "Evento con pago por día. La hora de salida es referencia operativa.",
    },
  },
  {
    id: "setup",
    label: "Setup / Montaje",
    emoji: "🛠️",
    hint: "Montaje previo al evento",
    recommendation: "Coordinar acceso al sitio con el cliente.",
    patch: {
      title: "Setup / Montaje",
      slots: "3",
      startTime: "10:00",
      endTime: "15:00",
      meetingTime: "09:50",
      payType: "hourly",
      notes:
        "Montaje del evento: mesas, sillas, decoración y logística previa al servicio.",
      specialInstructions:
        "Ropa de trabajo cómoda, zapatos cerrados. Se permite playera del staff.",
    },
  },
  {
    id: "kitchen_floor_mixed",
    label: "Kitchen + Floor mixto",
    emoji: "🍽️",
    hint: "Evento con cocina y servicio combinados",
    recommendation:
      "Asigna capitán por área (cocina y piso) cuando sea posible.",
    patch: {
      title: "Cocina + Servicio",
      slots: "6",
      startTime: "16:00",
      endTime: "23:30",
      meetingTime: "15:50",
      payType: "hourly",
      notes:
        "Evento mixto. Equipo dividido entre cocina y servicio de piso. Coordinar con capitán por área.",
      specialInstructions:
        "Cocina: filipina y antideslizantes. Piso: camisa blanca, pantalón negro, delantal.",
    },
  },
];

// ---------------------------------------------------------------------------
// Legacy role-only templates — kept so any v1 caller keeps working.
// New UI should prefer OPERATION_TEMPLATES.
// ---------------------------------------------------------------------------

export const ROLE_TEMPLATES: readonly QuickTemplate[] = [
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
    id: "setup_legacy",
    label: "Setup / Montaje (rol)",
    emoji: "🛠️",
    hint: "Solo personal de montaje",
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
      transportRequired: true,
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

/** Combined list — operation templates come first so they take visual priority. */
export const QUICK_TEMPLATES: readonly QuickTemplate[] = [
  ...OPERATION_TEMPLATES,
  ...ROLE_TEMPLATES,
];

/**
 * Build a "fill empty only" patch from a template against the current form state.
 * Fields the operator already filled are never overwritten. Default values
 * (see DEFAULT_MARKERS) are considered empty so templates can set them.
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
    const marker = DEFAULT_MARKERS[key];
    const existingEmpty =
      existing === undefined ||
      existing === null ||
      (typeof existing === "string" && existing.trim() === "") ||
      (marker !== undefined && existing === marker);

    if (existingEmpty) {
      (out as any)[key] = proposed;
    }
  }
  return out;
}
