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
  Shield, Menu, X, LogOut, Moon, Sun, Clock, MapPin, Megaphone, MessageCircle,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "next-themes";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";

const SidebarContext = createContext<{ collapsed: boolean; setCollapsed: (v: boolean) => void }>({ collapsed: false, setCollapsed: () => {} });

export function useSidebarCollapsed() {
  return useContext(SidebarContext);
}

const ALL_MOBILE_LINKS = [
  { to: "/app", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Inicio" },
  { to: "/app/periods", icon: CalendarDays, label: "Periodos", module: "periods", section: "Nómina" },
  { to: "/app/import", icon: Upload, label: "Importar horas", module: "import", section: "Nómina" },
  { to: "/app/movements", icon: DollarSign, label: "Novedades", module: "movements", section: "Nómina" },
  { to: "/app/summary", icon: FileSpreadsheet, label: "Resumen", module: "summary", section: "Nómina" },
  { to: "/app/reports", icon: BarChart3, label: "Reportes", module: "reports", section: "Nómina" },
  { to: "/app/shifts", icon: CalendarDays, label: "Turnos", module: "shifts", section: "Programación" },
  { to: "/app/timeclock", icon: Clock, label: "Reloj", module: "shifts", section: "Programación" },
  { to: "/app/employees", icon: Users, label: "Empleados", module: "employees", section: "Equipo" },
  { to: "/app/directory", icon: ContactRound, label: "Directorio", module: "employees", section: "Equipo" },
  { to: "/app/invite", icon: Smartphone, label: "Invitar", module: "employees", section: "Equipo" },
  { to: "/app/concepts", icon: Tags, label: "Conceptos", module: "concepts", section: "Equipo" },
  { to: "/app/clients", icon: Building2, label: "Clientes", module: "clients", section: "Clientes" },
  { to: "/app/locations", icon: MapPin, label: "Ubicaciones", module: "locations", section: "Clientes" },
  { to: "/app/announcements", icon: Megaphone, label: "Anuncios", module: "announcements", section: "Comunicación" },
  { to: "/app/chat", icon: MessageCircle, label: "Chat interno", module: null, section: "Comunicación" },
];

const OWNER_MOBILE_LINKS = [
  { to: "/app/global", icon: Globe, label: "Vista global", module: null, section: "Administración" },
  { to: "/app/companies", icon: Building2, label: "Empresas", module: null, section: "Administración" },
  { to: "/app/users", icon: Shield, label: "Usuarios", module: null, section: "Administración" },
];

// Bottom bar shows first 4 + "more"
const BOTTOM_BAR_KEYS = ["/app", "/app/movements", "/app/summary", "/app/employees"];

export default function AdminLayout() {
  const { user, role, loading, signOut, hasModuleAccess } = useAuth();
  const { companies, selectedCompanyId, setSelectedCompanyId, isModuleActive } = useCompany();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved !== null ? saved === "true" : true;
  });
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
              <div className="h-7 w-7 rounded-xl bg-primary/10 flex items-center justify-center">
                <img src="/favicon.png" alt="stafly" className="h-4 w-4 object-contain" />
              </div>
              <span className="text-sm font-bold font-heading">stafly</span>
            </div>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button className="p-2 rounded-lg hover:bg-accent transition-colors">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0 flex flex-col h-full">
                <SheetHeader className="p-4 border-b shrink-0">
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
                <div className="border-t p-3 space-y-1 shrink-0">
                  <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent w-full transition-colors"
                  >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {theme === "dark" ? "Modo claro" : "Modo oscuro"}
                  </button>
                  <LogoutConfirmDialog onConfirm={() => { signOut(); setSheetOpen(false); }}>
                    <button
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 w-full transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Cerrar sesión
                    </button>
                  </LogoutConfirmDialog>
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
    <SidebarContext.Provider value={{ collapsed, setCollapsed: (v: boolean) => { setCollapsed(v); localStorage.setItem("sidebar-collapsed", String(v)); } }}>
      <div className="min-h-screen bg-background">
        <AdminSidebar />
        <main className={cn("transition-all duration-300 ease-in-out p-6 lg:p-8 animate-fade-in", collapsed ? "ml-[60px]" : "ml-[250px]")}>
          <Outlet />
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
