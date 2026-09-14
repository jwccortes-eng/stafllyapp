/**
 * Lectura en SOMBRA del motor canónico de entitlements.
 *
 * Solo lee. No escribe, no bloquea, no cambia el gating vigente
 * (`useSubscription.canAddEmployees` / `canAddAdmins` siguen mandando).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { getCanonicalUsage } from "@/lib/commercial/active-worker-usage";
import { getCompanyOverrides } from "@/lib/commercial/entitlement-overrides";
import {
  evaluateEntitlement,
  type CompanyEntitlementInput,
  type EntitlementEvaluation,
} from "@/lib/commercial/entitlements";

export function useEntitlementShadow(companyIdOverride?: string | null) {
  const { selectedCompanyId } = useCompany();
  const companyId = companyIdOverride ?? selectedCompanyId;

  return useQuery({
    queryKey: ["entitlement-shadow", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<{
      input: CompanyEntitlementInput;
      workers: EntitlementEvaluation;
      admins: EntitlementEvaluation;
    } | null> => {
      if (!companyId) return null;

      const [companyRes, subRes, usage] = await Promise.all([
        supabase
          .from("companies")
          .select(
            "id, name, plan_code, plan_status, paid_features_enabled, max_employees, max_admins, is_active",
          )
          .eq("id", companyId)
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("plan, status")
          .eq("company_id", companyId)
          .maybeSingle(),
        getCanonicalUsage(companyId),
      ]);

      if (companyRes.error) throw companyRes.error;
      if (!companyRes.data) return null;

      const c = companyRes.data as any;
      const input: CompanyEntitlementInput = {
        id: c.id,
        name: c.name,
        plan_code: c.plan_code ?? null,
        plan_status: c.plan_status ?? null,
        paid_features_enabled: c.paid_features_enabled ?? false,
        max_employees: c.max_employees ?? null,
        max_admins: c.max_admins ?? null,
        is_active: c.is_active ?? null,
        subscription_plan: (subRes.data as any)?.plan ?? null,
        subscription_status: (subRes.data as any)?.status ?? null,
        overrides: [],
        usage,
      };

      return {
        input,
        workers: evaluateEntitlement(input, "active_workers"),
        admins: evaluateEntitlement(input, "admin_users"),
      };
    },
  });
}
