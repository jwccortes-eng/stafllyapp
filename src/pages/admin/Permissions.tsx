import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Shield, CalendarDays, Clock, DollarSign, Settings, Users,
  CheckCircle2, XCircle, Loader2, Zap,
} from "lucide-react";

// All available actions grouped by category
const ACTION_GROUPS = [
  {
    label: "Turnos",
    icon: CalendarDays,
    actions: [
      { key: "crear_turno", label: "Crear turnos" },
      { key: "editar_turno", label: "Editar turnos" },
      { key: "eliminar_turno", label: "Eliminar turnos" },
      { key: "asignar_turno", label: "Asignar empleados" },
      { key: "cerrar_turno", label: "Cerrar turnos" },
      { key: "reabrir_turno", label: "Reabrir turnos" },
    ],
  },
  {
    label: "Reloj / Time Clock",
    icon: Clock,
    actions: [
      { key: "editar_clock", label: "Editar registros" },
      { key: "aprobar_clock", label: "Aprobar registros" },
      { key: "cerrar_dia", label: "Cerrar día" },
      { key: "reabrir_dia", label: "Reabrir día" },
    ],
  },
  {
    label: "Nómina",
    icon: DollarSign,
    actions: [
      { key: "crear_nomina", label: "Crear nómina" },
      { key: "editar_nomina", label: "Editar nómina" },
      { key: "aprobar_nomina", label: "Aprobar nómina" },
      { key: "exportar_nomina", label: "Exportar nómina" },
      { key: "ver_salarios", label: "Ver salarios" },
      { key: "ver_reportes", label: "Ver reportes" },
    ],
  },
  {
    label: "Configuración",
    icon: Settings,
    actions: [
      { key: "configurar_empresa", label: "Configurar empresa" },
    ],
  },
];

const ALL_ACTIONS = ACTION_GROUPS.flatMap(g => g.actions.map(a => a.key));

