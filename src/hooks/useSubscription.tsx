import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export type PlanCode = "free" | "paid_manual" | "enterprise";
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
  enterprise: { label: "Enterprise", description: "Acceso completo, sin límites, soporte dedicado" },
};

/** Default limits per plan */
export const PLAN_DEFAULTS: Record<PlanCode, { maxEmployees: number; maxAdmins: number }> = {
  free: { maxEmployees: 10, maxAdmins: 2 },
  paid_manual: { maxEmployees: 999, maxAdmins: 10 },
  enterprise: { maxEmployees: Infinity, maxAdmins: Infinity },
};

/**
 * Ordered tiers for comparison.
 * enterprise > paid_manual > free
 */
const TIER_ORDER: PlanCode[] = ["free", "paid_manual", "enterprise"];
function tierIndex(plan: PlanCode): number {
  const idx = TIER_ORDER.indexOf(plan);
  return idx >= 0 ? idx : 0;
}

/**
 * Maps each sidebar module to the minimum plan required.
 * "free" = available to all, "paid_manual" = Pro+, "enterprise" = enterprise only.
 * Since enterprise >= pro >= free, an enterprise plan passes all checks.
 */
export const MODULE_PLAN_MAP: Record<string, PlanCode> = {
  // Free tier — always available
  employees: "free",
  concepts: "free",
  shifts: "free",
  announcements: "free",
  applications: "free",
  directory: "free",

  // Paid tier (Pro+)
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
  tenant_invoicing: "paid_manual",
};

/** All modules that Pro or higher can access */
const ALL_PAID_MODULES = Object.keys(MODULE_PLAN_MAP);

// Legacy compatibility types
export type PlanId = PlanCode;
export const PLAN_LIMITS = {
  free: { maxEmployees: 10, maxAdmins: 2, label: "Starter" },
  paid_manual: { maxEmployees: 999, maxAdmins: 10, label: "Pro" },
  enterprise: { maxEmployees: Infinity, maxAdmins: Infinity, label: "Enterprise" },
  // Legacy aliases
  pro: { maxEmployees: 100, maxAdmins: 3, label: "Pro" },
} as const;

export type PremiumFeature = string;

/**
 * Resolves the effective plan code, normalizing legacy values.
 * Treats paid_features_enabled as an enterprise indicator when plan_code is free/paid_manual.
 */
function resolveEffectivePlan(raw: string | null, paidFeaturesEnabled: boolean): PlanCode {
  const code = (raw ?? "free") as string;
  if (code === "enterprise") return "enterprise";
  if (code === "paid_manual") {
    // If paid_features_enabled is true on a Pro plan, treat as enterprise
    return paidFeaturesEnabled ? "enterprise" : "paid_manual";
  }
  // free plan with paid_features_enabled → enterprise override
  if (paidFeaturesEnabled) return "enterprise";
  return "free";
}

export function useSubscription() {
  const { selectedCompanyId, activeModules } = useCompany();

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

  // Resolve effective plan considering paid_features_enabled as upgrade signal
  const effectivePlan = resolveEffectivePlan(
    companyPlan?.plan_code ?? null,
    companyPlan?.paid_features_enabled ?? false,
  );

  const planCode = effectivePlan;
  const planStatus = (companyPlan?.plan_status ?? "active") as PlanStatus;
  const billingStatus = (companyPlan?.billing_status ?? "none") as BillingStatus;
  const isActive = planStatus === "active";
  const isPaid = tierIndex(planCode) >= tierIndex("paid_manual") && isActive;
  const isPremium = isPaid;
  const isEnterprise = planCode === "enterprise";
  const maxEmployees = companyPlan?.max_employees ?? PLAN_DEFAULTS[planCode].maxEmployees;
  const maxAdmins = companyPlan?.max_admins ?? PLAN_DEFAULTS[planCode].maxAdmins;

  // Trial logic
  const isTrial = false;
  const trialDaysLeft: number | null = null;

  const canAccessFeature = (_feature: string): boolean => {
    return isPremium;
  };

  /**
   * Unified module access check:
   * 1. Plan hierarchy: enterprise >= pro >= free
   * 2. company_modules override: if a module is explicitly enabled in company_modules,
   *    grant access even if plan tier would normally block it (admin manual override).
   */
  const canAccessModule = (moduleKey: string): boolean => {
    const requiredPlan = MODULE_PLAN_MAP[moduleKey];
    if (!requiredPlan) return true; // Unknown module → allow

    // Plan hierarchy check
    if (tierIndex(planCode) >= tierIndex(requiredPlan)) return true;

    // company_modules manual override: if admin has explicitly enabled this module
    if (activeModules.has(moduleKey)) return true;

    return false;
  };

  const requiredPlanForModule = (moduleKey: string): string | null => {
    if (canAccessModule(moduleKey)) return null;
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
    isEnterprise,
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
