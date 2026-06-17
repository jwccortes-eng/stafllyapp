import { Navigate } from "react-router-dom";
import { usePortalModules } from "@/hooks/usePortalModules";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useEmployeeReadiness } from "@/hooks/useEmployeeReadiness";

/**
 * Guards a portal route by portal module key. If the worker doesn't have the
 * module enabled (admin disabled it or plan doesn't include it), redirect to
 * /portal home instead of exposing the page via direct URL.
 *
 * Bypass: company owners/admins and global owners are NEVER blocked by portal
 * module toggles for the company they manage. Toggles still apply to regular
 * workers. This avoids the redirect loop where a Jorge-style multi-role user
 * gets bounced from /portal/profile because his admin company doesn't have
 * "profile" toggled in employee_portal_modules.
 *
 * Readiness bypass (my_documents only): if the worker's readiness status is
 * `pending_documents` or required documents are still missing, /portal/documents
 * is always reachable so the dashboard CTA ("Upload your documents") is never
 * a dead end — even when the admin disabled the my_documents toggle. This
 * prevents the Carlos-Ortiz-style trap where the home asks for uploads but the
 * route is blocked. No other modules are widened.
 *
 * Worker-facing only. Does NOT touch admin /app routes, RLS, payroll,
 * time_entries, PIN, PII, kiosk, or worker auth core.
 */
interface Props {
  moduleKey: string;
  children: React.ReactNode;
}

export function PortalModuleGuard({ moduleKey, children }: Props) {
  const { isModuleEnabled, loading } = usePortalModules();
  const { canAccessAdminForCompany } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { selectedCompanyId: effectiveCompanyId, effectiveEmployeeId } = useEffectiveEmployee();
  const readiness = useEmployeeReadiness(
    moduleKey === "my_documents" ? effectiveEmployeeId : null,
  );

   // Resolve permission first so background module refetches never blank the route.
  const adminBypass =
    canAccessAdminForCompany(selectedCompanyId) ||
    canAccessAdminForCompany(effectiveCompanyId);
  const moduleEnabled = isModuleEnabled(moduleKey);

  // Documents safety net: never trap a worker who still owes required documents.
  const readinessDocBypass =
    moduleKey === "my_documents" &&
    !readiness.loading &&
    (readiness.status === "pending_documents" || readiness.missingDocuments.length > 0);

  if (loading && !adminBypass && !moduleEnabled && !readinessDocBypass) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!adminBypass && !moduleEnabled && !readinessDocBypass) {
    return <Navigate to="/portal" replace />;
  }

  return <>{children}</>;
}

