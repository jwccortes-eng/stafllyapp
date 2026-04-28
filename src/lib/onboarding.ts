// Centralized onboarding status helper.
// Historically the codebase has written both "complete" and "completed" to
// employees.onboarding_status. Treat both as terminal/successful so guards
// (AuthCallback, /portal) never bounce activated workers back to /activate.
export const ONBOARDING_COMPLETE_VALUES = ["complete", "completed"] as const;

export function isOnboardingComplete(status?: string | null): boolean {
  if (!status) return false;
  return (ONBOARDING_COMPLETE_VALUES as readonly string[]).includes(status);
}
