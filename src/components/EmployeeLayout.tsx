import { Outlet, NavLink, useLocation, Navigate } from "react-router-dom";
import { CalendarDays, BarChart3, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const links = [
  { to: "/portal", icon: CalendarDays, label: "Mis Pagos" },
  { to: "/portal/accumulated", icon: BarChart3, label: "Acumulado" },
];

export default function EmployeeLayout() {
  const { user, role, employeeActive, loading, signOut } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (role !== 'employee') return <Navigate to="/auth" replace />;
  
  if (!employeeActive) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center gap-4">
        <h2 className="text-xl font-bold text-destructive">Cuenta inactiva</h2>
        <p className="text-muted-foreground max-w-md">
          Tu cuenta de empleado está inactiva. Contacta al administrador para más información.
        </p>
        <button onClick={signOut} className="text-sm text-primary hover:underline">
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pb-16">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-card border-b shadow-sm">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground text-xs font-bold">PW</span>
              </div>
              <span className="text-sm font-bold font-heading">Payroll Weekly</span>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="p-4 animate-fade-in">
          <Outlet />
        </main>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-card border-t shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          <div className="flex items-stretch h-16">
            {links.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <link.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                  {link.label}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>
    );
  }

  // Desktop
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card border-b shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-16">
          <div>
            <h1 className="text-lg font-bold font-heading tracking-tight">Payroll Weekly</h1>
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
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  <span>{link.label}</span>
                </NavLink>
              );
            })}
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent transition-colors ml-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Salir</span>
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
