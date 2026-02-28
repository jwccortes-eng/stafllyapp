import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface Subscription {
  id: string;
  company_id: string;
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

const PREMIUM_FEATURES = [
  "automations",
  "monetization",
  "advanced-reports",
  "api-access",
] as const;

export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

/** Plan limits: employees and admins per company */
export const PLAN_LIMITS = {
  free: { maxEmployees: 25, maxAdmins: 1, label: "Starter" },
  pro: { maxEmployees: 100, maxAdmins: 3, label: "Pro" },
  enterprise: { maxEmployees: Infinity, maxAdmins: Infinity, label: "Enterprise" },
} as const;

export type PlanId = keyof typeof PLAN_LIMITS;

export function useSubscription() {
  const { selectedCompanyId } = useCompany();

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["subscription", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("company_id", selectedCompanyId)
        .maybeSingle();
      if (error) throw error;
      return data as Subscription | null;
    },
    enabled: !!selectedCompanyId,
  });

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const plan = (subscription?.plan ?? "free") as PlanId;
  const isPremium = isActive && plan !== "free";
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  const canAccessFeature = (feature: PremiumFeature): boolean => {
    if (!PREMIUM_FEATURES.includes(feature)) return true;
    return isPremium;
  };

  /** Check if adding more employees would exceed the plan limit */
  const canAddEmployees = (currentCount: number, adding = 1): boolean => {
    return currentCount + adding <= limits.maxEmployees;
  };

  /** Check if adding more admins would exceed the plan limit */
  const canAddAdmins = (currentCount: number, adding = 1): boolean => {
    return currentCount + adding <= limits.maxAdmins;
  };

  return {
    subscription,
    isLoading,
    isActive,
    isPremium,
    plan,
    limits,
    canAccessFeature,
    canAddEmployees,
    canAddAdmins,
  };
}
