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
  const isPremium = isActive && subscription?.plan !== "free";

  const canAccessFeature = (feature: PremiumFeature): boolean => {
    // Free tier can access everything except premium features
    if (!PREMIUM_FEATURES.includes(feature)) return true;
    return isPremium;
  };

  return {
    subscription,
    isLoading,
    isActive,
    isPremium,
    plan: subscription?.plan ?? "free",
    canAccessFeature,
  };
}
