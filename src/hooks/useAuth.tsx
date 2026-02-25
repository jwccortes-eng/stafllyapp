import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = 'owner' | 'admin' | 'manager' | 'employee' | null;
type EmployeeStatus = 'active' | 'inactive' | null;

interface ModulePermission {
  module: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole;
  employeeId: string | null;
  employeeActive: boolean;
  fullName: string | null;
  loading: boolean;
  permissions: ModulePermission[];
  signOut: () => Promise<void>;
  hasModuleAccess: (module: string, permission: 'view' | 'edit' | 'delete') => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  employeeId: null,
  employeeActive: true,
  fullName: null,
  loading: true,
  permissions: [],
  signOut: async () => {},
  hasModuleAccess: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeActive, setEmployeeActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [fullName, setFullName] = useState<string | null>(null);

  const fetchUserData = async (userId: string) => {
    try {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      
      const newRole = (roleData?.role as AppRole) ?? null;
      setRole(newRole);

      // Fetch full name from profiles
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', userId)
        .maybeSingle();
      setFullName(profileData?.full_name ?? null);

      // Fetch module permissions for managers
      if (newRole === 'manager') {
        const { data: permsData } = await supabase
          .from('module_permissions')
          .select('module, can_view, can_edit, can_delete')
          .eq('user_id', userId);
        setPermissions((permsData as ModulePermission[]) ?? []);
      } else {
        setPermissions([]);
      }

      if (newRole === 'employee') {
        const { data: empData } = await supabase
          .from('employees')
          .select('id, is_active')
          .eq('user_id', userId)
          .maybeSingle();
        setEmployeeId(empData?.id ?? null);
        setEmployeeActive(empData?.is_active ?? false);
      } else {
        setEmployeeId(null);
        setEmployeeActive(true);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching user data:', err);
      setRole(null);
      setEmployeeId(null);
      setPermissions([]);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id).then(() => setLoading(false));
          }, 0);
        } else {
          setRole(null);
          setEmployeeId(null);
          setPermissions([]);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasModuleAccess = (module: string, permission: 'view' | 'edit' | 'delete'): boolean => {
    if (role === 'owner' || role === 'admin') return true;
    if (role === 'manager') {
      const perm = permissions.find(p => p.module === module);
      if (!perm) return false;
      if (permission === 'view') return perm.can_view;
      if (permission === 'edit') return perm.can_edit;
      if (permission === 'delete') return perm.can_delete;
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{ user, session, role, employeeId, employeeActive, fullName, loading, permissions, signOut, hasModuleAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
