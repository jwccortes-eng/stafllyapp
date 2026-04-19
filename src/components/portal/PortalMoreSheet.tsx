import { NavLink, useLocation } from "react-router-dom";
import { X, LogOut, Moon, Sun, CalendarCheck, Megaphone, FileText, BookOpen, ChevronRight, Wallet, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "next-themes";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { BuildVersionBadge } from "@/components/BuildVersionBadge";

interface MoreItem {
  id: string;
  to: string;
  icon: React.ElementType;
  label: string;
  description?: string;
}

interface PortalMoreSheetProps {
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
  employeeName?: string;
  avatarUrl?: string | null;
  enabledModules: Set<string>;
  isModuleEnabled: (key: string) => boolean;
  canAccessAdmin?: boolean;
}

const ALL_MORE_ITEMS: (MoreItem & { moduleKey?: string })[] = [
  { id: "payments", to: "/portal/payments", icon: Wallet, label: "Pagos", description: "Historial de pagos", moduleKey: "my_payments" },
  { id: "availability", to: "/portal/availability", icon: CalendarCheck, label: "Disponibilidad", description: "Gestiona tu horario", moduleKey: "my_availability" },
  { id: "announcements", to: "/portal/announcements", icon: Megaphone, label: "Anuncios", description: "Noticias de la empresa", moduleKey: "my_announcements" },
  { id: "w9", to: "/portal/w9", icon: FileText, label: "Formulario W-9", description: "Información fiscal", moduleKey: "my_w9" },
  { id: "resources", to: "/portal/resources", icon: BookOpen, label: "Recursos", description: "Material de apoyo", moduleKey: "my_resources" },
];

export function PortalMoreSheet({
  open,
  onClose,
  onSignOut,
  employeeName,
  avatarUrl,
  isModuleEnabled,
  canAccessAdmin,
}: PortalMoreSheetProps) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  if (!open) return null;

  const visibleItems = ALL_MORE_ITEMS.filter(
    (item) => !item.moduleKey || isModuleEnabled(item.moduleKey)
  );

  const firstName = employeeName?.split(" ")[0] || "";
  const lastName = employeeName?.split(" ").slice(1).join(" ") || "";

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-md animate-in fade-in-0 duration-200"
        onClick={onClose}
      />

      <div className="relative w-full max-h-[85vh] overflow-hidden bg-card border-t border-border/30 rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border/50" />
        </div>

        {/* Profile header */}
        <div className="px-6 pb-3 pt-2 flex items-center gap-3.5">
          <EmployeeAvatar
            firstName={firstName}
            lastName={lastName}
            avatarUrl={avatarUrl}
            size="lg"
            className="ring-2 ring-primary/10"
          />
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold font-heading text-foreground truncate">{employeeName || "Mi Cuenta"}</p>
            <p className="text-xs text-muted-foreground">Portal de empleado</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Separator className="opacity-30" />

        {/* Menu items */}
        <div className="px-4 py-3 overflow-y-auto max-h-[50vh]">
          <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-4 pb-2">Más opciones</p>
          <div className="space-y-0.5">
            {visibleItems.map((item) => {
              const isActive =
                location.pathname === item.to ||
                location.pathname.startsWith(item.to + "/");

              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all active:scale-[0.98]",
                    isActive
                      ? "bg-primary/8 text-primary"
                      : "text-foreground hover:bg-muted/40"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center h-9 w-9 rounded-lg shrink-0",
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted/50"
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[13px] font-medium", isActive && "font-semibold")}>
                      {item.label}
                    </p>
                    {item.description && (
                      <p className="text-[11px] text-muted-foreground/70">{item.description}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/20 shrink-0" />
                </NavLink>
              );
            })}
          </div>

          {/* Admin access for dual-role users */}
          {canAccessAdmin && (
            <>
              <Separator className="my-3 opacity-30" />
              <NavLink
                to="/app"
                onClick={onClose}
                className="flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all active:scale-[0.98] text-foreground hover:bg-muted/40"
              >
                <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0 bg-accent/50">
                  <Shield className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">Panel Admin</p>
                  <p className="text-[11px] text-muted-foreground/70">Acceder al panel de administración</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/20 shrink-0" />
              </NavLink>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-border/20">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl hover:bg-muted/30"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>
          <LogoutConfirmDialog onConfirm={() => { onSignOut(); onClose(); }}>
            <button className="flex items-center gap-2 text-xs text-destructive/70 hover:text-destructive transition-colors px-3 py-2 rounded-xl hover:bg-destructive/[0.06]">
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </LogoutConfirmDialog>
        </div>
        <div className="flex justify-center pb-2">
          <BuildVersionBadge />
        </div>
      </div>
    </div>
  );
}
