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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const links = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/employees", icon: Users, label: "Empleados" },
  { to: "/admin/periods", icon: CalendarDays, label: "Periodos" },
  { to: "/admin/import", icon: Upload, label: "Importar" },
  { to: "/admin/concepts", icon: Tags, label: "Conceptos" },
  { to: "/admin/movements", icon: DollarSign, label: "Novedades" },
  { to: "/admin/summary", icon: FileSpreadsheet, label: "Resumen" },
  { to: "/admin/reports", icon: BarChart3, label: "Reportes" },
];

export default function AdminSidebar() {
  const { signOut } = useAuth();
  const location = useLocation();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-5 border-b border-sidebar-border">
        <h1 className="text-lg font-bold text-sidebar-primary-foreground font-heading tracking-tight">
          Payroll Weekly
        </h1>
        <p className="text-xs text-sidebar-foreground/60 mt-0.5">Manager</p>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {links.map((link) => {
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
