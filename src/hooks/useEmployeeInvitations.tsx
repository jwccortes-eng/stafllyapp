import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface EmployeeInvitation {
  id: string;
  employee_id: string;
  channel: "whatsapp" | "sms" | "email" | "copy" | "other";
  status: "sent" | "delivered" | "opened" | "activated" | "failed";
  sent_at: string;
  sent_by: string;
  activated_at: string | null;
  notes: string | null;
  invite_token: string | null;
  expires_at: string | null;
}

/** Map of employee_id → latest invitation */
export type InvitationMap = Record<string, EmployeeInvitation>;

export function useEmployeeInvitations(companyId: string | null) {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<InvitationMap>({});
  const [loading, setLoading] = useState(false);

  const fetchInvitations = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("employee_invitations")
      .select("id, employee_id, channel, status, sent_at, sent_by, activated_at, notes, invite_token, expires_at")
      .eq("company_id", companyId)
      .order("sent_at", { ascending: false });

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
        notes: notes ?? null,
      })
      .select("id, employee_id, channel, status, sent_at, sent_by, activated_at, notes")
      .single();

    if (!error && data) {
      setInvitations(prev => ({ ...prev, [employeeId]: data as EmployeeInvitation }));
    }
    return data;
  }, [companyId, user?.id]);

  return { invitations, loading, logInvitation, refetch: fetchInvitations };
}
