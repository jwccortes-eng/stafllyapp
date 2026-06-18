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
 * workers.
 *
 * Readiness bypass (my_documents + my_w9): if the worker still owes required
 * documents (or the W-9 specifically), the corresponding route stays reachable
 * so the home/checklist CTAs ("Subir ahora", "Firmar W-9") are never dead ends
 * — even when the admin disabled the toggle. This prevents the Paula-Contento
 * trap where the home asked for uploads but the route silently redirected.
 *
 * We also wait for the readiness query to finish before redirecting on these
 * routes, to avoid a race where modules load first, the bypass evaluates as
 * "false" while readiness is still loading, and the guard redirects too early.
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
  const usesReadiness = moduleKey === "my_documents" || moduleKey === "my_w9";
  const readiness = useEmployeeReadiness(
    usesReadiness ? effectiveEmployeeId : null,
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

  // W-9 safety net: keep /portal/w9 reachable whenever the worker still owes a
  // W-9 (or any required doc), so the "Firmar W-9" CTA from the readiness card
  // and the update center never becomes a silent redirect.
  const readinessW9Bypass =
    moduleKey === "my_w9" &&
    !readiness.loading &&
    (readiness.status === "pending_documents" ||
      readiness.missingDocuments.some((d) => d.category === "w9"));

  const bypass = adminBypass || moduleEnabled || readinessDocBypass || readinessW9Bypass;

  // While modules or readiness (when relevant) are still loading, show a
  // spinner instead of redirecting — otherwise a slow readiness query can
  // race the guard and bounce the user back to /portal.
  if (!bypass && (loading || (usesReadiness && readiness.loading))) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!bypass) {
    return <Navigate to="/portal" replace />;
  }

  return <>{children}</>;
}
