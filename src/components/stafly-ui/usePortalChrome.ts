/**
 * usePortalChrome — DS1D-a2.
 *
 * Typed accessor for the EmployeeLayout outlet context. Pages migrating to
 * <StaflyPageShell> call setChromeMode("shell") on mount so EmployeeLayout
 * drops its legacy `px-4 py-4` chrome and the page can own its padding via
 * Stafly tokens.
 *
 * Default mode is "legacy" — every existing portal route keeps current chrome.
 *
 * Usage:
 *   const { setChromeMode } = usePortalChrome();
 *   useEffect(() => {
 *     setChromeMode("shell");
 *     return () => setChromeMode("legacy");
 *   }, [setChromeMode]);
 */

import { useOutletContext } from "react-router-dom";

export type PortalChromeMode = "legacy" | "shell";

export interface PortalOutletContext {
  openMore: () => void;
  chromeMode?: PortalChromeMode;
  setChromeMode?: (mode: PortalChromeMode) => void;
}

export function usePortalChrome(): PortalOutletContext {
  // Cast through unknown so callers from non-Employee layouts don't crash —
  // they just receive undefined chromeMode/setChromeMode.
  return (useOutletContext() ?? {}) as PortalOutletContext;
}
