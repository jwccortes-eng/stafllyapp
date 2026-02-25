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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const location = useLocation();

  const visibleLinks = links.filter(link => {
    if (!link.module) return true;
    if (role === 'owner' || role === 'admin') return true;
    if (role === 'manager') return hasModuleAccess(link.module, 'view');
    return false;
  });

  const roleLabel = role === 'owner' ? 'Dueño' : role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Usuario';

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-60 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo / Brand */}
      <div className="px-5 py-4 border-b border-sidebar-border flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground text-sm font-bold">PW</span>
        </div>
        <div>
          <h1 className="text-sm font-bold text-foreground font-heading tracking-tight leading-none">
            Payroll Weekly
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">{roleLabel}</p>
        </div>
      </div>

      {/* Company selector */}
      {companies.length > 1 && (
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

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {visibleLinks.map((link) => {
          const isActive = location.pathname === link.to || 
            (link.to !== "/admin" && location.pathname.startsWith(link.to));
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <link.icon className={cn("h-[18px] w-[18px] shrink-0", isActive && "text-primary")} />
              {link.label}
            </NavLink>
          );
        })}

        {role === 'owner' && (
          <>
            <NavLink
              to="/admin/companies"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all",
                location.pathname.startsWith("/admin/companies")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Building2 className={cn("h-[18px] w-[18px] shrink-0", location.pathname.startsWith("/admin/companies") && "text-primary")} />
              Empresas
            </NavLink>
            <NavLink
              to="/admin/users"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all",
                location.pathname.startsWith("/admin/users")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Shield className={cn("h-[18px] w-[18px] shrink-0", location.pathname.startsWith("/admin/users") && "text-primary")} />
              Usuarios
            </NavLink>
          </>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all w-full"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
