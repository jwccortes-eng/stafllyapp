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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const links = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", module: null },
  { to: "/admin/employees", icon: Users, label: "Empleados", module: "employees" },
  { to: "/admin/periods", icon: CalendarDays, label: "Periodos", module: "periods" },
  { to: "/admin/import", icon: Upload, label: "Importar", module: "import" },
  { to: "/admin/concepts", icon: Tags, label: "Conceptos", module: "concepts" },
  { to: "/admin/movements", icon: DollarSign, label: "Novedades", module: "movements" },
  { to: "/admin/summary", icon: FileSpreadsheet, label: "Resumen", module: "summary" },
  { to: "/admin/reports", icon: BarChart3, label: "Reportes", module: "reports" },
];

export default function AdminSidebar() {
  const { signOut, role, hasModuleAccess } = useAuth();
  const location = useLocation();

  const visibleLinks = links.filter(link => {
    if (!link.module) return true; // Dashboard always visible
    if (role === 'owner' || role === 'admin') return true;
    if (role === 'manager') return hasModuleAccess(link.module, 'view');
    return false;
  });

  const roleLabel = role === 'owner' ? 'Dueño' : role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Usuario';

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-5 border-b border-sidebar-border">
        <h1 className="text-lg font-bold text-sidebar-primary-foreground font-heading tracking-tight">
          Payroll Weekly
        </h1>
        <p className="text-xs text-sidebar-foreground/60 mt-0.5">{roleLabel}</p>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleLinks.map((link) => {
          const isActive = location.pathname === link.to || 
            (link.to !== "/admin" && location.pathname.startsWith(link.to));
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <link.icon className="h-4 w-4 shrink-0" />
              {link.label}
            </NavLink>
          );
        })}

        {/* Users management - only owner */}
        {role === 'owner' && (
          <NavLink
            to="/admin/users"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              location.pathname.startsWith("/admin/users")
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Shield className="h-4 w-4 shrink-0" />
            Usuarios
          </NavLink>
        )}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
