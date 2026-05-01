import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { safeLocalStorage } from "@/lib/safe-storage";

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
  /** Highest-priority GLOBAL role (developer/owner only — from user_roles).
   *  Per-company roles live in companyRoles. Do NOT use this to gate admin
   *  access for a specific tenant. */
  role: AppRole;
  /** Global roles only (from public.user_roles). */
  allRoles: Set<string>;
  /** Map of companyId → role from public.company_users (per-tenant). */
  companyRoles: Record<string, string>;
  /** Resolve role a user has IN a specific company.
   *  Combines global cross-tenant roles (developer/owner) with per-company role. */
  getRoleForCompany: (companyId: string | null) => AppRole;
  /** Whether the user has admin-level access in the given company. */
  canAccessAdminForCompany: (companyId: string | null) => boolean;
  /** Whether the user has an employee record in the given company. */
  canAccessPortalForCompany: (companyId: string | null) => boolean;
  /** Active mode: admin panel or employee portal */
  activeMode: ActiveMode;
  setActiveMode: (mode: ActiveMode) => void;
  /** DEPRECATED — global flag, true if user has any admin-level role anywhere.
   *  Use canAccessAdminForCompany(selectedCompanyId) for tenant-scoped checks. */
  canAccessAdmin: boolean;
  /** Whether user has an employee profile (anywhere) */
  canAccessPortal: boolean;
  employeeId: string | null;
  /** All employee IDs across companies */
  allEmployeeIds: { id: string; companyId: string }[];
  employeeActive: boolean;
  fullName: string | null;
  loading: boolean;
  permissions: ModulePermission[];
  actionPermissions: ActionPermission[];
  signOut: () => Promise<void>;
  hasModuleAccess: (module: string, permission: 'view' | 'edit' | 'delete') => boolean;
  hasActionPermission: (action: string) => boolean;
  /** Resolve employeeId for a specific company */
  resolveEmployeeForCompany: (companyId: string) => string | null;
}

