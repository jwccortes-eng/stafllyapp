import { NavLink, useLocation } from "react-router-dom";
import { X, LogOut, Moon, Sun, CalendarCheck, Megaphone, FileText, BookOpen, ChevronRight, Wallet, Shield, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "next-themes";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { BuildVersionBadge } from "@/components/BuildVersionBadge";
import { useT } from "@/i18n/LanguageContext";

interface MoreItem {
  id: string;
  to: string;
  icon: React.ElementType;
  labelKey: string;
  descriptionKey: string;
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
  { id: "pay-reports", to: "/portal/pay-reports", icon: Wallet, labelKey: "portal.more.item.pay_reports", descriptionKey: "portal.more.item.pay_reports_desc", moduleKey: "my_payments" },
  { id: "availability", to: "/portal/availability", icon: CalendarCheck, labelKey: "portal.more.item.availability", descriptionKey: "portal.more.item.availability_desc", moduleKey: "my_availability" },
  { id: "announcements", to: "/portal/announcements", icon: Megaphone, labelKey: "portal.more.item.announcements", descriptionKey: "portal.more.item.announcements_desc", moduleKey: "my_announcements" },
  { id: "documents", to: "/portal/documents", icon: FolderOpen, labelKey: "portal.more.item.documents", descriptionKey: "portal.more.item.documents_desc" },
  { id: "w9", to: "/portal/w9", icon: FileText, labelKey: "portal.more.item.w9", descriptionKey: "portal.more.item.w9_desc", moduleKey: "my_w9" },
  { id: "resources", to: "/portal/resources", icon: BookOpen, labelKey: "portal.more.item.resources", descriptionKey: "portal.more.item.resources_desc", moduleKey: "my_resources" },
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
  const { t } = useT();

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

      <div className="relative w-full max-h-[90vh] flex flex-col bg-card border-t border-border/30 rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Handle */}
        <div className="shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border/50" />
        </div>

        {/* Profile header */}
        <div className="shrink-0 px-6 pb-3 pt-2 flex items-center gap-3.5">
          <EmployeeAvatar
            firstName={firstName}
            lastName={lastName}
            avatarUrl={avatarUrl}
            size="lg"
            className="ring-2 ring-primary/10"
          />
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold font-heading text-foreground truncate">{employeeName || t("portal.more.account")}</p>
            <p className="text-xs text-muted-foreground">{t("portal.more.employee_portal")}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Separator className="shrink-0 opacity-30" />

        {/* Menu items (scrollable) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-4 pb-2">{t("portal.more.section.more")}</p>
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
                      {t(item.labelKey)}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70">{t(item.descriptionKey)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/20 shrink-0 flip-rtl" />
                </NavLink>
              );
            })}
          </div>

          {/* Admin access for dual-role users */}
          {canAccessAdmin && (
            <>
              <Separator className="my-3 opacity-30" />
              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-4 pb-2">{t("portal.more.section.admin")}</p>
              <NavLink
                to="/app"
                onClick={onClose}
                className="flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all active:scale-[0.98] text-foreground hover:bg-muted/40"
              >
                <div className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0 bg-accent/50">
                  <Shield className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">{t("portal.more.admin_panel")}</p>
                  <p className="text-[11px] text-muted-foreground/70">{t("portal.more.admin_panel_subtitle")}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/20 shrink-0 flip-rtl" />
              </NavLink>
            </>
          )}
        </div>

        {/* Footer (always visible, never clipped) */}
        <div className="shrink-0 flex items-center justify-between px-6 py-3.5 border-t border-border/20 bg-card pb-[calc(env(safe-area-inset-bottom,0px)+14px)]">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl hover:bg-muted/30"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? t("portal.more.light_mode") : t("portal.more.dark_mode")}
          </button>
          <LogoutConfirmDialog onConfirm={() => { onSignOut(); onClose(); }}>
            <button className="flex items-center gap-2 text-xs text-destructive/70 hover:text-destructive transition-colors px-3 py-2 rounded-xl hover:bg-destructive/[0.06]">
              <LogOut className="h-4 w-4" />
              {t("portal.more.sign_out")}
            </button>
          </LogoutConfirmDialog>
        </div>
        <div className="shrink-0 flex justify-center pb-1">
          <BuildVersionBadge />
        </div>
      </div>
    </div>
  );
}
