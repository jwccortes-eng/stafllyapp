/**
 * useEmployeeReadiness — fetches the readiness checklist for the current effective employee.
 *
 * Returns the live profile_status from `employees`, the missing personal fields
 * (mirrors compute_employee_profile_status), and the missing required documents
 * (resolved via the same source of truth used by the wizard).
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type ProfileStatus,
  missingPersonalFields,
  type PersonalInfoSnapshot,
} from "@/lib/onboarding/profile-status";
import { isEmployeeDriver } from "@/components/shifts/types";
import {
  getRequiredDocumentsForCompany,
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "@/lib/onboarding/required-documents";

export interface ReadinessSnapshot {
  loading: boolean;
  status: ProfileStatus | null;
  employeeId: string | null;
  missingPersonal: string[];
  missingDocuments: { category: DocumentCategory; label: string }[];
  totalRequirements: number;
  completedRequirements: number;
  progressPct: number;
  refresh: () => Promise<void>;
}

export function useEmployeeReadiness(employeeId: string | null | undefined): ReadinessSnapshot {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ProfileStatus | null>(null);
  const [missingPersonal, setMissingPersonal] = useState<string[]>([]);
  const [missingDocs, setMissingDocs] = useState<{ category: DocumentCategory; label: string }[]>([]);
  const [totals, setTotals] = useState({ total: 0, done: 0 });

  const load = useCallback(async () => {
    if (!employeeId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: emp } = await supabase
        .from("employees")
        .select(
          "id, company_id, profile_status, first_name, last_name, phone_number, date_of_birth, ssn_last4, address_line, address_city, address_state, address_zip, employee_role, has_car",
        )
        .eq("id", employeeId)
        .maybeSingle();

      if (!emp) { setLoading(false); return; }

      const personal = missingPersonalFields(emp as PersonalInfoSnapshot);
      setMissingPersonal(personal);

      const canDrive = !!emp.has_car;
      const required = await getRequiredDocumentsForCompany(emp.company_id, { canDrive });

      const { data: docs } = await supabase
        .from("employee_documents" as any)
        .select("category, review_status")
        .eq("employee_id", employeeId)
        .eq("review_status", "approved");

      const owned = new Set((docs ?? []).map((d: any) => d.category as DocumentCategory));
      const missing = required
        .filter((c) => !owned.has(c))
        .map((c) => ({ category: c, label: DOCUMENT_CATEGORIES[c].label }));
      setMissingDocs(missing);

      // Frontend guard for stale DB profile_status values. Carlos Ortiz exposed
      // a row where profile_status stayed "incomplete" even though personal
      // fields were complete; that incorrectly pushed him toward profile flows
      // instead of the correct documents path. Derive the routing status from
      // the same visible requirements we just computed, while preserving
      // terminal ready/active states when nothing is missing.
      const dbStatus = (emp.profile_status as ProfileStatus) ?? "incomplete";
      const effectiveStatus: ProfileStatus = personal.length > 0
        ? "incomplete"
        : missing.length > 0
          ? "pending_documents"
          : dbStatus === "active"
            ? "active"
            : "ready";
      setStatus(effectiveStatus);

      const personalReq = 10;
      const docsReq = required.length;
      const total = personalReq + docsReq;
      const done = total - personal.length - missing.length;
      setTotals({ total, done });
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const total = totals.total || 1;
  const progressPct = Math.max(0, Math.min(100, Math.round((totals.done / total) * 100)));

  return {
    loading,
    status,
    employeeId: employeeId ?? null,
    missingPersonal,
    missingDocuments: missingDocs,
    totalRequirements: totals.total,
    completedRequirements: totals.done,
    progressPct,
    refresh: load,
  };
}
