import { useState, useEffect } from "react";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { saveIntendedRoute } from "@/lib/auth-session";
import { useLocation } from "react-router-dom";
import { Outlet, Navigate } from "react-router-dom";
import { User, Building2, ChevronDown, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePortalModules } from "@/hooks/usePortalModules";
import EmployeeChatWidget from "@/components/EmployeeChatWidget";
import NotificationBell from "@/components/NotificationBell";

import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { PortalBottomNav } from "@/components/portal/PortalBottomNav";
import { PortalMoreSheet } from "@/components/portal/PortalMoreSheet";
import { ProductSwitcher } from "@/components/portal/ProductSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { PortalPageTitle } from "@/components/portal/PortalPageTitle";
import { PhotoGate } from "@/components/portal/PhotoGate";
import { formatPersonName } from "@/lib/format-helpers";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";

const PHOTO_GATE_BYPASS_KEY = "stafly:photo-gate:bypass:v1";

export default function EmployeeLayout() {
  const { user, role, employeeActive, employeeId, allEmployeeIds, resolveEmployeeForCompany, loading, signOut, fullName, canAccessAdmin, canAccessAdminForCompany } = useAuth();
  const { companies, selectedCompanyId, selectedCompany, switchCompany } = useCompany();
  const { stableEmployeeId, isResolvingEmployee } = useEffectiveEmployee();
  const isMobile = useIsMobile();
  const { isModuleEnabled, enabledModules, loading: modulesLoading } = usePortalModules();
  const [moreOpen, setMoreOpen] = useState(false);
  const [chromeMode, setChromeMode] = useState<"legacy" | "shell">("legacy");
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(undefined);
  const [empName, setEmpName] = useState<string>("");
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  // Session-scoped soft-bypass: lets a worker reach Documents/Shifts without
  // a photo. Cleared on sign-out or successful upload.
  const [photoGateBypass, setPhotoGateBypass] = useState<boolean>(() => {
    try { return typeof window !== "undefined" && window.sessionStorage.getItem(PHOTO_GATE_BYPASS_KEY) === "1"; }
    catch { return false; }
  });

  const currentEmployeeId = selectedCompanyId
    ? resolveEmployeeForCompany(selectedCompanyId)
    : employeeId;
  const renderEmployeeId = currentEmployeeId || stableEmployeeId || employeeId;

  const employeeCompanyIds = new Set(allEmployeeIds.map(e => e.companyId));
  const employeeCompanies = companies.filter(c => employeeCompanyIds.has(c.id));
  const hasMultipleCompanies = employeeCompanies.length > 1;

  useEffect(() => {
    if (!renderEmployeeId) return;
    let cancelled = false;
    setAvatarLoadFailed(false);
    // Safety net: if the avatar query hangs or silently fails, never trap the
    // worker on an infinite spinner. After 8s, surface PhotoGate with an
    // explicit retry + soft-bypass so they can still reach docs/shifts.
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setAvatarUrl((prev) => (prev === undefined ? null : prev));
      setAvatarLoadFailed(true);
    }, 8000);
    supabase
      .from("employees")
      .select("avatar_url, first_name, last_name")
      .eq("id", renderEmployeeId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        clearTimeout(timeout);
        if (error) {
          setAvatarLoadFailed(true);
          setAvatarUrl(null);
          return;
        }
        setAvatarUrl(data?.avatar_url ?? null);
        if (data) setEmpName(formatPersonName(`${data.first_name} ${data.last_name}`));
      });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [renderEmployeeId]);

  const enablePhotoGateBypass = () => {
    try { window.sessionStorage.setItem(PHOTO_GATE_BYPASS_KEY, "1"); } catch { /* noop */ }
    setPhotoGateBypass(true);
  };

  const handleSignOut = () => {
    try { window.sessionStorage.removeItem(PHOTO_GATE_BYPASS_KEY); } catch { /* noop */ }
    signOut();
  };

  if (loading && !renderEmployeeId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!renderEmployeeId) return <Navigate to={canAccessAdmin ? "/app" : "/auth"} replace />;

  const effectiveEmployeeId = renderEmployeeId;

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

  if (avatarUrl === undefined && !isResolvingEmployee) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!avatarUrl && !photoGateBypass) {
    return (
      <PhotoGate
        employeeId={effectiveEmployeeId!}
        onPhotoUploaded={(url) => {
          try { window.sessionStorage.removeItem(PHOTO_GATE_BYPASS_KEY); } catch { /* noop */ }
          setPhotoGateBypass(false);
          setAvatarUrl(url);
        }}
        onSignOut={handleSignOut}
        onContinueWithoutPhoto={enablePhotoGateBypass}
        loadFailed={avatarLoadFailed}
      />
    );
  }

  const companySwitcher = hasMultipleCompanies ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-xs font-medium text-foreground max-w-[160px]">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{selectedCompany?.name ?? "Empresa"}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {employeeCompanies.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onClick={() => switchCompany(c.id)}
            className="flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              {c.logo_url ? (
                <img src={c.logo_url} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
              ) : (
                <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-3 w-3 text-primary" />
                </div>
              )}
              <span className="truncate text-xs">{c.name}</span>
            </div>
            {c.id === selectedCompanyId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  // Tenant-scoped admin check: workers in this tenant must NOT see "Panel Admin"
  // even if they have admin role in another company.
  const canAccessAdminHere = canAccessAdminForCompany(selectedCompanyId);

  const navAndSheet = (
    <>
      <PortalBottomNav onOpenMore={() => setMoreOpen(true)} moreOpen={moreOpen} />
      <PortalMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onSignOut={signOut}
        employeeName={empName}
        avatarUrl={avatarUrl}
        enabledModules={enabledModules}
        isModuleEnabled={isModuleEnabled}
        canAccessAdmin={canAccessAdminHere}
      />
      <EmployeeChatWidget />
    </>
  );

  if (isMobile) {
    return (
      <div className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-background flex flex-col">
        <header
          className="sticky top-0 z-30 shrink-0 bg-background/80 backdrop-blur-2xl border-b border-border/20"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="flex items-center justify-between gap-2 px-4 h-12 max-w-full">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <StaflyLogo size={20} />
              <div className="min-w-0 flex-1">
                {companySwitcher || <PortalPageTitle />}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <NotificationBell />
            </div>
          </div>
        </header>

        <main
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden w-full max-w-full animate-fade-in",
            chromeMode === "legacy" && "px-4 py-4"
          )}
        >
          <Outlet context={{ openMore: () => setMoreOpen(true), chromeMode, setChromeMode }} />
        </main>

        {navAndSheet}
      </div>
    );
  }

  // Desktop
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-xl border-b border-border/30 shadow-2xs">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-2.5">
            <StaflyLogo size={32} />
            {companySwitcher}
          </div>
          <div className="flex items-center gap-2">
            <ProductSwitcher />
            <ModeSwitcher />
            <NotificationBell />
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
        <Outlet context={{ openMore: () => setMoreOpen(true), chromeMode, setChromeMode }} />
      </main>
      {navAndSheet}
    </div>
  );
}
