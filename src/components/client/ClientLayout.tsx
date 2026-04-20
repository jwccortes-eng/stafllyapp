/**
 * Skeleton layout for the requester/client portal at /client.
 *
 * Decisions captured here for future maintainers:
 *   - Lives at /client (not /requests inside admin) → cleaner UX for clients.
 *   - Reuses existing useServiceRequests hooks (no duplicate data layer).
 *   - Guard: TEMPORARY — admin/owner allowed for internal preview.
 *     Real target audience is users with role 'requester' or 'client'
 *     (to be wired once that role/RLS exists).
 */
import { useEffect } from "react";
import { Outlet, Navigate, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Loader2, LayoutDashboard, ClipboardList, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/client", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/client/requests", label: "Mis solicitudes", icon: ClipboardList },
];

export default function ClientLayout() {
  const { user, role, allRoles, loading, signOut } = useAuth();
  const { selectedCompanyId } = useCompany();
  const location = useLocation();

  useEffect(() => {
    document.title = "Portal de Cliente · Stafly";
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/auth?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // TEMPORARY guard: until a real `requester`/`client` role exists, allow
  // admin/owner/developer/company_owner for internal preview only.
  const allowed = ["requester", "client", "admin", "owner", "developer", "company_owner"];
  const hasAccess = [...allRoles].some((r) => allowed.includes(r));
  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-semibold">Acceso restringido</h1>
          <p className="text-sm text-muted-foreground">
            Este portal está disponible solo para clientes que solicitan personal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b border-border/60 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <NavLink to="/client" className="font-semibold text-sm tracking-tight">
              Stafly · Cliente
            </NavLink>
            <nav className="flex items-center gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )
                  }
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <NavLink to="/client/requests/new">
              <Button size="sm" className="h-8 text-xs gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Nueva solicitud
              </Button>
            </NavLink>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => signOut()}>
              Salir
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        {!selectedCompanyId ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            Selecciona una empresa para continuar.
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
