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
import { Badge } from "@/components/ui/badge";
import { Search, MoreHorizontal, Pencil, Trash2, Shield, ShieldCheck, UserCog, User, KeyRound, UserPlus, Smartphone, Mail } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const MODULES = [
  { key: "employees", label: "Empleados" },
  { key: "periods", label: "Periodos" },
  { key: "import", label: "Importar" },
  { key: "concepts", label: "Conceptos" },
  { key: "movements", label: "Novedades" },
  { key: "summary", label: "Resumen" },
  { key: "reports", label: "Reportes" },
];

type RoleType = 'owner' | 'admin' | 'manager' | 'employee';

interface UserRecord {
  user_id: string;
  email: string;
  full_name: string;
  role: RoleType;
  permissions: { module: string; can_view: boolean; can_edit: boolean; can_delete: boolean }[];
}

const ROLE_LABELS: Record<RoleType, string> = {
  owner: "Dueño",
  admin: "Admin",
  manager: "Manager",
  employee: "Empleado",
};

const ROLE_ICONS: Record<RoleType, typeof Shield> = {
  owner: ShieldCheck,
  admin: Shield,
  manager: UserCog,
  employee: User,
};

const ROLE_COLORS: Record<RoleType, string> = {
  owner: "bg-chart-1/10 text-chart-1 border-chart-1/20",
  admin: "bg-primary/10 text-primary border-primary/20",
  manager: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  employee: "bg-muted text-muted-foreground border-border",
};

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
  "bg-violet-500", "bg-teal-500", "bg-indigo-500", "bg-pink-500",
];

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function UserAvatar({ name, email, size = "md" }: { name: string; email: string; size?: "sm" | "md" }) {
  const isMobile = !email.includes("@") || email.includes("phone");
  const initials = name
    ? name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : email.charAt(0).toUpperCase();
  const color = AVATAR_COLORS[hashStr(name || email) % AVATAR_COLORS.length];
  const sz = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";

  return (
    <div className="relative">
      <div className={cn("rounded-full flex items-center justify-center font-semibold text-white shrink-0", sz, color)}>
        {initials}
      </div>
      <div className={cn(
        "absolute -bottom-0.5 -right-0.5 rounded-full p-[3px] border-2 border-background",
        isMobile ? "bg-emerald-500" : "bg-blue-500"
      )}>
        {isMobile
          ? <Smartphone className="h-2 w-2 text-white" />
          : <Mail className="h-2 w-2 text-white" />}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { role: currentRole } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
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
  const [inviteRole, setInviteRole] = useState<"admin" | "manager">("admin");
  const [inviteLoading, setInviteLoading] = useState(false);
  const { toast } = useToast();

  const fetchUsers = async () => {
    const { data: profiles } = await supabase.from("profiles").select("user_id, email, full_name");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const { data: perms } = await supabase.from("module_permissions").select("user_id, module, can_view, can_edit, can_delete");

    if (!profiles) return;

    const userList: UserRecord[] = profiles.map(p => {
      const roleRec = roles?.find(r => r.user_id === p.user_id);
      const userPerms = perms?.filter(pm => pm.user_id === p.user_id) ?? [];
      return {
        user_id: p.user_id,
        email: p.email ?? "",
        full_name: p.full_name ?? "",
        role: (roleRec?.role as RoleType) ?? "employee",
        permissions: userPerms,
      };
    });

    setUsers(userList);
  };

  useEffect(() => { fetchUsers(); }, []);

  const openEditUser = (u: UserRecord) => {
    setEditUser(u);
    setEditRole(u.role);
    setEditName(u.full_name);
    setEditEmail(u.email);
    const permsMap: Record<string, { can_view: boolean; can_edit: boolean; can_delete: boolean }> = {};
    MODULES.forEach(m => {
      const existing = u.permissions.find(p => p.module === m.key);
      permsMap[m.key] = existing
        ? { can_view: existing.can_view, can_edit: existing.can_edit, can_delete: existing.can_delete }
        : { can_view: false, can_edit: false, can_delete: false };
    });
    setEditPerms(permsMap);
    setEditOpen(true);
  };

  const handleSaveRole = async () => {
    if (!editUser) return;
    setLoading(true);

    // Update profile data
    if (editName !== editUser.full_name || editEmail !== editUser.email) {
      await supabase
        .from("profiles")
        .update({ full_name: editName, email: editEmail })
        .eq("user_id", editUser.user_id);
    }

    const { error: roleError } = await supabase
      .from("user_roles")
      .update({ role: editRole } as any)
      .eq("user_id", editUser.user_id);

    if (roleError) {
      toast({ title: "Error", description: getUserFriendlyError(roleError), variant: "destructive" });
      setLoading(false);
      return;
    }

    if (editRole === "manager") {
      for (const mod of MODULES) {
        const perm = editPerms[mod.key];
        await supabase
          .from("module_permissions")
          .upsert({
            user_id: editUser.user_id,
            module: mod.key,
            can_view: perm.can_view,
            can_edit: perm.can_edit,
            can_delete: perm.can_delete,
          } as any, { onConflict: "user_id,module" });
      }
    } else {
      await supabase
        .from("module_permissions")
        .delete()
        .eq("user_id", editUser.user_id);
    }

    toast({ title: "Usuario actualizado" });
    setEditOpen(false);
    setEditUser(null);
    fetchUsers();
    setLoading(false);
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    await supabase.from("user_roles").delete().eq("user_id", deleteTarget.user_id);
    await supabase.from("module_permissions").delete().eq("user_id", deleteTarget.user_id);
    toast({ title: "Rol de usuario eliminado" });
    setDeleteTarget(null);
    fetchUsers();
  };

  const handleResetPassword = async () => {
    if (!passwordTarget || !newPassword) return;
    setPasswordLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { user_id: passwordTarget.user_id, new_password: newPassword },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Contraseña actualizada", description: `Se cambió la contraseña de ${passwordTarget.full_name || passwordTarget.email}` });
        setPasswordTarget(null);
        setNewPassword("");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Error al cambiar contraseña", variant: "destructive" });
    }
    setPasswordLoading(false);
  };

  const togglePerm = (module: string, field: 'can_view' | 'can_edit' | 'can_delete') => {
    setEditPerms(prev => ({
      ...prev,
      [module]: { ...prev[module], [field]: !prev[module][field] },
    }));
  };

  const handleInviteAdmin = async () => {
    if (!inviteEmail || !invitePassword) return;
    setInviteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-admin", {
        body: { email: inviteEmail, password: invitePassword, full_name: inviteName, role: inviteRole },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Usuario creado", description: `${inviteEmail} fue agregado como ${inviteRole === "admin" ? "Administrador" : "Manager"}` });
        setInviteOpen(false);
        setInviteEmail("");
        setInviteName("");
        setInvitePassword("");
        fetchUsers();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Error al crear usuario", variant: "destructive" });
    }
    setInviteLoading(false);
  };

  const filtered = users.filter(u =>
    `${u.full_name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase())
  );

  if (currentRole !== 'owner') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  // Count by role
  const roleCounts = { owner: 0, admin: 0, manager: 0, employee: 0 };
  users.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

  return (
    <div>
      <PageHeader
        variant="5"
        icon={ShieldCheck}
        title="Gestión de Usuarios"
        subtitle="Administra roles y permisos por módulo"
        rightSlot={<Button onClick={() => setInviteOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invitar
        </Button>}
      />

      {/* Compact role pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(["owner", "admin", "manager", "employee"] as RoleType[]).map(r => {
          const Icon = ROLE_ICONS[r];
          return (
            <div key={r} className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium", ROLE_COLORS[r])}>
              <Icon className="h-3.5 w-3.5" />
              {roleCounts[r]} {ROLE_LABELS[r]}
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-xs mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {/* User list as cards */}
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm">No hay usuarios</p>
        ) : (
          filtered.map(u => {
            const Icon = ROLE_ICONS[u.role];
            return (
              <div
                key={u.user_id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/50 hover:border-border hover:shadow-sm transition-all group"
              >
                <UserAvatar name={u.full_name} email={u.email} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{u.full_name || "Sin nombre"}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>

                <Badge variant="outline" className={cn("text-[10px] shrink-0", ROLE_COLORS[u.role])}>
                  <Icon className="h-3 w-3 mr-1" />
                  {ROLE_LABELS[u.role]}
                </Badge>

                {u.role !== 'owner' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditUser(u)}>
                        <Pencil className="h-4 w-4 mr-2" />Editar usuario
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setPasswordTarget(u); setNewPassword(""); }}>
                        <KeyRound className="h-4 w-4 mr-2" />Cambiar contraseña
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(u)}>
                        <Trash2 className="h-4 w-4 mr-2" />Quitar rol
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditUser(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {editUser && <UserAvatar name={editUser.full_name} email={editUser.email} size="sm" />}
              Editar usuario
            </DialogTitle>
            <DialogDescription>Modifica datos, rol y permisos</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Editable fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} className="h-9" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Rol</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as RoleType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador — Acceso completo</SelectItem>
                  <SelectItem value="manager">Manager — Permisos selectivos</SelectItem>
                  <SelectItem value="employee">Empleado — Solo portal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editRole === "manager" && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Permisos por módulo</Label>
                <div className="border rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Módulo</TableHead>
                        <TableHead className="text-[10px] text-center w-16">Ver</TableHead>
                        <TableHead className="text-[10px] text-center w-16">Editar</TableHead>
                        <TableHead className="text-[10px] text-center w-16">Borrar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MODULES.map(m => (
                        <TableRow key={m.key}>
                          <TableCell className="text-xs font-medium py-2">{m.label}</TableCell>
                          <TableCell className="text-center py-2">
                            <Switch
                              checked={editPerms[m.key]?.can_view ?? false}
                              onCheckedChange={() => togglePerm(m.key, 'can_view')}
                            />
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <Switch
                              checked={editPerms[m.key]?.can_edit ?? false}
                              onCheckedChange={() => togglePerm(m.key, 'can_edit')}
                            />
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <Switch
                              checked={editPerms[m.key]?.can_delete ?? false}
                              onCheckedChange={() => togglePerm(m.key, 'can_delete')}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <Button onClick={handleSaveRole} className="w-full" disabled={loading}>
              {loading ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={!!passwordTarget} onOpenChange={(v) => { if (!v) { setPasswordTarget(null); setNewPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>
              {passwordTarget?.full_name || passwordTarget?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva contraseña</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
              />
            </div>
            <Button
              onClick={handleResetPassword}
              className="w-full"
              disabled={passwordLoading || newPassword.length < 6}
            >
              {passwordLoading ? "Cambiando..." : "Cambiar contraseña"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar rol de usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el rol de <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong> y sus permisos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Quitar rol
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite Admin Dialog */}
      <Dialog open={inviteOpen} onOpenChange={(v) => { setInviteOpen(v); if (!v) { setInviteEmail(""); setInviteName(""); setInvitePassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invitar Administrador</DialogTitle>
            <DialogDescription>Crea una cuenta con rol de admin o manager</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Nombre completo</Label>
              <Input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Juan Pérez" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Correo electrónico</Label>
              <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="admin@empresa.com" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contraseña</Label>
              <Input type="password" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rol</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "manager")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleInviteAdmin} className="w-full" disabled={inviteLoading || !inviteEmail || invitePassword.length < 6}>
              {inviteLoading ? "Creando..." : "Crear usuario"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
