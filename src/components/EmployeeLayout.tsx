import { Outlet, NavLink, useLocation, Navigate } from "react-router-dom";
import { CalendarDays, BarChart3, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const links = [
  { to: "/portal", icon: CalendarDays, label: "Mis Pagos" },
  { to: "/portal/accumulated", icon: BarChart3, label: "Acumulado" },
];

export default function EmployeeLayout() {
  const { user, role, loading, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (role !== 'employee') return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card border-b shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-16">
          <div>
            <h1 className="text-lg font-bold font-heading tracking-tight">
              Payroll Weekly
            </h1>
          </div>
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{link.label}</span>
                </NavLink>
              );
            })}
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent transition-colors ml-2"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4 lg:p-6 animate-fade-in">
        <Outlet />
      </main>
    </div>
  );
}
