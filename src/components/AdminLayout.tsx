import React, { createContext, useContext, useState } from "react";
import { Navigate, Outlet, NavLink, useLocation } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LayoutDashboard, CalendarDays, Upload, DollarSign, FileSpreadsheet,
  BarChart3, Users, Tags, Smartphone, ContactRound, Globe, Building2,
  Shield, Menu, X, LogOut, Moon, Sun,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "next-themes";

const SidebarContext = createContext<{ collapsed: boolean; setCollapsed: (v: boolean) => void }>({ collapsed: false, setCollapsed: () => {} });

export function useSidebarCollapsed() {
  return useContext(SidebarContext);
}

const ALL_MOBILE_LINKS = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Nómina" },
  { to: "/admin/periods", icon: CalendarDays, label: "Periodos", module: "periods", section: "Nómina" },
  { to: "/admin/import", icon: Upload, label: "Importar", module: "import", section: "Nómina" },
  { to: "/admin/movements", icon: DollarSign, label: "Novedades", module: "movements", section: "Nómina" },
  { to: "/admin/summary", icon: FileSpreadsheet, label: "Resumen", module: "summary", section: "Nómina" },
  { to: "/admin/reports", icon: BarChart3, label: "Reportes", module: "reports", section: "Nómina" },
  { to: "/admin/employees", icon: Users, label: "Empleados", module: "employees", section: "Catálogos" },
  { to: "/admin/concepts", icon: Tags, label: "Conceptos", module: "concepts", section: "Catálogos" },
  { to: "/admin/invite", icon: Smartphone, label: "Invitar", module: "employees", section: "Catálogos" },
  { to: "/admin/directory", icon: ContactRound, label: "Directorio", module: "employees", section: "Catálogos" },
];

const OWNER_MOBILE_LINKS = [
  { to: "/admin/global", icon: Globe, label: "Vista global", module: null, section: "Administración" },
  { to: "/admin/companies", icon: Building2, label: "Empresas", module: null, section: "Administración" },
  { to: "/admin/users", icon: Shield, label: "Usuarios", module: null, section: "Administración" },
];

// Bottom bar shows first 4 + "more"
const BOTTOM_BAR_KEYS = ["/admin", "/admin/movements", "/admin/summary", "/admin/employees"];

export default function AdminLayout() {
  const { user, role, loading, signOut, hasModuleAccess } = useAuth();
  const { companies, selectedCompanyId, setSelectedCompanyId, isModuleActive } = useCompany();
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

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

  const isActive = (to: string, end?: boolean) => {
    if (end) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(to + "/");
  };

  const visibleLinks = ALL_MOBILE_LINKS.filter(l => isLinkVisible(l.module));
  const ownerLinks = role === 'owner' ? OWNER_MOBILE_LINKS : [];
  const bottomLinks = BOTTOM_BAR_KEYS.map(k => visibleLinks.find(l => l.to === k)).filter(Boolean) as typeof ALL_MOBILE_LINKS;

  // Group links by section for sheet
  const sections = new Map<string, typeof ALL_MOBILE_LINKS>();
  for (const l of visibleLinks) {
    if (!sections.has(l.section)) sections.set(l.section, []);
    sections.get(l.section)!.push(l);
  }
  if (ownerLinks.length > 0) sections.set("Administración", ownerLinks as any);

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
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button className="p-2 rounded-lg hover:bg-accent transition-colors">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle className="text-sm font-heading">Menú</SheetTitle>
                </SheetHeader>
                {/* Company selector */}
                {companies.length > 1 && (
                  <div className="px-4 py-3 border-b">
                    <Select value={selectedCompanyId ?? ""} onValueChange={(v) => { setSelectedCompanyId(v); }}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
                  {Array.from(sections.entries()).map(([label, links]) => (
                    <div key={label}>
                      <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                      <div className="space-y-0.5">
                        {links.map(link => {
                          const active = isActive(link.to, link.end);
                          return (
                            <NavLink
                              key={link.to}
                              to={link.to}
                              onClick={() => setSheetOpen(false)}
                              className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                active
                                  ? "bg-primary/10 text-primary font-semibold"
                                  : "text-foreground hover:bg-accent"
                              )}
                            >
                              <link.icon className={cn("h-4 w-4", active && "text-primary")} />
                              {link.label}
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>
                <div className="border-t p-3 space-y-1">
                  <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent w-full transition-colors"
                  >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {theme === "dark" ? "Modo claro" : "Modo oscuro"}
                  </button>
                  <button
                    onClick={() => { signOut(); setSheetOpen(false); }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 w-full transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Content */}
        <main className="p-4 animate-fade-in">
          <Outlet />
        </main>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-card border-t shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          <div className="flex items-stretch h-16">
            {bottomLinks.map(link => {
              const active = isActive(link.to, link.end);
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <link.icon className={cn("h-5 w-5", active && "text-primary")} />
                  {link.label}
                </NavLink>
              );
            })}
            <button
              onClick={() => setSheetOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground"
            >
              <Menu className="h-5 w-5" />
              Más
            </button>
          </div>
        </nav>
      </div>
    );
  }

  // Desktop layout
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="min-h-screen bg-background">
        <AdminSidebar />
        <main className={cn("transition-all duration-200 p-6 lg:p-8 animate-fade-in", collapsed ? "ml-14" : "ml-60")}>
          <Outlet />
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
