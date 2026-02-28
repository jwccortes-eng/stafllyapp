import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Company {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

interface CompanyContextType {
  companies: Company[];
  selectedCompanyId: string | null;
  selectedCompany: Company | null;
  setSelectedCompanyId: (id: string) => void;
  loading: boolean;
  refetch: () => Promise<void>;
  activeModules: Set<string>;
  isModuleActive: (module: string) => boolean;
}

const CompanyContext = createContext<CompanyContextType>({
  companies: [],
  selectedCompanyId: null,
  selectedCompany: null,
  setSelectedCompanyId: () => {},
  loading: true,
  refetch: async () => {},
  activeModules: new Set(),
  isModuleActive: () => true,
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set());

  const fetchCompanies = async () => {
    if (!user) {
      setCompanies([]);
      setLoading(false);
      return;
    }

    let list: Company[] = [];

    if (role === 'owner') {
      // Owners see all companies
      const { data } = await supabase
        .from("companies")
        .select("id, name, slug, is_active")
        .order("name");
      list = (data as Company[]) ?? [];
    } else {
      // Non-owners only see companies they belong to via company_users
      const { data } = await supabase
        .from("company_users")
        .select("company_id, companies(id, name, slug, is_active)")
        .eq("user_id", user.id);

      list = ((data ?? [])
        .map((cu: any) => cu.companies)
        .filter(Boolean) as Company[])
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    setCompanies(list);

    // Auto-select first company if none selected
    if (!selectedCompanyId && list.length > 0) {
      const stored = localStorage.getItem("selectedCompanyId");
      if (stored && list.find(c => c.id === stored)) {
        setSelectedCompanyId(stored);
      } else {
        setSelectedCompanyId(list[0].id);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    if (user && role !== undefined) fetchCompanies();
  }, [user, role]);

  useEffect(() => {
    if (selectedCompanyId) {
      localStorage.setItem("selectedCompanyId", selectedCompanyId);
      // Fetch active modules for selected company
      supabase
        .from("company_modules")
        .select("module")
        .eq("company_id", selectedCompanyId)
        .eq("is_active", true)
        .then(({ data }) => {
          setActiveModules(new Set((data ?? []).map(d => d.module)));
        });
    }
  }, [selectedCompanyId]);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId) ?? null;

  const isModuleActive = (module: string) => {
    // If no modules configured yet, show everything
    if (activeModules.size === 0) return true;
    return activeModules.has(module);
  };

  return (
    <CompanyContext.Provider value={{ companies, selectedCompanyId, selectedCompany, setSelectedCompanyId, loading, refetch: fetchCompanies, activeModules, isModuleActive }}>
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
