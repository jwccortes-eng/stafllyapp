import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useCompensationProfiles, useCompensationMutations, type CompensationProfile, type PaymentMode } from "@/hooks/useCompensation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Pencil, Save, X, Plus, History, Loader2, Download } from "lucide-react";
import { format } from "date-fns";

const RATE_SOURCE_LABELS: Record<string, string> = {
  company_default: "Empresa",
  job_default: "Puesto",
  location_default: "Ubicación",
  employee_custom: "Personalizado",
  imported: "Importado",
};

const MODE_LABELS: Record<string, string> = {
  hourly: "Por hora",
  daily: "Por día",
  mixed: "Mixto",
};

interface EmployeeRow {
  employee_id: string;
  first_name: string;
  last_name: string;
  employee_role: string | null;
  profile: CompensationProfile | null;
}

export default function CompensationMatrixTab() {
  const { user, role, hasActionPermission } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { data: profiles, isLoading: profilesLoading } = useCompensationProfiles();
  const { upsertProfile } = useCompensationMutations();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const canEdit = role === "owner" || role === "admin" || role === "developer" || hasActionPermission("manage_compensation");

  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees-for-matrix", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, employee_role")
        .eq("company_id", selectedCompanyId!)
        .eq("is_active", true)
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const rows: EmployeeRow[] = useMemo(() => {
    if (!employees) return [];
    const profileMap = new Map((profiles ?? []).map(p => [p.employee_id, p]));
    return employees.map(e => ({
      employee_id: e.id,
      first_name: e.first_name ?? "",
      last_name: e.last_name ?? "",
      employee_role: e.employee_role,
      profile: profileMap.get(e.id) ?? null,
    }));
  }, [employees, profiles]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter(r =>
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(s) ||
      (r.employee_role ?? "").toLowerCase().includes(s)
    );
  }, [rows, search]);

  const startEdit = (row: EmployeeRow) => {
    setEditingId(row.employee_id);
    const p = row.profile;
    setEditForm({
      payment_mode: p?.payment_mode ?? "hourly",
      default_hourly_rate: p?.default_hourly_rate ?? "",
      default_daily_rate: p?.default_daily_rate ?? "",
      default_half_day_rate: p?.default_half_day_rate ?? "",
      default_ride_rate_regular: p?.default_ride_rate_regular ?? "",
      default_ride_rate_special: p?.default_ride_rate_special ?? "",
      effective_from: p?.effective_from ?? new Date().toISOString().split("T")[0],
      reason: "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (row: EmployeeRow) => {
    setSaving(true);
    try {
      const p = row.profile;
      const changes: { field: string; oldVal: string | null; newVal: string | null }[] = [];
      const fields = ["payment_mode", "default_hourly_rate", "default_daily_rate", "default_half_day_rate", "default_ride_rate_regular", "default_ride_rate_special"];
      for (const f of fields) {
        const oldV = p ? String(p[f as keyof CompensationProfile] ?? "") : "";
        const newV = String(editForm[f] ?? "");
        if (oldV !== newV) changes.push({ field: f, oldVal: oldV || null, newVal: newV || null });
      }

      await upsertProfile(row.employee_id, {
        payment_mode: editForm.payment_mode as PaymentMode,
        default_hourly_rate: editForm.default_hourly_rate ? Number(editForm.default_hourly_rate) : null,
        default_daily_rate: editForm.default_daily_rate ? Number(editForm.default_daily_rate) : null,
        default_half_day_rate: editForm.default_half_day_rate ? Number(editForm.default_half_day_rate) : null,
        default_ride_rate_regular: editForm.default_ride_rate_regular ? Number(editForm.default_ride_rate_regular) : null,
        default_ride_rate_special: editForm.default_ride_rate_special ? Number(editForm.default_ride_rate_special) : null,
        effective_from: editForm.effective_from,
        rate_source: "employee_custom" as any,
      }, {
        reason: editForm.reason || undefined,
        sourceType: "inline_edit",
        changedFields: changes.length > 0 ? changes : [{ field: "profile", oldVal: null, newVal: "inline_update" }],
      });

      toast.success("Compensación actualizada");
      cancelEdit();
    } catch (e: any) {
      toast.error(e.message || "Error al guardar");
    }
    setSaving(false);
  };

  const isLoading = profilesLoading || employeesLoading;

  const formatCurrency = (v: number | null) => v != null ? `$${v.toFixed(0)}` : "—";

  return (
    <div className="space-y-4">
      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar empleado..."
      >
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => {
            setAddForm({ payment_mode: "hourly", effective_from: new Date().toISOString().split("T")[0] });
            setShowAddDialog(true);
          }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar perfil
          </Button>
        )}
      </DataTableToolbar>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead className="text-right">Hora</TableHead>
                    <TableHead className="text-right">Día</TableHead>
                    <TableHead className="text-right">½ Día</TableHead>
                    <TableHead className="text-right">Ride</TableHead>
                    <TableHead className="text-right">Ride Esp.</TableHead>
                    <TableHead>Fuente</TableHead>
                    <TableHead>Desde</TableHead>
                    {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 11 : 10} className="text-center text-muted-foreground py-8">
                        No hay empleados con compensación configurada
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(row => {
                    const isEditing = editingId === row.employee_id;
                    const p = row.profile;

                    return (
                      <TableRow key={row.employee_id} className={isEditing ? "bg-primary/5" : ""}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {row.first_name} {row.last_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {row.employee_role || "—"}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select value={editForm.payment_mode} onValueChange={v => setEditForm(f => ({ ...f, payment_mode: v }))}>
                              <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hourly">Hora</SelectItem>
                                <SelectItem value="daily">Día</SelectItem>
                                <SelectItem value="mixed">Mixto</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {MODE_LABELS[p?.payment_mode ?? "hourly"]}
                            </Badge>
                          )}
                        </TableCell>
                        {["default_hourly_rate", "default_daily_rate", "default_half_day_rate", "default_ride_rate_regular", "default_ride_rate_special"].map(field => (
                          <TableCell key={field} className="text-right">
                            {isEditing ? (
                              <Input
                                type="number"
                                className="h-8 w-20 text-right"
                                value={editForm[field] ?? ""}
                                onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                              />
                            ) : (
                              formatCurrency(p?.[field as keyof CompensationProfile] as number | null)
                            )}
                          </TableCell>
                        ))}
                        <TableCell>
                          {p ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {RATE_SOURCE_LABELS[p.rate_source] ?? p.rate_source}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {isEditing ? (
                            <Input
                              type="date"
                              className="h-8 w-32"
                              value={editForm.effective_from}
                              onChange={e => setEditForm(f => ({ ...f, effective_from: e.target.value }))}
                            />
                          ) : (
                            p?.effective_from ? format(new Date(p.effective_from + "T00:00:00"), "dd MMM yyyy") : "—"
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            {isEditing ? (
                              <div className="flex gap-1 justify-end">
                                <Button size="xs" onClick={() => saveEdit(row)} disabled={saving}>
                                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                </Button>
                                <Button size="xs" variant="ghost" onClick={cancelEdit} disabled={saving}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button size="xs" variant="ghost" onClick={() => startEdit(row)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Profile Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear perfil de compensación</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Empleado</Label>
              <Select value={addForm.employee_id ?? ""} onValueChange={v => setAddForm(f => ({ ...f, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {(employees ?? []).filter(e => !profiles?.some(p => p.employee_id === e.id)).map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Modo de pago</Label>
                <Select value={addForm.payment_mode} onValueChange={v => setAddForm(f => ({ ...f, payment_mode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Por hora</SelectItem>
                    <SelectItem value="daily">Por día</SelectItem>
                    <SelectItem value="mixed">Mixto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Vigente desde</Label>
                <Input type="date" value={addForm.effective_from ?? ""} onChange={e => setAddForm(f => ({ ...f, effective_from: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Tarifa hora ($)</Label><Input type="number" min="0" step="0.01" value={addForm.default_hourly_rate ?? ""} onChange={e => setAddForm(f => ({ ...f, default_hourly_rate: e.target.value }))} /></div>
              <div><Label className="text-xs">Tarifa día ($)</Label><Input type="number" min="0" step="0.01" value={addForm.default_daily_rate ?? ""} onChange={e => setAddForm(f => ({ ...f, default_daily_rate: e.target.value }))} /></div>
              <div><Label className="text-xs">½ día ($)</Label><Input type="number" min="0" step="0.01" value={addForm.default_half_day_rate ?? ""} onChange={e => setAddForm(f => ({ ...f, default_half_day_rate: e.target.value }))} /></div>
              <div><Label className="text-xs">Ride regular ($)</Label><Input type="number" min="0" step="0.01" value={addForm.default_ride_rate_regular ?? ""} onChange={e => setAddForm(f => ({ ...f, default_ride_rate_regular: e.target.value }))} /></div>
              <div><Label className="text-xs">Ride especial ($)</Label><Input type="number" min="0" step="0.01" value={addForm.default_ride_rate_special ?? ""} onChange={e => setAddForm(f => ({ ...f, default_ride_rate_special: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button disabled={!addForm.employee_id || saving} onClick={async () => {
              setSaving(true);
              try {
                await upsertProfile(addForm.employee_id, {
                  payment_mode: addForm.payment_mode as PaymentMode,
                  default_hourly_rate: toNumOrNull(addForm.default_hourly_rate),
                  default_daily_rate: toNumOrNull(addForm.default_daily_rate),
                  default_half_day_rate: toNumOrNull(addForm.default_half_day_rate),
                  default_ride_rate_regular: toNumOrNull(addForm.default_ride_rate_regular),
                  default_ride_rate_special: toNumOrNull(addForm.default_ride_rate_special),
                  effective_from: addForm.effective_from,
                  rate_source: "employee_custom" as any,
                });
                toast.success("Perfil creado");
                setShowAddDialog(false);
              } catch (e: any) {
                toast.error(e.message ?? "Error al crear el perfil");
              }
              setSaving(false);
            }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
