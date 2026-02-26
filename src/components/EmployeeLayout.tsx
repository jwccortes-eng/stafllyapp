import { Outlet, NavLink, useLocation, Navigate } from "react-router-dom";
import { CalendarDays, BarChart3, LogOut, User, Megaphone, Clock, Home, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import EmployeeChatWidget from "@/components/EmployeeChatWidget";

const links = [
  { to: "/portal", icon: Home, label: "Inicio", end: true },
  { to: "/portal/payments", icon: Wallet, label: "Pagos" },
  { to: "/portal/shifts", icon: Clock, label: "Turnos" },
  { to: "/portal/announcements", icon: Megaphone, label: "Anuncios" },
];

export default function EmployeeLayout() {
  const { user, role, employeeActive, loading, signOut } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (role !== 'employee') return <Navigate to="/auth" replace />;
  
  if (!employeeActive) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center gap-6">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <User className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Cuenta inactiva</h2>
          <p className="text-muted-foreground text-sm mt-2 max-w-sm">
            Tu cuenta de empleado está inactiva. Contacta al administrador para más información.
          </p>
        </div>
        <button onClick={signOut} className="text-sm text-primary hover:underline font-medium">
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pb-20">
        {/* Minimal top bar */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b">
          <div className="flex items-center justify-between px-5 h-14">
            <span className="text-base font-bold font-heading tracking-tight text-foreground">PayrollWeekly</span>
            <button
              onClick={signOut}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="px-5 py-4 animate-fade-in">
          <Outlet />
        </main>

        {/* Bottom navigation — clean pill style */}
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-background/80 backdrop-blur-lg border-t">
          <div className="flex items-center justify-center gap-2 h-16 px-4">
            {links.map((link) => {
              const isActive = link.end ? location.pathname === link.to : location.pathname.startsWith(link.to);
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </NavLink>
              );
            })}
          </div>
        </nav>

        <EmployeeChatWidget />
      </div>
    );
  }

  // Desktop — centered clean layout
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-6 h-16">
          <span className="text-lg font-bold font-heading tracking-tight text-foreground">PayrollWeekly</span>
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const isActive = link.end ? location.pathname === link.to : location.pathname.startsWith(link.to);
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </NavLink>
              );
            })}
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all ml-2"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
        <Outlet />
      </main>
      <EmployeeChatWidget />
    </div>
  );
}