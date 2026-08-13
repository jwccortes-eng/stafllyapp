import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { safeLocalStorage } from "@/lib/safe-storage";
import {
  markSessionExpired,
  clearSupabaseAuthStorage,
  clearSessionExpired,
} from "@/lib/auth-session";
import { publishAuthState } from "@/lib/auth-mutation-gate";
import { logMount, logUnmount, documentInstanceId, appInstanceId } from "@/lib/ctx001-forensics";
import { notifyError } from "@/lib/feedback/notify";

type AppRole = 'developer' | 'owner' | 'company_owner' | 'admin' | 'manager' | 'supervisor' | 'employee' | null;
type ActiveMode = 'admin' | 'employee';
type EmployeeStatus = 'active' | 'inactive' | null;

interface ModulePermission {
  module: string;
  company_id: string | null;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface ActionPermission {
  action: string;
  company_id: string | null;
  granted: boolean;
}


export type AuthState = "initializing" | "authenticated" | "recovering" | "unauthenticated";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  /**
   * Explicit lifecycle state (STAFLY-CTX-001):
   *  - initializing: first boot, session not yet resolved
   *  - authenticated: valid session in memory
   *  - recovering: Supabase emitted SIGNED_OUT unexpectedly (e.g. after a
   *    background token refresh) — we're probing whether it's a transient
   *    hiccup or a definitive expiry. UI must preserve context but block
   *    sensitive mutations.
   *  - unauthenticated: no session (fresh visitor, controlled sign-out, or
   *    confirmed expiry).
   */
  authState: AuthState;
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
  /**
   * @deprecated SECURITY: GLOBAL admin flag — true if the user has ANY
   * admin-level role in ANY tenant. Using this to gate per-tenant UI causes
   * cross-tenant access (a company_owner in Tenant A would appear admin in
   * Tenant B).
   *
   * Use `canAccessAdminForCompany(selectedCompanyId)` for tenant-scoped
   * access checks, and `getRoleForCompany(selectedCompanyId)` + the
   * `isAdminLevelRole()` helper (`@/lib/roles`) for tenant-scoped role
   * comparisons.
   *
   * Existing call sites are kept for back-compat (sign-in routing, dual-mode
   * switchers, employee portal fallback). NEW code MUST NOT consume this.
   */
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
  /** FASE 2 — estado explícito de autorización. Nunca asumir defaults. */
  authorizationStatus: "loading" | "ready" | "error";

  signOut: () => Promise<void>;
  hasModuleAccess: (module: string, permission: 'view' | 'edit' | 'delete') => boolean;
  hasActionPermission: (action: string) => boolean;
  /** Resolve employeeId for a specific company */
  resolveEmployeeForCompany: (companyId: string) => string | null;
}

