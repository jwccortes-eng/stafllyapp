/**
 * worker-next-action.ts — pure prioritization helper.
 *
 * Reads existing readiness/risk/invitation snapshots and selects ONE next
 * recommended action so the admin never has to interpret 20 chips.
 *
 * No DB writes. No payroll math. No portal logic. Visual only.
 */
import type { ReadinessSnapshot } from "@/hooks/useEmployeeReadiness";
import type { EmployeeInvitation } from "@/hooks/useEmployeeInvitations";
import { normalizePhone } from "@/lib/phone";
import { isInviteStatusFailure } from "@/lib/invitation-status";

export type NextActionTone = "critical" | "attention" | "followup" | "ready";
export type NextActionCta = "edit_contact" | "open_access" | "open_documents" | "open_invite" | "none";

export interface WorkerNextAction {
  key:
    | "missing_phone"
    | "missing_pin"
    | "missing_email"
    | "missing_required_documents"
    | "review_documents"
    | "send_invitation"
    | "retry_invitation"
    | "follow_up_invitation"
    | "ready";
  label: string;
  helper: string;
  tone: NextActionTone;
  cta: NextActionCta;
  ctaLabel: string;
  /** Tab to deep-link into when CTA is open_access / open_documents / edit_contact. */
  targetTab?: "info" | "access" | "docs";
}

const TONE_LABEL: Record<NextActionTone, string> = {
  critical: "Crítico",
  attention: "Requiere atención",
  followup: "Seguimiento",
  ready: "Listo",
};

export function nextActionStatusLabel(tone: NextActionTone): string {
  return TONE_LABEL[tone];
}

export interface NextActionInputs {
  /** Document compliance signals — already computed elsewhere. Counts only. */
  docs?: {
    missingRequiredCount: number;
    expiredCount: number;
    rejectedCount: number;
    pendingCount: number;
  };
  /** Whether the worker has an access PIN configured (boolean RPC result). */
  hasPin?: boolean;
  /** Whether the worker has linked a portal account (employees.user_id present). */
  portalActive?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * selectWorkerNextAction
 *
 * Priority ladder (first match wins):
 *  1. missing phone           → "Agregar teléfono"
 *  2. missing PIN             → "Generar PIN"
 *  3. missing/invalid email   → "Corregir email"
 *  4. missing required docs   → "Completar documentos"
 *  5. expired/rejected docs   → "Revisar documentos"
 *  6. portal not active, ready→ "Enviar invitación"
 *  7. invitation failed/dlq   → "Reintentar invitación"
 *  8. invitation sent > 24h   → "Dar seguimiento"
 *  9. all complete            → "Worker listo"
 */
export function selectWorkerNextAction(
  worker: Record<string, any> | null | undefined,
  readiness: Pick<ReadinessSnapshot, "missingPersonal" | "missingDocuments"> | null | undefined,
  invitation: EmployeeInvitation | null | undefined,
  extras: NextActionInputs = {},
): WorkerNextAction {
  const phoneNorm = normalizePhone(worker?.phone_number);
  const hasPhone = phoneNorm.length === 10;
  const emailRaw = (worker?.email ?? "").toString().trim();
  const hasValidEmail = !!emailRaw && EMAIL_RE.test(emailRaw);
  const hasEmailField = !!emailRaw;

  // Prefer extras.hasPin when caller has resolved it via RPC; fall back to
  // employee.has_access_pin if the page already cached it.
  const hasPin = typeof extras.hasPin === "boolean"
    ? extras.hasPin
    : worker?.has_access_pin === true;

  const missingDocs = extras.docs?.missingRequiredCount
    ?? readiness?.missingDocuments?.length
    ?? 0;
  const expired = extras.docs?.expiredCount ?? 0;
  const rejected = extras.docs?.rejectedCount ?? 0;
  const pending = extras.docs?.pendingCount ?? 0;

  // 1. missing phone
  if (!hasPhone) {
    return {
      key: "missing_phone",
      label: "Agregar teléfono",
      helper: "Necesario para WhatsApp, llamadas e invitaciones.",
      tone: "critical",
      cta: "edit_contact",
      ctaLabel: "Editar contacto",
      targetTab: "info",
    };
  }

  // 2. missing PIN
  if (!hasPin) {
    return {
      key: "missing_pin",
      label: "Generar PIN",
      helper: "Necesario para activar acceso al portal.",
      tone: "critical",
      cta: "open_access",
      ctaLabel: "Ir a Acceso",
      targetTab: "access",
    };
  }

  // 3. invalid / missing email
  if (!hasValidEmail) {
    return {
      key: "missing_email",
      label: "Corregir email",
      helper: hasEmailField
        ? "El email registrado no es válido. Edítalo para enviar invitación por correo."
        : "Sin email registrado. Agrégalo para enviar invitación por correo.",
      tone: "attention",
      cta: "edit_contact",
      ctaLabel: "Editar email",
      targetTab: "info",
    };
  }

  // 4. missing required documents
  if (missingDocs > 0) {
    return {
      key: "missing_required_documents",
      label: "Completar documentos",
      helper: "Faltan documentos requeridos antes de estar payroll-ready.",
      tone: "attention",
      cta: "open_documents",
      ctaLabel: "Ir a Documentos",
      targetTab: "docs",
    };
  }

  // 5. expired / rejected / pending docs
  if (expired > 0 || rejected > 0 || pending > 0) {
    return {
      key: "review_documents",
      label: "Revisar documentos",
      helper: expired > 0
        ? "Hay documentos vencidos. Pide la versión actualizada."
        : rejected > 0
          ? "Hay documentos rechazados. Solicita reemplazo."
          : "Hay documentos pendientes de revisión.",
      tone: expired > 0 || rejected > 0 ? "attention" : "followup",
      cta: "open_documents",
      ctaLabel: "Ir a Documentos",
      targetTab: "docs",
    };
  }

  // 6 / 7 / 8 — portal access state
  const portalActive = extras.portalActive
    ?? !!worker?.user_id
    ?? worker?.profile_status === "active";

  if (!portalActive) {
    // 7. failed
    if (invitation && (isInviteStatusFailure(invitation.status) || invitation.status === "expired" || invitation.status === "revoked")) {
      return {
        key: "retry_invitation",
        label: "Reintentar invitación",
        helper: "El último envío falló. Usa email, WhatsApp o copia el link.",
        tone: "attention",
        cta: "open_invite",
        ctaLabel: "Reintentar invitación",
      };
    }

    // 8. sent >24h, no acceptance
    if (invitation?.sent_at && !invitation.accepted_at) {
      const ageMs = Date.now() - new Date(invitation.sent_at).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        return {
          key: "follow_up_invitation",
          label: "Dar seguimiento",
          helper: "La invitación fue enviada, pero el trabajador aún no activó el portal.",
          tone: "followup",
          cta: "open_invite",
          ctaLabel: "Dar seguimiento",
        };
      }
    }

    // 6. ready to invite
    return {
      key: "send_invitation",
      label: "Enviar invitación",
      helper: "El trabajador está listo para recibir acceso al portal.",
      tone: "attention",
      cta: "open_invite",
      ctaLabel: "Enviar invitación",
    };
  }

  // 9. ready
  return {
    key: "ready",
    label: "Worker listo",
    helper: "Perfil listo para operación.",
    tone: "ready",
    cta: "none",
    ctaLabel: "",
  };
}
