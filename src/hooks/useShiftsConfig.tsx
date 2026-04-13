import { useCompanyConfig } from "@/hooks/useCompanyConfig";

export interface ShiftsConfig {
  default_start_time: string;
  default_end_time: string;
  default_slots: number;
  require_client: boolean;
  require_location: boolean;
  auto_publish: boolean;
  copy_week_assignments: boolean;
  allow_claims: boolean;
  max_shift_hours: number;
  require_shift_admin: boolean;
}

export const SHIFTS_CONFIG_DEFAULTS: ShiftsConfig = {
  default_start_time: "08:00",
  default_end_time: "17:00",
  default_slots: 1,
  require_client: false,
  require_location: false,
  auto_publish: false,
  copy_week_assignments: true,
  allow_claims: true,
  max_shift_hours: 16,
  require_shift_admin: false,
};

export function useShiftsConfig() {
  return useCompanyConfig<ShiftsConfig>("shifts_config", SHIFTS_CONFIG_DEFAULTS);
}
