/**
 * COMUNICADOS OFICIALES — modelo canónico (extensión de `announcements`).
 *
 * Un comunicado (announcement) tiene VERSIONES inmutables. Cada versión
 * congela su audiencia al publicarse y genera un estado por destinatario:
 *
 *   AVAILABLE  → puesto a disposición dentro de Stafly
 *   VIEWED     → la persona abrió esa versión
 *   ACKNOWLEDGED → la persona ejecutó el CTA de acuse
 *
 * Reglas duras (respaldadas por la base de datos):
 *  - Un acuse SIEMPRE apunta a una versión concreta. Un acuse de v1 nunca
 *    confirma v2.
 *  - El acuse es idempotente, no editable y no borrable por el trabajador.
 *  - Español e inglés son variantes de la MISMA versión, no comunicados
 *    distintos. El acuse registra la variante mostrada al confirmar.
 *  - Las reacciones (`announcement_reactions`) NO son evidencia de acuse.
 */

export type CommunicationType =
  | "informational"
  | "acknowledgment_required"
  | "critical_acknowledgment";

export type VersionStatus = "draft" | "published" | "superseded";
export type RecipientState = "available" | "viewed" | "acknowledged";
export type AudienceMode = "all_company" | "selected";
export type CommLanguage = "es" | "en";

export interface AnnouncementVersion {
  id: string;
  announcement_id: string;
  company_id: string;
  version_number: number;
  status: VersionStatus;
  communication_type: CommunicationType;
  default_language: CommLanguage;
  title_es: string | null;
  body_es: string | null;
  title_en: string | null;
  body_en: string | null;
  media_urls: string[] | null;
  link_url: string | null;
  link_label: string | null;
  audience_mode: AudienceMode;
  audience_employee_ids: string[] | null;
  published_at: string | null;
  created_at: string;
}

export interface RecipientRow {
  employee_id: string;
  full_name: string | null;
  state: RecipientState;
  requires_acknowledgment: boolean;
  available_at: string | null;
  first_viewed_at: string | null;
  acknowledged_at: string | null;
  language_variant: CommLanguage | null;
}

export const COMMUNICATION_TYPES: {
  value: CommunicationType;
  label: string;
  help: string;
}[] = [
  {
    value: "informational",
    label: "Informativo",
    help: "No requiere acción de la persona.",
  },
  {
    value: "acknowledgment_required",
    label: "Requiere acuse",
    help: "La persona debe confirmar que lo recibió y entendió.",
  },
  {
    value: "critical_acknowledgment",
    label: "Crítico — requiere acuse",
    help: "Queda destacado como pendiente hasta que la persona confirme.",
  },
];

export function requiresAcknowledgment(type: CommunicationType | null | undefined): boolean {
  return type === "acknowledgment_required" || type === "critical_acknowledgment";
}

export function isCritical(type: CommunicationType | null | undefined): boolean {
  return type === "critical_acknowledgment";
}

export function typeLabel(type: CommunicationType | null | undefined): string {
  return COMMUNICATION_TYPES.find((t) => t.value === type)?.label ?? "Informativo";
}

/** CTA canónico del acuse por idioma. No inventar copias alternativas. */
export const ACK_CTA: Record<CommLanguage, string> = {
  es: "Confirmo que recibí y entendí este comunicado",
  en: "I confirm that I received and understood this communication",
};

export const ACK_CONFIRMED_LABEL: Record<CommLanguage, string> = {
  es: "Confirmado",
  en: "Confirmed",
};

export const ACK_PENDING_LABEL: Record<CommLanguage, string> = {
  es: "Requiere confirmación",
  en: "Confirmation required",
};

export const REVIEW_CTA: Record<CommLanguage, string> = {
  es: "Revisar comunicado",
  en: "Review communication",
};

/**
 * Idioma a mostrar: preferencia de la persona si la variante existe,
 * si no el idioma por defecto de la versión, si no la única disponible.
 */
export function resolveDisplayLanguage(
  version: Pick<AnnouncementVersion, "title_es" | "title_en" | "default_language">,
  preferred: CommLanguage | null | undefined,
): CommLanguage {
  const hasEs = !!(version.title_es && version.title_es.trim());
  const hasEn = !!(version.title_en && version.title_en.trim());
  if (preferred === "en" && hasEn) return "en";
  if (preferred === "es" && hasEs) return "es";
  if (version.default_language === "en" && hasEn) return "en";
  if (version.default_language === "es" && hasEs) return "es";
  return hasEs ? "es" : "en";
}

export function availableLanguages(
  version: Pick<AnnouncementVersion, "title_es" | "title_en">,
): CommLanguage[] {
  const out: CommLanguage[] = [];
  if (version.title_es?.trim()) out.push("es");
  if (version.title_en?.trim()) out.push("en");
  return out.length > 0 ? out : ["es"];
}

export function versionContent(version: AnnouncementVersion, lang: CommLanguage) {
  const title = lang === "en" ? version.title_en : version.title_es;
  const body = lang === "en" ? version.body_en : version.body_es;
  return {
    title: title?.trim() || version.title_es?.trim() || version.title_en?.trim() || "",
    body: body ?? (lang === "en" ? version.body_es : version.body_en) ?? "",
  };
}

export interface VersionStats {
  recipients: number;
  acknowledged: number;
  viewedNotAcknowledged: number;
  availableNotViewed: number;
  pending: number;
  progress: number;
}

/** Métricas derivadas de hechos demostrables. Nunca inventar "entregado". */
export function computeVersionStats(rows: RecipientRow[]): VersionStats {
  const recipients = rows.length;
  const acknowledged = rows.filter((r) => r.state === "acknowledged").length;
  const viewedNotAcknowledged = rows.filter((r) => r.state === "viewed").length;
  const availableNotViewed = rows.filter((r) => r.state === "available").length;
  return {
    recipients,
    acknowledged,
    viewedNotAcknowledged,
    availableNotViewed,
    pending: recipients - acknowledged,
    progress: recipients === 0 ? 0 : Math.round((acknowledged / recipients) * 100),
  };
}

export function recipientStateLabel(state: RecipientState): string {
  if (state === "acknowledged") return "Confirmado";
  if (state === "viewed") return "Visto sin confirmar";
  return "Disponible";
}

/** Normaliza `media_urls` (jsonb) a una lista de strings. */
export function mediaList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
}
