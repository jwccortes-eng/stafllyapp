import { useCompanyConfig } from "@/hooks/useCompanyConfig";

export interface OnboardingConfig {
  /** Fields required to create an employee beyond first_name */
  required_fields: string[];
  /** Require email when creating employees */
  require_email: boolean;
  /** Auto-open invite dialog after creating an employee */
  auto_send_invite_on_create: boolean;
  /** Days until an invitation expires */
  invite_expiry_days: number;
  /** Welcome message shown to employees on first portal login */
  welcome_message: string;
}

export const ONBOARDING_CONFIG_DEFAULTS: OnboardingConfig = {
  required_fields: ["first_name", "last_name", "phone_number"],
  require_email: false,
  auto_send_invite_on_create: false,
  invite_expiry_days: 7,
  welcome_message: "",
};

export function useOnboardingConfig() {
  return useCompanyConfig<OnboardingConfig>("onboarding_config", ONBOARDING_CONFIG_DEFAULTS);
}
