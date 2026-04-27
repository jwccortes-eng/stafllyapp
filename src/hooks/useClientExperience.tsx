/**
 * Client Experience Hub data hooks (Phase 1).
 *
 * Strict tenant scoping: every query is filtered by the active company_id
 * coming from useCompany(). RLS provides defense-in-depth, but we must
 * never rely on RLS alone — see Core memory rules.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

export type ClientContact = {
  id: string;
  company_id: string;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_primary: boolean;
  portal_status: "invited" | "active" | "disabled";
  last_login_at: string | null;
  notes: string | null;
  created_at: string;
};

export type ClientThread = {
  id: string;
  company_id: string;
  client_id: string;
  context: "client_general" | "service_request";
  service_request_id: string | null;
  subject: string | null;
  is_open: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender: "admin" | "client" | "system" | null;
  unread_admin_count: number;
  unread_client_count: number;
  created_at: string;
};

export type ClientMessage = {
  id: string;
  company_id: string;
  thread_id: string;
  sender_type: "admin" | "client" | "system";
  sender_user_id: string | null;
  sender_contact_id: string | null;
  body: string;
  visibility: "client_visible" | "internal_only";
  attachments: unknown;
  read_at: string | null;
  created_at: string;
};

export type ServiceRequestRow = {
  id: string;
  company_id: string;
  client_id: string | null;
  client_name_snapshot: string | null;
  request_code: string;
  title: string | null;
  description: string | null;
  request_type:
    | "staffing_request"
    | "schedule_change"
    | "cancellation"
    | "extra_workers"
    | "issue_report"
    | "billing_question"
    | "general_message";
  priority: "low" | "normal" | "high" | "urgent";
  status:
    | "new"
    | "reviewing"
    | "approved_for_scheduling"
    | "converted_to_shift"
    | "in_progress"
    | "ready_for_billing"
    | "pending_closure_review"
    | "invoiced"
    | "cancelled";
  service_date: string | null;
  start_time: string | null;
  end_time: string | null;
  headcount_requested: number | null;
  location_id: string | null;
  requested_by_contact_id: string | null;
  created_at: string;
  updated_at: string;
};

const keys = {
  contacts: (cid: string | null) => ["client-contacts", cid] as const,
  threads: (cid: string | null) => ["client-threads", cid] as const,
  messages: (tid: string | null) => ["client-messages", tid] as const,
  requests: (cid: string | null) => ["client-service-requests", cid] as const,
};

// ─── Contacts ─────────────────────────────────────────────────────────────
export function useClientContacts(clientId?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: [...keys.contacts(selectedCompanyId), clientId ?? "all"],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("client_contacts")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .is("deleted_at", null)
        .order("is_primary", { ascending: false })
        .order("name");
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClientContact[];
    },
  });
}

export function useUpsertClientContact() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (input: Partial<ClientContact> & { client_id: string; name: string }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const payload = { ...input, company_id: selectedCompanyId };
      const { data, error } = input.id
        ? await supabase.from("client_contacts").update(payload).eq("id", input.id).select().single()
        : await supabase.from("client_contacts").insert(payload).select().single();
      if (error) throw error;
      return data as ClientContact;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.contacts(selectedCompanyId) });
      toast.success("Contact saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Threads ──────────────────────────────────────────────────────────────
export function useClientThreads(filter?: { clientId?: string; openOnly?: boolean }) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: [...keys.threads(selectedCompanyId), filter ?? {}],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("client_conversation_threads")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (filter?.clientId) q = q.eq("client_id", filter.clientId);
      if (filter?.openOnly) q = q.eq("is_open", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClientThread[];
    },
  });
}

export function useGetOrCreateThread() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (input: {
      client_id: string;
      context: "client_general" | "service_request";
      service_request_id?: string | null;
      subject?: string | null;
    }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      // Try find existing
      let existingQ = supabase
        .from("client_conversation_threads")
        .select("*")
        .eq("company_id", selectedCompanyId)
        .eq("client_id", input.client_id)
        .eq("context", input.context)
        .limit(1);
      if (input.context === "service_request" && input.service_request_id) {
        existingQ = existingQ.eq("service_request_id", input.service_request_id);
      } else {
        existingQ = existingQ.is("service_request_id", null);
      }
      const { data: found } = await existingQ;
      if (found && found.length > 0) return found[0] as ClientThread;

      const { data, error } = await supabase
        .from("client_conversation_threads")
        .insert({
          company_id: selectedCompanyId,
          client_id: input.client_id,
          context: input.context,
          service_request_id: input.service_request_id ?? null,
          subject: input.subject ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ClientThread;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.threads(selectedCompanyId) }),
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────
export function useClientMessages(threadId: string | null) {
  return useQuery({
    queryKey: keys.messages(threadId),
    enabled: !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_messages")
        .select("*")
        .eq("thread_id", threadId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientMessage[];
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (input: {
      thread_id: string;
      body: string;
      visibility: "client_visible" | "internal_only";
    }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("client_messages")
        .insert({
          company_id: selectedCompanyId,
          thread_id: input.thread_id,
          body: input.body,
          visibility: input.visibility,
          sender_type: "admin",
          sender_user_id: u.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ClientMessage;
    },
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: keys.messages(msg.thread_id) });
      qc.invalidateQueries({ queryKey: keys.threads(selectedCompanyId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Service requests (extended) ──────────────────────────────────────────
export function useClientServiceRequests(filter?: {
  status?: ServiceRequestRow["status"];
  clientId?: string;
  priority?: ServiceRequestRow["priority"];
  search?: string;
}) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: [...keys.requests(selectedCompanyId), filter ?? {}],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("service_requests")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter?.status) q = q.eq("status", filter.status);
      if (filter?.clientId) q = q.eq("client_id", filter.clientId);
      if (filter?.priority) q = q.eq("priority", filter.priority);
      if (filter?.search) {
        q = q.or(
          `title.ilike.%${filter.search}%,client_name_snapshot.ilike.%${filter.search}%,request_code.ilike.%${filter.search}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ServiceRequestRow[];
    },
  });
}

export function useUpdateServiceRequest() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<ServiceRequestRow> }) => {
      const { data, error } = await supabase
        .from("service_requests")
        .update(input.patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data as ServiceRequestRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.requests(selectedCompanyId) });
      toast.success("Request updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
