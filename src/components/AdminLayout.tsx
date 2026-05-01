import React, { createContext, useContext, useState, useMemo, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import TopBar from "./TopBar";
import { CommandPalette } from "@/components/CommandPalette";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import NotificationBell from "@/components/NotificationBell";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { FloatingDock } from "@/components/navigation/FloatingDock";
import { AppLauncher } from "@/components/navigation/AppLauncher";
import { AdminBottomNav } from "@/components/navigation/AdminBottomNav";
import { MoreSheet } from "@/components/navigation/MoreSheet";
import { ADMIN_NAV_ITEMS, ADMIN_DEFAULT_PINS } from "@/components/navigation/nav-items";
import { useNavPreferences } from "@/hooks/useNavPreferences";
import { supabase } from "@/integrations/supabase/client";
import { NavItem } from "@/components/navigation/nav-items";
import CompanySwitcher from "@/components/CompanySwitcher";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { AdminProductSwitcher } from "@/components/admin/AdminProductSwitcher";
import { SoundStatusControl } from "@/components/SoundStatusControl";
import { safeLocalStorage } from "@/lib/safe-storage";

function MobilePageTitle({ items }: { items: NavItem[] }) {
  const location = useLocation();
  const current = items.find(item => {
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

const SidebarContext = createContext<{ collapsed: boolean; setCollapsed: (v: boolean) => void }>({ collapsed: false, setCollapsed: () => {} });

export function useSidebarCollapsed() {
  return useContext(SidebarContext);
}

export default function AdminLayout() {
  const {
    user, role, session, loading: authLoading, signOut, hasModuleAccess,
    canAccessAdminForCompany, canAccessPortalForCompany, getRoleForCompany,
    employeeId, companyRoles, allEmployeeIds, activeMode, allRoles,
  } = useAuth();
  const { companies, selectedCompanyId, selectedCompany, switchCompany, isModuleActive, loading: companyLoading } = useCompany();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = safeLocalStorage.getItem("sidebar-collapsed");
    return saved !== null ? saved === "true" : true;
  });
  const [recoveringAdminCompanyId, setRecoveringAdminCompanyId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const location = useLocation();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const { pinnedIds, togglePin, maxPins } = useNavPreferences(ADMIN_DEFAULT_PINS);

  // Effective role + admin gate for the CURRENT tenant (or global mode for
  // platform staff). Prevents company_owner from JKitchen entering Quality
  // admin shell.
  const effectiveRole = getRoleForCompany(selectedCompanyId);
  const canAccessAdminHere = canAccessAdminForCompany(selectedCompanyId);
  const canAccessPortalHere = canAccessPortalForCompany(selectedCompanyId);
  const isFounderFinanceRoute = location.pathname === "/app/founder-finance" || location.pathname.startsWith("/app/founder-finance/");
  const hasFounderAccess = role === "developer" || role === "owner" || allRoles.has("founder");
  const fallbackAdminCompanyId = useMemo(() => {
    if (canAccessAdminHere) return null;
    return companies.find((company) => canAccessAdminForCompany(company.id))?.id ?? null;
  }, [canAccessAdminForCompany, canAccessAdminHere, companies]);
  const authReady = !authLoading;
  const companyReady = !companyLoading;
  const shouldRecoverAdmin = authReady && companyReady && !!user && !canAccessAdminHere && !!fallbackAdminCompanyId && fallbackAdminCompanyId !== selectedCompanyId;

  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!selectedCompanyId) return;
    async function fetchBadges() {
      const [ticketsRes, shiftReqRes] = await Promise.all([
        supabase.from("employee_tickets").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).in("status", ["new", "in_progress"]),
        supabase.from("shift_assignments").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).eq("status", "pending"),
      ]);
      setBadgeCounts({
        tickets: ticketsRes.count ?? 0,
        shift_requests: shiftReqRes.count ?? 0,
      });
    }
    fetchBadges();
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, [selectedCompanyId]);

  useEffect(() => {
    console.info("[post-login-debug]", {
      step: "admin-layout",
      userId: user?.id ?? null,
      sessionExists: !!session,
      authLoading,
      companyLoading,
      selectedCompanyId,
      selectedCompanyName: selectedCompany?.name ?? null,
      companies: companies.map((company) => ({ id: company.id, name: company.name })),
      companyRoles,
      allEmployeeIds,
      activeMode,
      canAccessAdminForSelected: canAccessAdminForCompany(selectedCompanyId),
      canAccessPortalForSelected: canAccessPortalForCompany(selectedCompanyId),
      redirectTarget: shouldRecoverAdmin ? "/app" : !canAccessAdminHere && canAccessPortalHere ? "/portal" : null,
    });

    if (!authReady || !companyReady || !user) return;

    if (shouldRecoverAdmin) {
      setRecoveringAdminCompanyId(fallbackAdminCompanyId);
      switchCompany(fallbackAdminCompanyId);
      return;
    }

    if (recoveringAdminCompanyId && selectedCompanyId === recoveringAdminCompanyId) {
      setRecoveringAdminCompanyId(null);
    }
  }, [
    canAccessAdminHere,
    fallbackAdminCompanyId,
    authLoading,
    companyLoading,
    recoveringAdminCompanyId,
    selectedCompanyId,
    selectedCompany,
    switchCompany,
    user,
    session,
    companyRoles,
    allEmployeeIds,
    activeMode,
    canAccessPortalHere,
    shouldRecoverAdmin,
    authReady,
    companyReady,
  ]);

  if (!authReady || !companyReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (recoveringAdminCompanyId || shouldRecoverAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center space-y-3">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-base font-semibold text-foreground">Restoring admin access</p>
          <p className="text-sm text-muted-foreground">
            Switching you to a company where you have admin permissions.
          </p>
        </div>
      </div>
    );
  }

  // Hard tenant guard: a user that is admin in JKitchen but only employee in
  // Quality must NOT see admin shell while Quality is selected. Send them to
  // their portal in that company instead.
  if (!canAccessAdminHere) {
    if (isFounderFinanceRoute && hasFounderAccess) {
      return (
        <div className="min-h-screen bg-background">
          <main className="p-6 lg:p-10 pt-6">
            <div className="animate-fade-in max-w-[1500px] mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      );
    }
    if (canAccessPortalHere) return <Navigate to="/portal" replace />;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-base font-semibold text-foreground">No admin access for this company</p>
          <p className="text-sm text-muted-foreground">
            You don't have administration permissions for the selected company.
            Switch company or contact your owner.
          </p>
        </div>
      </div>
    );
  }

  const isLinkVisible = (module: string | null) => {
    if (!module) return true;
    if (!isModuleActive(module)) return false;
    if (effectiveRole === 'developer' || effectiveRole === 'owner' || effectiveRole === 'company_owner' || effectiveRole === 'admin') return true;
    if (effectiveRole === 'manager' || effectiveRole === 'supervisor') return hasModuleAccess(module, 'view');
    return false;
  };

  const visibleItems = ADMIN_NAV_ITEMS.filter(item => {
    if (!isLinkVisible(item.module)) return false;
    if (item.roles && !item.roles.includes(effectiveRole ?? '')) return false;
    return true;
  });

  if (isMobile) {
    // Phase A: Premium 5-tab AdminBottomNav + grouped MoreSheet.
    // Fallback to legacy FloatingDock + AppLauncher with ?nav=legacy.
    const useLegacyNav = typeof window !== "undefined"
      && new URLSearchParams(window.location.search).get("nav") === "legacy";

    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 bg-card/85 backdrop-blur-xl border-b border-border/40">
          <div className="flex items-center justify-between px-3 h-13">
            <div className="flex items-center gap-2 min-w-0">
              <StaflyLogo size={22} markOnly />
              <MobilePageTitle items={visibleItems} />
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <AdminProductSwitcher compact />
              <ModeSwitcher compact />
              <SoundStatusControl compact />
              <NotificationBell />
              {companies.length > 1 && (
                <div className="ml-0.5">
                  <CompanySwitcher collapsed />
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="p-4 animate-fade-in">
          <Outlet />
        </main>

        {useLegacyNav ? (
          <>
            <FloatingDock
              items={visibleItems}
              pinnedIds={pinnedIds}
              onOpenLauncher={() => setLauncherOpen(true)}
              variant="admin"
            />
            <AppLauncher
              open={launcherOpen}
              onClose={() => setLauncherOpen(false)}
              items={visibleItems}
              pinnedIds={pinnedIds}
              onTogglePin={togglePin}
              maxPins={maxPins}
              onSignOut={signOut}
              variant="admin"
            />
          </>
        ) : (
          <>
            <AdminBottomNav
              onOpenMore={() => setLauncherOpen(true)}
              moreOpen={launcherOpen}
            />
            <MoreSheet
              open={launcherOpen}
              onClose={() => setLauncherOpen(false)}
              items={visibleItems}
              pinnedIds={pinnedIds}
              onTogglePin={togglePin}
              maxPins={maxPins}
              onSignOut={signOut}
              badgeCounts={badgeCounts}
            />
          </>
        )}
      </div>
    );
  }

  // Desktop layout: Sidebar + TopBar + Content
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed: (v: boolean) => { setCollapsed(v); safeLocalStorage.setItem("sidebar-collapsed", String(v)); } }}>
      <div className="min-h-screen bg-background">
        <AdminSidebar />
        <TopBar collapsed={collapsed} />
        <CommandPalette />
        <main className={cn(
          "transition-all duration-300 ease-in-out min-h-[calc(100vh-3.5rem)]",
          collapsed ? "ml-[68px]" : "ml-[256px]",
          "p-6 lg:p-10 pt-6"
        )}>
          <div className="animate-fade-in max-w-[1500px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
