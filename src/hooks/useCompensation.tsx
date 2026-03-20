import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/* ── Types ── */
export type PaymentMode = "hourly" | "daily" | "mixed";
export type CompRateSource = "company_default" | "job_default" | "location_default" | "employee_custom" | "imported";
export type CompActionType = "created" | "updated" | "archived" | "imported" | "corrected" | "system_detected" | "inline_table_edit";
export type CompSourceType = "manual" | "import" | "migration" | "sync" | "admin_edit" | "inline_edit";
export type CompRuleType = "hourly_default" | "daily_full" | "daily_half" | "ride_regular" | "ride_special" | "custom_daily_pattern";

export interface CompensationProfile {
  id: string;
  company_id: string;
  employee_id: string;
  payment_mode: PaymentMode;
  default_hourly_rate: number | null;
  default_daily_rate: number | null;
  default_half_day_rate: number | null;
  default_ride_rate_regular: number | null;
  default_ride_rate_special: number | null;
  overtime_hourly_rate: number | null;
  kitchen_hourly_rate: number | null;
  bonus_transport_hourly_rate: number | null;
  double_pay_hourly_rate: number | null;
  inferred_hourly_rate: number | null;
  inferred_hourly_source: string | null;
  inferred_hourly_confidence: string | null;
  hourly_rate_last_verified_at: string | null;
  hourly_rate_override_manual: boolean;
  rate_source: CompRateSource;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CompensationRule {
  id: string;
  company_id: string;
  rule_type: CompRuleType;
  rule_name: string;
  amount: number;
  unit_type: string;
  applies_to_role: string | null;
  applies_to_job: string | null;
  applies_to_location: string | null;
  applies_to_employee: string | null;
  is_active: boolean;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompensationChangeLog {
  id: string;
  company_id: string;
  employee_id: string;
  action_type: CompActionType;
  changed_field: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  source_type: CompSourceType;
  changed_by: string;
  changed_at: string;
}

/* ── Profiles ── */
export function useCompensationProfiles() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: ["compensation-profiles", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compensation_profiles")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CompensationProfile[];
    },
  });
}

/* ── Rules ── */
export function useCompensationRules() {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: ["compensation-rules", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_compensation_rules")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("priority", { ascending: true });
      if (error) throw error;
      return data as CompensationRule[];
    },
  });
}

/* ── Change Log ── */
export function useCompensationChangeLog(employeeId?: string) {
  const { selectedCompanyId } = useCompany();
  return useQuery({
    queryKey: ["compensation-changelog", selectedCompanyId, employeeId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("compensation_change_log")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("changed_at", { ascending: false })
        .limit(200);
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as CompensationChangeLog[];
    },
  });
}

/* ── Mutations ── */
export function useCompensationMutations() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["compensation-profiles"] });
    qc.invalidateQueries({ queryKey: ["compensation-changelog"] });
  };

  const upsertProfile = useCallback(async (
    employeeId: string,
    updates: Partial<CompensationProfile>,
    opts: {
      reason?: string;
      sourceType?: CompSourceType;
      changedFields?: { field: string; oldVal: string | null; newVal: string | null }[];
    } = {}
  ) => {
    if (!user || !selectedCompanyId) throw new Error("Not authenticated");

    // Check existing active profile
    const { data: existing } = await supabase
      .from("compensation_profiles")
      .select("*")
      .eq("company_id", selectedCompanyId)
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .maybeSingle();

    const profileData = {
      company_id: selectedCompanyId,
      employee_id: employeeId,
      payment_mode: updates.payment_mode ?? existing?.payment_mode ?? "hourly",
      default_hourly_rate: updates.default_hourly_rate ?? existing?.default_hourly_rate,
      default_daily_rate: updates.default_daily_rate ?? existing?.default_daily_rate,
      default_half_day_rate: updates.default_half_day_rate ?? existing?.default_half_day_rate,
      default_ride_rate_regular: updates.default_ride_rate_regular ?? existing?.default_ride_rate_regular,
      default_ride_rate_special: updates.default_ride_rate_special ?? existing?.default_ride_rate_special,
      overtime_hourly_rate: updates.overtime_hourly_rate ?? existing?.overtime_hourly_rate,
      kitchen_hourly_rate: updates.kitchen_hourly_rate ?? existing?.kitchen_hourly_rate,
      bonus_transport_hourly_rate: updates.bonus_transport_hourly_rate ?? existing?.bonus_transport_hourly_rate,
      double_pay_hourly_rate: updates.double_pay_hourly_rate ?? existing?.double_pay_hourly_rate,
      rate_source: updates.rate_source ?? existing?.rate_source ?? "employee_custom",
      effective_from: updates.effective_from ?? new Date().toISOString().split("T")[0],
      is_active: true,
      notes: updates.notes ?? existing?.notes,
      updated_by: user.id,
    };

    let profileId: string;

    if (existing) {
      // Archive old if effective_from changed
      if (updates.effective_from && updates.effective_from !== existing.effective_from) {
        await supabase
          .from("compensation_profiles")
          .update({ is_active: false, effective_to: updates.effective_from, updated_by: user.id })
          .eq("id", existing.id);

        const { data: newP, error } = await supabase
          .from("compensation_profiles")
          .insert({ ...profileData, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        profileId = newP.id;
      } else {
        const { error } = await supabase
          .from("compensation_profiles")
          .update({ ...profileData })
          .eq("id", existing.id);
        if (error) throw error;
        profileId = existing.id;
      }
    } else {
      const { data: newP, error } = await supabase
        .from("compensation_profiles")
        .insert({ ...profileData, created_by: user.id })
        .select("id")
        .single();
      if (error) throw error;
      profileId = newP.id;
    }

    // Log changes
    const changedFields = opts.changedFields ?? [];
    if (changedFields.length === 0 && !existing) {
      changedFields.push({ field: "profile", oldVal: null, newVal: "created" });
    }

    for (const cf of changedFields) {
      await supabase.from("compensation_change_log").insert({
        company_id: selectedCompanyId,
        employee_id: employeeId,
        compensation_profile_id: profileId,
        action_type: existing ? (opts.sourceType === "inline_edit" ? "inline_table_edit" : "updated") : "created",
        changed_field: cf.field,
        old_value: cf.oldVal,
        new_value: cf.newVal,
        reason: opts.reason,
        source_type: opts.sourceType ?? "manual",
        changed_by: user.id,
      });
    }

    invalidate();
    return profileId;
  }, [user, selectedCompanyId, qc]);

  const saveRule = useCallback(async (rule: Partial<CompensationRule> & { id?: string }) => {
    if (!selectedCompanyId) throw new Error("No company");
    const payload = { ...rule, company_id: selectedCompanyId };

    const { id: ruleId, ...rest } = payload;
    if (ruleId) {
      const { error } = await supabase
        .from("company_compensation_rules")
        .update(rest as any)
        .eq("id", ruleId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("company_compensation_rules")
        .insert(payload as any);
      if (error) throw error;
    }
    qc.invalidateQueries({ queryKey: ["compensation-rules"] });
  }, [selectedCompanyId, qc]);

  const deleteRule = useCallback(async (ruleId: string) => {
    const { error } = await supabase
      .from("company_compensation_rules")
      .delete()
      .eq("id", ruleId);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["compensation-rules"] });
  }, [qc]);

  return { upsertProfile, saveRule, deleteRule };
}
