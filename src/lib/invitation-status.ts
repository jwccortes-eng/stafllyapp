export type InviteDeliveryStatus =
  | "created"
  | "queued"
  | "processing"
  | "sent"
  | "provider_accepted"
  | "rejected"
  | "delivered"
  | "opened"
  | "accepted"
  | "expired"
  | "revoked"
  | "superseded"
  | "failed"
  | "bounced"
  | "suppressed"
  | "dlq"
  | "resent";

export function mapEmailLogStatusToInviteStatus(
  emailLogStatus: string | null | undefined,
  fallbackStatus: InviteDeliveryStatus,
): InviteDeliveryStatus {
  if (!emailLogStatus) return fallbackStatus;

  // Verdad de entrega: la plataforma no emite acuses de entrega ni de apertura.
  // Nunca se deriva "delivered"/"opened" de un log de envío.
  const statusMap: Record<string, InviteDeliveryStatus> = {
    pending: "queued",
    queued: "queued",
    processing: "processing",
    created: "queued",
    rate_limited: "queued",
    // P0.3: aceptado por el API todavía NO es enviado.
    accepted: "queued",
    sent: "sent",
    delivered: "delivered",
    rejected: "rejected",
    failed: "failed",
    dlq: "dlq",
    bounced: "bounced",
    complained: "failed",
    suppressed: "suppressed",
    complaint_blocked: "suppressed",
  };

  return statusMap[emailLogStatus] ?? fallbackStatus;
}

export function isInviteStatusInFlight(status: InviteDeliveryStatus): boolean {
  return status === "queued" || status === "processing" || status === "sent" || status === "provider_accepted";
}

export function isInviteStatusFailure(status: InviteDeliveryStatus): boolean {
  return (
    status === "failed" ||
    status === "rejected" ||
    status === "bounced" ||
    status === "dlq" ||
    status === "suppressed"
  );
}