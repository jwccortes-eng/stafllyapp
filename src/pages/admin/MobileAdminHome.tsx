import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, CalendarDays, Clock, DollarSign, Inbox, Building2,
  Search, ArrowRight, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Mobile-first Admin Home — Command Center style.
 * Frontend-only. Reuses existing routes, permissions and tenant scoping.
 * Desktop Dashboard is untouched; this only renders when useIsMobile() is true.
 */

type ActionKey =
  | "workers" | "shifts" | "timeclock" | "payroll" | "tickets" | "clients" | "communities";

interface ActionDef {
  key: ActionKey;
  label: string;
  hint: string;
  to: string;
  icon: any;
  module: string | null;
  badgeKey?: "tickets" | "shift_requests";
  accent: string; // tailwind class for icon tile bg
}

const ACTIONS: ActionDef[] = [
  { key: "workers", label: "Workers", hint: "Roster & profiles", to: "/app/employees", icon: Users, module: "employees", accent: "bg-primary/10 text-primary" },
  { key: "shifts", label: "Shifts", hint: "Schedule & assign", to: "/app/shifts", icon: CalendarDays, module: "shifts", badgeKey: "shift_requests", accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { key: "timeclock", label: "Time Clock", hint: "Live attendance", to: "/app/timeclock", icon: Clock, module: "shifts", accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { key: "payroll", label: "Payroll", hint: "Periods & reports", to: "/app/periods", icon: DollarSign, module: "periods", accent: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  { key: "tickets", label: "Requests", hint: "Tickets & inbox", to: "/app/requests", icon: Inbox, module: null, badgeKey: "tickets", accent: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  { key: "clients", label: "Clients", hint: "Accounts & sites", to: "/app/clients", icon: Building2, module: "clients", accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
];

export default function MobileAdminHome() {
  const navigate = useNavigate();
  const { selectedCompanyId, selectedCompany, isModuleActive, isGlobalMode } = useCompany();
  const { role: globalRole, hasModuleAccess, fullName, getRoleForCompany } = useAuth();
  const role = isGlobalMode ? globalRole : getRoleForCompany(selectedCompanyId);
  const isAdminRole = role === "developer" || role === "owner" || role === "company_owner" || role === "admin";

  const [badges, setBadges] = useState<{ tickets: number; shift_requests: number }>({ tickets: 0, shift_requests: 0 });

  // Reuse the same badge query as AdminSidebar (tickets + pending shift assignments)
  useEffect(() => {
    if (!selectedCompanyId) {
      setBadges({ tickets: 0, shift_requests: 0 });
      return;
    }
    let alive = true;
    async function fetchBadges() {
      const [ticketsRes, shiftReqRes] = await Promise.all([
        supabase.from("employee_tickets").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).in("status", ["new", "in_progress"]),
        supabase.from("shift_assignments").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).eq("status", "pending"),
      ]);
      if (!alive) return;
      setBadges({
        tickets: ticketsRes.count ?? 0,
        shift_requests: shiftReqRes.count ?? 0,
      });
    }
    fetchBadges();
    const id = setInterval(fetchBadges, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [selectedCompanyId]);

  // Permission filter mirrors AdminSidebar.isLinkVisible logic for module-gated items
  const isVisible = (a: ActionDef) => {
    if (isGlobalMode) return true;
    if (a.module) {
      if (!isModuleActive(a.module)) return false;
      if (role === "developer" || role === "owner" || role === "company_owner" || role === "admin") return true;
      if (role === "manager" || role === "supervisor") return hasModuleAccess(a.module, "view");
      return false;
    }
    return true;
  };

  const visibleActions = useMemo(() => ACTIONS.filter(isVisible), [role, selectedCompanyId, isGlobalMode]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const firstName = (fullName || "").split(" ")[0] || "Operator";
  const companyLabel = isGlobalMode ? "Global mode" : (selectedCompany?.name || "Stafly");

  const openCommandPalette = () => {
    // Reuse the existing CommandPalette ⌘K trigger (same pattern as nTrigger).
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  };

  return (
    <div className="min-h-full pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
      {/* Hero */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
          <Sparkles className="h-3 w-3" />
          <span className="truncate">{companyLabel}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight leading-tight">
          {greeting},<br />
          <span className="text-primary">{firstName}.</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Your command center. Tap to jump in.
        </p>
      </div>

      {/* Search bar */}
      <div className="px-5 pb-4">
        <button
          type="button"
          onClick={openCommandPalette}
          className={cn(
            "w-full flex items-center gap-3 h-12 px-4 rounded-2xl",
            "bg-muted/50 hover:bg-muted/70 active:scale-[0.99] transition-all",
            "border border-border/40 text-left"
          )}
        >
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground truncate">
            Search workers, shifts, clients…
          </span>
          <kbd className="ml-auto text-[10px] font-mono text-muted-foreground/70 px-1.5 py-0.5 rounded bg-background/80 border border-border/40">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Action grid */}
      <div className="px-5">
        <div className="grid grid-cols-2 gap-3">
          {visibleActions.map((a) => {
            const Icon = a.icon;
            const count = a.badgeKey ? badges[a.badgeKey] : 0;
            return (
              <button
                key={a.key}
                onClick={() => navigate(a.to)}
                className={cn(
                  "group relative flex flex-col items-start text-left",
                  "rounded-2xl border border-border/50 bg-card",
                  "p-4 min-h-[120px]",
                  "active:scale-[0.97] hover:border-border transition-all",
                  "shadow-sm hover:shadow-md"
                )}
              >
                <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center mb-3", a.accent)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-semibold tracking-tight">{a.label}</span>
                  {count > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold ml-auto bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      {count > 9 ? "9+" : count}
                    </Badge>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                  {a.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick links */}
      <div className="px-5 mt-6">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 px-1">
          Quick access
        </div>
        <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40 overflow-hidden">
          <QuickLink label="Live Map" to="/app/live-map" onNav={navigate} />
          <QuickLink label="Announcements" to="/app/announcements" onNav={navigate} />
          <QuickLink label="Front Desk" to="/app/front-desk" onNav={navigate} />
          <QuickLink label="Reports" to="/app/summary" onNav={navigate} />
        </div>
      </div>

      <div className="px-5 mt-6 mb-2">
        <p className="text-[11px] text-center text-muted-foreground/70">
          Tap <span className="font-semibold">More</span> in the bottom bar for full navigation.
        </p>
      </div>
    </div>
  );
}

function QuickLink({ label, to, onNav }: { label: string; to: string; onNav: (to: string) => void }) {
  return (
    <button
      onClick={() => onNav(to)}
      className="w-full flex items-center justify-between px-4 py-3.5 active:bg-muted/40 transition-colors"
    >
      <span className="text-sm font-medium">{label}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
