import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { FloatingDock } from "@/components/navigation/FloatingDock";
import { AppLauncher } from "@/components/navigation/AppLauncher";
import { ADMIN_NAV_ITEMS, ADMIN_DEFAULT_PINS } from "@/components/navigation/nav-items";
import { useNavPreferences } from "@/hooks/useNavPreferences";
import { supabase } from "@/integrations/supabase/client";
import CompanyActionGuard from "@/components/CompanyActionGuard";

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
  const [pendingCompanyId, setPendingCompanyId] = useState<string | null>(null);

  // Badge counts
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
  if (role !== 'owner' && role !== 'admin' && role !== 'manager') return <Navigate to="/auth" replace />;

  const isLinkVisible = (module: string | null) => {
    if (!module) return true;
    if (!isModuleActive(module)) return false;
    if (role === 'owner' || role === 'admin') return true;
    if (role === 'manager') return hasModuleAccess(module, 'view');
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
        {/* Compact top bar */}
        <header className="sticky top-0 z-30 bg-card/85 backdrop-blur-xl border-b border-border/30">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2.5">
              <StaflyLogo size={28} />
            </div>
            <div className="flex items-center gap-1">
              {companies.length > 1 && (
                <Select value={selectedCompanyId ?? ""} onValueChange={(id) => setPendingCompanyId(id)}>
                  <SelectTrigger className="h-8 w-auto max-w-[130px] text-[11px] rounded-xl bg-muted/30 border-border/30">
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="p-4 animate-fade-in">
          <Outlet />
        </main>

        {/* Floating Dock */}
        <FloatingDock
          items={visibleItems}
          pinnedIds={pinnedIds}
          onOpenLauncher={() => setLauncherOpen(true)}
          variant="admin"
        />

        {/* App Launcher */}
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

        {/* Company switch guard (mobile) */}
        <CompanyActionGuard
          open={!!pendingCompanyId && pendingCompanyId !== selectedCompanyId}
          onOpenChange={(v) => { if (!v) setPendingCompanyId(null); }}
          title="Cambiar de empresa"
          description="Estás a punto de cambiar el contexto a otra empresa. Confirma tu contraseña para continuar."
          requirePassword
          onConfirm={() => {
            if (pendingCompanyId) setSelectedCompanyId(pendingCompanyId);
            setPendingCompanyId(null);
          }}
        />
      </div>
    );
  }

  // Desktop layout — keep sidebar + add dock
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed: (v: boolean) => { setCollapsed(v); localStorage.setItem("sidebar-collapsed", String(v)); } }}>
      <div className="min-h-screen bg-background">
        <AdminSidebar />
        <CommandPalette />
        <main className={cn(
          "transition-all duration-300 ease-in-out p-6 lg:p-8 pb-24 animate-fade-in",
          collapsed ? "ml-[60px]" : "ml-[250px]"
        )}>
          <Outlet />
        </main>

        {/* Floating Dock on desktop too */}
        <FloatingDock
          items={visibleItems}
          pinnedIds={pinnedIds}
          onOpenLauncher={() => setLauncherOpen(true)}
          variant="admin"
        />

        {/* App Launcher */}
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
      </div>
    </SidebarContext.Provider>
  );
}
