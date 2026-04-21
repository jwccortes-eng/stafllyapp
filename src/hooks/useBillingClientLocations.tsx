import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

export interface BillingClientLocation {
  id: string;
  company_id: string;
  client_id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type BillingClientLocationInput = {
  client_id: string;
  name: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
};

const KEY = "billing-client-locations";

/**
 * Locations belonging to a billing client (separate from operational locations).
 * Always scoped by company_id. Pass clientId to filter to a single client.
 */
export function useBillingClientLocations(clientId?: string | null) {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();

  const list = useQuery({
    queryKey: [KEY, selectedCompanyId, clientId ?? "all"],
    enabled: !!selectedCompanyId && !!clientId,
    queryFn: async (): Promise<BillingClientLocation[]> => {
      const { data, error } = await supabase
        .from("billing_client_locations")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("client_id", clientId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BillingClientLocation[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: BillingClientLocationInput) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const { data, error } = await supabase
        .from("billing_client_locations")
        .insert({
          company_id: selectedCompanyId,
          client_id: input.client_id,
          name: input.name.trim(),
          address_line1: input.address_line1?.trim() || null,
          address_line2: input.address_line2?.trim() || null,
          city: input.city?.trim() || null,
          state: input.state?.trim() || null,
          zip: input.zip?.trim() || null,
          notes: input.notes?.trim() || null,
          is_active: true,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as BillingClientLocation;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId, data.client_id] });
      toast.success("Ubicación creada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al crear ubicación"),
  });

  const update = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<BillingClientLocationInput> }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const patch: Record<string, any> = {};
      Object.entries(args.patch).forEach(([k, v]) => {
        if (k === "client_id") return;
        if (typeof v === "string") patch[k] = v.trim() || (k === "name" ? v.trim() : null);
        else patch[k] = v ?? null;
      });
      if (typeof args.patch.name === "string") patch.name = args.patch.name.trim();
      const { data, error } = await supabase
        .from("billing_client_locations")
        .update(patch)
        .eq("id", args.id)
        .eq("company_id", selectedCompanyId)
        .select("*")
        .single();
      if (error) throw error;
      return data as BillingClientLocation;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId, data.client_id] });
      toast.success("Ubicación actualizada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al actualizar"),
  });

  const setActive = useMutation({
    mutationFn: async (args: { id: string; client_id: string; is_active: boolean }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const { error } = await supabase
        .from("billing_client_locations")
        .update({ is_active: args.is_active })
        .eq("id", args.id)
        .eq("company_id", selectedCompanyId);
      if (error) throw error;
      return args;
    },
    onSuccess: (vars) => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId, vars.client_id] });
      toast.success(vars.is_active ? "Ubicación reactivada" : "Ubicación desactivada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return {
    locations: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    create,
    update,
    setActive,
  };
}
