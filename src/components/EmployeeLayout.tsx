import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation, Navigate, useNavigate } from "react-router-dom";
import { User, Camera, Upload, RotateCcw, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePortalModules } from "@/hooks/usePortalModules";
import EmployeeChatWidget from "@/components/EmployeeChatWidget";
import NotificationBell from "@/components/NotificationBell";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { PortalBottomNav } from "@/components/portal/PortalBottomNav";
import { PortalMoreSheet } from "@/components/portal/PortalMoreSheet";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PortalPageTitle } from "@/components/portal/PortalPageTitle";
import { PhotoGate } from "@/components/portal/PhotoGate";
import { formatPersonName } from "@/lib/format-helpers";

export default function EmployeeLayout() {
  const { user, role, employeeActive, employeeId, loading, signOut, fullName } = useAuth();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { isModuleEnabled, enabledModules, loading: modulesLoading } = usePortalModules();
  const [moreOpen, setMoreOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(undefined);
  const [empName, setEmpName] = useState<string>("");

  // Fetch employee avatar + name
  useEffect(() => {
    if (!employeeId) return;
    supabase
      .from("employees")
      .select("avatar_url, first_name, last_name")
      .eq("id", employeeId)
      .single()
      .then(({ data }) => {
        setAvatarUrl(data?.avatar_url ?? null);
        if (data) setEmpName(formatPersonName(`${data.first_name} ${data.last_name}`));
      });
  }, [employeeId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (role !== "employee") return <Navigate to="/auth" replace />;

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

  // Loading avatar status
  if (avatarUrl === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Photo gate
  if (!avatarUrl) {
    return (
      <PhotoGate
        employeeId={employeeId!}
        onPhotoUploaded={(url) => setAvatarUrl(url)}
        onSignOut={signOut}
      />
    );
  }

  if (isMobile) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        {/* Slim top bar */}
        <header className="sticky top-0 z-30 shrink-0 bg-card/95 backdrop-blur-2xl border-b border-border/40">
          <div className="flex items-center justify-between px-4 h-12">
            <div className="flex items-center gap-2">
              <StaflyLogo size={22} />
              <PortalPageTitle />
            </div>
            <NotificationBell />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 py-4 pb-20 animate-fade-in">
          <Outlet />
        </main>

        {/* Bottom nav */}
        <PortalBottomNav
          onOpenMore={() => setMoreOpen(true)}
          showShifts={isModuleEnabled("shifts")}
          showClock={isModuleEnabled("clock")}
          showEarnings={isModuleEnabled("earnings")}
        />

        {/* More sheet */}
        <PortalMoreSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          onSignOut={signOut}
          employeeName={empName}
          avatarUrl={avatarUrl}
          enabledModules={enabledModules}
          isModuleEnabled={isModuleEnabled}
        />

        <EmployeeChatWidget />
      </div>
    );
  }

  // Desktop — centered clean layout with bottom nav
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

      <PortalBottomNav
        onOpenMore={() => setMoreOpen(true)}
        showShifts={isModuleEnabled("shifts")}
        showClock={isModuleEnabled("clock")}
        showEarnings={isModuleEnabled("earnings")}
      />

      <PortalMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onSignOut={signOut}
        employeeName={empName}
        avatarUrl={avatarUrl}
        enabledModules={enabledModules}
        isModuleEnabled={isModuleEnabled}
      />

      <EmployeeChatWidget />
    </div>
  );
}
