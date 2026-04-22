import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { mapEmailLogStatusToInviteStatus, type InviteDeliveryStatus } from "@/lib/invitation-status";

export type { InviteDeliveryStatus } from "@/lib/invitation-status";

export interface EmployeeInvitation {
  id: string;
  employee_id: string;
  channel: "whatsapp" | "sms" | "email" | "copy" | "other";
  status: InviteDeliveryStatus;
  sent_at: string | null;
  sent_by: string;
  opened_at: string | null;
  accepted_at: string | null;
  notes: string | null;
  invite_token: string | null;
  expires_at: string | null;
  // Delivery tracking fields
  provider_message_id: string | null;
  last_error: string | null;
  bounce_reason: string | null;
  attempts: number;
  last_attempt_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  invite_recipient: string | null;
}

/** Map of employee_id → latest invitation */
export type InvitationMap = Record<string, EmployeeInvitation>;

const INVITE_FIELDS = "id, employee_id, channel, status, sent_at, sent_by, accepted_at, opened_at, notes, invite_token, expires_at, provider_message_id, last_error, bounce_reason, attempts, last_attempt_at, delivered_at, failed_at, invite_recipient";

export function useEmployeeInvitations(companyId: string | null) {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<InvitationMap>({});
  const [loading, setLoading] = useState(false);

  const fetchInvitations = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("employee_invitations")
      .select(INVITE_FIELDS)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    // Build map: keep only latest invitation per employee
    const map: InvitationMap = {};
    for (const inv of data ?? []) {
      if (!map[inv.employee_id]) {
        map[inv.employee_id] = inv as EmployeeInvitation;
      }
    }
    setInvitations(map);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const logInvitation = useCallback(async (
    employeeId: string,
    channel: EmployeeInvitation["channel"],
    notes?: string,
  ) => {
    if (!companyId || !user?.id) return null;
    const { data, error } = await supabase
      .from("employee_invitations")
      .insert({
        company_id: companyId,
        employee_id: employeeId,
        channel,
        status: "sent" as const,
        sent_by: user.id,
        sent_at: new Date().toISOString(),
        notes: notes ?? null,
      })
      .select(INVITE_FIELDS)
      .single();

    if (!error && data) {
      setInvitations(prev => ({ ...prev, [employeeId]: data as EmployeeInvitation }));
    }
    return data;
  }, [companyId, user?.id]);

  /** Check real delivery status from email_send_log for an invitation */
  const checkDeliveryStatus = useCallback(async (invitation: EmployeeInvitation) => {
    if (!invitation.provider_message_id) return invitation.status;

    const { data } = await supabase
      .from("email_send_log")
      .select("status, error_message, created_at")
      .eq("message_id", invitation.provider_message_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!data) return invitation.status;

    // Map email_send_log status to invitation status
    return mapEmailLogStatusToInviteStatus(data.status, invitation.status);
  }, []);

  return { invitations, loading, logInvitation, refetch: fetchInvitations, checkDeliveryStatus };
}
