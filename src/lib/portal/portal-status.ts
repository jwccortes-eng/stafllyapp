/**
 * Portal Status — ÚNICA fuente de verdad del estado de portal de una persona.
 *
 * REGLA CANÓNICA (no duplicar en componentes):
 *   Una persona TIENE acceso real al portal si y solo si su fila de
 *   `employees` está vinculada a una cuenta (`employees.user_id`).
 *   Ninguna otra señal (invitación aceptada, PIN, teléfono, estado del
 *   turno) implica acceso.
 *
 * Distinciones obligatorias:
 *   1. Portal activo            → `user_id` presente.
 *   2. Invitación enviada       → hay invitación viva sin `user_id`.
 *   3. Invitación aceptada pero sin vincular → caso de duplicados de
 *      identidad: la invitación dice "accepted" pero ESTE registro no
 *      tiene cuenta. Nunca mostrar "Cuenta activada" aquí.
 *   4. Sin portal               → nada de lo anterior.
 *
 * El estado del turno (pending/confirmed/rejected) NUNCA participa aquí.
 *
 * No crea campos nuevos: solo lee `user_id`, `is_active`, `phone_number`,
 * la existencia de PIN y la invitación más reciente.
 */

import { isInviteStatusFailure } from "@/lib/invitation-status";

export type PortalStatus =
  | "active"              // user_id presente → acceso real
  | "invited"             // invitación viva, aún sin cuenta
  | "invite_failed"       // último intento de invitación falló/rebotó
  | "activation_unlinked" // invitación "accepted" pero este registro no tiene user_id
  | "ready_to_invite"     // sin portal, con teléfono + PIN → se puede invitar
  | "incomplete"          // sin portal y faltan datos para invitar
  | "inactive";           // trabajador desactivado

/** Agrupación de alto nivel para badges y filtros. */
export type PortalStatusCategory = "active" | "pending" | "none";

export interface PortalStatusEmployeeLike {
  user_id?: string | null;
  is_active?: boolean | null;
  has_access_pin?: boolean | null;
  /** @deprecated no consumir el valor: solo existencia (transición) */
  access_pin?: string | null;
  phone_number?: string | null;
}

export interface PortalStatusInvitationLike {
  status?: string | null;
  accepted_at?: string | null;
}

export interface PortalStatusResult {
  status: PortalStatus;
  category: PortalStatusCategory;
  /** Verdad operativa: ¿puede entrar hoy al portal? */
  hasPortalAccess: boolean;
  /** Etiqueta corta para badges (es). */
  label: string;
  /** Frase explicativa (es). */
  description: string;
  tone: "ready" | "info" | "warn" | "critical" | "muted";
  /** Datos que faltan para poder invitar (solo estado `incomplete`). */
  missing: string[];
}

export function hasPortalAccess(emp: PortalStatusEmployeeLike | null | undefined): boolean {
  return !!emp?.user_id;
}

function hasPin(emp: PortalStatusEmployeeLike): boolean {
  if (typeof emp.has_access_pin === "boolean") return emp.has_access_pin;
  return !!(emp.access_pin ?? "").toString().trim();
}

function hasPhone(emp: PortalStatusEmployeeLike): boolean {
  return !!(emp.phone_number ?? "").replace(/\D/g, "");
}

const COPY: Record<PortalStatus, Pick<PortalStatusResult, "label" | "description" | "tone" | "category">> = {
  active: {
    label: "Portal activo",
    description: "La cuenta está vinculada y la persona puede entrar al portal.",
    tone: "ready",
    category: "active",
  },
  invited: {
    label: "Invitado",
    description: "Invitación enviada · pendiente de activar la cuenta.",
    tone: "info",
    category: "pending",
  },
  invite_failed: {
    label: "Invitación fallida",
    description: "El último envío falló o rebotó · reenviar invitación.",
    tone: "critical",
    category: "pending",
  },
  activation_unlinked: {
    label: "Activación sin vincular",
    description:
      "La invitación fue aceptada pero este registro no tiene cuenta vinculada · posible duplicado de identidad.",
    tone: "warn",
    category: "pending",
  },
  ready_to_invite: {
    label: "Sin portal",
    description: "Tiene teléfono y PIN · listo para invitar.",
    tone: "warn",
    category: "none",
  },
  incomplete: {
    label: "Sin portal",
    description: "Faltan datos para poder invitar.",
    tone: "warn",
    category: "none",
  },
  inactive: {
    label: "Inactivo",
    description: "El trabajador está desactivado.",
    tone: "muted",
    category: "none",
  },
};

/**
 * Resolver canónico. Todas las vistas (Equipo, Invitaciones, Perfil,
 * Servicio, selectores, portal) deben usar esta función.
 */
export function resolvePortalStatus(
  emp: PortalStatusEmployeeLike | null | undefined,
  invitation?: PortalStatusInvitationLike | null,
): PortalStatusResult {
  const e = emp ?? {};
  let status: PortalStatus;
  let missing: string[] = [];

  if (hasPortalAccess(e)) {
    // El acceso real gana sobre cualquier otra señal, incluso si está inactivo
    // en la operación: seguimos diciendo la verdad del portal.
    status = e.is_active === false ? "active" : "active";
  } else if (e.is_active === false) {
    status = "inactive";
  } else if (invitation?.status) {
    if (isInviteStatusFailure(invitation.status as never)) status = "invite_failed";
    else if (invitation.status === "accepted") status = "activation_unlinked";
    else status = "invited";
  } else {
    const ready = hasPhone(e) && hasPin(e);
    status = ready ? "ready_to_invite" : "incomplete";
    if (!ready) {
      missing = [
        ...(hasPhone(e) ? [] : ["teléfono"]),
        ...(hasPin(e) ? [] : ["PIN"]),
      ];
    }
  }

  const copy = COPY[status];
  return {
    status,
    category: copy.category,
    hasPortalAccess: status === "active",
    label: copy.label,
    description: status === "incomplete" && missing.length
      ? `Falta ${missing.join(" y ")} para poder invitar.`
      : copy.description,
    tone: copy.tone,
    missing,
  };
}

/** Etiqueta corta lista para badges sin lógica extra. */
export function portalStatusLabel(
  emp: PortalStatusEmployeeLike | null | undefined,
  invitation?: PortalStatusInvitationLike | null,
): string {
  return resolvePortalStatus(emp, invitation).label;
}
