import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, MoreHorizontal, Pencil, Trash2, Shield, ShieldCheck, UserCog, User,
  KeyRound, UserPlus, Smartphone, Mail, Building2, ChevronDown, ChevronRight,
  Package, Ticket, Copy, Plus, ToggleLeft, Download, ArrowLeftRight, Link2, LinkIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import { useSubscription, PLAN_LIMITS, type PlanId } from "@/hooks/useSubscription";
import UpgradeBanner from "@/components/billing/UpgradeBanner";

/* ── Constants ── */
const MODULES = [
  { key: "employees", label: "Empleados" },
  { key: "periods", label: "Periodos" },
  { key: "import", label: "Importar" },
  { key: "concepts", label: "Conceptos" },
  { key: "movements", label: "Novedades" },
  { key: "summary", label: "Resumen" },
  { key: "reports", label: "Reportes" },
  { key: "shifts", label: "Turnos" },
  { key: "timeclock", label: "Reloj" },
  { key: "clients", label: "Clientes" },
  { key: "locations", label: "Ubicaciones" },
  { key: "announcements", label: "Anuncios" },
  { key: "chat", label: "Chat" },
];

type RoleType = "developer" | "owner" | "admin" | "manager" | "supervisor" | "employee";

interface CompanyAssignment {
  company_id: string;
  company_name: string;
  company_role: string;
  plan: PlanId;
  plan_status: string;
  active_modules: string[];
  promo_codes: { code: string; modules: string[] }[];
}

interface UserRecord {
  user_id: string;
  email: string;
  full_name: string;
  role: RoleType;
  permissions: { module: string; can_view: boolean; can_edit: boolean; can_delete: boolean }[];
  companies: CompanyAssignment[];
  /** Employee profile linkage */
  employee_id: string | null;
  employee_name: string | null;
  employee_active: boolean;
  /** Whether user has admin-level roles */
  has_admin_access: boolean;
  /** Whether user has employee profile */
  has_employee_access: boolean;
}

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  modules: string[];
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

const ROLE_LABELS: Record<RoleType, string> = { developer: "Desarrollador", owner: "Dueño", admin: "Admin", manager: "Manager", supervisor: "Supervisor", employee: "Empleado" };
const ROLE_ICONS: Record<RoleType, typeof Shield> = { developer: ShieldCheck, owner: ShieldCheck, admin: Shield, manager: UserCog, supervisor: UserCog, employee: User };
const ROLE_COLORS: Record<RoleType, string> = {
  developer: "bg-destructive/10 text-destructive border-destructive/20",
  owner: "bg-chart-1/10 text-chart-1 border-chart-1/20",
  admin: "bg-primary/10 text-primary border-primary/20",
  manager: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  supervisor: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  employee: "bg-muted text-muted-foreground border-border",
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  pro: "bg-chart-4/10 text-chart-4",
  enterprise: "bg-chart-1/10 text-chart-1",
};

const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-teal-500", "bg-indigo-500", "bg-pink-500"];

function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h); }

function UserAvatar({ name, email, size = "md" }: { name: string; email: string; size?: "sm" | "md" }) {
  const isMobile = !email.includes("@") || email.includes("phone");
  const initials = name ? name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : email.charAt(0).toUpperCase();
  const color = AVATAR_COLORS[hashStr(name || email) % AVATAR_COLORS.length];
  const sz = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div className="relative">
      <div className={cn("rounded-full flex items-center justify-center font-semibold text-white shrink-0", sz, color)}>{initials}</div>
      <div className={cn("absolute -bottom-0.5 -right-0.5 rounded-full p-[3px] border-2 border-background", isMobile ? "bg-emerald-500" : "bg-blue-500")}>
        {isMobile ? <Smartphone className="h-2 w-2 text-white" /> : <Mail className="h-2 w-2 text-white" />}
      </div>
    </div>
  );
}

