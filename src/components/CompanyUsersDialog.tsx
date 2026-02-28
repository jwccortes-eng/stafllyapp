import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Shield, UserCog, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CompanyActionGuard from "@/components/CompanyActionGuard";

interface CompanyUser {
  id: string;
  user_id: string;
  role: string;
  email: string;
  full_name: string;
}

interface AvailableUser {
  user_id: string;
  email: string;
  full_name: string;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin", icon: Shield },
  { value: "manager", label: "Manager", icon: UserCog },
  { value: "employee", label: "Empleado", icon: User },
];

interface Props {
  companyId: string | null;
  companyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export default function CompanyUsersDialog({ companyId, companyName, open, onOpenChange, onUpdated }: Props) {
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("admin");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  // Guard state for protected actions
  const [guardAction, setGuardAction] = useState<(() => Promise<void>) | null>(null);
  const [guardTitle, setGuardTitle] = useState("");

  const fetchCompanyUsers = async () => {
    if (!companyId) return;

    const { data: cuData } = await supabase
      .from("company_users")
      .select("id, user_id, role")
      .eq("company_id", companyId);

    if (!cuData) return;

    // Get profiles for these users
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, full_name");

    const users: CompanyUser[] = cuData.map(cu => {
      const profile = profiles?.find(p => p.user_id === cu.user_id);
      return {
        id: cu.id,
        user_id: cu.user_id,
        role: cu.role,
        email: profile?.email ?? "",
        full_name: profile?.full_name ?? "",
      };
    });

    setCompanyUsers(users);

    // Available users = all profiles NOT already in this company
    const assignedIds = new Set(cuData.map(cu => cu.user_id));
    const available = (profiles ?? [])
      .filter(p => !assignedIds.has(p.user_id))
      .map(p => ({ user_id: p.user_id, email: p.email ?? "", full_name: p.full_name ?? "" }));
    setAvailableUsers(available);
  };

  useEffect(() => {
    if (open && companyId) {
      fetchCompanyUsers();
      setSelectedUserId("");
      setSelectedRole("admin");
    }
  }, [open, companyId]);

  const doAdd = async () => {
    if (!selectedUserId || !companyId) return;
    setLoading(true);
    const { error } = await supabase
      .from("company_users")
      .insert({ company_id: companyId, user_id: selectedUserId, role: selectedRole } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Usuario asignado" });
      fetchCompanyUsers();
      onUpdated();
      setSelectedUserId("");
    }
    setLoading(false);
  };

  const handleAdd = () => {
    setGuardTitle("Asignar usuario a " + companyName);
    setGuardAction(() => doAdd);
  };

  const doRemove = async (cuId: string) => {
    const { error } = await supabase.from("company_users").delete().eq("id", cuId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Usuario removido" });
      fetchCompanyUsers();
      onUpdated();
    }
  };

  const handleRemove = (cuId: string) => {
    setGuardTitle("Remover usuario de " + companyName);
    setGuardAction(() => () => doRemove(cuId));
  };

  const doRoleChange = async (cuId: string, newRole: string) => {
    const { error } = await supabase
      .from("company_users")
      .update({ role: newRole } as any)
      .eq("id", cuId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Rol actualizado" });
      fetchCompanyUsers();
    }
  };

  const handleRoleChange = (cuId: string, newRole: string) => {
    setGuardTitle("Cambiar rol en " + companyName);
    setGuardAction(() => () => doRoleChange(cuId, newRole));
  };

  const roleColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-primary/10 text-primary border-primary/20";
      case "manager": return "bg-chart-4/10 text-chart-4 border-chart-4/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Usuarios de {companyName}</DialogTitle>
          <DialogDescription>Asigna usuarios y roles a esta empresa</DialogDescription>
        </DialogHeader>

        {/* Add user form */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Usuario</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Seleccionar usuario" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.length === 0 ? (
                  <SelectItem value="__none" disabled>No hay usuarios disponibles</SelectItem>
                ) : (
                  availableUsers.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="w-32 space-y-1">
            <Label className="text-xs">Rol</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={loading || !selectedUserId} className="h-9">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Current users */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Usuario</TableHead>
                <TableHead className="text-xs">Rol</TableHead>
                <TableHead className="text-xs w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companyUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6 text-sm">
                    No hay usuarios asignados
                  </TableCell>
                </TableRow>
              ) : (
                companyUsers.map(cu => (
                  <TableRow key={cu.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{cu.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{cu.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select value={cu.role} onValueChange={(v) => handleRoleChange(cu.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemove(cu.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>

      {/* Security guard for user management actions */}
      <CompanyActionGuard
        open={!!guardAction}
        onOpenChange={(v) => { if (!v) setGuardAction(null); }}
        title={guardTitle}
        description="Esta acción modifica los accesos de la empresa. Confirma tu identidad."
        companyName={companyName}
        requirePassword
        onConfirm={async () => {
          if (guardAction) await guardAction();
          setGuardAction(null);
        }}
      />
    </Dialog>
  );
}