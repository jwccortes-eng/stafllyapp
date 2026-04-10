/**
 * Resolves the correct employee ID for the active company context.
 * CRITICAL for multi-tenant isolation: ensures portal pages only see
 * data for the currently selected company, not the first employee found.
 */
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";

export function useEffectiveEmployee() {
  const { employeeId, resolveEmployeeForCompany } = useAuth();
  const { selectedCompanyId } = useCompany();

  const effectiveEmployeeId = selectedCompanyId
    ? resolveEmployeeForCompany(selectedCompanyId) ?? employeeId
    : employeeId;

  return { effectiveEmployeeId, selectedCompanyId };
}
