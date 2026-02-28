import { useState } from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import { User, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import EmployeeChatWidget from "@/components/EmployeeChatWidget";
import NotificationBell from "@/components/NotificationBell";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import staflyLogo from "@/assets/stafly-logo.png";
import { FloatingDock } from "@/components/navigation/FloatingDock";
import { AppLauncher } from "@/components/navigation/AppLauncher";
import { EMPLOYEE_NAV_ITEMS, EMPLOYEE_DEFAULT_PINS } from "@/components/navigation/nav-items";
import { useNavPreferences } from "@/hooks/useNavPreferences";

export default function EmployeeLayout() {
  const { user, role, employeeActive, loading, signOut } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const { pinnedIds, togglePin, maxPins } = useNavPreferences(EMPLOYEE_DEFAULT_PINS);

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
          <h2 className="text-xl font-bold text-foreground font-heading">Cuenta inactiva</h2>
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
      <div className="min-h-[100dvh] bg-[hsl(var(--background))] flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 shrink-0 bg-card/95 backdrop-blur-2xl border-b border-border/50 shadow-2xs">
          <div className="flex items-center justify-between px-5 h-14">
            <div className="flex items-center gap-2">
              <img src={staflyLogo} alt="stafly" className="h-8 w-auto" style={{ imageRendering: "auto" }} />
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5 pb-24 animate-fade-in">
          <Outlet />
        </main>

        {/* Floating Dock */}
        <FloatingDock
          items={EMPLOYEE_NAV_ITEMS}
          pinnedIds={pinnedIds}
          onOpenLauncher={() => setLauncherOpen(true)}
          variant="portal"
        />

        {/* App Launcher */}
        <AppLauncher
          open={launcherOpen}
          onClose={() => setLauncherOpen(false)}
          items={EMPLOYEE_NAV_ITEMS}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          maxPins={maxPins}
          onSignOut={signOut}
          variant="portal"
        />

        <EmployeeChatWidget />
      </div>
    );
  }

  // Desktop — centered clean layout with dock
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-xl border-b border-border/50 shadow-2xs">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-2.5">
            <img src={staflyLogo} alt="stafly" className="h-9 w-auto" style={{ imageRendering: "auto" }} />
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 pb-24 animate-fade-in">
        <Outlet />
      </main>

      {/* Floating Dock */}
      <FloatingDock
        items={EMPLOYEE_NAV_ITEMS}
        pinnedIds={pinnedIds}
        onOpenLauncher={() => setLauncherOpen(true)}
        variant="portal"
      />

      {/* App Launcher */}
      <AppLauncher
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
        items={EMPLOYEE_NAV_ITEMS}
        pinnedIds={pinnedIds}
        onTogglePin={togglePin}
        maxPins={maxPins}
        onSignOut={signOut}
        variant="portal"
      />

      <EmployeeChatWidget />
    </div>
  );
}
