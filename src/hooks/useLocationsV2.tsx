import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export type LocationType =
  | "billing"
  | "operational"
  | "meeting_point"
  | "job_site"
  | "company_site"
  | "customer_site";

export interface LocationV2 {
  id: string;
  company_id: string;
  location_type: LocationType;
  name: string | null;
  formatted_address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  access_notes: string | null;
  arrival_notes: string | null;
  parking_notes: string | null;
  contact_on_site: string | null;
  geofence_radius_meters: number | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type LocationV2Input = Partial<
  Omit<LocationV2, "id" | "created_at" | "updated_at" | "company_id">
> & {
  company_id: string;
  location_type: LocationType;
};

export function useLocationsV2(companyId: string | null, type?: LocationType) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["locations_v2", companyId, type ?? "all"],
    enabled: !!companyId && !!user,
    queryFn: async () => {
      let q = supabase
        .from("locations_v2")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (type) q = q.eq("location_type", type);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LocationV2[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: LocationV2Input) => {
      const { data, error } = await supabase
        .from("locations_v2")
        .insert({ ...input, created_by: user?.id ?? null })
        .select("*")
        .single();
      if (error) throw error;
      return data as LocationV2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations_v2", companyId] });
    },
    onError: (e: Error) => {
      toast({ title: "Could not save location", description: e.message, variant: "destructive" });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<LocationV2Input> }) => {
      const { data, error } = await supabase
        .from("locations_v2")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as LocationV2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations_v2", companyId] });
    },
    onError: (e: Error) => {
      toast({ title: "Could not update location", description: e.message, variant: "destructive" });
    },
  });

  return { ...list, create, update };
}

export async function fetchLocationById(id: string): Promise<LocationV2 | null> {
  const { data, error } = await supabase
    .from("locations_v2")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("fetchLocationById:", error.message);
    return null;
  }
  return data as LocationV2 | null;
}
