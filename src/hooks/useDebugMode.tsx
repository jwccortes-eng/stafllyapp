import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns whether the current user can see debug overlays/panels.
 *
 * Activated only when BOTH conditions are true:
 *  1) URL contains `?debug=1` (or `?debug=true`).
 *  2) The current user holds an authorized role (developer / owner / company_owner / admin).
 *
 * Also exposes an optional `debugWorker` token (from `?debugWorker=...`) so
 * call-sites can scope diagnostics to a specific worker (UUID or
 * employer_identification like `145` / `#145`) without hardcoding identities.
 */
export function useDebugMode() {
  const { role } = useAuth();
  const location = useLocation();

  return useMemo(() => {
    const params = new URLSearchParams(location.search);
    const flag = params.get("debug");
    const requested = flag === "1" || flag === "true";

    const authorized =
      role === "developer" ||
      role === "owner" ||
      role === "company_owner" ||
      role === "admin";

    const debugMode = requested && authorized;

    const rawWorker = params.get("debugWorker");
    const debugWorker = debugMode && rawWorker
      ? rawWorker.trim().replace(/^#/, "")
      : null;

    return { debugMode, debugWorker, authorized };
  }, [location.search, role]);
}
