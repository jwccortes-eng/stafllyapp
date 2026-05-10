/**
 * 60-day worker readiness grace policy — frontend mirror of
 * public.get_employee_shift_readiness().
 *
 * Single source of truth lives in the SQL function. This file mirrors the
 * constants so the UI can preview the same decision the backend will return.
 * Keep both in sync if the policy changes.
 */

/** 60-day profile completion grace policy start date. */
export const GRACE_POLICY_START_DATE = "2026-05-10";
export const GRACE_POLICY_DAYS = 60;

/** Companies eligible for the 60-day grace window. */
export const GRACE_ELIGIBLE_COMPANY_IDS: ReadonlySet<string> = new Set([
  "00000000-0000-0000-0000-000000000001", // Quality Staff by Keury
  "37f92f75-7af4-4496-aa10-793e14b09ed9", // My Staff Solution LLC / MyStaff
  "b653f344-b07a-44a2-ae2c-cf06bfb0645a", // JKitchen Staff
]);

export function isWithinGraceWindow(now: Date = new Date()): boolean {
  const start = new Date(GRACE_POLICY_START_DATE + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + GRACE_POLICY_DAYS);
  return now <= end;
}

export function isGraceEligibleCompany(companyId: string | null | undefined): boolean {
  return !!companyId && GRACE_ELIGIBLE_COMPANY_IDS.has(companyId);
}
