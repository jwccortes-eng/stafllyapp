import {
  LayoutDashboard, CalendarDays, Upload, DollarSign, FileSpreadsheet,
  BarChart3, Users, Tags, ContactRound, Building2,
  Clock, MapPin, Megaphone, MessageCircle, ScanEye, Inbox, Bell, Monitor,
  MessageSquare, Settings2, Home, User, Wrench, UserPlus, FileText, GitCompareArrows,
  ClipboardList, Receipt, Brain, Map as MapIcon, Award, CalendarCheck, ArrowLeftRight,
  Banknote, ShieldCheck, Scale,
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
  { id: "summary", to: "/app/summary", icon: FileSpreadsheet, label: "Reportes", module: "summary", section: "Nómina" },
  { id: "comparison", to: "/app/comparison", icon: GitCompareArrows, label: "Comparación", module: "shifts", section: "Operaciones" },
  { id: "payroll-settings", to: "/app/payroll-settings", icon: Settings2, label: "Config Nómina", module: null, section: "Gestión" },
  { id: "w9", to: "/app/w9", icon: FileText, label: "W-9", module: "employees", section: "Fiscal" },
  { id: "1099", to: "/app/1099", icon: FileText, label: "1099-NEC", module: "employees", section: "Fiscal" },
  { id: "employees", to: "/app/employees", icon: Users, label: "Empleados", module: "employees", section: "Gestión" },
  { id: "directory", to: "/app/directory", icon: ContactRound, label: "Directorio", module: "employees", section: "Operaciones" },
  { id: "concepts", to: "/app/concepts", icon: Tags, label: "Conceptos", module: "concepts", section: "Gestión" },
  { id: "announcements", to: "/app/announcements", icon: Megaphone, label: "Anuncios", module: "announcements", section: "Operaciones" },
  { id: "chat", to: "/app/chat", icon: MessageCircle, label: "Chat", module: null, section: "Operaciones" },
  { id: "tickets", to: "/app/requests", icon: Inbox, label: "Tickets", module: null, section: "Gestión", badge: "tickets" },
  { id: "notifications", to: "/app/notifications", icon: Bell, label: "Notificaciones", module: null, section: "Gestión" },
  { id: "invite", to: "/app/invite", icon: UserPlus, label: "Invitaciones", module: null, section: "Gestión" },
  { id: "admin-hub", to: "/app/admin", icon: Wrench, label: "Admin", module: null, section: "Administración", roles: ["owner"] },
  { id: "staffing-requests", to: "/app/staffing-requests", icon: ClipboardList, label: "Solicitudes", module: null, section: "Comercial" },
  { id: "invoices", to: "/app/invoices", icon: Receipt, label: "Facturación", module: null, section: "Comercial" },
  { id: "service-categories", to: "/app/service-categories", icon: Tags, label: "Categorías", module: null, section: "Comercial" },
  { id: "ai-workforce", to: "/app/ai-workforce", icon: Brain, label: "AI Workforce", module: null, section: "Operaciones" },
  { id: "live-map", to: "/app/live-map", icon: MapIcon, label: "Mapa en Vivo", module: null, section: "Operaciones" },
  { id: "leaderboard", to: "/app/leaderboard", icon: Award, label: "Leaderboard", module: null, section: "Operaciones" },
  { id: "kiosk-devices", to: "/app/kiosk-devices", icon: Monitor, label: "Kiosk", module: null, section: "Operaciones" },
  { id: "attendance", to: "/app/attendance", icon: ScanEye, label: "Asistencia", module: null, section: "Operaciones" },
  { id: "migration", to: "/app/migration", icon: ArrowLeftRight, label: "Migración", module: null, section: "Administración", roles: ["owner"] },
  { id: "staged-recon", to: "/app/staged-reconciliation", icon: GitCompareArrows, label: "Reconciliación", module: null, section: "Nómina", roles: ["developer", "owner", "company_owner", "admin"] },
  { id: "advances-loans", to: "/app/advances-loans", icon: Banknote, label: "Anticipos", module: null, section: "Nómina" },
  { id: "comp-validation", to: "/app/compensation-validation", icon: DollarSign, label: "Compensación", module: null, section: "Nómina", roles: ["developer", "owner", "company_owner", "admin"] },
  { id: "pilot-close", to: "/app/payroll-pilot-close", icon: ShieldCheck, label: "Cierre Piloto", module: null, section: "Nómina", roles: ["developer", "owner", "company_owner", "admin"] },
  { id: "payroll-recon", to: "/app/payroll-reconciliation", icon: Scale, label: "Reconciliación Nómina", module: null, section: "Nómina", roles: ["developer", "owner", "company_owner", "admin"] },
];

export const ADMIN_DEFAULT_PINS = ["dashboard", "shifts", "employees", "movements"];

/* ── Employee portal nav items ── */
export const EMPLOYEE_NAV_ITEMS: NavItem[] = [
  { id: "portal-home", to: "/portal", icon: Home, label: "Inicio", module: null, end: true, section: "Principal" },
  { id: "portal-clock", to: "/portal/clock", icon: Clock, label: "Reloj", module: null, section: "Principal" },
  { id: "portal-shifts", to: "/portal/shifts", icon: CalendarDays, label: "Turnos", module: null, section: "Principal" },
  { id: "portal-availability", to: "/portal/availability", icon: CalendarCheck, label: "Disponibilidad", module: null, section: "Principal" },
  { id: "portal-chat", to: "/portal/chat", icon: MessageSquare, label: "Chat", module: null, section: "Principal" },
  { id: "portal-profile", to: "/portal/profile", icon: User, label: "Perfil", module: null, section: "Principal" },
];

export const EMPLOYEE_DEFAULT_PINS = ["portal-home", "portal-clock", "portal-shifts", "portal-availability", "portal-profile"];
