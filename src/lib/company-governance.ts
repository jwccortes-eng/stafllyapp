/**
 * Tenant governance badges and helpers.
 *
 * Source of truth for how a company should be classified visually and
 * whether it can be selected for normal operations.
 *
 * status drives is_active via DB trigger — never read is_active to decide
 * "is this a real production tenant?". Use the helpers here instead.
 */

export type CompanyStatus =
  | "draft"
  | "needs_review"
  | "active"
  | "inactive"
  | "suspended"
  | "archived";

export interface CompanyGovernance {
  status?: CompanyStatus | string | null;
  source?: string | null;
  is_test?: boolean | null;
  is_demo?: boolean | null;
}

export type CompanyGroup =
  | "production_pilot"
  | "test_demo"
  | "needs_review"
  | "inactive_suspended";

export interface GovernanceBadge {
  label: string;
  tone: "active" | "pilot" | "test" | "demo" | "inactive" | "suspended" | "review" | "archived" | "production";
}

export function classifyCompany(c: CompanyGovernance): CompanyGroup {
  const status = (c.status ?? "active") as CompanyStatus;
  if (status === "needs_review" || status === "draft") return "needs_review";
  if (status === "inactive" || status === "suspended" || status === "archived") return "inactive_suspended";
  if (c.is_test || c.is_demo) return "test_demo";
  return "production_pilot";
}

export function getCompanyBadges(c: CompanyGovernance): GovernanceBadge[] {
  const status = (c.status ?? "active") as CompanyStatus;
  const badges: GovernanceBadge[] = [];

  switch (status) {
    case "active": badges.push({ label: "Active", tone: "active" }); break;
    case "inactive": badges.push({ label: "Inactive", tone: "inactive" }); break;
    case "suspended": badges.push({ label: "Suspended", tone: "suspended" }); break;
    case "archived": badges.push({ label: "Archived", tone: "archived" }); break;
    case "needs_review": badges.push({ label: "Needs Review", tone: "review" }); break;
    case "draft": badges.push({ label: "Draft", tone: "review" }); break;
  }

  if (c.source === "production") badges.push({ label: "Production", tone: "production" });
  else if (c.source === "pilot") badges.push({ label: "Pilot", tone: "pilot" });

  if (c.is_test) badges.push({ label: "Test", tone: "test" });
  if (c.is_demo) badges.push({ label: "Demo", tone: "demo" });

  return badges;
}

/** Whether a tenant should be selectable for normal operations.
 *  Suspended/archived are blocked for everyone except developers (who can
 *  still enter with a visible warning). */
export function isCompanyOperable(c: CompanyGovernance, isDeveloper: boolean): boolean {
  const status = (c.status ?? "active") as CompanyStatus;
  if (status === "suspended" || status === "archived") return isDeveloper;
  return true;
}

/** Whether non-developer users should even SEE this tenant in the switcher.
 *  Suspended/archived disappear from regular users' lists. */
export function isCompanyVisibleTo(c: CompanyGovernance, isDeveloper: boolean): boolean {
  const status = (c.status ?? "active") as CompanyStatus;
  if (isDeveloper) return true;
  if (status === "suspended" || status === "archived") return false;
  return true;
}

/** Whether onboarding checklist makes sense for this tenant. */
export function shouldShowOnboarding(c: CompanyGovernance): boolean {
  const status = (c.status ?? "active") as CompanyStatus;
  if (status === "suspended" || status === "archived" || status === "inactive") return false;
  if (c.is_test || c.is_demo) return false;
  return true;
}

export const GROUP_LABELS: Record<CompanyGroup, string> = {
  production_pilot: "Production / Pilot",
  test_demo: "Test / Demo",
  needs_review: "Needs Review",
  inactive_suspended: "Inactive / Suspended",
};

export const BADGE_CLASSES: Record<GovernanceBadge["tone"], string> = {
  active: "bg-earning/10 text-earning",
  production: "bg-primary/10 text-primary",
  pilot: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  test: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  demo: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/10 text-destructive",
  archived: "bg-muted text-muted-foreground line-through",
  review: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};
