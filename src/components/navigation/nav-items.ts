import {
  LayoutDashboard, CalendarDays, Upload, DollarSign, FileSpreadsheet,
  BarChart3, Users, Tags, ContactRound, Building2,
  Clock, MapPin, Megaphone, MessageCircle, ScanEye, Inbox,
  MessageSquare, Settings2, Home, User, Wrench, UserPlus, FileText, GitCompareArrows,
} from "lucide-react";

export interface NavItem {
  id: string;
  to: string;
  icon: any;
  label: string;
  module: string | null;
  end?: boolean;
  section: string;
  badge?: string;
  roles?: string[]; // which roles can see this
}

/* ── Admin / Manager nav items ── */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", to: "/app", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Inicio" },
  { id: "shifts", to: "/app/shifts", icon: CalendarDays, label: "Turnos", module: "shifts", section: "Operaciones" },
  { id: "timeclock", to: "/app/timeclock", icon: Clock, label: "Reloj", module: "shifts", section: "Operaciones" },
  { id: "clients", to: "/app/clients", icon: Building2, label: "Clientes", module: "clients", section: "Operaciones" },
  { id: "locations", to: "/app/locations", icon: MapPin, label: "Ubicaciones", module: "locations", section: "Operaciones" },
  { id: "periods", to: "/app/periods", icon: CalendarDays, label: "Periodos", module: "periods", section: "Nómina" },
  { id: "import", to: "/app/import", icon: Upload, label: "Importar", module: "import", section: "Nómina" },
  { id: "movements", to: "/app/movements", icon: DollarSign, label: "Novedades", module: "movements", section: "Nómina" },
  { id: "summary", to: "/app/summary", icon: FileSpreadsheet, label: "Resumen", module: "summary", section: "Nómina" },
  { id: "reports", to: "/app/reports", icon: BarChart3, label: "Reportes", module: "reports", section: "Nómina" },
  { id: "comparison", to: "/app/comparison", icon: GitCompareArrows, label: "Comparación", module: "shifts", section: "Operaciones" },
  { id: "payroll-settings", to: "/app/payroll-settings", icon: Settings2, label: "Config Nómina", module: null, section: "Nómina" },
  { id: "w9", to: "/app/w9", icon: FileText, label: "W-9", module: "employees", section: "Fiscal" },
  { id: "1099", to: "/app/1099", icon: FileText, label: "1099-NEC", module: "employees", section: "Fiscal" },
  { id: "employees", to: "/app/employees", icon: Users, label: "Empleados", module: "employees", section: "Gestión" },
  { id: "directory", to: "/app/directory", icon: ContactRound, label: "Directorio", module: "employees", section: "Gestión" },
  { id: "concepts", to: "/app/concepts", icon: Tags, label: "Conceptos", module: "concepts", section: "Gestión" },
  { id: "announcements", to: "/app/announcements", icon: Megaphone, label: "Anuncios", module: "announcements", section: "Gestión" },
  { id: "chat", to: "/app/chat", icon: MessageCircle, label: "Chat", module: null, section: "Gestión" },
  { id: "tickets", to: "/app/requests", icon: Inbox, label: "Tickets", module: null, section: "Gestión", badge: "tickets" },
  { id: "invite", to: "/app/invite", icon: UserPlus, label: "Invitaciones", module: null, section: "Gestión" },
  { id: "admin-hub", to: "/app/admin", icon: Wrench, label: "Admin", module: null, section: "Administración", roles: ["owner"] },
];

export const ADMIN_DEFAULT_PINS = ["dashboard", "shifts", "employees", "movements"];

/* ── Employee portal nav items ── */
export const EMPLOYEE_NAV_ITEMS: NavItem[] = [
  { id: "portal-home", to: "/portal", icon: Home, label: "Inicio", module: null, end: true, section: "Principal" },
  { id: "portal-clock", to: "/portal/clock", icon: Clock, label: "Reloj", module: null, section: "Principal" },
  { id: "portal-shifts", to: "/portal/shifts", icon: CalendarDays, label: "Turnos", module: null, section: "Principal" },
  { id: "portal-chat", to: "/portal/chat", icon: MessageSquare, label: "Chat", module: null, section: "Principal" },
  { id: "portal-profile", to: "/portal/profile", icon: User, label: "Perfil", module: null, section: "Principal" },
];

export const EMPLOYEE_DEFAULT_PINS = ["portal-home", "portal-clock", "portal-shifts", "portal-chat", "portal-profile"];