const ADMIN_ROLES = new Set(['developer', 'owner', 'company_owner', 'admin', 'manager', 'supervisor']);
/** Roles in user_roles that are TRULY cross-tenant (Stafly platform staff). */
const GLOBAL_CROSS_TENANT_ROLES = new Set(['developer', 'owner']);

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  allRoles: new Set(),
  activeMode: 'admin',
  setActiveMode: () => {},
  canAccessAdmin: false,
  canAccessPortal: false,
  companyRoles: {},
  getRoleForCompany: () => null,
  canAccessAdminForCompany: () => false,
  canAccessPortalForCompany: () => false,
  employeeId: null,
  allEmployeeIds: [],
  employeeActive: true,
  fullName: null,
  loading: true,
  permissions: [],
  actionPermissions: [],
  signOut: async () => {},
  hasModuleAccess: () => false,
  hasActionPermission: () => false,
  resolveEmployeeForCompany: () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [allRoles, setAllRoles] = useState<Set<string>>(new Set());
  const [companyRoles, setCompanyRoles] = useState<Record<string, string>>({});
  const [activeMode, setActiveModeState] = useState<ActiveMode>(() => {
    return (safeLocalStorage.getItem("stafly-active-mode") as ActiveMode) || 'admin';
  });
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [allEmployeeIds, setAllEmployeeIds] = useState<{ id: string; companyId: string }[]>([]);
  const [employeeActive, setEmployeeActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [actionPermissions, setActionPermissions] = useState<ActionPermission[]>([]);
  const [fullName, setFullName] = useState<string | null>(null);

  const setActiveMode = useCallback((mode: ActiveMode) => {
    setActiveModeState(mode);
    safeLocalStorage.setItem("stafly-active-mode", mode);
  }, []);

  const resetAuthState = useCallback(() => {
    setRole(null);
    setAllRoles(new Set());
    setCompanyRoles({});
    setEmployeeId(null);
    setAllEmployeeIds([]);
    setEmployeeActive(true);
    setPermissions([]);
    setActionPermissions([]);
    setFullName(null);
  }, []);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (roleError) throw roleError;

      const rolePriority: AppRole[] = ["developer", "owner", "company_owner", "admin", "manager", "supervisor", "employee", null];
      const availableRoles = new Set((roleRows ?? []).map((row) => row.role as string));

      // Per-company role membership (tenant-scoped — does NOT bleed into
      // global role/allRoles. A company_owner in JKitchen is NOT an admin in
      // Quality Staff. See `getRoleForCompany` / `canAccessAdminForCompany`.)
      const { data: companyUserRoles } = await supabase
        .from("company_users")
        .select("company_id, role")
        .eq("user_id", userId);

      const cRoles: Record<string, string> = {};
      for (const cu of companyUserRoles ?? []) {
        if (cu.company_id && cu.role) cRoles[cu.company_id as string] = cu.role as string;
      }
      setCompanyRoles(cRoles);

      const { data: empData } = await supabase
        .from("employees")
        .select("id, is_active, company_id")
        .eq("user_id", userId)
        .eq("is_active", true);

      const activeEmps = (empData ?? []).map(e => ({ id: e.id, companyId: e.company_id }));
      setAllEmployeeIds(activeEmps);

      // If has employee profile, add employee to role set
      if (activeEmps.length > 0) {
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

      // Fetch module permissions for managers and supervisors (company_owner gets full access like admin)
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

      // Set first employee as default (company context will refine later)
      const firstEmp = activeEmps[0];
      if (firstEmp) {
        setEmployeeId(firstEmp.id);
        setEmployeeActive(true);
      } else {
        setEmployeeId(null);
        setEmployeeActive(true);
      }

      // Auto-set active mode based on what access user has
      const hasAdminRole = [...availableRoles].some(r => ADMIN_ROLES.has(r));
      const hasEmployeeProfile = activeEmps.length > 0;
      const savedMode = safeLocalStorage.getItem("stafly-active-mode") as ActiveMode | null;

      if (savedMode === 'employee' && hasEmployeeProfile) {
        setActiveModeState('employee');
      } else if (savedMode === 'admin' && hasAdminRole) {
        setActiveModeState('admin');
      } else if (hasAdminRole) {
        setActiveModeState('admin');
      } else if (hasEmployeeProfile) {
        setActiveModeState('employee');
      }

      console.info("[useAuth]", {
        userId,
        sessionExists: true,
        profileExists: !!profileData,
        companyRoles: cRoles,
        allEmployeeIds: activeEmps,
        activeMode: savedMode,
        canAccessAdmin: hasAdminRole || Object.values(cRoles).some((r) => ADMIN_ROLES.has(r)),
        canAccessPortal: activeEmps.length > 0,
        redirectTarget: hasAdminRole || Object.values(cRoles).some((r) => ADMIN_ROLES.has(r)) ? "/app" : activeEmps.length > 0 ? "/portal" : "/auth",
      });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching user data:', err);
      resetAuthState();
    }
  }, [resetAuthState]);

  useEffect(() => {
    let mounted = true;

    const syncSession = async (nextSession: Session | null) => {
      if (!mounted) return;

      console.info("[useAuth]", {
        userId: nextSession?.user?.id ?? null,
        sessionExists: !!nextSession,
        step: "syncSession",
      });

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        await fetchUserData(nextSession.user.id);
      } else {
        resetAuthState();
      }

      if (mounted) {
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;

        console.info("[useAuth]", {
          userId: nextSession?.user?.id ?? null,
          sessionExists: !!nextSession,
          step: "onAuthStateChange",
          event,
        });

        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
          if (event === "INITIAL_SESSION" && !nextSession) {
            resetAuthState();
            setLoading(false);
          }
          return;
        }

        if (nextSession?.user) {
          setLoading(true);
          setTimeout(() => {
            void fetchUserData(nextSession.user.id).finally(() => {
              if (mounted) setLoading(false);
            });
          }, 0);
        } else {
          resetAuthState();
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      void syncSession(session);
    }).catch((err) => {
      if (import.meta.env.DEV) console.error('Error restoring session:', err);
      if (mounted) {
        resetAuthState();
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData, resetAuthState]);

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
    setCompanyRoles({});
    setEmployeeId(null);
    setPermissions([]);
    setActionPermissions([]);
    setFullName(null);
    // Wipe SW + CacheStorage so the next user on this device never inherits
    // cached responses or a stale bundle (Aline / iPhone fix, Apr 2026).
    try {
      const { clearPwaCachesAndUnregister } = await import("@/lib/pwa-runtime");
      await clearPwaCachesAndUnregister();
    } catch {
      // non-blocking
    }
    window.location.href = "/";
  };

  // GLOBAL admin flag — true only if the user has a true cross-tenant role
  // (developer/owner) OR ANY per-company admin role anywhere. This is kept
  // for back-compat (e.g. "do they have admin somewhere?"). It must NOT be
  // used to gate access for a specific tenant — use canAccessAdminForCompany.
  const hasGlobalCrossTenantAdmin = [...allRoles].some(r => GLOBAL_CROSS_TENANT_ROLES.has(r));
  const hasAnyCompanyAdmin = Object.values(companyRoles).some(r => ADMIN_ROLES.has(r));
  const canAccessAdmin = hasGlobalCrossTenantAdmin || hasAnyCompanyAdmin;
  const canAccessPortal = !!employeeId || allEmployeeIds.length > 0;

  const resolveEmployeeForCompany = useCallback((companyId: string): string | null => {
    return allEmployeeIds.find(e => e.companyId === companyId)?.id ?? null;
  }, [allEmployeeIds]);

  /**
   * Resolve the effective role of the user IN a specific company.
   * Priority:
   *  1. Cross-tenant platform roles (developer, owner) — apply everywhere.
   *  2. Per-company role from company_users for THAT company.
   *  3. employee (if they have an active employee record in that company).
   *  4. null.
   */
  const getRoleForCompany = useCallback((companyId: string | null): AppRole => {
    // Global platform staff keep cross-tenant access.
    if (allRoles.has('developer')) return 'developer';
    if (allRoles.has('owner')) return 'owner';
    if (!companyId) return null;
    const cRole = companyRoles[companyId];
    if (cRole) return cRole as AppRole;
    const hasEmp = allEmployeeIds.some(e => e.companyId === companyId);
    if (hasEmp) return 'employee';
    return null;
  }, [allRoles, companyRoles, allEmployeeIds]);

  const canAccessAdminForCompany = useCallback((companyId: string | null): boolean => {
    // Cross-tenant platform roles bypass tenant scope.
    if (allRoles.has('developer') || allRoles.has('owner')) return true;
    if (!companyId) return false;
    const cRole = companyRoles[companyId];
    return !!cRole && ADMIN_ROLES.has(cRole);
  }, [allRoles, companyRoles]);

  const canAccessPortalForCompany = useCallback((companyId: string | null): boolean => {
    if (!companyId) return false;
    return allEmployeeIds.some(e => e.companyId === companyId);
  }, [allEmployeeIds]);

  const hasModuleAccess = (module: string, permission: 'view' | 'edit' | 'delete'): boolean => {
    if (role === 'developer' || role === 'owner' || role === 'company_owner' || role === 'admin') return true;
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
    if (role === 'developer' || role === 'owner' || role === 'company_owner' || role === 'admin') return true;
    if (role === 'manager' || role === 'supervisor') {
      const perm = actionPermissions.find(p => p.action === action);
      return perm?.granted ?? false;
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{
      user, session, role, allRoles, companyRoles,
      getRoleForCompany, canAccessAdminForCompany, canAccessPortalForCompany,
      activeMode, setActiveMode,
      canAccessAdmin, canAccessPortal,
      employeeId, allEmployeeIds, employeeActive, fullName, loading,
      permissions, actionPermissions, signOut, hasModuleAccess, hasActionPermission,
      resolveEmployeeForCompany,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
