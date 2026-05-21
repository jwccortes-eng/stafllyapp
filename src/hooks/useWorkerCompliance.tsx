/**
 * useWorkerCompliance — Phase 1 hook.
 *
 * Read-only: loads one worker's snapshot and runs the rules engine.
 * No writes, no payroll, no enforcement.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  computeRequirements,
  summarizeCompletion,
  type ComputedRequirement,
  type CompletionSummary,
  type EmployeeComplianceSnapshot,
} from "@/lib/compliance/rules-engine";

interface UseWorkerComplianceResult {
  loading: boolean;
  items: ComputedRequirement[];
  summary: CompletionSummary | null;
  refresh: () => Promise<void>;
}

export function useWorkerCompliance(
  employeeId: string | null | undefined,
): UseWorkerComplianceResult {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ComputedRequirement[]>([]);
  const [summary, setSummary] = useState<CompletionSummary | null>(null);

  const load = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      setItems([]);
      setSummary(null);
      return;
    }
    setLoading(true);

    const { data: emp } = await supabase
      .from("employees")
      .select(
        "first_name,last_name,phone_number,email,date_of_birth,ssn_last4," +
          "address_line,address_city,address_state,address_zip," +
          "emergency_contact_name,emergency_contact_phone,avatar_url,has_car,can_drive",
      )
      .eq("id", employeeId)
      .maybeSingle();

    const { data: docs } = await supabase
      .from("employee_documents" as any)
      .select("category, review_status")
      .eq("employee_id", employeeId)
      .eq("review_status", "approved");

    const approved = new Set<string>(
      ((docs ?? []) as any[]).map((d) => String(d.category)),
    );

    const snap: EmployeeComplianceSnapshot = {
      ...(emp ?? {}),
      approvedDocumentCategories: approved,
    } as EmployeeComplianceSnapshot;

    const computed = computeRequirements(snap);
    setItems(computed);
    setSummary(summarizeCompletion(computed));
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  return { loading, items, summary, refresh: load };
}
