import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";

/**
 * Captures the current compensation rates for an employee into payroll_rate_snapshots.
 * Used before shift creation or payroll calculation to preserve historical accuracy.
 */
export function useCompensationSnapshot() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();

  const captureSnapshot = useCallback(async (
    employeeId: string,
    opts: {
      sourceRecordType: string;
      sourceRecordId?: string;
      snapshotReason?: string;
    }
  ) => {
    if (!user || !selectedCompanyId) return null;

    // Get active compensation profile (order+limit to handle duplicates safely)
    const { data: profileArr } = await supabase
      .from("compensation_profiles")
      .select("*")
      .eq("company_id", selectedCompanyId)
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    const profile = profileArr?.[0] ?? null;

    if (!profile) return null;

    const { data: snapshot, error } = await supabase
      .from("payroll_rate_snapshots")
      .insert({
        company_id: selectedCompanyId,
        employee_id: employeeId,
        compensation_profile_id: profile.id,
        source_record_type: opts.sourceRecordType,
        source_record_id: opts.sourceRecordId ?? null,
        payment_mode: profile.payment_mode,
        hourly_rate: profile.default_hourly_rate,
        daily_rate: profile.default_daily_rate,
        half_day_rate: profile.default_half_day_rate,
        ride_rate_regular: profile.default_ride_rate_regular,
        ride_rate_special: profile.default_ride_rate_special,
        snapshot_reason: opts.snapshotReason ?? "rate_capture",
        effective_date: new Date().toISOString().split("T")[0],
        snapshotted_by: user.id,
      } as any)
      .select("id")
      .single();

    if (error) throw error;
    return snapshot.id;
  }, [user, selectedCompanyId]);

  return { captureSnapshot };
}
