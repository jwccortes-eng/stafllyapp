/**
 * Operational clients hook (Clients OS).
 *
 * Strict tenant scoping: every query is filtered by selectedCompanyId.
 * Never relies on RLS alone.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

export interface Client {
  id: string;
  company_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface ClientLocation {
  id: string;
  name: string;
  address: string | null;
  default_pay_type: string | null;
  default_clock_method: string | null;
  require_car: boolean;
  contact_name: string | null;
  contact_phone: string | null;
}

const keys = {
  list: (cid: string | null) => ["clients", cid] as const,
  detail: (cid: string | null, id: string) => ["clients", cid, id] as const,
  locations: (cid: string | null, id: string) => ["clients", cid, id, "locations"] as const,
};

export function useClient(clientId: string | undefined) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: keys.detail(selectedCompanyId, clientId ?? ""),
    enabled: !!selectedCompanyId && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("id", clientId!)
        .maybeSingle();
      if (error) throw error;
      return data as Client | null;
    },
  });
}

export function useClientLocations(clientId: string | undefined) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: keys.locations(selectedCompanyId, clientId ?? ""),
    enabled: !!selectedCompanyId && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select(
          "id, name, address, default_pay_type, default_clock_method, require_car, contact_name, contact_phone",
        )
        .eq("company_id", selectedCompanyId!)
        .eq("client_id", clientId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClientLocation[];
    },
  });
}

export function useUpdateClientNotes(clientId: string | undefined) {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (notes: string) => {
      if (!selectedCompanyId || !clientId) throw new Error("Missing context");
      const { error } = await supabase
        .from("clients")
        .update({ notes: notes.trim() || null })
        .eq("id", clientId)
        .eq("company_id", selectedCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.detail(selectedCompanyId, clientId ?? "") });
      qc.invalidateQueries({ queryKey: keys.list(selectedCompanyId) });
      toast.success("Notes saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
