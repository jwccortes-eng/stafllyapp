/**
 * P0 — RELIABLE TIME CLOCK · adaptador Supabase del motor de sincronización.
 *
 * Único punto donde un evento local se convierte en `time_entries` canónico.
 * Payroll no cambia: seguimos escribiendo clock_in/clock_out reales.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ClockSyncAdapter } from "./clock-sync";
import type { PendingClockEvent } from "./offline-clock-types";

export function createSupabaseClockSyncAdapter(): ClockSyncAdapter {
  return {
    serverNow: async () => new Date(),

    findByClientEventId: async (clientEventId) => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, clock_out")
        .eq("client_event_id", clientEventId)
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, clock_out: data.clock_out } : null;
    },

    findOpenEntry: async (event: PendingClockEvent) => {
      let q = supabase
        .from("time_entries")
        .select("id")
        .eq("employee_id", event.employee_id)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1);
      if (event.shift_id) q = q.eq("shift_id", event.shift_id);
      const { data, error } = await q;
      if (error) throw error;
      return data?.[0] ? { id: data[0].id } : null;
    },

    insertClockIn: async (event, meta) => {
      const { data, error } = await supabase
        .from("time_entries")
        .insert({
          employee_id: event.employee_id,
          company_id: event.company_id,
          shift_id: event.shift_id,
          // La hora pagable es la del evento real, no la de la sincronización.
          clock_in: event.event_time_device,
          status: "pending",
          clock_in_lat: event.gps?.latitude ?? null,
          clock_in_lng: event.gps?.longitude ?? null,
          clock_in_within_geofence: event.within_geofence,
          client_event_id: event.client_event_id,
          captured_offline: event.offline,
          event_time_device: event.event_time_device,
          synced_at: meta.syncedAt,
          sync_delay_seconds: meta.syncDelaySeconds,
          requires_time_review: meta.requiresReview,
          time_review_reason: meta.reviewReason,
        } as never)
        .select("id")
        .single();
      if (error) {
        // Carrera con otro dispositivo/pestaña: la clave única ya existe.
        if ((error as { code?: string }).code === "23505") {
          const { data: existing } = await supabase
            .from("time_entries")
            .select("id")
            .eq("client_event_id", event.client_event_id)
            .maybeSingle();
          if (existing) return existing.id;
        }
        throw error;
      }

      try {
        await supabase.from("clock_events").insert({
          employee_id: event.employee_id,
          company_id: event.company_id,
          shift_id: event.shift_id,
          time_entry_id: data.id,
          type: "clock_in",
          latitude: event.gps?.latitude ?? null,
          longitude: event.gps?.longitude ?? null,
          accuracy: event.gps?.accuracy ?? null,
          device: event.device_id,
          photo_url: event.photo_url,
        } as never);
      } catch {
        /* evidencia secundaria: nunca bloquea el fichaje */
      }
      return data.id;
    },

    applyClockOut: async (event, timeEntryId, meta) => {
      const { error } = await supabase
        .from("time_entries")
        .update({
          clock_out: event.event_time_device,
          clock_out_lat: event.gps?.latitude ?? null,
          clock_out_lng: event.gps?.longitude ?? null,
          clock_out_within_geofence: event.within_geofence,
          synced_at: meta.syncedAt,
          sync_delay_seconds: meta.syncDelaySeconds,
          requires_time_review: meta.requiresReview,
          time_review_reason: meta.reviewReason,
        } as never)
        .eq("id", timeEntryId)
        .is("clock_out", null);
      if (error) throw error;

      try {
        await supabase.from("clock_events").insert({
          employee_id: event.employee_id,
          company_id: event.company_id,
          shift_id: event.shift_id,
          time_entry_id: timeEntryId,
          type: "clock_out",
          latitude: event.gps?.latitude ?? null,
          longitude: event.gps?.longitude ?? null,
          accuracy: event.gps?.accuracy ?? null,
          device: event.device_id,
          photo_url: event.photo_url,
        } as never);
      } catch {
        /* evidencia secundaria */
      }
    },
  };
}
