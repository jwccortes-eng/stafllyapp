import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, CalendarDays, Users, Building2, MapPin, Moon, Sun, Globe } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import NotificationBell from "@/components/NotificationBell";
import { useT } from "@/i18n";

import { CommandPaletteTrigger } from "@/components/CommandPalette";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { CompanyLogo } from "@/components/ui/company-logo";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function TopBar({ collapsed }: { collapsed: boolean }) {
  const { user, fullName, signOut, getRoleForCompany } = useAuth();
  const { selectedCompany, selectedCompanyId, companies, isGlobalMode } = useCompany();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { t } = useT();

  const CREATE_OPTIONS = [
    { label: t("topbar.create.shift"), icon: CalendarDays, route: "/app/shifts?create=1" },
    { label: t("topbar.create.worker"), icon: Users, route: "/app/employees?create=1" },
    { label: t("topbar.create.client"), icon: Building2, route: "/app/clients?create=1" },
    { label: t("topbar.create.location"), icon: MapPin, route: "/app/locations?create=1" },
  ];



  // Effective role within the CURRENT company context (or global mode for
  // platform staff). The badge must NEVER show a role the user doesn't truly
  // hold in the selected tenant.
  const effectiveRole = getRoleForCompany(selectedCompanyId);
  const isOwner = effectiveRole === "developer" || effectiveRole === "owner";
  const isMultiCompany = companies.length > 1;
  const initials = fullName
    ? fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email ? user.email[0].toUpperCase() : "?";
  const roleLabel =
    effectiveRole === "developer" ? t("topbar.role.dev")
    : effectiveRole === "owner" ? t("topbar.role.owner")
    : effectiveRole === "company_owner" ? t("topbar.role.owner")
    : effectiveRole === "admin" ? t("topbar.role.admin")
    : effectiveRole === "manager" ? t("topbar.role.manager")
    : effectiveRole === "supervisor" ? t("topbar.role.supervisor")
    : effectiveRole === "employee" ? t("topbar.role.employee")
    : t("topbar.role.user");

  return (
    <header
      className={cn(
        "sticky top-0 z-20 h-16 flex items-center justify-between gap-4 px-7 lg:px-10 border-b border-border/50 bg-background/85 backdrop-blur-xl transition-all duration-300",
        collapsed ? "ms-[68px]" : "ms-[240px]"
      )}
    >
      {/* Izquierda: identidad sólo cuando el sidebar está colapsado (fuente única) + búsqueda */}
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        {collapsed && isGlobalMode ? (
          <div className="flex items-center gap-2.5 shrink-0 pe-3 border-e border-border/30">
            <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <Globe className="h-4 w-4 text-accent-foreground" />
            </div>
            <div className="hidden sm:flex flex-col min-w-0">
              <span className="text-[13px] font-semibold text-foreground leading-tight">{t("topbar.global_view")}</span>
              <span className="text-[10px] text-muted-foreground/60 leading-tight">{t("topbar.companies_count", { n: companies.length })}</span>
            </div>
          </div>
        ) : collapsed && selectedCompany ? (
          <div className="flex items-center gap-2.5 shrink-0 pe-3 border-e border-border/30">
            <CompanyLogo
              name={selectedCompany.name}
              logoUrl={selectedCompany.logo_url}
              brandColor={selectedCompany.brand_color}
              size="sm"
              active
              glow
            />
            <span className={cn(
              "font-semibold text-foreground truncate hidden sm:inline leading-tight",
              isMultiCompany ? "text-[13px] max-w-[200px]" : "text-[12px] max-w-[160px]"
            )}>
              {selectedCompany.name}
            </span>
            {selectedCompany.is_demo ? (
              <span className="hidden sm:inline-flex items-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                {t("topbar.demo")}
              </span>
            ) : null}
          </div>
        ) : null}
        <CommandPaletteTrigger collapsed={false} />
      </div>


      {/* Right: actions */}
      <div className="flex items-center gap-1.5">
        {/* El cambio de contexto vive en el sidebar (fuente única en desktop). */}

        {/* Global Create — only in company mode */}
        {!isGlobalMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 rounded-lg text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" />
                {t("topbar.create")}
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
        )}

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
              <div className="hidden md:block text-start min-w-0">
                <p className="text-[12px] font-semibold text-foreground truncate leading-tight max-w-[120px]">{fullName || t("topbar.user_fallback")}</p>
                <p className="text-[10px] text-muted-foreground/60 leading-tight">{roleLabel}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate("/app/settings")} className="text-[13px]">
              {t("topbar.account")}
            </DropdownMenuItem>
            {isOwner && (
              <DropdownMenuItem onClick={() => navigate("/app/admin")} className="text-[13px]">
                {t("topbar.administration")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <LogoutConfirmDialog onConfirm={signOut}>
              <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive text-[13px]">
                {t("topbar.sign_out")}
              </DropdownMenuItem>
            </LogoutConfirmDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}