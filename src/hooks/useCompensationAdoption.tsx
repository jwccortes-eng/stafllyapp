import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type ConfidenceLevel = "high" | "medium" | "review";
export type AdoptionDecision = "accept" | "edit" | "skip" | null;
export type SuggestedPaymentMode = "hourly" | "daily" | "hybrid";

export interface AdoptionProposal {
  employeeId: string;
  employeeName: string;
  currentHourlyRate: number | null;
  currentDailyRate: number | null;
  currentPaymentMode: string | null;
  suggestedHourlyRate: number | null;
  suggestedDailyRate: number | null;
  suggestedPaymentMode: SuggestedPaymentMode;
  source: string;
  confidence: ConfidenceLevel;
  reason: string;
  decision: AdoptionDecision;
  editedRate: number | null;
}

function classifyConfidence(
  currentRate: number | null,
  suggestedRate: number | null,
  hasMultipleRates: boolean,
): ConfidenceLevel {
  if (!suggestedRate || suggestedRate <= 0) return "review";
  if (hasMultipleRates) return "medium";
  if (currentRate && Math.abs(currentRate - suggestedRate) < 0.01) return "high";
  if (!currentRate) return "medium";
  const pctDiff = Math.abs(currentRate - suggestedRate) / currentRate;
  if (pctDiff < 0.05) return "high";
  if (pctDiff < 0.20) return "medium";
  return "review";
}

interface BatchInfo {
  id: string;
  payroll_period_start: string | null;
  payroll_period_end: string | null;
}

