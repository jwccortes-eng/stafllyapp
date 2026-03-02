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

/**
 * Maps each sidebar module to the minimum plan required.
 * "free" = available to all, "pro" = Pro+, "enterprise" = Enterprise only.
 */
export const MODULE_PLAN_MAP: Record<string, PlanId> = {
  // Free tier — always available
  employees: "free",
  concepts: "free",
  shifts: "free",
  announcements: "free",

  // Pro tier
  timeclock: "pro",
  periods: "pro",
  import: "pro",
  movements: "pro",
  summary: "pro",
  reports: "pro",
  clients: "pro",
  locations: "pro",

  // Enterprise tier
  automations: "enterprise",
  chat: "enterprise",
  monetization: "enterprise",
  "api-access": "enterprise",
};

/** Ordered tiers for comparison */
const TIER_ORDER: PlanId[] = ["free", "pro", "enterprise"];

function tierIndex(plan: PlanId): number {
  return TIER_ORDER.indexOf(plan);
}

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
  const isTrial = subscription?.status === "trialing";

  // Days remaining in trial
  const trialDaysLeft = isTrial && subscription?.current_period_end
    ? Math.max(0, Math.ceil((new Date(subscription.current_period_end).getTime() - Date.now()) / 86400000))
    : null;

  const canAccessFeature = (feature: PremiumFeature): boolean => {
    if (!PREMIUM_FEATURES.includes(feature)) return true;
    return isPremium;
  };

  /**
   * Check if the current plan can access a given module.
   * Returns true if the company's effective plan tier is >= the module's required tier.
   */
  const canAccessModule = (moduleKey: string): boolean => {
    const requiredPlan = MODULE_PLAN_MAP[moduleKey];
    if (!requiredPlan) return true; // unknown module = allow
    const effectivePlan: PlanId = isActive ? plan : "free";
    return tierIndex(effectivePlan) >= tierIndex(requiredPlan);
  };

  /**
   * Get the required plan label for a given module (for upgrade prompts).
   */
  const requiredPlanForModule = (moduleKey: string): string | null => {
    const requiredPlan = MODULE_PLAN_MAP[moduleKey];
    if (!requiredPlan || requiredPlan === "free") return null;
    return PLAN_LIMITS[requiredPlan].label;
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
    isTrial,
    trialDaysLeft,
    plan,
    limits,
    canAccessFeature,
    canAccessModule,
    requiredPlanForModule,
    canAddEmployees,
    canAddAdmins,
  };
}
