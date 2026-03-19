import { useState } from "react";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { useNavigate } from "react-router-dom";
import { Plus, CalendarDays, Users, Building2, MapPin, Search, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import NotificationBell from "@/components/NotificationBell";
import { CommandPaletteTrigger } from "@/components/CommandPalette";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const CREATE_OPTIONS = [
  { label: "Nuevo Turno", icon: CalendarDays, route: "/app/shifts?create=1" },
  { label: "Nuevo Trabajador", icon: Users, route: "/app/employees?create=1" },
  { label: "Nueva Empresa", icon: Building2, route: "/app/clients?create=1" },
  { label: "Nueva Ubicación", icon: MapPin, route: "/app/locations?create=1" },
];

export default function TopBar({ collapsed }: { collapsed: boolean }) {
  const { user, role, fullName, signOut } = useAuth();
  const { selectedCompany, companies } = useCompany();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const companyColor = selectedCompany?.brand_color || "#6366f1";
  const isOwner = role === "developer" || role === "owner";
  const isMultiCompany = companies.length > 1;
  const initials = fullName
    ? fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email ? user.email[0].toUpperCase() : "?";
  const roleLabel = role === "developer" ? "Dev" : role === "owner" ? "Owner" : role === "admin" ? "Admin" : role === "manager" ? "Manager" : "User";

  return (
    <header
      className={cn(
        "sticky top-0 z-20 h-14 flex items-center justify-between gap-4 px-6 border-b border-border/60 bg-card/80 backdrop-blur-xl transition-all duration-300",
        collapsed ? "ml-[60px]" : "ml-[240px]"
      )}
    >
      {/* Left: Company context badge + Search */}
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        {selectedCompany && (
          <div className={cn(
            "flex items-center gap-2 shrink-0",
            isMultiCompany ? "pr-3 border-r border-border/30" : "pr-3 border-r border-border/30"
          )}>
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-background"
              style={{ backgroundColor: companyColor, boxShadow: `0 0 8px ${companyColor}40` }}
            />
            <span className={cn(
              "font-semibold text-foreground truncate hidden sm:inline",
              isMultiCompany ? "text-[13px] max-w-[180px]" : "text-[12px] max-w-[140px] text-foreground/70"
            )}>
              {selectedCompany.name}
            </span>
          </div>
        )}
        <CommandPaletteTrigger collapsed={false} />
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5">
        <ModeSwitcher />
        {/* Global Create */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-8 gap-1.5 rounded-lg text-xs font-semibold">
              <Plus className="h-3.5 w-3.5" />
              Crear
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {CREATE_OPTIONS.map(opt => (
              <DropdownMenuItem key={opt.route} onClick={() => navigate(opt.route)} className="gap-2 text-[13px]">
                <opt.icon className="h-4 w-4 text-muted-foreground" />
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notifications */}
        <NotificationBell />

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors">
              <Avatar className={cn("h-7 w-7 border", isOwner ? "border-accent-warm/30" : "border-primary/15")}>
                <AvatarFallback className={cn("text-[10px] font-bold", isOwner ? "bg-accent-warm/[0.1] text-accent-warm" : "bg-primary/[0.08] text-primary")}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left min-w-0">
                <p className="text-[12px] font-semibold text-foreground truncate leading-tight max-w-[120px]">{fullName || "Usuario"}</p>
                <p className="text-[10px] text-muted-foreground/60 leading-tight">{roleLabel}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate("/app/settings")} className="text-[13px]">
              Cuenta
            </DropdownMenuItem>
            {isOwner && (
              <DropdownMenuItem onClick={() => navigate("/app/admin")} className="text-[13px]">
                Administración
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <LogoutConfirmDialog onConfirm={signOut}>
              <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive text-[13px]">
                Cerrar sesión
              </DropdownMenuItem>
            </LogoutConfirmDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
