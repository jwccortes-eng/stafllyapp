import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/query-client";
import { safeLocalStorage } from "@/lib/safe-storage";

interface Company {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  invite_code?: string;
  brand_color?: string | null;
  logo_url?: string | null;
}

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
});

const GLOBAL_MODE_ROLES = new Set(["developer", "owner"]);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdRaw] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set());
  /** Tracks whether the user has manually switched company in this session */
  const [manuallySelected, setManuallySelected] = useState(false);

  const canUseGlobalMode = !!role && GLOBAL_MODE_ROLES.has(role);
  const isGlobalMode = canUseGlobalMode && selectedCompanyId === null;

  const setSelectedCompanyId = useCallback((id: string | null) => {
    setSelectedCompanyIdRaw(id);
    setManuallySelected(true);
    if (id) {
      safeLocalStorage.setItem("selectedCompanyId", id);
    } else {
      safeLocalStorage.removeItem("selectedCompanyId");
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([]);
      setLoading(false);
      return;
    }

    let list: Company[] = [];

    if (role === 'developer' || role === 'owner') {
      const { data } = await supabase
        .from("companies")
        .select("id, name, slug, is_active, invite_code, brand_color, logo_url")
        .order("name");
      list = (data as Company[]) ?? [];
    } else {
      const { data } = await supabase
        .from("company_users")
        .select("company_id, companies(id, name, slug, is_active, brand_color, logo_url)")
        .eq("user_id", user.id);

      list = ((data ?? [])
        .map((cu: any) => cu.companies)
        .filter(Boolean) as Company[])
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    setCompanies(list);

    // CRITICAL: read fresh values from storage (not from closure) so a recent
    // company switch is NOT overwritten back to "first company" when this re-runs.
    const currentSelection = safeLocalStorage.getItem("selectedCompanyId");

    if (canUseGlobalMode) {
      // Developer/owner: start in global mode unless user manually switched this session
      if (!manuallySelected) {
        setSelectedCompanyIdRaw(null);
      }
    } else {
      // Regular users MUST have a company context.
      // Trust localStorage as source of truth — do NOT clobber a valid selection.
      const validStored = currentSelection && list.some(c => c.id === currentSelection)
        ? currentSelection
        : null;

      if (validStored) {
        setSelectedCompanyIdRaw(validStored);
      } else if (list.length > 0) {
        const first = list[0].id;
        setSelectedCompanyIdRaw(first);
        safeLocalStorage.setItem("selectedCompanyId", first);
      } else {
        setSelectedCompanyIdRaw(null);
      }
    }

    setLoading(false);
  }, [user, role, canUseGlobalMode, manuallySelected]);

  /** Switch company: update state + invalidate all cached queries */
  const switchCompany = useCallback((id: string | null) => {
    if (id === selectedCompanyId) return;
    setSelectedCompanyId(id);
    queryClient.invalidateQueries();
  }, [selectedCompanyId, setSelectedCompanyId]);

  useEffect(() => {
    if (user && role !== undefined) fetchCompanies();
  }, [user, role, fetchCompanies]);

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
