import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ServiceZone = Database["public"]["Tables"]["worker_service_zones"]["Row"];
type SchedulePrefs = Database["public"]["Tables"]["worker_schedule_preferences"]["Row"];
type TravelPrefs = Database["public"]["Tables"]["worker_travel_preferences"]["Row"];

export interface WorkerAvailabilityData {
  serviceZones: ServiceZone[];
  schedulePrefs: SchedulePrefs | null;
  travelPrefs: TravelPrefs | null;
}

interface UseWorkerAvailabilityOptions {
  workerProfileId?: string;
}

export function useWorkerAvailability(options: UseWorkerAvailabilityOptions = {}) {
  const [data, setData] = useState<WorkerAvailabilityData>({
    serviceZones: [],
    schedulePrefs: null,
    travelPrefs: null,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!options.workerProfileId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [zonesRes, schedRes, travelRes] = await Promise.all([
      supabase
        .from("worker_service_zones")
        .select("*")
        .eq("worker_profile_id", options.workerProfileId)
        .order("is_primary", { ascending: false }),
      supabase
        .from("worker_schedule_preferences")
        .select("*")
        .eq("worker_profile_id", options.workerProfileId)
        .maybeSingle(),
      supabase
        .from("worker_travel_preferences")
        .select("*")
        .eq("worker_profile_id", options.workerProfileId)
        .maybeSingle(),
    ]);

    setData({
      serviceZones: zonesRes.data ?? [],
      schedulePrefs: schedRes.data,
      travelPrefs: travelRes.data,
    });

    setLoading(false);
  }, [options.workerProfileId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** Save schedule preferences */
  const saveSchedulePrefs = async (prefs: Partial<SchedulePrefs>) => {
    if (!options.workerProfileId) return;
    const { error } = await supabase
      .from("worker_schedule_preferences")
      .upsert({
        worker_profile_id: options.workerProfileId,
        ...prefs,
      } as any, { onConflict: "worker_profile_id" });
    if (!error) await fetchData();
    return error;
  };

  /** Save travel preferences */
  const saveTravelPrefs = async (prefs: Partial<TravelPrefs>) => {
    if (!options.workerProfileId) return;
    const { error } = await supabase
      .from("worker_travel_preferences")
      .upsert({
        worker_profile_id: options.workerProfileId,
        ...prefs,
      } as any, { onConflict: "worker_profile_id" });
    if (!error) await fetchData();
    return error;
  };

  /** Add a service zone */
  const addServiceZone = async (zone: Partial<ServiceZone>) => {
    if (!options.workerProfileId) return;
    const { error } = await supabase
      .from("worker_service_zones")
      .insert({
        worker_profile_id: options.workerProfileId,
        ...zone,
      } as any);
    if (!error) await fetchData();
    return error;
  };

  /** Remove a service zone */
  const removeServiceZone = async (zoneId: string) => {
    const { error } = await supabase
      .from("worker_service_zones")
      .delete()
      .eq("id", zoneId);
    if (!error) await fetchData();
    return error;
  };

  /** Update a service zone */
  const updateServiceZone = async (zoneId: string, updates: Partial<ServiceZone>) => {
    const { error } = await supabase
      .from("worker_service_zones")
      .update(updates as any)
      .eq("id", zoneId);
    if (!error) await fetchData();
    return error;
  };

  return {
    ...data,
    loading,
    refetch: fetchData,
    saveSchedulePrefs,
    saveTravelPrefs,
    addServiceZone,
    removeServiceZone,
    updateServiceZone,
  };
}
