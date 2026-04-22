export type InviteDeliveryStatus =
  | "created"
  | "queued"
  | "processing"
  | "sent"
  | "provider_accepted"
  | "delivered"
  | "opened"
  | "accepted"
  | "expired"
  | "revoked"
  | "failed"
  | "bounced"
  | "dlq"
  | "resent";

export function mapEmailLogStatusToInviteStatus(
  emailLogStatus: string | null | undefined,
  fallbackStatus: InviteDeliveryStatus,
): InviteDeliveryStatus {
  if (!emailLogStatus) return fallbackStatus;

  const statusMap: Record<string, InviteDeliveryStatus> = {
    pending: "queued",
    processing: "processing",
    sent: "sent",
    delivered: "delivered",
    opened: "opened",
    failed: "failed",
    dlq: "dlq",
    bounced: "bounced",
    complained: "failed",
    suppressed: "failed",
  };

  return statusMap[emailLogStatus] ?? fallbackStatus;
}

export function isInviteStatusInFlight(status: InviteDeliveryStatus): boolean {
  return status === "queued" || status === "processing" || status === "sent" || status === "provider_accepted";
}

export function isInviteStatusFailure(status: InviteDeliveryStatus): boolean {
  return status === "failed" || status === "bounced" || status === "dlq";
}