export function useCompensationAdoption() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const qc = useQueryClient();
  const [proposals, setProposals] = useState<AdoptionProposal[]>([]);
  const [generated, setGenerated] = useState(false);

  const { data: batchData, isLoading: loadingBatch } = useQuery({
    queryKey: ["adoption-batch-rows", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data: batch } = await supabase
        .from("reconciliation_batches")
        .select("id, payroll_period_start, payroll_period_end")
        .eq("company_id", selectedCompanyId!)
        .in("status", ["approved", "reconciled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!batch) return null;

      const { data: rows } = await supabase
        .from("reconciliation_employee_rows")
        .select("*")
        .eq("batch_id", batch.id);

      return { batch: batch as BatchInfo, rows: rows ?? [] };
    },
  });

  const { data: currentProfiles, isLoading: loadingProfiles } = useQuery({
    queryKey: ["adoption-current-profiles", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("compensation_profiles")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const loading = loadingBatch || loadingProfiles;
  const batchInfo = batchData?.batch ?? null;

  const generateProposals = useCallback(() => {
    if (!batchData?.rows) return;

    const profileMap = new Map(
      (currentProfiles ?? []).map((p) => [p.employee_id, p])
    );

    const newProposals: AdoptionProposal[] = [];

    for (const row of batchData.rows) {
      const empId = row.matched_system_employee_id;
      if (!empId) continue;

      const profile = profileMap.get(empId);
      const empName = [row.first_name, row.last_name].filter(Boolean).join(" ") || empId;

      const truthHours = row.truth_hours ?? 0;
      const truthBase = row.truth_total_pay ?? 0;
      const truthPPD = row.truth_pay_per_day ?? 0;

      let suggestedMode: SuggestedPaymentMode = "hourly";
      if (truthPPD > 0 && truthBase > 0) suggestedMode = "hybrid";
      else if (truthPPD > 0 && truthBase === 0) suggestedMode = "daily";

      const suggestedHourly =
        truthHours > 0 && truthBase > 0
          ? Math.round((truthBase / truthHours) * 100) / 100
          : null;

      const suggestedDaily = truthPPD > 0 ? truthPPD : null;

      const hasMultiple = !!(suggestedHourly && suggestedDaily);
      const confidence = classifyConfidence(
        profile?.default_hourly_rate ?? null,
        suggestedHourly,
        hasMultiple
      );

      let reason = "";
      if (!profile) {
        reason = "Sin perfil de compensación actual";
      } else if (suggestedHourly && profile.default_hourly_rate && Math.abs(suggestedHourly - profile.default_hourly_rate) > 0.01) {
        reason = `Rate actual $${profile.default_hourly_rate}/hr vs payroll $${suggestedHourly}/hr`;
      } else if (!suggestedHourly && suggestedDaily) {
        reason = "Empleado pagado por día — sin tarifa por hora detectable";
      } else {
        reason = "Rate coincide con payroll";
      }

      newProposals.push({
        employeeId: empId,
        employeeName: empName,
        currentHourlyRate: profile?.default_hourly_rate ?? null,
        currentDailyRate: profile?.default_daily_rate ?? null,
        currentPaymentMode: profile?.payment_mode ?? null,
        suggestedHourlyRate: suggestedHourly,
        suggestedDailyRate: suggestedDaily,
        suggestedPaymentMode: suggestedMode,
        source: `Payroll ${batchData.batch.payroll_period_start ?? "?"} → ${batchData.batch.payroll_period_end ?? "?"}`,
        confidence,
        reason,
        decision: confidence === "high" ? "accept" : null,
        editedRate: null,
      });
    }

    const order: Record<ConfidenceLevel, number> = { review: 0, medium: 1, high: 2 };
    newProposals.sort((a, b) => order[a.confidence] - order[b.confidence]);

    setProposals(newProposals);
    setGenerated(true);
  }, [batchData, currentProfiles]);

  const updateDecision = useCallback(
    (employeeId: string, decision: AdoptionDecision, editedRate?: number) => {
      setProposals((prev) =>
        prev.map((p) =>
          p.employeeId === employeeId
            ? { ...p, decision, editedRate: editedRate ?? p.editedRate }
            : p
        )
      );
    },
    []
  );

  const applyConfirmed = useCallback(async () => {
    if (!user || !selectedCompanyId) return { applied: 0, errors: 0 };

    const toApply = proposals.filter((p) => p.decision === "accept" || p.decision === "edit");
    let applied = 0;
    let errors = 0;

    for (const p of toApply) {
      try {
        const hourlyRate =
          p.decision === "edit" && p.editedRate != null
            ? p.editedRate
            : p.suggestedHourlyRate;

        const { data: existing } = await supabase
          .from("compensation_profiles")
          .select("id")
          .eq("company_id", selectedCompanyId)
          .eq("employee_id", p.employeeId)
          .eq("is_active", true)
          .maybeSingle();

        const paymentMode: "hourly" | "daily" | "mixed" =
          p.suggestedPaymentMode === "hybrid" ? "mixed" : p.suggestedPaymentMode;

        const profilePayload = {
          company_id: selectedCompanyId,
          employee_id: p.employeeId,
          payment_mode: paymentMode,
          default_hourly_rate: hourlyRate,
          default_daily_rate: p.suggestedDailyRate,
          rate_source: "imported" as const,
          is_active: true,
          effective_from: new Date().toISOString().split("T")[0],
          updated_by: user.id,
          notes: `Adoption from payroll: ${p.source}`,
        };

        if (existing) {
          await supabase
            .from("compensation_profiles")
            .update(profilePayload)
            .eq("id", existing.id);
        } else {
          await supabase
            .from("compensation_profiles")
            .insert({ ...profilePayload, created_by: user.id });
        }

        await supabase.from("compensation_change_log").insert({
          company_id: selectedCompanyId,
          employee_id: p.employeeId,
          action_type: existing ? "updated" : "created",
          changed_field: "default_hourly_rate",
          old_value: p.currentHourlyRate?.toString() ?? null,
          new_value: hourlyRate?.toString() ?? null,
          reason: `Adoption review: ${p.reason}`,
          source_type: "import",
          changed_by: user.id,
        });

        applied++;
      } catch (e) {
        console.error("Failed to apply adoption for", p.employeeName, e);
        errors++;
      }
    }

    qc.invalidateQueries({ queryKey: ["compensation-profiles"] });
    qc.invalidateQueries({ queryKey: ["adoption-current-profiles"] });

    return { applied, errors };
  }, [proposals, user, selectedCompanyId, qc]);

  const stats = useMemo(() => {
    const high = proposals.filter((p) => p.confidence === "high").length;
    const medium = proposals.filter((p) => p.confidence === "medium").length;
    const review = proposals.filter((p) => p.confidence === "review").length;
    const accepted = proposals.filter((p) => p.decision === "accept" || p.decision === "edit").length;
    const skipped = proposals.filter((p) => p.decision === "skip").length;
    const pending = proposals.filter((p) => p.decision === null).length;
    return { total: proposals.length, high, medium, review, accepted, skipped, pending };
  }, [proposals]);

  return {
    proposals,
    stats,
    loading,
    generated,
    batchInfo,
    generateProposals,
    updateDecision,
    applyConfirmed,
  };
}
