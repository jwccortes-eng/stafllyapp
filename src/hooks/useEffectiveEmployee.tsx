/**
 * Resolves the correct employee ID for the active company context.
 * CRITICAL for multi-tenant isolation: ensures portal pages only see
 * data for the currently selected company, not the first employee found.
 *
 * Resolution rules:
 * - If admin selected a company → return employee for THAT company, or null.
 *   We MUST NOT fall back to a different-company employee, because that
 *   would leak portal data across tenants (e.g. seeing Quality Staff
 *   shifts while admin context is on My Staff).
 * - If no company selected (pure employee, no admin) → return their
 *   single employee record directly.
 */
import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";

export function useEffectiveEmployee() {
  const { employeeId, resolveEmployeeForCompany } = useAuth();
  const { selectedCompanyId } = useCompany();

  // Strict isolation: if a company is selected, only return an employee
  // that belongs to that company. No silent cross-company fallback.
  const effectiveEmployeeId = selectedCompanyId
    ? resolveEmployeeForCompany(selectedCompanyId)
    : employeeId;

  const lastKnownEmployeeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (effectiveEmployeeId) {
      lastKnownEmployeeIdRef.current = effectiveEmployeeId;
    }
  }, [effectiveEmployeeId]);

  const stableEmployeeId = useMemo(() => {
    return effectiveEmployeeId ?? lastKnownEmployeeIdRef.current;
  }, [effectiveEmployeeId]);

  return {
    effectiveEmployeeId,
    stableEmployeeId,
    lastKnownEmployeeId: lastKnownEmployeeIdRef.current,
    selectedCompanyId,
    isResolvingEmployee: !effectiveEmployeeId && !!lastKnownEmployeeIdRef.current,
  };
}
