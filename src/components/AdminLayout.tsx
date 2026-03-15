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
import { ADMIN_NAV_ITEMS, ADMIN_DEFAULT_PINS } from "@/components/navigation/nav-items";
import { useNavPreferences } from "@/hooks/useNavPreferences";
import { supabase } from "@/integrations/supabase/client";
import { NavItem } from "@/components/navigation/nav-items";
import CompanySwitcher from "@/components/CompanySwitcher";

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
  const { user, role, loading, signOut, hasModuleAccess } = useAuth();
  const { companies, selectedCompanyId, setSelectedCompanyId, isModuleActive } = useCompany();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved !== null ? saved === "true" : true;
  });
  const isMobile = useIsMobile();
  const location = useLocation();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const { pinnedIds, togglePin, maxPins } = useNavPreferences(ADMIN_DEFAULT_PINS);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (role !== 'developer' && role !== 'owner' && role !== 'admin' && role !== 'manager') return <Navigate to="/auth" replace />;

  const isLinkVisible = (module: string | null) => {
    if (!module) return true;
    if (!isModuleActive(module)) return false;
    if (role === 'developer' || role === 'owner' || role === 'admin') return true;
    if (role === 'manager' || role === 'supervisor') return hasModuleAccess(module, 'view');
    return false;
  };

  const visibleItems = ADMIN_NAV_ITEMS.filter(item => {
    if (!isLinkVisible(item.module)) return false;
    if (item.roles && !item.roles.includes(role ?? '')) return false;
    return true;
  });

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-xl border-b border-border/40">
          <div className="flex items-center justify-between px-4 h-13">
            <div className="flex items-center gap-2.5">
              <StaflyLogo size={22} markOnly />
              <MobilePageTitle items={visibleItems} />
            </div>
            <div className="flex items-center gap-1">
              {companies.length > 1 && (
                <div className="max-w-[140px]">
                  <CompanySwitcher collapsed={false} />
                </div>
              )}
              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="p-4 animate-fade-in">
          <Outlet />
        </main>

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

        {/* CompanyActionGuard is now inside CompanySwitcher */}
      </div>
    );
  }

  // Desktop layout: Sidebar + TopBar + Content
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed: (v: boolean) => { setCollapsed(v); localStorage.setItem("sidebar-collapsed", String(v)); } }}>
      <div className="min-h-screen bg-background">
        <AdminSidebar />
        <TopBar collapsed={collapsed} />
        <CommandPalette />
        <main className={cn(
          "transition-all duration-300 ease-in-out min-h-[calc(100vh-3.5rem)]",
          collapsed ? "ml-[60px]" : "ml-[240px]",
          "p-6 lg:p-8 pt-6"
        )}>
          <div className="animate-fade-in max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
