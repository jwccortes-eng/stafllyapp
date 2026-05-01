/**
 * Founder Finance access helper.
 * The personal-finance module is gated by the `founder` role in user_roles.
 * Backend RLS already enforces this — this helper is just for UI gating.
 */
export function isFounder(allRoles: Set<string> | string[] | undefined | null): boolean {
  if (!allRoles) return false;
  if (Array.isArray(allRoles)) return allRoles.includes("founder");
  return allRoles.has("founder");
}

export const FOUNDER_FINANCE_BUCKET = "founder-finance";

export const DEFAULT_CATEGORIES: Array<{ name: string; kind: "expense" | "income"; sort_order: number }> = [
  { name: "Housing", kind: "expense", sort_order: 1 },
  { name: "Food", kind: "expense", sort_order: 2 },
  { name: "Transportation", kind: "expense", sort_order: 3 },
  { name: "Insurance", kind: "expense", sort_order: 4 },
  { name: "Utilities", kind: "expense", sort_order: 5 },
  { name: "Subscriptions", kind: "expense", sort_order: 6 },
  { name: "Software", kind: "expense", sort_order: 7 },
  { name: "Debt Payment", kind: "expense", sort_order: 8 },
  { name: "Fees & Interest", kind: "expense", sort_order: 9 },
  { name: "Business Expense", kind: "expense", sort_order: 10 },
  { name: "Personal", kind: "expense", sort_order: 11 },
  { name: "Family", kind: "expense", sort_order: 12 },
  { name: "Taxes", kind: "expense", sort_order: 13 },
  { name: "Income", kind: "income", sort_order: 14 },
  { name: "Other", kind: "expense", sort_order: 15 },
];
