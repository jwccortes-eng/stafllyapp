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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, MoreHorizontal, Pencil, Trash2, Shield, ShieldCheck, UserCog, User, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { useAuth } from "@/hooks/useAuth";

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
  admin: "Administrador",
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

export default function UsersPage() {
  const { role: currentRole } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleType>("employee");
  const [editPerms, setEditPerms] = useState<Record<string, { can_view: boolean; can_edit: boolean; can_delete: boolean }>>({});
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [loading, setLoading] = useState(false);
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

    toast({ title: "Rol actualizado" });
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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Gestión de Usuarios</h1>
        <p className="page-subtitle">Administra roles y permisos por módulo</p>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {(["owner", "admin", "manager", "employee"] as RoleType[]).map(r => {
          const Icon = ROLE_ICONS[r];
          const count = users.filter(u => u.role === r).length;
          return (
            <Card key={r}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`p-2 rounded-lg ${ROLE_COLORS[r]}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[r]}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="data-table-wrapper">
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar usuario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Permisos</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No hay usuarios</TableCell></TableRow>
            ) : (
              filtered.map(u => {
                const Icon = ROLE_ICONS[u.role];
                return (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ROLE_COLORS[u.role]}>
                        <Icon className="h-3 w-3 mr-1" />
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.role === 'owner' || u.role === 'admin' ? (
                        <span>Todos los módulos</span>
                      ) : u.role === 'manager' ? (
                        <span>{u.permissions.filter(p => p.can_view).length} módulos</span>
                      ) : (
                        <span>Solo portal</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.role !== 'owner' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditUser(u)}>
                              <Pencil className="h-4 w-4 mr-2" />Editar rol
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
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Role Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditUser(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar rol: {editUser?.full_name || editUser?.email}</DialogTitle>
            <DialogDescription>Cambia el rol y configura los permisos por módulo</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rol</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as RoleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador — Todos los permisos</SelectItem>
                  <SelectItem value="manager">Manager — Permisos por módulo</SelectItem>
                  <SelectItem value="employee">Empleado — Solo portal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editRole === "manager" && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Permisos por módulo</Label>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Módulo</TableHead>
                        <TableHead className="text-xs text-center">Ver</TableHead>
                        <TableHead className="text-xs text-center">Editar</TableHead>
                        <TableHead className="text-xs text-center">Eliminar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MODULES.map(m => (
                        <TableRow key={m.key}>
                          <TableCell className="text-sm font-medium">{m.label}</TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={editPerms[m.key]?.can_view ?? false}
                              onCheckedChange={() => togglePerm(m.key, 'can_view')}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={editPerms[m.key]?.can_edit ?? false}
                              onCheckedChange={() => togglePerm(m.key, 'can_edit')}
                            />
                          </TableCell>
                          <TableCell className="text-center">
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
    </div>
  );
}
