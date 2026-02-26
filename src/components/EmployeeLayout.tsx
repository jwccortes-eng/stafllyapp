import { Outlet, NavLink, useLocation, Navigate } from "react-router-dom";
import { CalendarDays, BarChart3, LogOut, User, Megaphone, Clock, Home, Wallet, Package, Grid3X3 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import EmployeeChatWidget from "@/components/EmployeeChatWidget";

const links = [
  { to: "/portal", icon: Home, label: "Inicio", end: true },
  { to: "/portal/clock", icon: Clock, label: "Reloj" },
  { to: "/portal/shifts", icon: CalendarDays, label: "Turnos" },
  { to: "/portal/resources", icon: Grid3X3, label: "Recursos" },
  { to: "/portal/profile", icon: User, label: "Perfil" },
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
      <div className="min-h-[100dvh] bg-background flex flex-col">
        {/* Minimal top bar */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b shrink-0">
          <div className="flex items-center justify-between px-5 h-14">
            <span className="text-base font-bold font-heading tracking-tight text-foreground">Staffly</span>
            <button onClick={signOut} className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" aria-label="Cerrar sesión">
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-4 pb-24 animate-fade-in">
          <Outlet />
        </main>

        {/* Bottom navigation — Instagram-style tabs */}
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-background/80 backdrop-blur-lg border-t pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-around h-16 px-2">
            {links.map((link) => {
              const isActive = link.end ? location.pathname === link.to : location.pathname.startsWith(link.to);
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all min-w-[60px]",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  <link.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                  <span className={cn("text-[10px]", isActive && "font-semibold")}>{link.label}</span>
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
          <span className="text-lg font-bold font-heading tracking-tight text-foreground">Staffly</span>
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