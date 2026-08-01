/**
 * OX-1 — Sistema de feedback único y nunca silencioso.
 *
 * Capa canónica de feedback al usuario. Envuelve `sonner` (única
 * implementación de toast del producto) y aplica el contrato de mensaje:
 *
 *   [Título corto]
 *   [Hecho]
 *   [Consecuencia]
 *   [Acción opcional]
 *
 * Reglas que garantiza esta capa:
 *  - Un mismo `key` nunca produce dos toasts simultáneos (anti-spam / anti
 *    doble submit visual): sonner reemplaza el toast con el mismo id.
 *  - Errores repetidos en ráfaga se agrupan ("Ocurrió N veces").
 *  - Las duraciones dependen de la severidad; lo crítico no se auto-cierra.
 *  - El significado nunca depende del color: siempre hay título + hecho.
 *  - Nunca se muestran mensajes técnicos: el detalle técnico va a consola.
 *
 * NO toca lógica de negocio. Es exclusivamente superficie de comunicación.
 */

import { toast } from "sonner";

export type FeedbackTone =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "critical";

export interface NotifyAction {
  /** Texto del CTA. Debe ser un verbo ("Reintentar", "Revisar horas"). */
  label: string;
  onClick: () => void;
}

export interface NotifyOptions {
  /** Título corto, sin punto final. Ej: "Horas aprobadas". */
  title: string;
  /** Qué ocurrió, en una frase. Ej: "12 registros fueron aprobados." */
  fact?: string;
  /** Consecuencia operacional. Ej: "Este turno ya puede avanzar a payroll." */
  consequence?: string;
  /** CTA opcional. Solo cuando la acción es segura de repetir. */
  action?: NotifyAction;
  /**
   * Identidad estable de la acción. Dos llamadas con el mismo `key` no
   * apilan toasts: la segunda reemplaza a la primera y suma al contador de
   * ráfaga. Por defecto se deriva del título.
   */
  key?: string;
  /** Detalle técnico: va SIEMPRE a consola, NUNCA a la UI. */
  cause?: unknown;
  /** Fuerza duración (ms). `Infinity` = permanece hasta que el usuario cierre. */
  duration?: number;
}

/** Duraciones por severidad. Lo crítico exige acción explícita. */
const DURATION: Record<FeedbackTone, number> = {
  success: 4000,
  info: 4500,
  warning: 7000,
  error: 9000,
  critical: Number.POSITIVE_INFINITY,
};

/** Prefijo textual: el mensaje se entiende sin depender del color. */
const PREFIX: Record<FeedbackTone, string> = {
  success: "",
  info: "",
  warning: "Atención",
  error: "Error",
  critical: "Crítico",
};

/** Ventana de agrupación de errores repetidos. */
const BURST_WINDOW_MS = 8000;

interface BurstState {
  count: number;
  firstAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const bursts = new Map<string, BurstState>();

function slug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60);
}

/**
 * Registra la repetición y devuelve el sufijo de agrupación
 * ("" la primera vez, " · ocurrió 3 veces" a partir de la segunda).
 */
function registerBurst(key: string): string {
  const now = Date.now();
  const prev = bursts.get(key);

  if (prev && now - prev.firstAt < BURST_WINDOW_MS) {
    prev.count += 1;
    if (prev.timer) clearTimeout(prev.timer);
    prev.timer = setTimeout(() => bursts.delete(key), BURST_WINDOW_MS);
    return ` · ocurrió ${prev.count} veces`;
  }

  const timer = setTimeout(() => bursts.delete(key), BURST_WINDOW_MS);
  bursts.set(key, { count: 1, firstAt: now, timer });
  return "";
}

/** El detalle técnico jamás llega a la UI, pero nunca se pierde. */
function logCause(tone: FeedbackTone, key: string, cause: unknown) {
  if (cause === undefined) return;
  const line = `[feedback:${tone}] ${key}`;
  if (tone === "error" || tone === "critical") console.error(line, cause);
  else console.warn(line, cause);
}

function buildDescription(o: NotifyOptions, burstSuffix: string): string | undefined {
  const parts = [o.fact, o.consequence].filter(Boolean) as string[];
  if (parts.length === 0) return burstSuffix ? burstSuffix.replace(" · ", "") : undefined;
  return parts.join(" ") + burstSuffix;
}

function emit(tone: FeedbackTone, o: NotifyOptions) {
  const key = o.key ?? slug(o.title);
  const isNoisy = tone === "error" || tone === "critical" || tone === "warning";
  const burstSuffix = isNoisy ? registerBurst(key) : "";

  logCause(tone, key, o.cause);

  const prefix = PREFIX[tone];
  const title = prefix ? `${prefix} · ${o.title}` : o.title;
  const description = buildDescription(o, burstSuffix);
  const duration = o.duration ?? DURATION[tone];

  const payload = {
    id: key,
    description,
    duration: Number.isFinite(duration) ? duration : Number.POSITIVE_INFINITY,
    // `important` mantiene el anuncio en lectores de pantalla como assertive.
    important: tone === "error" || tone === "critical",
    closeButton: tone === "critical",
    action: o.action
      ? { label: o.action.label, onClick: o.action.onClick }
      : undefined,
    className: `stafly-toast stafly-toast--${tone}`,
  };

  switch (tone) {
    case "success":
      return toast.success(title, payload);
    case "warning":
      return toast.warning(title, payload);
    case "info":
      return toast.info(title, payload);
    default:
      return toast.error(title, payload);
  }
}

/** Algo terminó bien. Siempre debe explicar la consecuencia operacional. */
export function notifySuccess(o: NotifyOptions) {
  return emit("success", o);
}

/** Algo falló y afecta una acción del usuario. */
export function notifyError(o: NotifyOptions) {
  return emit("error", o);
}

/** Algo requiere conocimiento del usuario pero no bloquea. */
export function notifyWarning(o: NotifyOptions) {
  return emit("warning", o);
}

/** Información neutra. Usar con moderación: no todo evento merece un toast. */
export function notifyInfo(o: NotifyOptions) {
  return emit("info", o);
}

/**
 * Estado terminal que NO se resuelve solo: exige una decisión del usuario.
 * No se auto-cierra y trae botón de cierre explícito.
 */
export function notifyActionRequired(o: NotifyOptions) {
  return emit("critical", { ...o, action: o.action });
}

/** Cierra un toast por su `key` (p.ej. al resolverse un reintento). */
export function dismissNotification(key: string) {
  toast.dismiss(key);
  bursts.delete(key);
}

/** Solo para tests: limpia el estado de agrupación. */
export function __resetFeedbackBursts() {
  bursts.forEach((b) => b.timer && clearTimeout(b.timer));
  bursts.clear();
}
