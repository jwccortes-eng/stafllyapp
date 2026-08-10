/**
 * useEmployeeRoster
 * -----------------
 * Single source of truth for "give me ALL workers of this company that
 * could possibly be relevant for shifts/assignments/replacements".
 *
 * Design rules (do NOT change without product approval):
 *   1. Pagination is mandatory — never trust the implicit 1,000-row PostgREST cap.
 *   2. Only `deleted_at IS NULL` is a hard exclusion.
 *   3. profile_status, onboarding_status, portal status, missing docs, etc.
 *      are NEVER hidden here. Consumers may show badges/warnings, but the
 *      worker must remain visible in the drawer / search / replacement UI.
 *      (This is what caused the "Johny Munera missing" class of bugs.)
 *   4. React Query key is always scoped by companyId — no cross-tenant leakage.
 *
 * Scope:
 *   - "shifts" (default): columns needed by Shifts.tsx / ShiftDetailDialog /
 *     EmployeeCombobox / ReplacementSuggestionDialog.
 *
 * Returns the raw roster + small derived helpers; business rules
 * (driver detection, eligibility) live in their own modules and consume
 * this hook's data.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/supabase-pagination";
import type { Employee } from "@/components/shifts/types";

export type EmployeeRosterScope = "shifts";

const SCOPE_COLUMNS: Record<EmployeeRosterScope, string> = {
  shifts:
    "id, first_name, last_name, phone_number, email, avatar_url, gender, employee_role, groups, user_id, has_car, can_drive, is_active, added_via, employer_identification, profile_status, onboarding_status," +
    // Phase 1 identity columns — needed by EmployeeCombobox / IdentityBadges.
    " worker_type, identity_status, requires_identity_resolution, payroll_approval_blocked, original_placeholder_name, identity_source, identity_notes",
};

export function employeeRosterQueryKey(
  companyId: string | null | undefined,
  scope: EmployeeRosterScope = "shifts"
) {
  // companyId is part of the key — prevents tenant cache leakage.
  return ["employee-roster", companyId ?? "__none__", scope] as const;
}

export interface UseEmployeeRosterResult {
  employees: Employee[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  /** True if pagination hit the safety hard limit. */
  truncated: boolean;
  pagesFetched: number;
  refetch: () => Promise<unknown>;
}

export function useEmployeeRoster(
  companyId: string | null | undefined,
  scope: EmployeeRosterScope = "shifts"
): UseEmployeeRosterResult {
  const columns = SCOPE_COLUMNS[scope];

  const query = useQuery({
    queryKey: employeeRosterQueryKey(companyId, scope),
    enabled: !!companyId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const result = await fetchAllPaginated<Employee>((from, to) =>
        supabase
          .from("employees")
          .select(columns)
          .eq("company_id", companyId as string)
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to)
      );
      if (result.error) throw new Error(result.error.message);
      return result;
    },
  });

  return useMemo(
    () => ({
      employees: (query.data?.data ?? []) as Employee[],
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      error: query.error ? (query.error as Error).message : null,
      truncated: query.data?.truncated ?? false,
      pagesFetched: query.data?.pages ?? 0,
      refetch: query.refetch,
    }),
    [query.data, query.isLoading, query.isFetching, query.error, query.refetch]
  );
}
