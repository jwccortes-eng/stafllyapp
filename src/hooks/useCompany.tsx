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
}

const CompanyContext = createContext<CompanyContextType>({
  companies: [],
  selectedCompanyId: null,
  selectedCompany: null,
  setSelectedCompanyId: () => {},
  loading: true,
  refetch: async () => {},
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCompanies = async () => {
    if (!user) {
      setCompanies([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("companies")
      .select("id, name, slug, is_active")
      .order("name");

    const list = (data as Company[]) ?? [];
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
    if (user) fetchCompanies();
  }, [user]);

  useEffect(() => {
    if (selectedCompanyId) {
      localStorage.setItem("selectedCompanyId", selectedCompanyId);
    }
  }, [selectedCompanyId]);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId) ?? null;

  return (
    <CompanyContext.Provider value={{ companies, selectedCompanyId, selectedCompany, setSelectedCompanyId, loading, refetch: fetchCompanies }}>
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
