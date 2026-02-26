import { useEffect, useState, useCallback, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";

import {
  LayoutDashboard, Users, CalendarDays, Upload, Tags, FileSpreadsheet,
  BarChart3, LogOut, ContactRound, DollarSign, Shield, Building2, Globe,
  PanelLeftClose, PanelLeft, Smartphone, Moon, Sun, Settings2,
  GripVertical, MessageSquare, Check, X, Clock, MapPin, Megaphone,
  MessageCircle, ChevronDown, ScanEye,
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
import { Input } from "@/components/ui/input";
import { useSidebarCollapsed } from "./AdminLayout";
import logoQS from "@/assets/logo-quality-staff.png";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface LinkDef {
  to: string;
  icon: any;
  label: string;
  module: string | null;
  end?: boolean;
  section: string;
}

const ALL_LINKS: LinkDef[] = [
  // ── Inicio ──
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Inicio" },
  // ── Nómina ──
  { to: "/admin/periods", icon: CalendarDays, label: "Periodos", module: "periods", section: "Nómina" },
  { to: "/admin/import", icon: Upload, label: "Importar horas", module: "import", section: "Nómina" },
  { to: "/admin/movements", icon: DollarSign, label: "Novedades", module: "movements", section: "Nómina" },
  { to: "/admin/summary", icon: FileSpreadsheet, label: "Resumen", module: "summary", section: "Nómina" },
  { to: "/admin/reports", icon: BarChart3, label: "Reportes", module: "reports", section: "Nómina" },
  { to: "/admin/payroll-settings", icon: Settings2, label: "Config Nómina", module: null, section: "Nómina" },
  // ── Programación ──
  { to: "/admin/today", icon: ScanEye, label: "Hoy", module: "shifts", section: "Programación" },
  { to: "/admin/shifts", icon: CalendarDays, label: "Turnos", module: "shifts", section: "Programación" },
  { to: "/admin/shift-requests", icon: MessageSquare, label: "Solicitudes", module: "shifts", section: "Programación" },
  { to: "/admin/timeclock", icon: Clock, label: "Reloj", module: "shifts", section: "Programación" },
  // ── Equipo ──
  { to: "/admin/employees", icon: Users, label: "Empleados", module: "employees", section: "Equipo" },
  { to: "/admin/directory", icon: ContactRound, label: "Directorio", module: "employees", section: "Equipo" },
  { to: "/admin/invite", icon: Smartphone, label: "Invitar", module: "employees", section: "Equipo" },
  { to: "/admin/concepts", icon: Tags, label: "Conceptos", module: "concepts", section: "Equipo" },
  // ── Clientes ──
  { to: "/admin/clients", icon: Building2, label: "Clientes", module: "clients", section: "Clientes" },
  { to: "/admin/locations", icon: MapPin, label: "Ubicaciones", module: "locations", section: "Clientes" },
  // ── Comunicación ──
  { to: "/admin/announcements", icon: Megaphone, label: "Anuncios", module: "announcements", section: "Comunicación" },
  { to: "/admin/chat", icon: MessageCircle, label: "Chat interno", module: null, section: "Comunicación" },
];

const OWNER_LINKS: LinkDef[] = [
  { to: "/admin/global", icon: Globe, label: "Vista global", module: null, section: "Administración" },
  { to: "/admin/companies", icon: Building2, label: "Empresas", module: null, section: "Administración" },
  { to: "/admin/users", icon: Shield, label: "Usuarios", module: null, section: "Administración" },
  { to: "/admin/onboarding", icon: Users, label: "Onboarding", module: null, section: "Administración" },
  { to: "/admin/activity", icon: CalendarDays, label: "Actividad", module: null, section: "Administración" },
  { to: "/admin/company-config", icon: Settings2, label: "Config Empresa", module: null, section: "Administración" },
  { to: "/admin/automations", icon: CalendarDays, label: "Automatizar", module: null, section: "Administración" },
  { to: "/admin/permissions", icon: Shield, label: "Permisos", module: null, section: "Administración" },
  { to: "/admin/monetization", icon: DollarSign, label: "Inversión", module: null, section: "Administración" },
  { to: "/admin/settings", icon: Settings2, label: "Plataforma", module: null, section: "Administración" },
];

interface Customization {
  link_key: string;
  note: string;
  sort_order: number;
}

export default function AdminSidebar() {
  const { signOut, role, hasModuleAccess, user } = useAuth();
  const { companies, selectedCompanyId, setSelectedCompanyId, isModuleActive } = useCompany();
  const location = useLocation();
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const { theme, setTheme } = useTheme();

  const [customizations, setCustomizations] = useState<Customization[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("sidebar_customizations")
      .select("link_key, note, sort_order")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) setCustomizations(data);
      });
  }, [user?.id]);

  const getNote = (key: string) => customizations.find(c => c.link_key === key)?.note || "";
  const getOrder = (key: string) => customizations.find(c => c.link_key === key)?.sort_order;

  const saveCustomization = useCallback(async (link_key: string, note: string, sort_order: number) => {
    if (!user?.id) return;
    await supabase
      .from("sidebar_customizations")
      .upsert({ user_id: user.id, link_key, note, sort_order } as any, { onConflict: "user_id,link_key" });
  }, [user?.id]);

  const saveNote = async (linkKey: string) => {
    const order = getOrder(linkKey) ?? 0;
    await saveCustomization(linkKey, noteValue, order);
    setCustomizations(prev => {
      const existing = prev.find(c => c.link_key === linkKey);
      if (existing) return prev.map(c => c.link_key === linkKey ? { ...c, note: noteValue } : c);
      return [...prev, { link_key: linkKey, note: noteValue, sort_order: order }];
    });
    setEditingNote(null);
    setNoteValue("");
  };

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

  const sortLinks = useCallback((links: LinkDef[]) => {
    return [...links].sort((a, b) => {
      const orderA = getOrder(a.to) ?? links.indexOf(a) * 10;
      const orderB = getOrder(b.to) ?? links.indexOf(b) * 10;
      return orderA - orderB;
    });
  }, [customizations]);

  const visibleSections = useMemo(() => {
    const result: { label: string; links: LinkDef[] }[] = [];
    const sectionMap = new Map<string, LinkDef[]>();
    for (const link of ALL_LINKS) {
      if (!isLinkVisible(link.module)) continue;
      if (!sectionMap.has(link.section)) sectionMap.set(link.section, []);
      sectionMap.get(link.section)!.push(link);
    }
    for (const [label, links] of sectionMap) {
      result.push({ label, links: sortLinks(links) });
    }
    return result;
  }, [role, customizations, selectedCompanyId]);

  const visibleOwnerLinks = useMemo(() => {
    if (role !== 'owner') return [];
    return sortLinks(OWNER_LINKS);
  }, [role, customizations]);

  const handleDragStart = (linkKey: string) => { if (editMode) setDragItem(linkKey); };
  const handleDragOver = (e: React.DragEvent, linkKey: string) => { if (editMode) { e.preventDefault(); setDragOverItem(linkKey); } };

  const handleDrop = async (targetKey: string, sectionLinks: LinkDef[]) => {
    if (!dragItem || dragItem === targetKey || !editMode) return;
    const keys = sectionLinks.map(l => l.to);
    const fromIdx = keys.indexOf(dragItem);
    const toIdx = keys.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...keys];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, dragItem);
    const updates = reordered.map((key, i) => ({ link_key: key, sort_order: i * 10, note: getNote(key) }));
    for (const u of updates) await saveCustomization(u.link_key, u.note, u.sort_order);
    setCustomizations(prev => {
      const newCustom = [...prev];
      for (const u of updates) {
        const idx = newCustom.findIndex(c => c.link_key === u.link_key);
        if (idx >= 0) newCustom[idx] = { ...newCustom[idx], sort_order: u.sort_order };
        else newCustom.push({ link_key: u.link_key, note: u.note, sort_order: u.sort_order });
      }
      return newCustom;
    });
    setDragItem(null);
    setDragOverItem(null);
  };

  const toggleSection = (label: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const renderLink = (link: LinkDef, sectionLinks: LinkDef[]) => {
    const active = isActive(link.to, link.end);
    const note = getNote(link.to);
    const isEditingThis = editingNote === link.to;

    const linkContent = (
      <div
        key={link.to}
        draggable={editMode}
        onDragStart={() => handleDragStart(link.to)}
        onDragOver={(e) => handleDragOver(e, link.to)}
        onDrop={() => handleDrop(link.to, sectionLinks)}
        onDragEnd={() => { setDragItem(null); setDragOverItem(null); }}
        className={cn(
          "group/link",
          dragOverItem === link.to && editMode && "border-t-2 border-primary",
        )}
      >
        <div className="flex items-center gap-1">
          {editMode && !collapsed && (
            <GripVertical className="h-3 w-3 text-muted-foreground/40 cursor-grab shrink-0" />
          )}
          <NavLink
            to={link.to}
            className={cn(
              "relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200 flex-1 min-w-0",
              collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
              active
                ? "bg-primary/10 text-primary font-semibold shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
            )}
            <link.icon className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
              active ? "text-primary" : "text-muted-foreground/70 group-hover/link:text-sidebar-foreground"
            )} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <span className="block leading-tight">{link.label}</span>
                {note && !editMode && (
                  <span className="block text-[10px] text-muted-foreground/60 truncate leading-tight mt-0.5">{note}</span>
                )}
              </div>
            )}
          </NavLink>
          {editMode && !collapsed && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditingNote(link.to); setNoteValue(note); }}
              className="p-1 rounded-lg hover:bg-sidebar-accent/60 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity"
              title="Editar nota"
            >
              <MessageSquare className="h-3 w-3 text-muted-foreground/50" />
            </button>
          )}
        </div>

        {isEditingThis && !collapsed && (
          <div className="flex items-center gap-1 px-3 pb-1 ml-4 mt-1">
            <Input
              value={noteValue}
              onChange={e => setNoteValue(e.target.value)}
              placeholder="Agregar nota..."
              className="h-6 text-[11px] bg-sidebar-accent/30 border-sidebar-border/50 rounded-lg"
              autoFocus
              onKeyDown={e => {
                if (e.key === "Enter") saveNote(link.to);
                if (e.key === "Escape") { setEditingNote(null); setNoteValue(""); }
              }}
            />
            <button onClick={() => saveNote(link.to)} className="p-0.5 rounded-lg hover:bg-sidebar-accent">
              <Check className="h-3 w-3 text-primary" />
            </button>
            <button onClick={() => { setEditingNote(null); setNoteValue(""); }} className="p-0.5 rounded-lg hover:bg-sidebar-accent">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
    );

    if (collapsed) {
      return (
        <Tooltip key={link.to} delayDuration={0}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs font-medium">
            {link.label}
            {note && <span className="block text-[10px] text-muted-foreground">{note}</span>}
          </TooltipContent>
        </Tooltip>
      );
    }
    return linkContent;
  };

  // Auto-open section with active route on mount/route change
  useEffect(() => {
    const activeSection = [...visibleSections, ...(visibleOwnerLinks.length > 0 ? [{ label: "Administración", links: visibleOwnerLinks }] : [])]
      .find(s => s.links.some(l => isActive(l.to, l.end)));
    if (activeSection) {
      setOpenSections(prev => {
        if (prev.has(activeSection.label)) return prev;
        const next = new Set(prev);
        next.add(activeSection.label);
        return next;
      });
    }
  }, [location.pathname]);

  const renderSection = (section: { label: string; links: LinkDef[] }) => {
    if (collapsed) {
      return (
        <div key={section.label} className="space-y-0.5">
          <div className="border-t border-sidebar-border/50 my-2" />
          {section.links.map(l => renderLink(l, section.links))}
        </div>
      );
    }

    const isOpen = openSections.has(section.label);

    return (
      <Collapsible key={section.label} open={isOpen} onOpenChange={() => toggleSection(section.label)}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 group/section cursor-pointer">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 group-hover/section:text-muted-foreground transition-colors">
            {section.label}
          </span>
          <ChevronDown className={cn(
            "h-3 w-3 text-muted-foreground/40 transition-transform duration-300 ease-in-out",
            isOpen && "rotate-180"
          )} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-0.5 mt-0.5 overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
          {section.links.map(l => renderLink(l, section.links))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ease-in-out",
      "bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border/50",
      "shadow-[1px_0_20px_-5px_hsl(var(--sidebar-border)/0.3)]",
      collapsed ? "w-[60px]" : "w-[250px]"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border/50 shrink-0",
        collapsed ? "px-2 py-4 justify-center" : "px-4 py-4 gap-3"
      )}>
        <div className="relative">
          <img
            src={logoQS}
            alt="Staffly"
            className={cn(
              "shrink-0 object-contain transition-all duration-300",
              collapsed ? "h-8 w-8" : "h-9"
            )}
          />
          <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-earning border-2 border-sidebar" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-sidebar-foreground leading-tight truncate">Staffly</p>
            <p className="text-[10px] text-muted-foreground/60 leading-tight">{roleLabel}</p>
          </div>
        )}
      </div>

      {/* Company selector */}
      {companies.length > 1 && !collapsed && (
        <div className="px-3 py-2.5 border-b border-sidebar-border/50">
          <Select value={selectedCompanyId ?? ""} onValueChange={setSelectedCompanyId}>
            <SelectTrigger className="h-8 text-xs bg-sidebar-accent/30 border-sidebar-border/50 rounded-xl hover:bg-sidebar-accent/50 transition-colors">
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
        {visibleSections.map(renderSection)}

        {visibleOwnerLinks.length > 0 && renderSection({ label: "Administración", links: visibleOwnerLinks })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-2.5 border-t border-sidebar-border/50 space-y-0.5 shrink-0">
        {/* Edit mode */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => { setEditMode(!editMode); setEditingNote(null); }}
              className={cn(
                "flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200 w-full",
                collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
                editMode
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Settings2 className="h-[18px] w-[18px]" />
              {!collapsed && (editMode ? "Listo" : "Personalizar")}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right" className="text-xs">{editMode ? "Listo" : "Personalizar"}</TooltipContent>}
        </Tooltip>

        {/* Theme */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={cn(
                "flex items-center gap-3 rounded-xl text-[13px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all duration-200 w-full",
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
                "flex items-center gap-3 rounded-xl text-[13px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all duration-200 w-full",
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
                "flex items-center gap-3 rounded-xl text-[13px] font-medium text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-all duration-200 w-full",
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
