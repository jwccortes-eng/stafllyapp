/**
 * FrontDeskGuard — Restricts /front-desk to internal staff only.
 *
 * The Front Desk kiosk is an INTERNAL TOOL used by office reception staff
 * on a tablet/TV in the office. It must NOT be reachable as a public flow.
 *
 * Access rules:
 *  - Must be authenticated.
 *  - Must hold one of: developer, owner, company_owner, admin, manager,
 *    supervisor.
 *  - Anyone else (employees, anonymous) is sent to /auth.
 */
import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const ALLOWED_ROLES = new Set([
  "developer",
  "owner",
  "company_owner",
  "admin",
  "manager",
  "supervisor",
]);

interface Props {
  children: ReactNode;
}

export function FrontDeskGuard({ children }: Props) {
  const { user, role, loading } = useAuth() as any;
  const location = useLocation();
  // Avoid flicker: short delay so role finishes resolving on cold loads.
  const [ready, setReady] = useState(!loading);

  useEffect(() => {
    if (!loading) setReady(true);
  }, [loading]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={`/auth?redirect=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  if (!role || !ALLOWED_ROLES.has(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default FrontDeskGuard;
