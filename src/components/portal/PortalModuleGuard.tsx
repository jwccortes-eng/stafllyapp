import { Navigate } from "react-router-dom";
import { usePortalModules } from "@/hooks/usePortalModules";

/**
 * Guards a portal route by portal module key. If the worker doesn't have the
 * module enabled (admin disabled it or plan doesn't include it), redirect to
 * /portal home instead of exposing the page via direct URL.
 *
 * Worker-facing only. Does NOT touch admin /app routes, RLS, payroll, time_entries
 * or worker auth core.
 */
interface Props {
  moduleKey: string;
  children: React.ReactNode;
}

export function PortalModuleGuard({ moduleKey, children }: Props) {
  const { isModuleEnabled, loading } = usePortalModules();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isModuleEnabled(moduleKey)) {
    return <Navigate to="/portal" replace />;
  }

  return <>{children}</>;
}
