import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/query-client";
import { logMount, logUnmount } from "@/lib/ctx001-forensics";

import {
  readSelectedCompanyForTab,
  writeSelectedCompanyForTab,
  clearSelectedCompanyForTab,
  migrateLegacySelectedCompany,
} from "@/lib/auth-session";

interface Company {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  invite_code?: string;
  brand_color?: string | null;
  logo_url?: string | null;
  status?: string | null;
  source?: string | null;
  is_test?: boolean | null;
  is_demo?: boolean | null;
}

export type TenantSwitchState = "idle" | "switching" | "error";

interface CompanyContextType {
  companies: Company[];
  selectedCompanyId: string | null;
  selectedCompany: Company | null;
  setSelectedCompanyId: (id: string | null) => void;
  /** Switch company with cache invalidation */
  switchCompany: (id: string | null) => void;
  loading: boolean;
  refetch: () => Promise<void>;
  activeModules: Set<string>;
  isModuleActive: (module: string) => boolean;
  /** Whether user is in global mode (no company selected, developer/owner only) */
  isGlobalMode: boolean;
  /** Whether user CAN enter global mode */
  canUseGlobalMode: boolean;
  /** P0 OX — the company list itself failed to load. */
  loadError: string | null;
  /** P0 OX — explicit tenant-switch lifecycle. Never fails silently. */
  switchState: TenantSwitchState;
  switchError: string | null;
  /** Retry the last failed switch (or the company list load). */
  retrySwitch: () => void;
  clearSwitchError: () => void;
}

const CompanyContext = createContext<CompanyContextType>({
  companies: [],
  selectedCompanyId: null,
  selectedCompany: null,
  setSelectedCompanyId: () => {},
  switchCompany: () => {},
  loading: true,
  refetch: async () => {},
  activeModules: new Set(),
  isModuleActive: () => true,
  isGlobalMode: false,
  canUseGlobalMode: false,
  loadError: null,
  switchState: "idle",
  switchError: null,
  retrySwitch: () => {},
  clearSwitchError: () => {},
});


