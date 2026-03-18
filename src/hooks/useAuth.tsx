import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = 'developer' | 'owner' | 'company_owner' | 'admin' | 'manager' | 'supervisor' | 'employee' | null;
type ActiveMode = 'admin' | 'employee';
type EmployeeStatus = 'active' | 'inactive' | null;

interface ModulePermission {
  module: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface ActionPermission {
  action: string;
  granted: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  /** Highest-priority role (backward compat) */
  role: AppRole;
  /** All roles the user has */
  allRoles: Set<string>;
  /** Active mode: admin panel or employee portal */
  activeMode: ActiveMode;
  setActiveMode: (mode: ActiveMode) => void;
  /** Whether user can access admin panel */
  canAccessAdmin: boolean;
  /** Whether user has an employee profile */
  canAccessPortal: boolean;
  employeeId: string | null;
  employeeActive: boolean;
  fullName: string | null;
  loading: boolean;
  permissions: ModulePermission[];
  actionPermissions: ActionPermission[];
  signOut: () => Promise<void>;
  hasModuleAccess: (module: string, permission: 'view' | 'edit' | 'delete') => boolean;
  hasActionPermission: (action: string) => boolean;
}

const ADMIN_ROLES = new Set(['developer', 'owner', 'company_owner', 'admin', 'manager', 'supervisor']);

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  allRoles: new Set(),
  activeMode: 'admin',
  setActiveMode: () => {},
  canAccessAdmin: false,
  canAccessPortal: false,
  employeeId: null,
  employeeActive: true,
  fullName: null,
  loading: true,
  permissions: [],
  actionPermissions: [],
  signOut: async () => {},
  hasModuleAccess: () => false,
  hasActionPermission: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [allRoles, setAllRoles] = useState<Set<string>>(new Set());
  const [activeMode, setActiveModeState] = useState<ActiveMode>(() => {
    return (localStorage.getItem("stafly-active-mode") as ActiveMode) || 'admin';
  });
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeActive, setEmployeeActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [actionPermissions, setActionPermissions] = useState<ActionPermission[]>([]);
  const [fullName, setFullName] = useState<string | null>(null);

  const setActiveMode = useCallback((mode: ActiveMode) => {
    setActiveModeState(mode);
    localStorage.setItem("stafly-active-mode", mode);
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (roleError) throw roleError;

      const rolePriority: AppRole[] = ["developer", "owner", "company_owner", "admin", "manager", "supervisor", "employee", null];
      const availableRoles = new Set((roleRows ?? []).map((row) => row.role as string));

      // Check if user is company_owner in any company
      const { data: companyUserRoles } = await supabase
        .from("company_users")
        .select("role")
        .eq("user_id", userId);

      if (companyUserRoles?.some(cu => cu.role === 'company_owner')) {
        availableRoles.add("company_owner");
      }

      const { data: empData } = await supabase
        .from("employees")
        .select("id, is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      // If has employee profile, add employee to role set
      if (empData?.id) {
        availableRoles.add("employee");
      }

      setAllRoles(availableRoles);

      // Resolve highest-priority role
      let resolvedRole = rolePriority.find(
        (candidate) => candidate && availableRoles.has(candidate)
      ) ?? null;

      setRole(resolvedRole);

      // Fetch full name from profiles
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', userId)
        .maybeSingle();
      setFullName(profileData?.full_name ?? null);

      // Fetch module permissions for managers and supervisors
      if (resolvedRole === 'manager' || resolvedRole === 'supervisor') {
        const { data: permsData } = await supabase
          .from('module_permissions')
          .select('module, can_view, can_edit, can_delete')
          .eq('user_id', userId);
        setPermissions((permsData as ModulePermission[]) ?? []);
        const { data: actionPermsData } = await supabase
          .from('action_permissions')
          .select('action, granted')
          .eq('user_id', userId);
        setActionPermissions((actionPermsData as ActionPermission[]) ?? []);
      } else {
        setPermissions([]);
        setActionPermissions([]);
      }

      if (empData?.id) {
        setEmployeeId(empData.id);
        setEmployeeActive(empData.is_active ?? false);
      } else {
        setEmployeeId(null);
        setEmployeeActive(true);
      }

      // Auto-set active mode based on what access user has
      const hasAdminRole = [...availableRoles].some(r => ADMIN_ROLES.has(r));
      const hasEmployeeProfile = !!empData?.id;
      const savedMode = localStorage.getItem("stafly-active-mode") as ActiveMode | null;

      if (savedMode === 'employee' && hasEmployeeProfile) {
        setActiveModeState('employee');
      } else if (savedMode === 'admin' && hasAdminRole) {
        setActiveModeState('admin');
      } else if (hasAdminRole) {
        setActiveModeState('admin');
      } else if (hasEmployeeProfile) {
        setActiveModeState('employee');
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching user data:', err);
      setRole(null);
      setAllRoles(new Set());
      setEmployeeId(null);
      setPermissions([]);
      setActionPermissions([]);
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
          setAllRoles(new Set());
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
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
    setUser(null);
    setSession(null);
    setRole(null);
    setAllRoles(new Set());
    setEmployeeId(null);
    setPermissions([]);
    setActionPermissions([]);
    setFullName(null);
    window.location.href = "/";
  };

  const canAccessAdmin = [...allRoles].some(r => ADMIN_ROLES.has(r));
  const canAccessPortal = !!employeeId;

  const hasModuleAccess = (module: string, permission: 'view' | 'edit' | 'delete'): boolean => {
    if (role === 'developer' || role === 'owner' || role === 'admin') return true;
    if (role === 'manager' || role === 'supervisor') {
      const perm = permissions.find(p => p.module === module);
      if (!perm) return false;
      if (permission === 'view') return perm.can_view;
      if (permission === 'edit') return perm.can_edit;
      if (permission === 'delete') return perm.can_delete;
    }
    return false;
  };

  const hasActionPermission = (action: string): boolean => {
    if (role === 'developer' || role === 'owner' || role === 'admin') return true;
    if (role === 'manager' || role === 'supervisor') {
      const perm = actionPermissions.find(p => p.action === action);
      return perm?.granted ?? false;
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{
      user, session, role, allRoles, activeMode, setActiveMode,
      canAccessAdmin, canAccessPortal,
      employeeId, employeeActive, fullName, loading,
      permissions, actionPermissions, signOut, hasModuleAccess, hasActionPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
