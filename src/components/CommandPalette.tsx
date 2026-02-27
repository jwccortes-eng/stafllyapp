import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, CalendarDays, Upload, Tags, FileSpreadsheet,
  BarChart3, ContactRound, DollarSign, Shield, Building2, Globe,
  Smartphone, Settings2, Clock, MapPin, Megaphone, MessageCircle,
  ScanEye, Activity, ListChecks, Search, Inbox, Star,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";

interface SearchableLink {
  to: string;
  icon: any;
  label: string;
  keywords: string;
  section: string;
  module: string | null;
}

const ALL_SEARCHABLE: SearchableLink[] = [
  { to: "/app", icon: LayoutDashboard, label: "Dashboard", keywords: "inicio home tablero", section: "Inicio", module: null },
  { to: "/app/periods", icon: CalendarDays, label: "Periodos", keywords: "nomina payroll periodo quincenal semanal", section: "Nómina", module: "periods" },
  { to: "/app/import", icon: Upload, label: "Importar horas", keywords: "upload connecteam archivo subir", section: "Nómina", module: "import" },
  { to: "/app/movements", icon: DollarSign, label: "Novedades", keywords: "extras deducciones bonos ajustes movimientos", section: "Nómina", module: "movements" },
  { to: "/app/summary", icon: FileSpreadsheet, label: "Resumen", keywords: "consolidado periodo resumen", section: "Nómina", module: "summary" },
  { to: "/app/reports", icon: BarChart3, label: "Reportes", keywords: "reporte grafico analytics", section: "Nómina", module: "reports" },
  { to: "/app/payroll-settings", icon: Settings2, label: "Config Nómina", keywords: "configuracion payroll settings", section: "Nómina", module: null },
  { to: "/app/today", icon: ScanEye, label: "Hoy", keywords: "hoy today operaciones vista diaria", section: "Operaciones", module: "shifts" },
  { to: "/app/shifts", icon: CalendarDays, label: "Turnos", keywords: "turno shift agenda calendario programacion", section: "Operaciones", module: "shifts" },
  { to: "/app/shift-requests", icon: MessageCircle, label: "Solicitudes turno", keywords: "solicitud request turno", section: "Operaciones", module: "shifts" },
  { to: "/app/timeclock", icon: Clock, label: "Reloj", keywords: "reloj checador clock ponchar", section: "Operaciones", module: "shifts" },
  { to: "/app/employees", icon: Users, label: "Empleados", keywords: "empleado staff personal recursos humanos", section: "Equipo", module: "employees" },
  { to: "/app/directory", icon: ContactRound, label: "Directorio", keywords: "directorio contacto telefono correo", section: "Equipo", module: "employees" },
  { to: "/app/invite", icon: Smartphone, label: "Invitar", keywords: "invitar onboarding nuevo empleado qr link", section: "Equipo", module: "employees" },
  { to: "/app/concepts", icon: Tags, label: "Conceptos", keywords: "concepto pago categoria tarifa rate", section: "Equipo", module: "concepts" },
  { to: "/app/clients", icon: Building2, label: "Clientes", keywords: "cliente customer empresa contrato", section: "Clientes", module: "clients" },
  { to: "/app/locations", icon: MapPin, label: "Ubicaciones", keywords: "ubicacion location sitio direccion geofence", section: "Clientes", module: "locations" },
  { to: "/app/announcements", icon: Megaphone, label: "Anuncios", keywords: "comunicado anuncio aviso publicar", section: "Comunicación", module: "announcements" },
  { to: "/app/chat", icon: MessageCircle, label: "Chat interno", keywords: "chat mensaje interno conversacion", section: "Comunicación", module: null },
  { to: "/app/requests", icon: Inbox, label: "Solicitudes", keywords: "solicitud ticket request gestion", section: "Gestión", module: null },
];

const OWNER_SEARCHABLE: SearchableLink[] = [
  { to: "/app/global", icon: Globe, label: "Vista global", keywords: "global owner dueño", section: "Admin", module: null },
  { to: "/app/companies", icon: Building2, label: "Empresas", keywords: "empresa company crear", section: "Admin", module: null },
  { to: "/app/users", icon: Shield, label: "Usuarios", keywords: "usuario admin manager permisos", section: "Admin", module: null },
  { to: "/app/company-config", icon: Settings2, label: "Config Empresa", keywords: "configuracion empresa settings", section: "Admin", module: null },
  { to: "/app/activity", icon: Activity, label: "Actividad", keywords: "actividad log auditoria", section: "Admin", module: null },
  { to: "/app/automations", icon: CalendarDays, label: "Automatizar", keywords: "automatizacion regla trigger", section: "Admin", module: null },
  { to: "/app/permissions", icon: Shield, label: "Permisos", keywords: "permiso rol acceso", section: "Admin", module: null },
  { to: "/app/system-health", icon: Activity, label: "Cuadro de control", keywords: "salud sistema health check", section: "Admin", module: null },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { role, hasModuleAccess } = useAuth();
  const { isModuleActive } = useCompany();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const isVisible = (module: string | null) => {
    if (!module) return true;
    if (!isModuleActive(module)) return false;
    if (role === 'owner' || role === 'admin') return true;
    if (role === 'manager') return hasModuleAccess(module, 'view');
    return false;
  };

  const links = useMemo(() => {
    const base = ALL_SEARCHABLE.filter(l => isVisible(l.module));
    if (role === 'owner') return [...base, ...OWNER_SEARCHABLE];
    return base;
  }, [role]);

  const sections = useMemo(() => {
    const map = new Map<string, SearchableLink[]>();
    for (const l of links) {
      if (!map.has(l.section)) map.set(l.section, []);
      map.get(l.section)!.push(l);
    }
    return Array.from(map.entries());
  }, [links]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar módulo, acción..." />
      <CommandList>
        <CommandEmpty>No se encontraron resultados.</CommandEmpty>
        {sections.map(([section, items]) => (
          <CommandGroup key={section} heading={section}>
            {items.map(item => (
              <CommandItem
                key={item.to}
                value={`${item.label} ${item.keywords}`}
                onSelect={() => {
                  navigate(item.to);
                  setOpen(false);
                }}
                className="gap-3 cursor-pointer"
              >
                <item.icon className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                <span className="text-sm">{item.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/40">{item.section}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export function CommandPaletteTrigger({ collapsed }: { collapsed?: boolean }) {
  return (
    <button
      onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
      className={`flex items-center gap-2.5 rounded-xl text-[13px] font-medium text-muted-foreground/50 hover:bg-muted/30 hover:text-foreground transition-all duration-200 w-full ${collapsed ? "justify-center px-2 py-2" : "px-3 py-2"}`}
    >
      <Search className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">Buscar...</span>
          <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/50">
            ⌘K
          </kbd>
        </>
      )}
    </button>
  );
}