const ADMIN_ROLES = new Set(['developer', 'owner', 'company_owner', 'admin', 'manager', 'supervisor']);
/** Roles in user_roles that are TRULY cross-tenant (Stafly platform staff). */
// 'founder' is cross-tenant for finance/admin views (Founder Finance,
// shift management, etc.). It does NOT grant payroll write access.
const GLOBAL_CROSS_TENANT_ROLES = new Set(['developer', 'owner', 'founder']);

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  authState: "initializing",
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
  authorizationStatus: "loading",

  signOut: async () => {},
  hasModuleAccess: () => false,
  hasActionPermission: () => false,
  resolveEmployeeForCompany: () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<AuthState>("initializing");

  // STAFLY-CTX-001 forensics: track AuthProvider mount identity.
  useEffect(() => {
    const id = logMount("AuthProvider");
    return () => logUnmount("AuthProvider", id);
  }, []);

  // Publish to the module-scope mutation gate so non-React callers
  // (guardMutation / assertAuthReady) see the same lifecycle state as
  // hooks and components. STAFLY-CTX-001.
  useEffect(() => { publishAuthState(authState); }, [authState]);

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
  const [authorizationStatus, setAuthorizationStatus] = useState<"loading" | "ready" | "error">("loading");

  const [fullName, setFullName] = useState<string | null>(null);
  const hydratedUserIdRef = useRef<string | null>(null);
  const activeModeRef = useRef<ActiveMode>(activeMode);
  // Suppress "session expired" UX when the user themselves chose to sign out.
  const userInitiatedSignOutRef = useRef<boolean>(false);
  // Track whether we ever observed an authenticated session in this tab,
  // so we only flag SIGNED_OUT as "expired" when there was something to lose.
  const hadAuthedSessionRef = useRef<boolean>(false);
  const recoveryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

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

      // FASE 2 — sin bypass de carga: los permisos se resuelven SIEMPRE, para
      // cualquier rol, antes de declarar la autorización lista. Nunca
      // "unknown → allow → deny".
      const [{ data: permsData, error: permsError }, { data: actionPermsData, error: actionsError }] =
        await Promise.all([
          supabase
            .from('module_permissions')
            .select('module, company_id, can_view, can_edit, can_delete')
            .eq('user_id', userId),
          supabase
            .from('action_permissions')
            .select('action, company_id, granted')
            .eq('user_id', userId),
        ]);

      if (permsError || actionsError) {
        setAuthorizationStatus("error");
        throw permsError ?? actionsError;
      }

      setPermissions((permsData as ModulePermission[]) ?? []);
      setActionPermissions((actionPermsData as ActionPermission[]) ?? []);
      setAuthorizationStatus("ready");


      // Set first employee as default (company context will refine later)
      const firstEmp = activeEmps[0];
      if (firstEmp) {
        setEmployeeId(firstEmp.id);
        setEmployeeActive(true);
      } else {
        setEmployeeId(null);
        setEmployeeActive(true);
      }

      // Auto-set active mode. Admin access takes priority — workers with both
      // employee profile AND per-company admin/manager role default to admin
      // so they can actually do their job (Create Shift, etc.). Workers who
      // only have an employee profile go to the portal. ModeSwitcher still
      // allows in-session toggling; savedMode is only honored when admin
      // access exists (so it persists explicit "I want portal today" within
      // the session, but a fresh SIGNED_IN clears it — see listener below).
      const hasAdminRole =
        [...availableRoles].some(r => ADMIN_ROLES.has(r)) ||
        Object.values(cRoles).some(r => ADMIN_ROLES.has(r));
      const hasEmployeeProfile = activeEmps.length > 0;
      const savedMode = safeLocalStorage.getItem("stafly-active-mode") as ActiveMode | null;

      if (hasAdminRole && savedMode === 'employee' && hasEmployeeProfile) {
        // honor explicit in-session toggle
        setActiveModeState('employee');
      } else if (hasAdminRole) {
        setActiveModeState('admin');
      } else if (hasEmployeeProfile) {
        setActiveModeState('employee');
      }

      console.info("[auth-role-debug]", {
        step: "use-auth-hydrated",
        authUserId: userId,
        email: null, // populated by caller via session.user.email if needed
        phone: null,
        globalRoles: [...availableRoles],
        companyRoles: cRoles,
        employeeIds: activeEmps,
        resolvedRole,
        hasAdminRole,
        hasEmployeeProfile,
        savedMode,
        portalMode: hasAdminRole && !(savedMode === 'employee' && hasEmployeeProfile) ? 'admin' : (hasEmployeeProfile ? 'employee' : 'admin'),
        canCreateShift: hasAdminRole,
      });
    } catch (err) {
      // OX-1 — la sesión existe pero no pudimos resolver rol/permisos.
      // Nunca silencioso: el usuario debe saber por qué ve la app vacía.
      notifyError({
        key: "auth-session",
        title: "No pudimos cargar tu sesión",
        fact: "Tu perfil, rol y permisos no se pudieron leer.",
        consequence: "Puede que veas la app sin datos o sin accesos.",
        action: { label: "Reintentar", onClick: () => window.location.reload() },
        cause: err,
      });
      resetAuthState();
    }
  }, [resetAuthState]);

  useEffect(() => {
    let mounted = true;

    const syncSession = async (nextSession: Session | null) => {
      if (!mounted) return;

        console.info("[post-login-debug]", {
          step: "use-auth-sync-session",
        userId: nextSession?.user?.id ?? null,
        sessionExists: !!nextSession,
          authLoading: true,
          companyLoading: null,
          selectedCompanyId: null,
          selectedCompanyName: null,
          companies: [],
          companyRoles: {},
          allEmployeeIds: [],
          activeMode: activeModeRef.current,
          canAccessAdminForSelected: null,
          canAccessPortalForSelected: null,
          redirectTarget: null,
      });

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        hadAuthedSessionRef.current = true;
        setAuthState("authenticated");
        await fetchUserData(nextSession.user.id);
        hydratedUserIdRef.current = nextSession.user.id;
      } else {
        resetAuthState();
        hydratedUserIdRef.current = null;
        setAuthState("unauthenticated");
      }

      if (mounted) {
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;

        console.info("[STAFLY-CTX-001][auth-event]", {
          event,
          documentInstanceId,
          appInstanceId,
          authStatePrev: authState,
          hasSession: !!nextSession,
          userIdSame: nextSession?.user?.id === hydratedUserIdRef.current,
          hydratedUserIdSet: !!hydratedUserIdRef.current,
          visibilityState: typeof document !== "undefined" ? document.visibilityState : null,
          pathname: typeof window !== "undefined" ? window.location.pathname : null,
          ts: Date.now(),
        });

        console.info("[post-login-debug]", {
          step: "use-auth-state-change",
          userId: nextSession?.user?.id ?? null,
          sessionExists: !!nextSession,
          authLoading: true,
          companyLoading: null,
          selectedCompanyId: null,
          selectedCompanyName: null,
          companies: [],
          companyRoles: {},
          allEmployeeIds: [],
          activeMode: activeModeRef.current,
          canAccessAdminForSelected: null,
          canAccessPortalForSelected: null,
          redirectTarget: null,
          event,
        });

        // STAFLY-CTX-001 — Idempotencia de sesión.
        // Comparamos identidad de la sesión antes de invocar setState. Si la
        // sesión nueva es materialmente equivalente (mismo user.id y mismo
        // access_token) no propagamos un re-render a los consumidores de
        // AuthContext. Esto es crítico para TOKEN_REFRESHED, que en Supabase
        // v2 puede dispararse en cada foco/refresh silencioso incluso cuando
        // el token vigente sigue siendo válido.
        //
        // Campos comparados y por qué:
        //  - user.id: única forma segura de detectar un cambio de usuario.
        //  - access_token: refleja rotación real del JWT.
        // NO comparamos expires_at porque cambia con cada refresh silencioso
        // sin implicar un cambio de identidad de sesión.
        setSession((prev) => {
          const same =
            prev?.user?.id === nextSession?.user?.id &&
            prev?.access_token === nextSession?.access_token;
          return same ? prev : nextSession;
        });
        setUser((prev) => {
          const same = prev?.id === nextSession?.user?.id;
          return same ? prev : (nextSession?.user ?? null);
        });

        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
          if (event === "INITIAL_SESSION" && !nextSession) {
            resetAuthState();
            hydratedUserIdRef.current = null;
            setLoading(false);
          } else if (
            nextSession?.user?.id &&
            hydratedUserIdRef.current === nextSession.user.id
          ) {
            setLoading(false);
          }
          return;
        }

        if (nextSession?.user) {
          // Fresh login → drop any leftover "employee" mode from a previous
          // session so admins/managers default back to admin. In-session
          // ModeSwitcher writes still persist for the current session.
          if (event === "SIGNED_IN") {
            safeLocalStorage.removeItem("stafly-active-mode");
            clearSessionExpired();
          }
          hadAuthedSessionRef.current = true;
          // A session came back — cancel any pending recovery probe.
          if (recoveryTimerRef.current) {
            window.clearTimeout(recoveryTimerRef.current);
            recoveryTimerRef.current = null;
          }
          setAuthState("authenticated");
          console.info("[STAFLY-CTX-001][auth-loading] start", {
            provider: "AuthProvider",
            event,
            reason: "authenticated auth event rehydrates user data",
          });
          setLoading(true);
          setTimeout(() => {
            void fetchUserData(nextSession.user.id).finally(() => {
              hydratedUserIdRef.current = nextSession.user.id;
              if (mounted) {
                console.info("[STAFLY-CTX-001][auth-loading] end", {
                  provider: "AuthProvider",
                  event,
                  reason: "user data hydration completed",
                });
                setLoading(false);
              }
            });
          }, 0);
        } else {
          // SIGNED_OUT / USER_DELETED path.
          const userInitiated = userInitiatedSignOutRef.current;
          const hadAuthed = hadAuthedSessionRef.current;
          userInitiatedSignOutRef.current = false;

          if (event === "SIGNED_OUT" && hadAuthed && !userInitiated) {
            // STAFLY-CTX-001: don't collapse UI immediately. Enter recovering
            // and run a bounded probe. If the session reappears (rare race)
            // we resume; otherwise we confirm expiry and log out cleanly.
            // Preserve session/user/role visually — sensitive mutations MUST
            // be gated by consumers on authState !== "authenticated".
            setAuthState("recovering");
            if (recoveryTimerRef.current) {
              window.clearTimeout(recoveryTimerRef.current);
            }
            const runProbe = async (attemptsLeft: number) => {
              if (!mounted) return;
              try {
                const { data } = await supabase.auth.getSession();
                if (data.session?.user) {
                  setSession(data.session);
                  setUser(data.session.user);
                  setAuthState("authenticated");
                  recoveryTimerRef.current = null;
                  return;
                }
              } catch {
                // fall through to backoff / definitive expiry
              }
              const offline = typeof navigator !== "undefined" && navigator.onLine === false;
              if (offline && attemptsLeft > 0) {
                recoveryTimerRef.current = window.setTimeout(
                  () => void runProbe(attemptsLeft - 1),
                  2000,
                );
                return;
              }
              // Definitive expiry.
              markSessionExpired("session_not_found");
              clearSupabaseAuthStorage();
              hadAuthedSessionRef.current = false;
              resetAuthState();
              setUser(null);
              setSession(null);
              hydratedUserIdRef.current = null;
              setAuthState("unauthenticated");
              setLoading(false);
              recoveryTimerRef.current = null;
            };
            recoveryTimerRef.current = window.setTimeout(() => void runProbe(3), 800);
            return;
          }

          // User-initiated sign-out OR no prior authed session (fresh visitor).
          hadAuthedSessionRef.current = false;
          resetAuthState();
          hydratedUserIdRef.current = null;
          setAuthState("unauthenticated");
          setLoading(false);
        }
      }
    );

    // Boot path: detect a stale localStorage session (session JSON present but
    // server says session_not_found). Fail gracefully → wipe + flag expired.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        hadAuthedSessionRef.current = true;
        try {
          const { error } = await supabase.auth.getUser();
          if (error) {
            const msg = (error.message || "").toLowerCase();
            const stale =
              msg.includes("session_not_found") ||
              msg.includes("invalid refresh") ||
              msg.includes("jwt") ||
              error.status === 401 ||
              error.status === 403;
            if (stale) {
              markSessionExpired("stale_local");
              clearSupabaseAuthStorage();
              try { await supabase.auth.signOut(); } catch { /* noop */ }
              if (mounted) {
                resetAuthState();
                setUser(null);
                setSession(null);
                setAuthState("unauthenticated");
                setLoading(false);
              }
              return;
            }
          }
        } catch {
          // Network hiccup — fall through and let normal flow handle it.
        }
      }
      void syncSession(session);
    }).catch((err) => {
      // OX-1 — mismo `key` que arriba: una sola voz, sin apilar toasts.
      notifyError({
        key: "auth-session",
        title: "No pudimos restaurar tu sesión",
        fact: "La sesión guardada en este dispositivo no se pudo validar.",
        consequence: "Vuelve a iniciar sesión para continuar.",
        action: { label: "Reintentar", onClick: () => window.location.reload() },
        cause: err,
      });
      if (mounted) {
        resetAuthState();
        setAuthState("unauthenticated");
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      if (recoveryTimerRef.current) {
        window.clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
      subscription.unsubscribe();
    };
  }, [fetchUserData, resetAuthState]);

  const signOut = async () => {
    userInitiatedSignOutRef.current = true;
    clearSessionExpired();
    if (recoveryTimerRef.current) {
      window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // OX-1 — intencionalmente SIN toast: el cierre local continúa abajo y
      // el usuario es redirigido de inmediato. La sesión no queda ambigua.
      console.error("[feedback:info] auth-signout-remote", err);
    }
    // P0 — explicit sign-out is a security event: drop the remembered
    // workspace/company/route for this device.
    try {
      const { clearAllWorkspaceMemory } = await import("@/lib/session/workspace-memory");
      clearAllWorkspaceMemory();
    } catch { /* noop */ }
    setUser(null);
    setSession(null);
    setRole(null);
    setAllRoles(new Set());
    setCompanyRoles({});
    setEmployeeId(null);
    setPermissions([]);
    setActionPermissions([]);
    setFullName(null);
    setAuthState("unauthenticated");
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
    if (allRoles.has('founder')) return 'founder' as AppRole;
    if (!companyId) return null;
    const cRole = companyRoles[companyId];
    if (cRole) return cRole as AppRole;
    const hasEmp = allEmployeeIds.some(e => e.companyId === companyId);
    if (hasEmp) return 'employee';
    return null;
  }, [allRoles, companyRoles, allEmployeeIds]);

  const canAccessAdminForCompany = useCallback((companyId: string | null): boolean => {
    // Cross-tenant platform roles bypass tenant scope.
    if (allRoles.has('developer') || allRoles.has('owner') || allRoles.has('founder')) return true;
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
      user, session, authState, role, allRoles, companyRoles,
      getRoleForCompany, canAccessAdminForCompany, canAccessPortalForCompany,
      activeMode, setActiveMode,
      canAccessAdmin, canAccessPortal,
      employeeId, allEmployeeIds, employeeActive, fullName, loading,
      permissions, actionPermissions, authorizationStatus, signOut, hasModuleAccess, hasActionPermission,
      resolveEmployeeForCompany,
    }}>
      {children}
      <SessionRecoveringOverlay authState={authState} />
    </AuthContext.Provider>
  );
}

/** Minimal, non-blocking "Reconectando sesión…" indicator. */
function SessionRecoveringOverlay({ authState }: { authState: AuthState }) {
  if (authState !== "recovering") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[9999] rounded-md border border-border bg-background/95 px-3 py-2 text-xs text-foreground shadow-md backdrop-blur"
    >
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        Reconectando sesión…
      </span>
    </div>
  );
}

export const useAuth = () => useContext(AuthContext);