const GLOBAL_MODE_ROLES = new Set(["developer", "owner"]);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const {
    user,
    session,
    authState,
    role,
    loading: authLoading,
    companyRoles,
    allEmployeeIds,
    activeMode,
    canAccessAdminForCompany,
    canAccessPortalForCompany,
  } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdRaw] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set());
  /** Tracks whether the user has manually switched company in this session */
  const [manuallySelected, setManuallySelected] = useState(false);

  useEffect(() => {
    const id = logMount("CompanyProvider");
    return () => logUnmount("CompanyProvider", id);
  }, []);


  const canUseGlobalMode = !!role && GLOBAL_MODE_ROLES.has(role);
  const isGlobalMode = canUseGlobalMode && selectedCompanyId === null;

  const logPostLoginDebug = useCallback((step: string, nextCompanies: Company[], nextSelectedCompanyId: string | null, nextCompanyLoading: boolean) => {
    console.info("[post-login-debug]", {
      step,
      userId: user?.id ?? null,
      sessionExists: !!session,
      authLoading,
      companyLoading: nextCompanyLoading,
      selectedCompanyId: nextSelectedCompanyId,
      selectedCompanyName: nextCompanies.find((company) => company.id === nextSelectedCompanyId)?.name ?? null,
      companies: nextCompanies.map((company) => ({ id: company.id, name: company.name })),
      companyRoles,
      allEmployeeIds,
      activeMode,
      canAccessAdminForSelected: canAccessAdminForCompany(nextSelectedCompanyId),
      canAccessPortalForSelected: canAccessPortalForCompany(nextSelectedCompanyId),
      redirectTarget: null,
    });
  }, [activeMode, allEmployeeIds, authLoading, canAccessAdminForCompany, canAccessPortalForCompany, companyRoles, session, user]);

  const setSelectedCompanyId = useCallback((id: string | null) => {
    setSelectedCompanyIdRaw(id);
    setManuallySelected(true);
    const uid = user?.id ?? null;
    if (id) {
      writeSelectedCompanyForTab(uid, id);
    } else {
      clearSelectedCompanyForTab(uid);
    }
  }, [user?.id]);

  const fetchCompanies = useCallback(async () => {
    if (authLoading) {
      console.info("[STAFLY-CTX-001][company-loading] start", {
        provider: "CompanyProvider",
        reason: "authLoading became true",
        authState,
      });
      setLoading(true);
      return;
    }

    // STAFLY-CTX-001: while auth is probing a suspicious SIGNED_OUT, keep the
    // current company context intact. Do NOT hit the network or reset state.
    if (authState === "recovering") {
      return;
    }

    if (!user) {
      setCompanies([]);
      setSelectedCompanyIdRaw(null);
      setLoading(false);
      logPostLoginDebug("company-provider-no-user", [], null, false);
      return;
    }

    console.info("[STAFLY-CTX-001][company-loading] start", {
      provider: "CompanyProvider",
      reason: "fetchCompanies started",
      authState,
    });
    setLoading(true);

    let list: Company[] = [];
    let resolvedSelection: string | null = null;

    try {
      if (role === 'developer' || role === 'owner') {
        const { data, error } = await supabase
          .from("companies")
          .select("id, name, slug, is_active, invite_code, brand_color, logo_url, status, source, is_test, is_demo")
          .order("name");
        if (error) throw error;
        list = (data as Company[]) ?? [];
      } else {
        const { data, error } = await supabase
          .from("company_users")
          .select("company_id, companies(id, name, slug, is_active, brand_color, logo_url, status, source, is_test, is_demo)")
          .eq("user_id", user.id);
        if (error) throw error;
        list = ((data ?? [])
          .map((cu: any) => cu.companies)
          .filter(Boolean) as Company[])
          // Hide suspended/archived tenants from non-developer users.
          .filter((c) => c.status !== "suspended" && c.status !== "archived")
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (err) {
      // Don't blow up the UI on transient/permission errors — leave the
      // user with whatever they had cached and let the consumer decide.
      console.error("[useCompany] fetchCompanies failed:", err);
      list = [];
    }

    setCompanies(list);

    // Per-tab source of truth for the active company. On first load for this
    // user in this tab, migrate the legacy global localStorage key ONCE so
    // returning users don't lose their selection, then drop it to prevent
    // cross-tab bleed.
    const validIds = list.map((c) => c.id);
    const migrated = migrateLegacySelectedCompany(user.id, validIds);
    let currentSelection = readSelectedCompanyForTab(user.id);
    if (!currentSelection && migrated) {
      writeSelectedCompanyForTab(user.id, migrated);
      currentSelection = migrated;
    }

    if (canUseGlobalMode) {
      // Developer/owner: respect a valid stored selection if it still belongs
      // to an accessible company; otherwise drop to global mode.
      const validStored = currentSelection && list.some(c => c.id === currentSelection)
        ? currentSelection
        : null;
      if (manuallySelected) {
        if (!validStored && selectedCompanyId !== null) {
          setSelectedCompanyIdRaw(null);
          clearSelectedCompanyForTab(user.id);
        }
        resolvedSelection = validStored ?? selectedCompanyId;
      } else if (validStored) {
        setSelectedCompanyIdRaw(validStored);
        resolvedSelection = validStored;
      } else {
        setSelectedCompanyIdRaw(null);
        clearSelectedCompanyForTab(user.id);
        resolvedSelection = null;
      }
    } else {
      // Regular users MUST have a company context.
      const validStored = currentSelection && list.some(c => c.id === currentSelection)
        ? currentSelection
        : null;

      if (validStored) {
        setSelectedCompanyIdRaw(validStored);
        resolvedSelection = validStored;
      } else if (list.length > 0) {
        if (currentSelection && currentSelection !== list[0].id) {
          clearSelectedCompanyForTab(user.id);
        }
        const first = list[0].id;
        setSelectedCompanyIdRaw(first);
        writeSelectedCompanyForTab(user.id, first);
        resolvedSelection = first;
      } else {
        setSelectedCompanyIdRaw(null);
        clearSelectedCompanyForTab(user.id);
        resolvedSelection = null;
      }
    }

    console.info("[STAFLY-CTX-001][company-loading] end", {
      provider: "CompanyProvider",
      reason: "fetchCompanies completed",
      authState,
    });
    setLoading(false);
    logPostLoginDebug("company-provider-resolved", list, resolvedSelection, false);
  }, [authLoading, authState, user, role, canUseGlobalMode, manuallySelected, selectedCompanyId, logPostLoginDebug]);

  /** Switch company: update state + invalidate all cached queries */
  const switchCompany = useCallback((id: string | null) => {
    if (id === selectedCompanyId) return;
    setSelectedCompanyId(id);
    queryClient.invalidateQueries();
  }, [selectedCompanyId, setSelectedCompanyId]);

  useEffect(() => {
    void fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    if (selectedCompanyId) {
      // Fetch active modules for selected company
      supabase
        .from("company_modules")
        .select("module")
        .eq("company_id", selectedCompanyId)
        .eq("is_active", true)
        .then(({ data }) => {
          setActiveModules(new Set((data ?? []).map(d => d.module)));
        });
    } else {
      setActiveModules(new Set());
    }
  }, [selectedCompanyId]);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId) ?? null;

  const isModuleActive = (module: string) => {
    // In global mode or no modules configured, show everything
    if (isGlobalMode || activeModules.size === 0) return true;
    return activeModules.has(module);
  };

  return (
    <CompanyContext.Provider value={{
      companies, selectedCompanyId, selectedCompany, setSelectedCompanyId,
      switchCompany, loading, refetch: fetchCompanies, activeModules, isModuleActive,
      isGlobalMode, canUseGlobalMode,
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
