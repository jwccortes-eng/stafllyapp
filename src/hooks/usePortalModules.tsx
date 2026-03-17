import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Portal module keys that can be toggled by admins.
 * "home" and "profile" are always visible.
 */
export const PORTAL_MODULE_KEYS = [
  "my_shifts",
  "my_clock",
  "my_payments",
  "my_chat",
  "my_announcements",
  "my_w9",
  "my_profile",
  "my_resources",
  "my_availability",
  "my_documents",
  "my_reviews",
] as const;

export type PortalModuleKey = (typeof PORTAL_MODULE_KEYS)[number];

/** Always-visible modules that cannot be disabled */
const ALWAYS_VISIBLE: Set<string> = new Set(["home", "profile"]);

/** Default modules shown when admin hasn't configured anything */
const DEFAULT_ENABLED: Set<string> = new Set([
  "my_shifts", "my_clock", "my_payments",
]);

interface UsePortalModulesReturn {
  isModuleEnabled: (key: string) => boolean;
  enabledModules: Set<string>;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function usePortalModules(): UsePortalModulesReturn {
  const { employeeId } = useAuth();
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set());
  const [hasConfig, setHasConfig] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchModules = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("employee_portal_modules")
      .select("module, enabled")
      .eq("employee_id", employeeId);

    if (data && data.length > 0) {
      setHasConfig(true);
      const enabled = new Set(
        data.filter((d) => d.enabled).map((d) => d.module)
      );
      setEnabledModules(enabled);
    } else {
      setHasConfig(false);
      setEnabledModules(new Set());
    }

    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const isModuleEnabled = useCallback(
    (key: string): boolean => {
      if (ALWAYS_VISIBLE.has(key)) return true;
      // If no config exists, use defaults
      if (!hasConfig) return DEFAULT_ENABLED.has(key);
      return enabledModules.has(key);
    },
    [hasConfig, enabledModules]
  );

  return { isModuleEnabled, enabledModules, loading, refetch: fetchModules };
}
