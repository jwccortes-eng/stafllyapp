import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation, Navigate, useNavigate } from "react-router-dom";
import { User, LogOut, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import EmployeeChatWidget from "@/components/EmployeeChatWidget";
import NotificationBell from "@/components/NotificationBell";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { FloatingDock } from "@/components/navigation/FloatingDock";
import { AppLauncher } from "@/components/navigation/AppLauncher";
import { EMPLOYEE_NAV_ITEMS, EMPLOYEE_DEFAULT_PINS } from "@/components/navigation/nav-items";
import { useNavPreferences } from "@/hooks/useNavPreferences";
import { supabase } from "@/integrations/supabase/client";

/** Shows current page title in mobile portal header */
function PortalPageTitle() {
  const location = useLocation();
  const current = EMPLOYEE_NAV_ITEMS.find(item => {
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  });
  if (!current) return null;
  return (
    <span className="text-sm font-semibold text-foreground/80 truncate max-w-[140px]">
      {current.label}
    </span>
  );
}

export default function EmployeeLayout() {
  const { user, role, employeeActive, employeeId, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const { pinnedIds, togglePin, maxPins } = useNavPreferences(EMPLOYEE_DEFAULT_PINS);
  const [isClockedIn, setIsClockedIn] = useState(false);

  // Check active clock entry
  const checkClockStatus = useCallback(async () => {
    if (!employeeId) return;
    const { data } = await supabase.from("time_entries").select("id").eq("employee_id", employeeId).is("clock_out", null).limit(1);
    setIsClockedIn((data ?? []).length > 0);
  }, [employeeId]);

  useEffect(() => { checkClockStatus(); }, [checkClockStatus]);
  useEffect(() => {
    if (!employeeId) return;
    const ch = supabase.channel("emp-clock-status").on("postgres_changes", { event: "*", schema: "public", table: "time_entries", filter: `employee_id=eq.${employeeId}` }, () => checkClockStatus()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [employeeId, checkClockStatus]);

  const isOnClockPage = location.pathname.includes("/portal/clock");

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
        {/* Top bar with page context */}
        <header className="sticky top-0 z-30 shrink-0 bg-card/95 backdrop-blur-2xl border-b border-border/50 shadow-2xs">
          <div className="flex items-center justify-between px-5 h-14">
            <div className="flex items-center gap-2.5">
              <StaflyLogo size={24} />
              <PortalPageTitle />
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
            <StaflyLogo size={32} />
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