interface ManagerUser {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface RoleTemplate {
  id: string;
  name: string;
  description: string | null;
  actions: string[];
  is_system: boolean;
}

export default function Permissions() {
  const { role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const [managers, setManagers] = useState<ManagerUser[]>([]);
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch managers and templates
  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const fetchData = async () => {
      // Get managers from user_roles + company_users
      const { data: companyUsers } = await supabase
        .from("company_users")
        .select("user_id, role")
        .eq("company_id", selectedCompanyId);

      const managerUserIds = (companyUsers ?? [])
        .filter(cu => cu.role === "manager")
        .map(cu => cu.user_id);

      // Also check user_roles for managers
      const { data: roleUsers } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "manager");

      const allManagerIds = [...new Set([
        ...managerUserIds,
        ...(roleUsers ?? []).map(r => r.user_id),
      ])];

      if (allManagerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", allManagerIds);

        setManagers((profiles ?? []).map(p => ({
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
        })));
      } else {
        setManagers([]);
      }

      // Fetch templates
      const { data: tmpl } = await supabase
        .from("role_templates")
        .select("*")
        .or(`company_id.eq.${selectedCompanyId},is_system.eq.true`);

      setTemplates((tmpl as RoleTemplate[]) ?? []);
      setLoading(false);
    };

    fetchData();
  }, [selectedCompanyId]);

  // Fetch permissions for selected manager
  useEffect(() => {
    if (!selectedManager || !selectedCompanyId) {
      setPermissions({});
      return;
    }

    supabase
      .from("action_permissions")
      .select("action, granted")
      .eq("user_id", selectedManager)
      .eq("company_id", selectedCompanyId)
      .then(({ data }) => {
        const perms: Record<string, boolean> = {};
        for (const a of ALL_ACTIONS) perms[a] = false;
        for (const d of data ?? []) perms[d.action] = d.granted;
        setPermissions(perms);
      });
  }, [selectedManager, selectedCompanyId]);

  const togglePermission = (action: string) => {
    setPermissions(prev => ({ ...prev, [action]: !prev[action] }));
  };

  const toggleGroup = (actions: { key: string }[]) => {
    const allGranted = actions.every(a => permissions[a.key]);
    const newPerms = { ...permissions };
    for (const a of actions) newPerms[a.key] = !allGranted;
    setPermissions(newPerms);
  };

  const applyTemplate = (template: RoleTemplate) => {
    const newPerms: Record<string, boolean> = {};
    for (const a of ALL_ACTIONS) newPerms[a] = false;
    for (const a of template.actions) newPerms[a] = true;
    setPermissions(newPerms);
    toast.info(`Plantilla "${template.name}" aplicada`);
  };

  const savePermissions = async () => {
    if (!selectedManager || !selectedCompanyId) return;
    setSaving(true);

    // Upsert all permissions
    const upserts = ALL_ACTIONS.map(action => ({
      user_id: selectedManager,
      company_id: selectedCompanyId,
      action,
      granted: permissions[action] ?? false,
    }));

    const { error } = await supabase
      .from("action_permissions")
      .upsert(upserts as any, { onConflict: "user_id,company_id,action" });

    if (error) {
      toast.error("Error al guardar permisos");
    } else {
      toast.success("Permisos guardados correctamente");
      // Log activity
      await supabase.rpc("log_activity", {
        _action: "update",
        _entity_type: "permissions",
        _entity_id: selectedManager,
        _company_id: selectedCompanyId,
        _details: { actions_granted: ALL_ACTIONS.filter(a => permissions[a]) },
      });
    }
    setSaving(false);
  };

  const grantedCount = ALL_ACTIONS.filter(a => permissions[a]).length;
  const selectedManagerInfo = managers.find(m => m.user_id === selectedManager);

  if (role !== "owner" && role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Permisos Granulares
        </h1>
        <p className="page-subtitle">Controla las acciones específicas que cada manager puede realizar</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Manager selector + templates */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Manager
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando...
                </div>
              ) : managers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay managers en esta empresa. Asigna el rol "manager" desde Usuarios.
                </p>
              ) : (
                <Select value={selectedManager ?? ""} onValueChange={setSelectedManager}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map(m => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.full_name || m.email || "Sin nombre"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {selectedManager && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>{selectedManagerInfo?.email}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {grantedCount}/{ALL_ACTIONS.length} permisos
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Templates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Plantillas
              </CardTitle>
              <CardDescription className="text-xs">
                Aplica un conjunto predefinido de permisos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {templates.map(t => (
                <Button
                  key={t.id}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs h-auto py-2"
                  disabled={!selectedManager}
                  onClick={() => applyTemplate(t)}
                >
                  <div className="text-left">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-muted-foreground text-[10px]">
                      {t.actions.length} acciones
                    </p>
                  </div>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right: Permission grid */}
        <div className="lg:col-span-3">
          {!selectedManager ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Shield className="h-12 w-12 mb-4 opacity-20" />
                <p>Selecciona un manager para configurar sus permisos</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {ACTION_GROUPS.map(group => {
                const GroupIcon = group.icon;
                const allGranted = group.actions.every(a => permissions[a.key]);
                const someGranted = group.actions.some(a => permissions[a.key]);

                return (
                  <Card key={group.label}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <GroupIcon className="h-4 w-4" />
                          {group.label}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => toggleGroup(group.actions)}
                        >
                          {allGranted ? (
                            <><XCircle className="h-3 w-3 mr-1" /> Quitar todos</>
                          ) : (
                            <><CheckCircle2 className="h-3 w-3 mr-1" /> Dar todos</>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {group.actions.map(action => (
                          <div
                            key={action.key}
                            className="flex items-center justify-between rounded-lg border px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium">{action.label}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{action.key}</p>
                            </div>
                            <Switch
                              checked={permissions[action.key] ?? false}
                              onCheckedChange={() => togglePermission(action.key)}
                            />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <div className="flex justify-end">
                <Button onClick={savePermissions} disabled={saving} className="min-w-[140px]">
                  {saving ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando...</>
                  ) : (
                    "Guardar permisos"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
