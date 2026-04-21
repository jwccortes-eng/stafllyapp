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
  // Phase 1 — location intelligence fields (resolved from locations_v2 when linked)
  location_v2_id: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  geofence_radius_meters: number | null;
  arrival_notes: string | null;
  parking_notes: string | null;
  contact_on_site: string | null;
  access_notes: string | null;
  formatted_address: string | null;
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
  // Optional structured location upsert
  latitude?: number | null;
  longitude?: number | null;
  place_id?: string | null;
  formatted_address?: string | null;
  geofence_radius_meters?: number | null;
  arrival_notes?: string | null;
  parking_notes?: string | null;
  contact_on_site?: string | null;
  access_notes?: string | null;
};

const KEY = "billing-client-locations";

interface CompositeRow extends Record<string, unknown> {
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
  location_v2_id: string | null;
  created_at: string;
  updated_at: string;
  locations_v2?: {
    latitude: number | null;
    longitude: number | null;
    place_id: string | null;
    geofence_radius_meters: number | null;
    arrival_notes: string | null;
    parking_notes: string | null;
    contact_on_site: string | null;
    access_notes: string | null;
    formatted_address: string | null;
  } | null;
}

function flatten(row: CompositeRow): BillingClientLocation {
  const lv = row.locations_v2 ?? null;
  return {
    id: row.id,
    company_id: row.company_id,
    client_id: row.client_id,
    name: row.name,
    address_line1: row.address_line1,
    address_line2: row.address_line2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    notes: row.notes,
    is_active: row.is_active,
    location_v2_id: row.location_v2_id,
    latitude: lv?.latitude ?? null,
    longitude: lv?.longitude ?? null,
    place_id: lv?.place_id ?? null,
    geofence_radius_meters: lv?.geofence_radius_meters ?? null,
    arrival_notes: lv?.arrival_notes ?? null,
    parking_notes: lv?.parking_notes ?? null,
    contact_on_site: lv?.contact_on_site ?? null,
    access_notes: lv?.access_notes ?? null,
    formatted_address: lv?.formatted_address ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function upsertLocationV2(
  companyId: string,
  existingId: string | null,
  input: BillingClientLocationInput,
): Promise<string | null> {
  const hasIntelData =
    input.latitude != null ||
    input.longitude != null ||
    input.place_id ||
    input.formatted_address ||
    input.geofence_radius_meters != null ||
    input.arrival_notes ||
    input.parking_notes ||
    input.contact_on_site ||
    input.access_notes;

  if (!hasIntelData && !existingId) return null;

  const payload = {
    company_id: companyId,
    location_type: "billing" as const,
    name: input.name?.trim() || null,
    formatted_address: input.formatted_address ?? null,
    address_line1: input.address_line1?.trim() || null,
    address_line2: input.address_line2?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    postal_code: input.zip?.trim() || null,
    place_id: input.place_id ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    geofence_radius_meters: input.geofence_radius_meters ?? null,
    arrival_notes: input.arrival_notes ?? null,
    parking_notes: input.parking_notes ?? null,
    contact_on_site: input.contact_on_site ?? null,
    access_notes: input.access_notes ?? null,
  };

  if (existingId) {
    const { error } = await supabase
      .from("locations_v2")
      .update(payload as never)
      .eq("id", existingId);
    if (error) throw error;
    return existingId;
  }

  const { data, error } = await supabase
    .from("locations_v2")
    .insert(payload as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Locations belonging to a billing client (separate from operational locations).
 * Always scoped by company_id. Pass clientId to filter to a single client.
 *
 * Now backed by `locations_v2` for richer fields (coordinates, geofence, notes).
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
        .select("*, locations_v2(latitude, longitude, place_id, geofence_radius_meters, arrival_notes, parking_notes, contact_on_site, access_notes, formatted_address)")
        .eq("company_id", selectedCompanyId!)
        .eq("client_id", clientId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as unknown as CompositeRow[]).map(flatten);
    },
  });

  const create = useMutation({
    mutationFn: async (input: BillingClientLocationInput) => {
      if (!selectedCompanyId) throw new Error("No company selected");

      const locationV2Id = await upsertLocationV2(selectedCompanyId, null, input);

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
          location_v2_id: locationV2Id,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as BillingClientLocation;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId, data.client_id] });
      toast.success("Location created");
    },
    onError: (e: Error) => toast.error(e?.message ?? "Failed to create location"),
  });

  const update = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<BillingClientLocationInput> }) => {
      if (!selectedCompanyId) throw new Error("No company selected");

      // Resolve existing row to know if a v2 link exists
      const { data: existing, error: exErr } = await supabase
        .from("billing_client_locations")
        .select("client_id, location_v2_id")
        .eq("id", args.id)
        .eq("company_id", selectedCompanyId)
        .single();
      if (exErr) throw exErr;

      const fullInput: BillingClientLocationInput = {
        client_id: (existing as { client_id: string }).client_id,
        name: args.patch.name ?? "",
        ...args.patch,
      };
      const locationV2Id = await upsertLocationV2(
        selectedCompanyId,
        (existing as { location_v2_id: string | null }).location_v2_id,
        fullInput,
      );

      const patch: Record<string, unknown> = {};
      const fields: Array<keyof BillingClientLocationInput> = [
        "name", "address_line1", "address_line2", "city", "state", "zip", "notes",
      ];
      fields.forEach((k) => {
        if (k in args.patch) {
          const v = args.patch[k];
          patch[k] = typeof v === "string" ? (v.trim() || (k === "name" ? v : null)) : v ?? null;
        }
      });
      if (locationV2Id) patch.location_v2_id = locationV2Id;
      if (typeof args.patch.name === "string") patch.name = args.patch.name.trim();

      const { data, error } = await supabase
        .from("billing_client_locations")
        .update(patch)
        .eq("id", args.id)
        .eq("company_id", selectedCompanyId)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as BillingClientLocation;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId, data.client_id] });
      toast.success("Location updated");
    },
    onError: (e: Error) => toast.error(e?.message ?? "Failed to update"),
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
      toast.success(vars.is_active ? "Location restored" : "Location archived");
    },
    onError: (e: Error) => toast.error(e?.message ?? "Error"),
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
