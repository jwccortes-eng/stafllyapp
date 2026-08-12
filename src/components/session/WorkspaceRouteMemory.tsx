/**
 * P0 — Persistent Session & Last Workspace Restoration.
 *
 * Two jobs, both frontend-only:
 *  1) Remember the last valid operational route per user, per device.
 *  2) On a cold app start that lands on a workspace index (`/app`, `/portal`),
 *     restore that route once, if it is still restorable.
 *
 * Guards (AdminLayout / EmployeeLayout / module gates) remain the authority:
 * if the restored screen no longer exists or the user lost access, they send
 * the user back to the dashboard of the active company. The user is never
 * left on an invalid screen.
 */

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  isRestorableRoute,
  readWorkspaceMemory,
  rememberRoute,
} from "@/lib/session/workspace-memory";

const INDEX_ROUTES = new Set(["/app", "/app/", "/portal", "/portal/"]);

/** Installed app (PWA / Capacitor) cold start lands on "/". */
function isStandaloneLaunch(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function WorkspaceRouteMemory() {
  const { user, loading: authLoading } = useAuth();
  const { loading: companyLoading, selectedCompanyId } = useCompany();
  const location = useLocation();
  const navigate = useNavigate();
  const restoredRef = useRef(false);

  const path = location.pathname + (location.search || "");

  // 1) Restore once per page load.
  useEffect(() => {
    if (restoredRef.current) return;
    if (authLoading || companyLoading || !user) return;
    const isRootLaunch = location.pathname === "/" && isStandaloneLaunch();
    if (!INDEX_ROUTES.has(location.pathname) && !isRootLaunch) {
      // The user navigated somewhere concrete already: nothing to restore.
      restoredRef.current = true;
      return;
    }
    const memory = readWorkspaceMemory(user.id);
    restoredRef.current = true;
    if (!memory.route || !isRestorableRoute(memory.route)) return;
    if (memory.route === path) return;
    // Only restore inside the same workspace family the user opened.
    if (!isRootLaunch) {
      const family = location.pathname.startsWith("/portal") ? "/portal" : "/app";
      if (!memory.route.startsWith(family)) return;
    }
    const family = memory.route.startsWith("/portal") ? "/portal" : "/app";
    // Company context must be resolved before restoring a tenant-scoped screen.
    if (family === "/app" && !selectedCompanyId && memory.companyId) return;
    navigate(memory.route, { replace: true });
  }, [authLoading, companyLoading, user, location.pathname, path, navigate, selectedCompanyId]);

  // 2) Remember the last valid route.
  useEffect(() => {
    if (!user || authLoading) return;
    if (!isRestorableRoute(path)) return;
    rememberRoute(user.id, path);
  }, [user, authLoading, path]);

  return null;
}

export default WorkspaceRouteMemory;
