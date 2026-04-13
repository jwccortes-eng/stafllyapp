import { useCompanyConfig } from "@/hooks/useCompanyConfig";

export type GpsEnforcement = "none" | "warn" | "block";

export interface ClockConfig {
  /** Allowed clock-in methods */
  allowed_methods: string[];
  /** GPS geofence radius in meters */
  gps_radius_meters: number;
  /** GPS enforcement mode: none (no check), warn (alert only), block (prevent clock-in) */
  gps_enforcement: GpsEnforcement;
  /** Require a photo on clock-in/out */
  require_photo: boolean;
  /** Minutes after shift start before marking late */
  grace_period_minutes: number;
}

export const CLOCK_CONFIG_DEFAULTS: ClockConfig = {
  allowed_methods: ["manual", "gps", "qr", "kiosk"],
  gps_radius_meters: 200,
  gps_enforcement: "none",
  require_photo: false,
  grace_period_minutes: 15,
};

export function useClockConfig() {
  return useCompanyConfig<ClockConfig>("clock_config", CLOCK_CONFIG_DEFAULTS);
}
