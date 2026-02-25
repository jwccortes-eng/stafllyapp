import { NavLink, useLocation } from "react-router-dom";

import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Upload,
  Tags,
  FileSpreadsheet,
  BarChart3,
  LogOut,
  DollarSign,
  Shield,
  Building2,
  Globe,
  PanelLeftClose,
  PanelLeft,
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebarCollapsed } from "./AdminLayout";

const sections = [
  {
    label: "Nómina",
    links: [
      { to: "/admin", icon: LayoutDashboard, label: "Dashboard", module: null, end: true },
      { to: "/admin/periods", icon: CalendarDays, label: "Periodos", module: "periods" },
      { to: "/admin/import", icon: Upload, label: "Importar", module: "import" },
      { to: "/admin/movements", icon: DollarSign, label: "Novedades", module: "movements" },
      { to: "/admin/summary", icon: FileSpreadsheet, label: "Resumen", module: "summary" },
      { to: "/admin/reports", icon: BarChart3, label: "Reportes", module: "reports" },
    ],
  },
  {
    label: "Catálogos",
    links: [
      { to: "/admin/employees", icon: Users, label: "Empleados", module: "employees" },
      { to: "/admin/concepts", icon: Tags, label: "Conceptos", module: "concepts" },
      { to: "/admin/invite", icon: Smartphone, label: "Invitar", module: "employees" },
    ],
  },
];

const ownerLinks = [
  { to: "/admin/global", icon: Globe, label: "Vista global" },
  { to: "/admin/companies", icon: Building2, label: "Empresas" },
  { to: "/admin/users", icon: Shield, label: "Usuarios" },
];

export default function AdminSidebar() {
  const { signOut, role, hasModuleAccess } = useAuth();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const location = useLocation();
  const { collapsed, setCollapsed } = useSidebarCollapsed();

  const isLinkVisible = (module: string | null) => {
    if (!module) return true;
    if (role === 'owner' || role === 'admin') return true;
    if (role === 'manager') return hasModuleAccess(module, 'view');
    return false;
  };

  const isActive = (to: string, end?: boolean) => {
    if (end) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(to + "/");
  };

  const roleLabel = role === 'owner' ? 'Dueño' : role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Usuario';

  const renderLink = (link: { to: string; icon: any; label: string; module?: string | null; end?: boolean }) => {
    const active = isActive(link.to, link.end);
    const content = (
      <NavLink
        to={link.to}
        className={cn(
          "flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all",
          collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        <link.icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-primary")} />
        {!collapsed && link.label}
      </NavLink>
    );

    if (collapsed) {
      return (
        <Tooltip key={link.to} delayDuration={0}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{link.label}</TooltipContent>
        </Tooltip>
      );
    }
    return <div key={link.to}>{content}</div>;
  };

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-30 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-200",
      collapsed ? "w-14" : "w-60"
    )}>
      {/* Header */}
      <div className={cn("border-b border-sidebar-border flex items-center", collapsed ? "px-2 py-3 justify-center" : "px-5 py-4 gap-3")}>
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground text-sm font-bold">PW</span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground font-heading tracking-tight leading-none">
              Payroll Weekly
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">{roleLabel}</p>
          </div>
        )}
      </div>

      {/* Company selector */}
      {companies.length > 1 && !collapsed && (
        <div className="px-3 py-2 border-b border-sidebar-border">
          <Select value={selectedCompanyId ?? ""} onValueChange={setSelectedCompanyId}>
            <SelectTrigger className="h-8 text-xs">
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

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-3 overflow-y-auto">
        {sections.map((section) => {
          const visibleLinks = section.links.filter(l => isLinkVisible(l.module ?? null));
          if (visibleLinks.length === 0) return null;
          return (
            <div key={section.label}>
              {!collapsed && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleLinks.map(renderLink)}
              </div>
            </div>
          );
        })}

        {role === 'owner' && (
          <div>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Administración
              </p>
            )}
            {collapsed && <div className="border-t border-sidebar-border my-1.5" />}
            <div className="space-y-0.5">
              {ownerLinks.map(l => renderLink({ ...l, module: null }))}
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-2 py-2 border-t border-sidebar-border space-y-1">
        {/* Collapse toggle */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn(
                "flex items-center gap-3 rounded-lg text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all w-full",
                collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
              )}
            >
              {collapsed ? <PanelLeft className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
              {!collapsed && "Colapsar"}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right" className="text-xs">{collapsed ? "Expandir" : "Colapsar"}</TooltipContent>}
        </Tooltip>

        {/* Sign out */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={signOut}
              className={cn(
                "flex items-center gap-3 rounded-lg text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all w-full",
                collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
              )}
            >
              <LogOut className="h-[18px] w-[18px]" />
              {!collapsed && "Cerrar sesión"}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right" className="text-xs">Cerrar sesión</TooltipContent>}
        </Tooltip>
      </div>
    </aside>
  );
}
