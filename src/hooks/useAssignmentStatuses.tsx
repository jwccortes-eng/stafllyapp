/**
 * useAssignmentStatuses — batch reader for the backend assignment verdict.
 *
 * The hook contains no rules: it just caches the result of
 * `public.get_employees_assignment_status`.
 */
import { useQuery } from "@tanstack/react-query";
import {
  fetchAssignmentStatuses,
  optimisticStatus,
  type AssignmentStatus,
} from "@/lib/shifts/assignment-status";

export function useAssignmentStatuses(
  employeeIds: string[],
  companyId?: string | null,
) {
  const ids = [...new Set(employeeIds.filter(Boolean))].sort();

  const { data, isLoading } = useQuery({
    queryKey: ["assignment-status", companyId ?? null, ids],
    queryFn: () => fetchAssignmentStatuses(ids, companyId),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });

  const statusById = data ?? new Map<string, AssignmentStatus>();

  const getStatus = (employeeId: string): AssignmentStatus =>
    statusById.get(employeeId) ?? optimisticStatus(employeeId);

  return { statusById, getStatus, loading: isLoading };
}