/* ── User Row (expandable) ── */
function UserRow({ u, onEdit, onResetPw, onDelete }: {
  u: UserRecord; onEdit: () => void; onResetPw: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = ROLE_ICONS[u.role];
  const hasCompanies = u.companies.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl bg-card border border-border/50 hover:border-border hover:shadow-sm transition-all group">
        {/* Main row */}
        <div className="flex items-center gap-3 px-4 py-3">
          {hasCompanies ? (
            <CollapsibleTrigger asChild>
              <button className="shrink-0 p-1 rounded hover:bg-accent transition-colors">
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
          ) : <div className="w-6" />}

          <UserAvatar name={u.full_name} email={u.email} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold truncate">{u.full_name || "Sin nombre"}</p>
              {u.has_admin_access && u.has_employee_access && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-chart-4 bg-chart-4/10 px-1.5 py-0.5 rounded-full shrink-0" title="Acceso dual: Admin + Empleado">
                  <ArrowLeftRight className="h-2.5 w-2.5" />Dual
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              {u.has_employee_access && (
                <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-600 dark:text-emerald-400" title={`Perfil empleado: ${u.employee_name}`}>
                  <LinkIcon className="h-2.5 w-2.5" />
                </span>
              )}
            </div>
          </div>

          {/* Company count */}
          {hasCompanies && (
            <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span>{u.companies.length}</span>
            </div>
          )}

          {/* Access mode badges */}
          <div className="hidden sm:flex items-center gap-1">
            {u.has_admin_access && (
              <Badge variant="outline" className="text-[9px] bg-primary/5 text-primary border-primary/20 px-1.5 py-0">
                Admin
              </Badge>
            )}
            {u.has_employee_access && (
              <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", u.employee_active ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800" : "bg-muted text-muted-foreground border-border")}>
                {u.employee_active ? "Empleado" : "Inactivo"}
              </Badge>
            )}
          </div>

          <Badge variant="outline" className={cn("text-[10px] shrink-0", ROLE_COLORS[u.role])}>
            <Icon className="h-3 w-3 mr-1" />{ROLE_LABELS[u.role]}
          </Badge>

          {u.role !== "developer" && u.role !== "owner" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4 mr-2" />Editar usuario</DropdownMenuItem>
                <DropdownMenuItem onClick={onResetPw}><KeyRound className="h-4 w-4 mr-2" />Cambiar contraseña</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4 mr-2" />Quitar rol</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Expanded detail */}
        <CollapsibleContent>
          <div className="border-t border-border/50 px-4 py-3 space-y-3">
            {/* Access summary */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground font-medium">Acceso:</span>
                {u.has_admin_access && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                    <Shield className="h-3 w-3" />Panel Admin
                  </span>
                )}
                {u.has_employee_access && (
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold", u.employee_active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                    <User className="h-3 w-3" />Portal Empleado {!u.employee_active && "(inactivo)"}
                  </span>
                )}
                {!u.has_admin_access && !u.has_employee_access && (
                  <span className="text-muted-foreground italic">Sin acceso configurado</span>
                )}
              </div>
              {u.employee_id && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Link2 className="h-3 w-3" />Perfil: {u.employee_name}
                </span>
              )}
            </div>

            {u.companies.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sin empresas asignadas</p>
            ) : (
              u.companies.map(c => (
                <div key={c.company_id} className="bg-muted/40 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{c.company_name}</span>
                      <Badge variant="outline" className="text-[10px]">{c.company_role}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-[10px] border-0", PLAN_COLORS[c.plan] || PLAN_COLORS.free)}>
                        {PLAN_LIMITS[c.plan]?.label || "Starter"}
                      </Badge>
                      {c.plan_status === "trialing" && <Badge variant="outline" className="text-[10px] text-chart-4">Trial</Badge>}
                    </div>
                  </div>

                  {/* Active modules */}
                  {c.active_modules.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Package className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {c.active_modules.map(m => {
                          const mod = MODULES.find(mm => mm.key === m);
                          return <Badge key={m} variant="secondary" className="text-[10px] font-normal">{mod?.label || m}</Badge>;
                        })}
                      </div>
                    </div>
                  )}

                  {/* Promo codes */}
                  {c.promo_codes.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Ticket className="h-3.5 w-3.5 text-chart-4 mt-0.5 shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {c.promo_codes.map(pc => (
                          <Badge key={pc.code} variant="outline" className="text-[10px] text-chart-4 border-chart-4/30">
                            {pc.code}
                            <span className="ml-1 text-muted-foreground">({pc.modules.length} mód.)</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Permissions for managers */}
                  {u.role === "manager" && u.permissions.length > 0 && (
                    <div className="mt-1">
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">Permisos:</p>
                      <div className="flex flex-wrap gap-1">
                        {u.permissions.filter(p => p.can_view || p.can_edit || p.can_delete).map(p => {
                          const mod = MODULES.find(m => m.key === p.module);
                          const flags = [p.can_view && "V", p.can_edit && "E", p.can_delete && "D"].filter(Boolean).join("");
                          return <Badge key={p.module} variant="secondary" className="text-[10px] font-normal">{mod?.label || p.module} [{flags}]</Badge>;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/* ── Main Page ── */
export default function UsersPage() {
  const { role: currentRole, user } = useAuth();
  const { selectedCompanyId, isGlobalMode } = useCompany();
  const { canAddAdmins, limits } = useSubscription();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleType | "all">("all");
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleType>("employee");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPerms, setEditPerms] = useState<Record<string, { can_view: boolean; can_edit: boolean; can_delete: boolean }>>({});
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "manager" | "supervisor">("admin");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("users");

  // Promo state
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoDesc, setPromoDesc] = useState("");
  const [promoModules, setPromoModules] = useState<string[]>([]);
  const [promoMaxUses, setPromoMaxUses] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);

  const { toast } = useToast();
  const adminCount = users.filter(u => u.role === "admin" || u.role === "owner" || u.role === "developer").length;
  const atAdminLimit = !canAddAdmins(adminCount);

  const fetchUsers = async () => {
    // Build company-scoped queries when a company is selected
    let companyUsersQuery = supabase.from("company_users").select("user_id, company_id, role, companies(id, name)");
    let employeesQuery = supabase.from("employees").select("id, user_id, first_name, last_name, is_active");
    let subsQuery = supabase.from("subscriptions").select("company_id, plan, status");
    let modulesQuery = supabase.from("company_modules").select("company_id, module, is_active");
    let redemptionsQuery = supabase.from("promo_redemptions").select("company_id, promo_codes(code, modules)");

    if (selectedCompanyId) {
      companyUsersQuery = companyUsersQuery.eq("company_id", selectedCompanyId);
      employeesQuery = employeesQuery.eq("company_id", selectedCompanyId);
      subsQuery = subsQuery.eq("company_id", selectedCompanyId);
      modulesQuery = modulesQuery.eq("company_id", selectedCompanyId);
      redemptionsQuery = redemptionsQuery.eq("company_id", selectedCompanyId);
    }

    const [companyUsersRes, employeesRes, subsRes, modulesRes, redemptionsRes, promoCodesRes] = await Promise.all([
      companyUsersQuery,
      employeesQuery,
      subsQuery,
      modulesQuery,
      redemptionsQuery,
      supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
    ]);

    const companyUsers = companyUsersRes.data ?? [];
    const employees = employeesRes.data ?? [];

    // Derive the set of user_ids that belong to this company context
    const relevantUserIds = new Set(companyUsers.map(cu => cu.user_id));
    // Also include user_ids from employees (some may not have company_users entries)
    employees.forEach(e => { if (e.user_id) relevantUserIds.add(e.user_id); });

    // Now fetch only the profiles/roles/perms for these users
    const userIdArray = Array.from(relevantUserIds);
    if (userIdArray.length === 0 && selectedCompanyId) {
      setUsers([]);
      setPromoCodes((promoCodesRes.data ?? []) as unknown as PromoCode[]);
      return;
    }

    let profilesQuery = supabase.from("profiles").select("user_id, email, full_name");
    let rolesQuery = supabase.from("user_roles").select("user_id, role");
    let permsQuery = supabase.from("module_permissions").select("user_id, module, can_view, can_edit, can_delete");

    if (selectedCompanyId && userIdArray.length > 0) {
      profilesQuery = profilesQuery.in("user_id", userIdArray);
      rolesQuery = rolesQuery.in("user_id", userIdArray);
      permsQuery = permsQuery.in("user_id", userIdArray);
    }

    const [profilesRes, rolesRes, permsRes] = await Promise.all([
      profilesQuery,
      rolesQuery,
      permsQuery,
    ]);

    const profiles = profilesRes.data ?? [];
    const roles = rolesRes.data ?? [];
    const perms = permsRes.data ?? [];
    const subs = subsRes.data ?? [];
    const modules = modulesRes.data ?? [];
    const redemptions = redemptionsRes.data ?? [];

    setPromoCodes((promoCodesRes.data ?? []) as unknown as PromoCode[]);

    const ADMIN_ROLE_SET = new Set(['developer', 'owner', 'admin', 'manager', 'supervisor']);

    const userList: UserRecord[] = profiles.map(p => {
      const roleRec = roles.find(r => r.user_id === p.user_id);
      const userPerms = perms.filter(pm => pm.user_id === p.user_id);
      const resolvedRole = (roleRec?.role as RoleType) ?? "employee";

      // Employee profile linkage
      const linkedEmployee = employees.find(e => e.user_id === p.user_id);

      // Build company assignments
      const userCompanies = companyUsers
        .filter(cu => cu.user_id === p.user_id)
        .map((cu: any) => {
          const companyId = cu.company_id;
          const sub = subs.find(s => s.company_id === companyId);
          const activeModules = modules
            .filter(m => m.company_id === companyId && m.is_active)
            .map(m => m.module);
          const companyRedemptions = redemptions
            .filter((r: any) => r.company_id === companyId && r.promo_codes)
            .map((r: any) => ({ code: r.promo_codes.code, modules: r.promo_codes.modules ?? [] }));

          return {
            company_id: companyId,
            company_name: cu.companies?.name ?? "—",
            company_role: cu.role ?? "admin",
            plan: (sub?.plan ?? "free") as PlanId,
            plan_status: sub?.status ?? "none",
            active_modules: activeModules,
            promo_codes: companyRedemptions,
          };
        });

      return {
        user_id: p.user_id,
        email: p.email ?? "",
        full_name: p.full_name ?? "",
        role: resolvedRole,
        permissions: userPerms,
        companies: userCompanies,
        employee_id: linkedEmployee?.id ?? null,
        employee_name: linkedEmployee ? `${linkedEmployee.first_name} ${linkedEmployee.last_name}` : null,
        employee_active: linkedEmployee?.is_active ?? false,
        has_admin_access: ADMIN_ROLE_SET.has(resolvedRole),
        has_employee_access: !!linkedEmployee,
      };
    });

    setUsers(userList);
  };

  useEffect(() => { fetchUsers(); }, [selectedCompanyId]);

  /* ── Edit handlers (same logic as before) ── */
  const openEditUser = (u: UserRecord) => {
    setEditUser(u);
    setEditRole(u.role);
    setEditName(u.full_name);
    setEditEmail(u.email);
    const permsMap: Record<string, { can_view: boolean; can_edit: boolean; can_delete: boolean }> = {};
    MODULES.forEach(m => {
      const existing = u.permissions.find(p => p.module === m.key);
      permsMap[m.key] = existing ? { can_view: existing.can_view, can_edit: existing.can_edit, can_delete: existing.can_delete } : { can_view: false, can_edit: false, can_delete: false };
    });
    setEditPerms(permsMap);
    setEditOpen(true);
  };

  const handleSaveRole = async () => {
    if (!editUser) return;
    setLoading(true);
    if (editName !== editUser.full_name || editEmail !== editUser.email) {
      await supabase.from("profiles").update({ full_name: editName, email: editEmail }).eq("user_id", editUser.user_id);
    }
    const { error: roleError } = await supabase.from("user_roles").update({ role: editRole } as any).eq("user_id", editUser.user_id);
    if (roleError) { toast({ title: "Error", description: getUserFriendlyError(roleError), variant: "destructive" }); setLoading(false); return; }
    if (editRole === "manager" || editRole === "supervisor") {
      for (const mod of MODULES) {
        const perm = editPerms[mod.key];
        await supabase.from("module_permissions").upsert({ user_id: editUser.user_id, module: mod.key, can_view: perm.can_view, can_edit: perm.can_edit, can_delete: perm.can_delete } as any, { onConflict: "user_id,module" });
      }
    } else {
      await supabase.from("module_permissions").delete().eq("user_id", editUser.user_id);
    }
    toast({ title: "Usuario actualizado" });
    setEditOpen(false); setEditUser(null); fetchUsers(); setLoading(false);
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    await supabase.from("user_roles").delete().eq("user_id", deleteTarget.user_id);
    await supabase.from("module_permissions").delete().eq("user_id", deleteTarget.user_id);
    toast({ title: "Rol de usuario eliminado" });
    setDeleteTarget(null); fetchUsers();
  };

  const handleResetPassword = async () => {
    if (!passwordTarget || !newPassword) return;
    setPasswordLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", { body: { user_id: passwordTarget.user_id, new_password: newPassword } });
      if (error) throw error;
      if (data?.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); }
      else { toast({ title: "Contraseña actualizada" }); setPasswordTarget(null); setNewPassword(""); }
    } catch (err: any) { toast({ title: "Error", description: err.message || "Error al cambiar contraseña", variant: "destructive" }); }
    setPasswordLoading(false);
  };

  const togglePerm = (module: string, field: "can_view" | "can_edit" | "can_delete") => {
    setEditPerms(prev => ({ ...prev, [module]: { ...prev[module], [field]: !prev[module][field] } }));
  };

  const handleInviteAdmin = async () => {
    if (!inviteEmail || !invitePassword) return;
    if (inviteRole === "admin" && atAdminLimit) { toast({ title: "Límite alcanzado", description: `Tu plan permite máximo ${limits.maxAdmins} admin(s).`, variant: "destructive" }); return; }
    setInviteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-admin", { body: { email: inviteEmail, password: invitePassword, full_name: inviteName, role: inviteRole } });
      if (error) throw error;
      if (data?.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); }
      else { toast({ title: "Usuario creado" }); setInviteOpen(false); setInviteEmail(""); setInviteName(""); setInvitePassword(""); fetchUsers(); }
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setInviteLoading(false);
  };

  /* ── Promo code handlers ── */
  const handleCreatePromo = async () => {
    if (!promoCode || promoModules.length === 0) return;
    setPromoLoading(true);
    const { error } = await supabase.from("promo_codes").insert({
      code: promoCode.toUpperCase().trim(),
      description: promoDesc || null,
      modules: promoModules,
      max_uses: promoMaxUses ? parseInt(promoMaxUses) : null,
      created_by: user?.id,
    } as any);
    if (error) { toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" }); }
    else { toast({ title: "Código creado", description: promoCode.toUpperCase() }); setPromoOpen(false); setPromoCode(""); setPromoDesc(""); setPromoModules([]); setPromoMaxUses(""); fetchUsers(); }
    setPromoLoading(false);
  };

  const handleTogglePromo = async (id: string, active: boolean) => {
    await supabase.from("promo_codes").update({ is_active: !active } as any).eq("id", id);
    fetchUsers();
  };

  const handleCopyPromo = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copiado", description: code });
  };

  /* ── Filters ── */
  const filtered = users
    .filter(u => roleFilter === "all" || u.role === roleFilter)
    .filter(u => `${u.full_name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase()));

  const exportUsersCsv = () => {
    const headers = ["Nombre", "Email", "Rol", "Empresas", "Fecha creación"];
    const rows = filtered.map(u => [
      u.full_name || "Sin nombre",
      u.email,
      ROLE_LABELS[u.role],
      u.companies.map(c => c.company_name).join("; ") || "—",
      "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usuarios_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (currentRole !== "developer" && currentRole !== "owner") {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">No tienes acceso a este módulo.</p></div>;
  }

  const roleCounts: Record<RoleType, number> = { developer: 0, owner: 0, admin: 0, manager: 0, supervisor: 0, employee: 0 };
  users.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

  return (
    <div>
      <PageHeader
        variant="5"
        icon={ShieldCheck}
        title="Gestión de Usuarios"
        subtitle="Identidad única · Roles múltiples · Acceso dual admin/empleado"
        rightSlot={
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={exportUsersCsv} title="Exportar CSV">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setPromoOpen(true)} className="gap-2">
              <Ticket className="h-4 w-4" />Crear código
            </Button>
            <Button onClick={() => setInviteOpen(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />Invitar
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5"><User className="h-3.5 w-3.5" />Usuarios ({users.length})</TabsTrigger>
          <TabsTrigger value="promos" className="gap-1.5"><Ticket className="h-3.5 w-3.5" />Códigos Promo ({promoCodes.length})</TabsTrigger>
        </TabsList>

        {/* ── Users Tab ── */}
        <TabsContent value="users" className="space-y-4 mt-4">
          {/* Role pills (clickable filters) */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setRoleFilter("all")}
              className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors", roleFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40")}
            >
              Todos ({users.length})
            </button>
            {(["developer", "owner", "admin", "manager", "supervisor", "employee"] as RoleType[]).map(r => {
              const Icon = ROLE_ICONS[r];
              return (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors", roleFilter === r ? "bg-primary text-primary-foreground border-primary" : cn(ROLE_COLORS[r], "hover:opacity-80"))}
                >
                  <Icon className="h-3.5 w-3.5" />{roleCounts[r]} {ROLE_LABELS[r]}
                </button>
              );
            })}
          </div>

          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar usuario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>

          <div className="space-y-1.5">
            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">No hay usuarios</p>
            ) : (
              filtered.map(u => (
                <UserRow
                  key={u.user_id}
                  u={u}
                  onEdit={() => openEditUser(u)}
                  onResetPw={() => { setPasswordTarget(u); setNewPassword(""); }}
                  onDelete={() => setDeleteTarget(u)}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* ── Promos Tab ── */}
        <TabsContent value="promos" className="space-y-4 mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Códigos que desbloquean módulos para empresas</p>
            <Button size="sm" onClick={() => setPromoOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />Nuevo código
            </Button>
          </div>

          {promoCodes.length === 0 ? (
            <div className="text-center py-16">
              <Ticket className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No hay códigos promocionales</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setPromoOpen(true)}>Crear primer código</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {promoCodes.map(pc => (
                <div key={pc.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/50">
                  <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", pc.is_active ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold">{pc.code}</span>
                      <button onClick={() => handleCopyPromo(pc.code)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
                    </div>
                    {pc.description && <p className="text-xs text-muted-foreground truncate">{pc.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {(pc.modules ?? []).map(m => {
                      const mod = MODULES.find(mm => mm.key === m);
                      return <Badge key={m} variant="secondary" className="text-[10px]">{mod?.label || m}</Badge>;
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 text-right min-w-[60px]">
                    {pc.uses_count}{pc.max_uses ? `/${pc.max_uses}` : ""} usos
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleTogglePromo(pc.id, pc.is_active)}>
                    <ToggleLeft className={cn("h-4 w-4", pc.is_active ? "text-emerald-500" : "text-muted-foreground")} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Edit User Dialog ── */}
      <Dialog open={editOpen} onOpenChange={v => { setEditOpen(v); if (!v) setEditUser(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {editUser && <UserAvatar name={editUser.full_name} email={editUser.email} size="sm" />}
              Editar usuario
            </DialogTitle>
            <DialogDescription>Modifica datos, rol y permisos</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Nombre</Label><Input value={editName} onChange={e => setEditName(e.target.value)} className="h-9" /></div>
              <div className="space-y-1"><Label className="text-xs">Email</Label><Input value={editEmail} onChange={e => setEditEmail(e.target.value)} className="h-9" /></div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rol principal</Label>
              <Select value={editRole} onValueChange={v => setEditRole(v as RoleType)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador — Acceso completo</SelectItem>
                  <SelectItem value="manager">Manager — Permisos selectivos</SelectItem>
                  <SelectItem value="supervisor">Supervisor — Permisos limitados</SelectItem>
                  <SelectItem value="employee">Empleado — Solo portal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Employee profile linkage info */}
            {editUser && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Perfil de empleado
                </p>
                {editUser.has_employee_access ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                      Vinculado
                    </Badge>
                    <span className="text-xs text-muted-foreground">{editUser.employee_name}</span>
                    {!editUser.employee_active && <Badge variant="outline" className="text-[9px] text-destructive">Inactivo</Badge>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sin perfil de empleado vinculado. El usuario no podrá acceder al portal empleado.</p>
                )}
              </div>
            )}

            {(editRole === "manager" || editRole === "supervisor") && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Permisos por módulo</Label>
                <div className="border rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-[10px]">Módulo</TableHead>
                      <TableHead className="text-[10px] text-center w-16">Ver</TableHead>
                      <TableHead className="text-[10px] text-center w-16">Editar</TableHead>
                      <TableHead className="text-[10px] text-center w-16">Borrar</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {MODULES.map(m => (
                        <TableRow key={m.key}>
                          <TableCell className="text-xs font-medium py-2">{m.label}</TableCell>
                          <TableCell className="text-center py-2"><Switch checked={editPerms[m.key]?.can_view ?? false} onCheckedChange={() => togglePerm(m.key, "can_view")} /></TableCell>
                          <TableCell className="text-center py-2"><Switch checked={editPerms[m.key]?.can_edit ?? false} onCheckedChange={() => togglePerm(m.key, "can_edit")} /></TableCell>
                          <TableCell className="text-center py-2"><Switch checked={editPerms[m.key]?.can_delete ?? false} onCheckedChange={() => togglePerm(m.key, "can_delete")} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            <Button onClick={handleSaveRole} className="w-full" disabled={loading}>{loading ? "Guardando..." : "Guardar cambios"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Change Password Dialog ── */}
      <Dialog open={!!passwordTarget} onOpenChange={v => { if (!v) { setPasswordTarget(null); setNewPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>{passwordTarget?.full_name || passwordTarget?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva contraseña</Label>
              <Input id="newPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} />
            </div>
            <Button onClick={handleResetPassword} className="w-full" disabled={passwordLoading || newPassword.length < 6}>{passwordLoading ? "Cambiando..." : "Cambiar contraseña"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar rol de usuario?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará el rol de <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong> y sus permisos asociados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Quitar rol</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Invite Admin Dialog ── */}
      <Dialog open={inviteOpen} onOpenChange={v => { setInviteOpen(v); if (!v) { setInviteEmail(""); setInviteName(""); setInvitePassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invitar Usuario</DialogTitle>
            <DialogDescription>Crea una cuenta con acceso al panel administrativo</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1"><Label className="text-xs">Nombre completo</Label><Input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Juan Pérez" className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">Correo electrónico</Label><Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="admin@empresa.com" className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">Contraseña</Label><Input type="password" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="h-9" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Rol</Label>
              <Select value={inviteRole} onValueChange={v => setInviteRole(v as "admin" | "manager" | "supervisor")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador — Acceso completo</SelectItem>
                  <SelectItem value="manager">Manager — Permisos selectivos</SelectItem>
                  <SelectItem value="supervisor">Supervisor — Permisos limitados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteRole === "admin" && atAdminLimit ? (
              <UpgradeBanner feature={`Límite de ${limits.maxAdmins} administrador(es) alcanzado`} />
            ) : (
              <Button onClick={handleInviteAdmin} className="w-full" disabled={inviteLoading || !inviteEmail || invitePassword.length < 6}>{inviteLoading ? "Creando..." : "Crear usuario"}</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create Promo Code Dialog ── */}
      <Dialog open={promoOpen} onOpenChange={v => { setPromoOpen(v); if (!v) { setPromoCode(""); setPromoDesc(""); setPromoModules([]); setPromoMaxUses(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear código promocional</DialogTitle>
            <DialogDescription>El código desbloqueará módulos específicos para las empresas que lo rediman</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Código</Label>
                <Input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="PROMO2026" className="h-9 font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Usos máximos (vacío = ilimitado)</Label>
                <Input type="number" value={promoMaxUses} onChange={e => setPromoMaxUses(e.target.value)} placeholder="∞" className="h-9" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descripción (opcional)</Label>
              <Input value={promoDesc} onChange={e => setPromoDesc(e.target.value)} placeholder="Campaña lanzamiento Q1" className="h-9" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Módulos a desbloquear</Label>
              <div className="flex flex-wrap gap-2">
                {MODULES.map(m => {
                  const selected = promoModules.includes(m.key);
                  return (
                    <button
                      key={m.key}
                      onClick={() => setPromoModules(prev => selected ? prev.filter(x => x !== m.key) : [...prev, m.key])}
                      className={cn("px-2.5 py-1 rounded-full text-xs border transition-colors", selected ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40")}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <Button onClick={handleCreatePromo} className="w-full" disabled={promoLoading || !promoCode || promoModules.length === 0}>
              {promoLoading ? "Creando..." : "Crear código"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
