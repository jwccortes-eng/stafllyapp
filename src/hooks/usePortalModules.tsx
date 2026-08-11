import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import {
  PORTAL_MODULE_KEYS,
  type PortalModuleKey,
  buildPortalModuleOverrides,
  resolveEnabledPortalModules,
  resolvePortalModuleEnabled,
} from "@/lib/portal/portal-modules";

export { PORTAL_MODULE_KEYS };
export type { PortalModuleKey };

interface UsePortalModulesReturn {
  isModuleEnabled: (key: string) => boolean;
  enabledModules: Set<string>;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Lee overrides de employee_portal_modules y los resuelve con la regla
 * canónica: ausencia de fila = default, nunca "deshabilitado".
 *
 * El fetch depende SOLO de employeeId (sin dependencias derivadas como
 * enabledModules.size / hasConfig) para no generar refetches ni estados
 * transitorios que cambien permisos después del primer render.
 */
export function usePortalModules(): UsePortalModulesReturn {
  const { stableEmployeeId: employeeId } = useEffectiveEmployee();
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const loadedForRef = useRef<string | null>(null);

  const fetchModules = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }

    if (loadedForRef.current !== employeeId) setLoading(true);

    const { data } = await supabase
      .from("employee_portal_modules")
      .select("module, enabled")
      .eq("employee_id", employeeId);

    setOverrides(buildPortalModuleOverrides(data as any));
    loadedForRef.current = employeeId;
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const enabledModules = useMemo(
    () => resolveEnabledPortalModules(overrides),
    [overrides],
  );

  const isModuleEnabled = useCallback(
    (key: string): boolean => resolvePortalModuleEnabled(key, overrides),
    [overrides],
  );

  return { isModuleEnabled, enabledModules, loading, refetch: fetchModules };
}
