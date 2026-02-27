import { useEffect, useState, useCallback, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";

import {
  LayoutDashboard, Users, CalendarDays, Upload, Tags, FileSpreadsheet,
  BarChart3, LogOut, ContactRound, DollarSign, Shield, Building2, Globe,
  PanelLeftClose, PanelLeft, Smartphone, Moon, Sun, Settings2,
  MessageSquare, Clock, MapPin, Megaphone, MessageCircle, ChevronDown,
  ScanEye, Activity, Star, Inbox,
} from "lucide-react";
import { ListChecks } from "lucide-react";
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
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { CommandPaletteTrigger } from "@/components/CommandPalette";
import staflyLogo from "@/assets/stafly-logo.png";
import staflyIcon from "@/assets/stafly-isotipo.png";

interface LinkDef {
  to: string;
  icon: any;
  label: string;
  module: string | null;
  end?: boolean;
  section: string;
  badge?: string; // key for badge count
}

const ALL_LINKS: LinkDef[] = [
  { to: "/app", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Inicio" },
  // Nómina
  { to: "/app/periods", icon: CalendarDays, label: "Periodos", module: "periods", section: "Nómina" },
  { to: "/app/import", icon: Upload, label: "Importar horas", module: "import", section: "Nómina" },
  { to: "/app/movements", icon: DollarSign, label: "Novedades", module: "movements", section: "Nómina" },
  { to: "/app/summary", icon: FileSpreadsheet, label: "Resumen", module: "summary", section: "Nómina" },
  { to: "/app/reports", icon: BarChart3, label: "Reportes", module: "reports", section: "Nómina" },
  { to: "/app/payroll-settings", icon: Settings2, label: "Config Nómina", module: null, section: "Nómina" },
  // Operaciones
  { to: "/app/today", icon: ScanEye, label: "Hoy", module: "shifts", section: "Operaciones" },
  { to: "/app/shifts", icon: CalendarDays, label: "Turnos", module: "shifts", section: "Operaciones" },
  { to: "/app/import-schedule", icon: Upload, label: "Importar Turnos", module: "shifts", section: "Operaciones" },
  { to: "/app/import-timeclock", icon: Clock, label: "Importar Reloj", module: "shifts", section: "Operaciones" },
  { to: "/app/shift-requests", icon: MessageSquare, label: "Solicitudes turno", module: "shifts", section: "Operaciones", badge: "shift_requests" },
  { to: "/app/timeclock", icon: Clock, label: "Reloj", module: "shifts", section: "Operaciones" },
  // Gestión
  { to: "/app/requests", icon: Inbox, label: "Solicitudes", module: null, section: "Gestión", badge: "tickets" },
  // Equipo
  { to: "/app/employees", icon: Users, label: "Empleados", module: "employees", section: "Equipo" },
  { to: "/app/directory", icon: ContactRound, label: "Directorio", module: "employees", section: "Equipo" },
  { to: "/app/invite", icon: Smartphone, label: "Invitar", module: "employees", section: "Equipo" },
  { to: "/app/concepts", icon: Tags, label: "Conceptos", module: "concepts", section: "Equipo" },
  // Clientes
  { to: "/app/clients", icon: Building2, label: "Clientes", module: "clients", section: "Clientes" },
  { to: "/app/locations", icon: MapPin, label: "Ubicaciones", module: "locations", section: "Clientes" },
  // Comunicación
  { to: "/app/announcements", icon: Megaphone, label: "Anuncios", module: "announcements", section: "Comunicación" },
  { to: "/app/chat", icon: MessageCircle, label: "Chat interno", module: null, section: "Comunicación" },
];

const OWNER_LINKS: LinkDef[] = [
  { to: "/app/global", icon: Globe, label: "Vista global", module: null, section: "Administración" },
  { to: "/app/companies", icon: Building2, label: "Empresas", module: null, section: "Administración" },
  { to: "/app/users", icon: Shield, label: "Usuarios", module: null, section: "Administración" },
  { to: "/app/onboarding", icon: Users, label: "Onboarding", module: null, section: "Administración" },
  { to: "/app/activity", icon: Activity, label: "Actividad", module: null, section: "Administración" },
  { to: "/app/company-config", icon: Settings2, label: "Config Empresa", module: null, section: "Administración" },
  { to: "/app/automations", icon: CalendarDays, label: "Automatizar", module: null, section: "Administración" },
  { to: "/app/permissions", icon: Shield, label: "Permisos", module: null, section: "Administración" },
  { to: "/app/monetization", icon: DollarSign, label: "Inversión", module: null, section: "Administración" },
  { to: "/app/settings", icon: Settings2, label: "Plataforma", module: null, section: "Administración" },
  { to: "/app/system-health", icon: Activity, label: "Cuadro de control", module: null, section: "Administración" },
  { to: "/app/implementations", icon: ListChecks, label: "Implementaciones", module: null, section: "Administración" },
  { to: "/app/leads", icon: Users, label: "Leads", module: null, section: "Administración" },
];

// Section ordering for consistency
const SECTION_ORDER = ["Inicio", "Operaciones", "Nómina", "Gestión", "Equipo", "Clientes", "Comunicación", "Administración"];

export default function AdminSidebar() {
  const { signOut, role, hasModuleAccess, user } = useAuth();
  const { companies, selectedCompanyId, setSelectedCompanyId, isModuleActive } = useCompany();
  const location = useLocation();
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const { theme, setTheme } = useTheme();

  const [favorites, setFavorites] = useState<string[]>([]);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});

  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`sidebar-favorites-${user?.id}`);
    if (saved) setFavorites(JSON.parse(saved));
  }, [user?.id]);

  // Fetch badge counts
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

  const toggleFavorite = useCallback((to: string) => {
    setFavorites(prev => {
      const next = prev.includes(to) ? prev.filter(f => f !== to) : [...prev, to];
      localStorage.setItem(`sidebar-favorites-${user?.id}`, JSON.stringify(next));
      return next;
    });
  }, [user?.id]);

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

  const roleLabel = role === 'owner' ? 'Dueño' : role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Usuario';

  const visibleSections = useMemo(() => {
    const sectionMap = new Map<string, LinkDef[]>();
    for (const link of ALL_LINKS) {
      if (!isLinkVisible(link.module)) continue;
      if (!sectionMap.has(link.section)) sectionMap.set(link.section, []);
      sectionMap.get(link.section)!.push(link);
    }
    const result: { label: string; links: LinkDef[] }[] = [];
    for (const sec of SECTION_ORDER) {
      if (sectionMap.has(sec)) result.push({ label: sec, links: sectionMap.get(sec)! });
    }
    return result;
  }, [role, selectedCompanyId]);

  const visibleOwnerLinks = useMemo(() => {
    if (role !== 'owner') return [];
    return OWNER_LINKS;
  }, [role]);

  // Favorite links
  const favoriteLinks = useMemo(() => {
    const allLinks = [...ALL_LINKS, ...OWNER_LINKS];
    return favorites.map(f => allLinks.find(l => l.to === f)).filter(Boolean) as LinkDef[];
  }, [favorites]);

  // Auto-open section with active route
  useEffect(() => {
    const allSections = [...visibleSections, ...(visibleOwnerLinks.length > 0 ? [{ label: "Administración", links: visibleOwnerLinks }] : [])];
    const activeSection = allSections.find(s => s.links.some(l => isActive(l.to, l.end)));
    if (activeSection) {
      setOpenSections(prev => {
        if (prev.has(activeSection.label)) return prev;
        const next = new Set(prev);
        next.add(activeSection.label);
        return next;
      });
    }
  }, [location.pathname]);

  const toggleSection = (label: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const renderLink = (link: LinkDef, showFavStar = true) => {
    const active = isActive(link.to, link.end);
    const isFav = favorites.includes(link.to);
    const badge = link.badge ? badgeCounts[link.badge] : 0;

    const linkContent = (
      <div key={link.to} className="group/link relative">
        <NavLink
          to={link.to}
          className={cn(
            "relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200 w-full min-w-0",
            collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
            active
              ? "bg-primary/8 text-primary font-semibold"
              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
          )}
        >
          {active && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
          )}
          <div className="relative">
            <link.icon className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
              active ? "text-primary" : "text-muted-foreground/50 group-hover/link:text-sidebar-foreground"
            )} />
            {/* Badge dot on icon when collapsed */}
            {collapsed && badge > 0 && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
            )}
          </div>
          {!collapsed && (
            <>
              <span className="flex-1 truncate leading-tight">{link.label}</span>
              {badge > 0 && (
                <span className="ml-auto shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive/10 text-destructive text-[10px] font-bold tabular-nums px-1">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
              {showFavStar && !collapsed && (
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(link.to); }}
                  className={cn(
                    "shrink-0 p-0.5 rounded-md transition-all",
                    isFav ? "text-warning opacity-100" : "opacity-0 group-hover/link:opacity-60 hover:!opacity-100 text-muted-foreground/40"
                  )}
                >
                  <Star className={cn("h-3 w-3", isFav && "fill-warning")} />
                </button>
              )}
            </>
          )}
        </NavLink>
      </div>
    );

    if (collapsed) {
      return (
        <Tooltip key={link.to} delayDuration={0}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs font-medium flex items-center gap-2">
            {link.label}
            {badge > 0 && (
              <span className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-1">
                {badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }
    return linkContent;
  };

  const renderSection = (section: { label: string; links: LinkDef[] }) => {
    if (collapsed) {
      return (
        <div key={section.label} className="space-y-0.5">
          <div className="border-t border-sidebar-border/30 my-2" />
          {section.links.map(l => renderLink(l))}
        </div>
      );
    }

    const isOpen = openSections.has(section.label);
    const sectionBadge = section.links.reduce((sum, l) => sum + (l.badge ? (badgeCounts[l.badge] ?? 0) : 0), 0);

    return (
      <Collapsible key={section.label} open={isOpen} onOpenChange={() => toggleSection(section.label)}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 group/section cursor-pointer">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 group-hover/section:text-muted-foreground/60 transition-colors">
            {section.label}
          </span>
          <div className="flex items-center gap-1.5">
            {!isOpen && sectionBadge > 0 && (
              <span className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-destructive/10 text-destructive text-[9px] font-bold px-1 tabular-nums">
                {sectionBadge}
              </span>
            )}
            <ChevronDown className={cn(
              "h-3 w-3 text-muted-foreground/25 transition-transform duration-300 ease-in-out",
              isOpen && "rotate-180"
            )} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-0.5 mt-0.5 overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
          {section.links.map(l => renderLink(l))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ease-in-out",
      "bg-card border-r border-border/40",
      collapsed ? "w-[60px]" : "w-[250px]"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center shrink-0 border-b border-border/30",
        collapsed ? "px-2 py-4 justify-center" : "px-4 py-4 gap-3"
      )}>
        {collapsed ? (
          <img src={staflyIcon} alt="stafly" className="h-8 w-8 shrink-0" style={{ imageRendering: "auto" }} />
        ) : (
          <>
            <img src={staflyLogo} alt="stafly" className="h-8 w-auto shrink-0" style={{ imageRendering: "auto" }} />
            <div className="min-w-0 flex-1">
              <span className={cn(
                "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                role === 'owner' ? "bg-primary/8 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {roleLabel}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Search trigger */}
      <div className={cn("shrink-0 border-b border-border/30", collapsed ? "px-2 py-2" : "px-3 py-2")}>
        <CommandPaletteTrigger collapsed={collapsed} />
      </div>

      {/* Company selector */}
      {companies.length > 1 && !collapsed && (
        <div className="px-3 py-3 border-b border-border/30">
          <Select value={selectedCompanyId ?? ""} onValueChange={setSelectedCompanyId}>
            <SelectTrigger className="h-8 text-xs bg-muted/30 border-border/30 rounded-xl hover:bg-muted/50 transition-colors">
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
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto scrollbar-thin">
        {/* Favorites section */}
        {favoriteLinks.length > 0 && !collapsed && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <Star className="h-3 w-3 text-warning fill-warning" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-warning/60">Favoritos</span>
            </div>
            <div className="space-y-0.5">
              {favoriteLinks.map(l => renderLink(l, false))}
            </div>
          </div>
        )}

        {visibleSections.map(renderSection)}
        {visibleOwnerLinks.length > 0 && renderSection({ label: "Administración", links: visibleOwnerLinks })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-2.5 border-t border-border/30 space-y-0.5 shrink-0">
        {/* Theme */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={cn(
                "flex items-center gap-3 rounded-xl text-[13px] font-medium text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-all duration-200 w-full",
                collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
              )}
            >
              {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              {!collapsed && (theme === "dark" ? "Modo claro" : "Modo oscuro")}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right" className="text-xs">{theme === "dark" ? "Modo claro" : "Modo oscuro"}</TooltipContent>}
        </Tooltip>

        {/* Collapse */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn(
                "flex items-center gap-3 rounded-xl text-[13px] font-medium text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-all duration-200 w-full",
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
            <span className="w-full">
              <LogoutConfirmDialog onConfirm={signOut}>
                <button
                  className={cn(
                    "flex items-center gap-3 rounded-xl text-[13px] font-medium text-muted-foreground/60 hover:bg-destructive/8 hover:text-destructive transition-all duration-200 w-full",
                    collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
                  )}
                >
                  <LogOut className="h-[18px] w-[18px]" />
                  {!collapsed && "Cerrar sesión"}
                </button>
              </LogoutConfirmDialog>
            </span>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right" className="text-xs">Cerrar sesión</TooltipContent>}
        </Tooltip>
      </div>
    </aside>
  );
}
