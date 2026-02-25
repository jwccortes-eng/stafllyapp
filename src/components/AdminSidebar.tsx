import { useEffect, useState, useCallback, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";

import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Upload,
  Tags,
  FileSpreadsheet,
  BarChart3,
  LogOut,
  ContactRound,
  DollarSign,
  Shield,
  Building2,
  Globe,
  PanelLeftClose,
  PanelLeft,
  Smartphone,
  Moon,
  Sun,
  Settings2,
  GripVertical,
  MessageSquare,
  Check,
  X,
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

interface LinkDef {
  to: string;
  icon: any;
  label: string;
  module: string | null;
  end?: boolean;
  section: string;
}

const ALL_LINKS: LinkDef[] = [
  // Nómina
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Nómina" },
  { to: "/admin/periods", icon: CalendarDays, label: "Periodos", module: "periods", section: "Nómina" },
  { to: "/admin/import", icon: Upload, label: "Importar", module: "import", section: "Nómina" },
  { to: "/admin/movements", icon: DollarSign, label: "Novedades", module: "movements", section: "Nómina" },
  { to: "/admin/summary", icon: FileSpreadsheet, label: "Resumen", module: "summary", section: "Nómina" },
  { to: "/admin/reports", icon: BarChart3, label: "Reportes", module: "reports", section: "Nómina" },
  // Catálogos
  { to: "/admin/employees", icon: Users, label: "Empleados", module: "employees", section: "Catálogos" },
  { to: "/admin/concepts", icon: Tags, label: "Conceptos", module: "concepts", section: "Catálogos" },
  { to: "/admin/invite", icon: Smartphone, label: "Invitar", module: "employees", section: "Catálogos" },
  { to: "/admin/directory", icon: ContactRound, label: "Directorio", module: "employees", section: "Catálogos" },
];

const OWNER_LINKS: LinkDef[] = [
  { to: "/admin/global", icon: Globe, label: "Vista global", module: null, section: "Administración" },
  { to: "/admin/companies", icon: Building2, label: "Empresas", module: null, section: "Administración" },
  { to: "/admin/users", icon: Shield, label: "Usuarios", module: null, section: "Administración" },
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

  // Fetch customizations
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

  // Sort links by customization order, fallback to default
  const sortLinks = useCallback((links: LinkDef[]) => {
    return [...links].sort((a, b) => {
      const orderA = getOrder(a.to) ?? links.indexOf(a) * 10;
      const orderB = getOrder(b.to) ?? links.indexOf(b) * 10;
      return orderA - orderB;
    });
  }, [customizations]);

  // Group visible links by section
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

  // Drag handlers
  const handleDragStart = (linkKey: string) => {
    if (!editMode) return;
    setDragItem(linkKey);
  };

  const handleDragOver = (e: React.DragEvent, linkKey: string) => {
    if (!editMode) return;
    e.preventDefault();
    setDragOverItem(linkKey);
  };

  const handleDrop = async (targetKey: string, sectionLinks: LinkDef[]) => {
    if (!dragItem || dragItem === targetKey || !editMode) return;

    const keys = sectionLinks.map(l => l.to);
    const fromIdx = keys.indexOf(dragItem);
    const toIdx = keys.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) return;

    // Reorder
    const reordered = [...keys];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, dragItem);

    // Save new order
    const updates = reordered.map((key, i) => ({
      link_key: key,
      sort_order: i * 10,
      note: getNote(key),
    }));

    for (const u of updates) {
      await saveCustomization(u.link_key, u.note, u.sort_order);
    }

    setCustomizations(prev => {
      const newCustom = [...prev];
      for (const u of updates) {
        const idx = newCustom.findIndex(c => c.link_key === u.link_key);
        if (idx >= 0) {
          newCustom[idx] = { ...newCustom[idx], sort_order: u.sort_order };
        } else {
          newCustom.push({ link_key: u.link_key, note: u.note, sort_order: u.sort_order });
        }
      }
      return newCustom;
    });

    setDragItem(null);
    setDragOverItem(null);
  };

  const renderLink = (link: LinkDef, sectionLinks: LinkDef[]) => {
    const active = isActive(link.to, link.end);
    const note = getNote(link.to);
    const isEditingThis = editingNote === link.to;

    const content = (
      <div
        key={link.to}
        draggable={editMode}
        onDragStart={() => handleDragStart(link.to)}
        onDragOver={(e) => handleDragOver(e, link.to)}
        onDrop={() => handleDrop(link.to, sectionLinks)}
        onDragEnd={() => { setDragItem(null); setDragOverItem(null); }}
        className={cn(
          "group/link transition-all",
          dragOverItem === link.to && editMode && "border-t-2 border-primary",
        )}
      >
        <div className="flex items-center gap-1">
          {editMode && !collapsed && (
            <GripVertical className="h-3 w-3 text-muted-foreground/50 cursor-grab shrink-0" />
          )}
          <NavLink
            to={link.to}
            className={cn(
              "flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all flex-1 min-w-0",
              collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            <link.icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-primary")} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <span>{link.label}</span>
                {note && !editMode && (
                  <span className="block text-[10px] text-muted-foreground/70 truncate leading-tight mt-0.5">{note}</span>
                )}
              </div>
            )}
          </NavLink>
          {editMode && !collapsed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingNote(link.to);
                setNoteValue(note);
              }}
              className="p-1 rounded hover:bg-sidebar-accent/60 shrink-0"
              title="Editar nota"
            >
              <MessageSquare className="h-3 w-3 text-muted-foreground/60" />
            </button>
          )}
        </div>

        {/* Inline note editor */}
        {isEditingThis && !collapsed && (
          <div className="flex items-center gap-1 px-3 pb-1 ml-4">
            <Input
              value={noteValue}
              onChange={e => setNoteValue(e.target.value)}
              placeholder="Agregar nota..."
              className="h-6 text-[11px] bg-sidebar-accent/40 border-sidebar-border"
              autoFocus
              onKeyDown={e => {
                if (e.key === "Enter") saveNote(link.to);
                if (e.key === "Escape") { setEditingNote(null); setNoteValue(""); }
              }}
            />
            <button onClick={() => saveNote(link.to)} className="p-0.5 rounded hover:bg-sidebar-accent">
              <Check className="h-3 w-3 text-primary" />
            </button>
            <button onClick={() => { setEditingNote(null); setNoteValue(""); }} className="p-0.5 rounded hover:bg-sidebar-accent">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
    );

    if (collapsed) {
      return (
        <Tooltip key={link.to} delayDuration={0}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {link.label}
            {note && <span className="block text-[10px] text-muted-foreground">{note}</span>}
          </TooltipContent>
        </Tooltip>
      );
    }
    return content;
  };

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-30 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-200",
      collapsed ? "w-14" : "w-60"
    )}>
      {/* Header */}
      <div className={cn("border-b border-sidebar-border flex items-center", collapsed ? "px-2 py-3 justify-center" : "px-4 py-3 gap-3")}>
        <img src={logoQS} alt="Quality Staff" className={cn("shrink-0 object-contain", collapsed ? "h-8 w-8" : "h-9")} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{roleLabel}</p>
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
        {visibleSections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.links.map(l => renderLink(l, section.links))}
            </div>
          </div>
        ))}

        {visibleOwnerLinks.length > 0 && (
          <div>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Administración
              </p>
            )}
            {collapsed && <div className="border-t border-sidebar-border my-1.5" />}
            <div className="space-y-0.5">
              {visibleOwnerLinks.map(l => renderLink(l, visibleOwnerLinks))}
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-2 py-2 border-t border-sidebar-border space-y-1">
        {/* Edit mode toggle */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => { setEditMode(!editMode); setEditingNote(null); }}
              className={cn(
                "flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all w-full",
                collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
                editMode
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Settings2 className="h-[18px] w-[18px]" />
              {!collapsed && (editMode ? "Listo" : "Personalizar")}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right" className="text-xs">{editMode ? "Listo" : "Personalizar"}</TooltipContent>}
        </Tooltip>

        {/* Dark mode toggle */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={cn(
                "flex items-center gap-3 rounded-lg text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all w-full",
                collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
              )}
            >
              {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              {!collapsed && (theme === "dark" ? "Modo claro" : "Modo oscuro")}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right" className="text-xs">{theme === "dark" ? "Modo claro" : "Modo oscuro"}</TooltipContent>}
        </Tooltip>

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
