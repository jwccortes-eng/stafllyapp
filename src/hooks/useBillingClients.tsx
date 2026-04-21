import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

export interface BillingClient {
  id: string;
  company_id: string;
  name: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  payment_terms: string | null;
  default_currency: string;
  notes: string | null;
  is_active: boolean;
  operational_client_id: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  billing_country: string | null;
  created_at: string;
  updated_at: string;
}

export type BillingClientUpsertInput = {
  name: string;
  legal_name?: string | null;
  email?: string | null;
  phone?: string | null;
  tax_id?: string | null;
  payment_terms?: string | null;
  default_currency?: string;
  notes?: string | null;
  operational_client_id?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  billing_country?: string | null;
};

const KEY = "billing-clients";

/**
 * Catalog of billable clients per tenant. Strict company_id scoping.
 * Independent from operational `clients` table; optional FK link via operational_client_id.
 */
export function useBillingClients(opts?: { includeInactive?: boolean }) {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const includeInactive = opts?.includeInactive ?? true;

  const list = useQuery({
    queryKey: [KEY, selectedCompanyId, includeInactive],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<BillingClient[]> => {
      let q = supabase
        .from("billing_clients")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("name", { ascending: true });
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BillingClient[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: BillingClientUpsertInput) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const payload = {
        company_id: selectedCompanyId,
        name: input.name.trim(),
        legal_name: input.legal_name?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        tax_id: input.tax_id?.trim() || null,
        payment_terms: input.payment_terms?.trim() || null,
        default_currency: (input.default_currency || "USD").toUpperCase(),
        notes: input.notes?.trim() || null,
        operational_client_id: input.operational_client_id || null,
        billing_address_line1: input.billing_address_line1?.trim() || null,
        billing_address_line2: input.billing_address_line2?.trim() || null,
        billing_city: input.billing_city?.trim() || null,
        billing_state: input.billing_state?.trim() || null,
        billing_zip: input.billing_zip?.trim() || null,
        billing_country: input.billing_country?.trim() || null,
        is_active: true,
      };
      const { data, error } = await supabase
        .from("billing_clients")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as BillingClient;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId] });
      toast.success("Cliente de facturación creado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al crear"),
  });

  const update = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<BillingClientUpsertInput> }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const patch: Record<string, any> = {};
      const { id, patch: p } = args;
      Object.entries(p).forEach(([k, v]) => {
        if (typeof v === "string") patch[k] = v.trim() || null;
        else patch[k] = v ?? null;
      });
      if (typeof p.default_currency === "string") {
        patch.default_currency = (p.default_currency || "USD").toUpperCase();
      }
      if (typeof p.name === "string") patch.name = p.name.trim();
      const { data, error } = await supabase
        .from("billing_clients")
        .update(patch)
        .eq("id", id)
        .eq("company_id", selectedCompanyId)
        .select("*")
        .single();
      if (error) throw error;
      return data as BillingClient;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId] });
      toast.success("Cliente actualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al actualizar"),
  });

  const setActive = useMutation({
    mutationFn: async (args: { id: string; is_active: boolean }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const { error } = await supabase
        .from("billing_clients")
        .update({ is_active: args.is_active })
        .eq("id", args.id)
        .eq("company_id", selectedCompanyId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId] });
      toast.success(vars.is_active ? "Cliente reactivado" : "Cliente archivado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return {
    clients: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    create,
    update,
    setActive,
  };
}
