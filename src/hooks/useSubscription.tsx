import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export type PlanCode = "free" | "paid_manual";
export type PlanStatus = "active" | "suspended" | "pending";
export type BillingStatus = "none" | "contact_requested" | "invoiced" | "paid";

export interface CompanyPlan {
  plan_code: PlanCode;
  plan_status: PlanStatus;
  billing_status: BillingStatus;
  max_employees: number;
  max_admins: number;
  paid_features_enabled: boolean;
  trial_ends_at: string | null;
  plan_activated_at: string | null;
  plan_activated_by: string | null;
  upgrade_requested_at: string | null;
}

/** Plan display info */
export const PLAN_INFO: Record<PlanCode, { label: string; description: string }> = {
  free: { label: "Starter (Gratis)", description: "Funciones básicas para equipos pequeños" },
  paid_manual: { label: "Pro", description: "Funciones avanzadas para operaciones completas" },
};

/** Default limits per plan */
export const PLAN_DEFAULTS: Record<PlanCode, { maxEmployees: number; maxAdmins: number }> = {
  free: { maxEmployees: 10, maxAdmins: 2 },
  paid_manual: { maxEmployees: 999, maxAdmins: 10 },
};

/**
 * Maps each sidebar module to the minimum plan required.
 * "free" = available to all, "paid_manual" = Pro+.
 */
export const MODULE_PLAN_MAP: Record<string, PlanCode> = {
  // Free tier — always available
  employees: "free",
  concepts: "free",
  shifts: "free",
  announcements: "free",
  applications: "free",
  directory: "free",

  // Paid tier
  timeclock: "paid_manual",
  periods: "paid_manual",
  import: "paid_manual",
  movements: "paid_manual",
  summary: "paid_manual",
  reports: "paid_manual",
  clients: "paid_manual",
  locations: "paid_manual",
  automations: "paid_manual",
  chat: "paid_manual",
  monetization: "paid_manual",
  "api-access": "paid_manual",
  reconciliation: "paid_manual",
  "command-center": "paid_manual",
  payroll: "paid_manual",
};

/** Ordered tiers for comparison */
const TIER_ORDER: PlanCode[] = ["free", "paid_manual"];
function tierIndex(plan: PlanCode): number {
  return TIER_ORDER.indexOf(plan);
}

// Legacy compatibility types
export type PlanId = PlanCode;
export const PLAN_LIMITS = {
  free: { maxEmployees: 10, maxAdmins: 2, label: "Starter" },
  paid_manual: { maxEmployees: 999, maxAdmins: 10, label: "Pro" },
  // Legacy aliases
  pro: { maxEmployees: 100, maxAdmins: 3, label: "Pro" },
  enterprise: { maxEmployees: Infinity, maxAdmins: Infinity, label: "Enterprise" },
} as const;

export type PremiumFeature = string;

export function useSubscription() {
  const { selectedCompanyId } = useCompany();

  const { data: companyPlan, isLoading } = useQuery({
    queryKey: ["company-plan", selectedCompanyId],
    queryFn: async (): Promise<CompanyPlan | null> => {
      if (!selectedCompanyId) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("plan_code, plan_status, billing_status, max_employees, max_admins, paid_features_enabled, trial_ends_at, plan_activated_at, plan_activated_by, upgrade_requested_at")
        .eq("id", selectedCompanyId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data as unknown as CompanyPlan;
    },
    enabled: !!selectedCompanyId,
  });

  const planCode = (companyPlan?.plan_code ?? "free") as PlanCode;
  const planStatus = (companyPlan?.plan_status ?? "active") as PlanStatus;
  const billingStatus = (companyPlan?.billing_status ?? "none") as BillingStatus;
  const isActive = planStatus === "active";
  const isPaid = planCode === "paid_manual" && isActive;
  const isPremium = isPaid && companyPlan?.paid_features_enabled === true;
  const maxEmployees = companyPlan?.max_employees ?? PLAN_DEFAULTS[planCode].maxEmployees;
  const maxAdmins = companyPlan?.max_admins ?? PLAN_DEFAULTS[planCode].maxAdmins;

  // Trial logic
  const isTrial = false; // No active trial system yet
  const trialDaysLeft: number | null = null;

  const canAccessFeature = (_feature: string): boolean => {
    return isPremium;
  };

  const canAccessModule = (moduleKey: string): boolean => {
    const requiredPlan = MODULE_PLAN_MAP[moduleKey];
    if (!requiredPlan) return true;
    return tierIndex(planCode) >= tierIndex(requiredPlan);
  };

  const requiredPlanForModule = (moduleKey: string): string | null => {
    const requiredPlan = MODULE_PLAN_MAP[moduleKey];
    if (!requiredPlan || requiredPlan === "free") return null;
    return PLAN_INFO[requiredPlan].label;
  };

  const canAddEmployees = (currentCount: number, adding = 1): boolean => {
    return currentCount + adding <= maxEmployees;
  };

  const canAddAdmins = (currentCount: number, adding = 1): boolean => {
    return currentCount + adding <= maxAdmins;
  };

  const hasRequestedUpgrade = billingStatus === "contact_requested";

  return {
    // New fields
    companyPlan,
    planCode,
    planStatus,
    billingStatus,
    maxEmployees,
    maxAdmins,
    isPaid,
    hasRequestedUpgrade,

    // Legacy-compatible fields
    subscription: null,
    isLoading,
    isActive,
    isPremium,
    isTrial,
    trialDaysLeft,
    plan: planCode as any,
    limits: { maxEmployees, maxAdmins, label: PLAN_INFO[planCode].label },
    canAccessFeature,
    canAccessModule,
    requiredPlanForModule,
    canAddEmployees,
    canAddAdmins,
  };
}
