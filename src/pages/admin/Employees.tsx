import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Search, Upload, FileSpreadsheet, CheckCircle2, MoreHorizontal, Pencil, Trash2, UserX, UserCheck, Eye, RefreshCw, ArrowUpDown, Users, Download, Filter, X, Phone, Mail, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { parseConnecteamFile, type ParsedEmployee } from "@/lib/connecteam-parser";
import { safeRead, safeSheetToJson, getSheetNames, getSheet, writeExcelFile } from "@/lib/safe-xlsx";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";
import { EmployeeAvailabilitySection } from "@/components/EmployeeAvailabilitySection";
import { useSubscription } from "@/hooks/useSubscription";
import UpgradeBanner from "@/components/billing/UpgradeBanner";

// Fields that only owner/admin can see - hidden from managers
const SENSITIVE_FIELD_KEYS = new Set([
  "access_pin", "driver_licence", "has_car", "country_code", "english_level",
]);

// All Connecteam fields in Excel order
const CONNECTEAM_FIELDS: { key: string; label: string; fileCol: string[]; required?: boolean; hidden?: boolean }[] = [
  { key: "first_name", label: "Nombre", fileCol: ["First name"], required: true },
  { key: "last_name", label: "Apellido", fileCol: ["Last name"], required: true },
  { key: "phone_number", label: "Teléfono", fileCol: ["Mobile phone", "Phone"] },
  { key: "country_code", label: "Código país", fileCol: ["Country code"] },
  { key: "email", label: "Email", fileCol: ["Email"] },
  { key: "access_pin", label: "PIN de acceso", fileCol: [], hidden: true },
  { key: "start_date", label: "Fecha inicio", fileCol: ["Start Date"] },
  { key: "english_level", label: "Nivel inglés", fileCol: ["English Level"] },
  { key: "employee_role", label: "Rol", fileCol: ["Role"] },
  { key: "qualify", label: "Calificación", fileCol: ["Qualify"] },
  { key: "recommended_by", label: "Recomendado por", fileCol: ["Recommended by?"] },
  { key: "direct_manager", label: "Manager directo", fileCol: ["Direct manager"] },
  { key: "has_car", label: "¿Tiene carro?", fileCol: ["You have car?"] },
  { key: "driver_licence", label: "Licencia", fileCol: ["Driver Licence"] },
  { key: "end_date", label: "Fecha fin", fileCol: ["End Date"] },
  { key: "date_added", label: "Fecha agregado", fileCol: ["Date added"] },
  { key: "last_login", label: "Último login", fileCol: ["Last login"] },
  { key: "connecteam_employee_id", label: "Connecteam ID", fileCol: ["Connecteam User ID"] },
  { key: "added_via", label: "Agregado vía", fileCol: ["Added via"] },
  { key: "added_by", label: "Agregado por", fileCol: ["Added by"] },
  { key: "groups", label: "Grupos", fileCol: ["Groups"] },
  { key: "tags", label: "Tags", fileCol: ["Tags"] },
];

type EmployeeRecord = Record<string, any>;

/** Converts "JOHN DOE" or "john doe" to "John Doe" */
const toTitleCase = (s: string | null | undefined): string => {
  if (!s) return "";
  return s.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};

const NAME_FIELDS = ["first_name", "last_name", "direct_manager", "recommended_by", "added_by"];

interface ImportPreviewRow extends EmployeeRecord {
  exists: boolean;
}

interface UpdateDiff {
  employeeId: string;
  name: string;
  changes: { field: string; label: string; oldVal: string; newVal: string }[];
  selected: boolean;
}

export default function Employees() {
  const { selectedCompanyId } = useCompany();
  const { role } = useAuth();
  const isPrivileged = role === 'owner' || role === 'admin';
  const { canAddEmployees, limits, plan } = useSubscription();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRecord | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [viewEmployee, setViewEmployee] = useState<EmployeeRecord | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "done">("upload");
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [updateDiffs, setUpdateDiffs] = useState<UpdateDiff[]>([]);
  const [updateStep, setUpdateStep] = useState<"upload" | "preview" | "done">("upload");
  const [updateResult, setUpdateResult] = useState<{ updated: number; skipped: number; created?: number } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMode, setUpdateMode] = useState<"diff" | "full">("full");
  const { toast } = useToast();

  const emptyForm = () => Object.fromEntries(CONNECTEAM_FIELDS.map(f => [f.key, ""]));

  const fetchEmployees = async () => {
    if (!selectedCompanyId) return;
    const { data } = await supabase.from("employees").select("*").eq("company_id", selectedCompanyId).order("first_name");
    setEmployees((data as EmployeeRecord[]) ?? []);
    setInitialLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, [selectedCompanyId]);

  const activeEmployeeCount = employees.filter(e => e.is_active !== false).length;
  const atEmployeeLimit = !canAddEmployees(activeEmployeeCount);

  const findCol = (row: Record<string, any>, candidates: string[]) => {
    const keys = Object.keys(row);
    for (const c of candidates) {
      const found = keys.find(k => k.toLowerCase().replace(/[_\s-]/g, "") === c.toLowerCase().replace(/[_\s-]/g, ""));
      if (found) return String(row[found]).trim();
    }
    return "";
  };

  const buildInsertData = (src: Record<string, string>) => {
    const data: Record<string, any> = {};
    CONNECTEAM_FIELDS.forEach(f => {
      let val = (src[f.key] ?? "").trim();
      if (NAME_FIELDS.includes(f.key)) val = toTitleCase(val);
      data[f.key] = val || null;
    });
    data.first_name = data.first_name || "";
    data.last_name = data.last_name || "";
    return data;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (atEmployeeLimit) {
      toast({ title: "Límite alcanzado", description: `Tu plan ${limits.label} permite máximo ${limits.maxEmployees} empleados activos. Actualiza tu plan para agregar más.`, variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("employees").insert({ ...buildInsertData(form), company_id: selectedCompanyId } as any);
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Empleado creado" });
      setOpen(false);
      setForm(emptyForm());
      fetchEmployees();
    }
    setLoading(false);
  };

  const openEdit = (emp: EmployeeRecord) => {
    setEditingEmployee(emp);
    const f: Record<string, string> = {};
    CONNECTEAM_FIELDS.forEach(field => { f[field.key] = emp[field.key] ?? ""; });
    setForm(f);
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setLoading(true);
    const { error } = await supabase.from("employees").update(buildInsertData(form) as any).eq("id", editingEmployee.id);
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Empleado actualizado" });
      setEditOpen(false);
      setEditingEmployee(null);
      setForm(emptyForm());
      fetchEmployees();
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("employees").delete().eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Error al eliminar", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Empleado eliminado" });
      fetchEmployees();
    }
    setDeleteTarget(null);
  };

  const toggleActive = async (emp: EmployeeRecord) => {
    const { error } = await supabase.from("employees").update({ is_active: !emp.is_active }).eq("id", emp.id);
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: emp.is_active ? "Empleado desactivado" : "Empleado activado" });
      fetchEmployees();
    }
  };

  // ---- Match employee from file row to existing DB record ----
  const matchEmployee = (parsed: ParsedEmployee): EmployeeRecord | undefined => {
    // Match by Connecteam ID first
    if (parsed.connecteam_employee_id) {
      const match = employees.find(e => e.connecteam_employee_id === parsed.connecteam_employee_id);
      if (match) return match;
    }
    // Then by phone number
    if (parsed.phone_number) {
      const phone = parsed.phone_number.replace(/\D/g, "");
      const match = employees.find(e => e.phone_number?.replace(/\D/g, "") === phone);
      if (match) return match;
    }
    // Then by name
    if (parsed.first_name && parsed.last_name) {
      const match = employees.find(
        e => e.first_name?.toLowerCase().trim() === parsed.first_name?.toLowerCase().trim() &&
             e.last_name?.toLowerCase().trim() === parsed.last_name?.toLowerCase().trim()
      );
      if (match) return match;
    }
    return undefined;
  };

  // ---- IMPORT (create new) ----
  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const content = await f.arrayBuffer();

    let parsed: ParsedEmployee[];
    try {
      parsed = await parseConnecteamFile(content, f.name);
    } catch {
      // Fallback to ExcelJS direct parse
      const wb = await safeRead(content);
      const names = getSheetNames(wb);
      const ws = getSheet(wb, names[0]);
      if (!ws) return;
      const rows = safeSheetToJson<Record<string, any>>(ws, { defval: "" });
      parsed = rows.map(row => {
        const mapped: ParsedEmployee = {};
        CONNECTEAM_FIELDS.forEach(field => {
          mapped[field.key] = findCol(row, field.fileCol);
        });
        return mapped;
      }).filter(r => r.first_name || r.last_name);
    }

      const seen = new Set<string>();
      const preview: ImportPreviewRow[] = [];

      for (const row of parsed) {
        const key = `${(row.first_name ?? "").toLowerCase()}|${(row.last_name ?? "").toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const exists = !!matchEmployee(row);
        preview.push({ ...row, exists });
      }

      setImportPreview(preview);
      setImportStep("preview");
  }, [employees]);

  const executeImport = async () => {
    setImporting(true);
    const toCreate = importPreview.filter(r => !r.exists);
    let created = 0;

    for (const emp of toCreate) {
      const data = buildInsertData(emp);
      const { error } = await supabase.from("employees").insert({ ...data, company_id: selectedCompanyId } as any);
      if (!error) created++;
    }

    setImportResult({ created, skipped: importPreview.filter(r => r.exists).length });
    setImportStep("done");
    setImporting(false);
    fetchEmployees();
  };

  const resetImport = () => {
    setImportStep("upload");
    setImportPreview([]);
    setImportResult(null);
  };

  // ---- UPDATE (diff or full replace) ----
  const handleUpdateFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const content = await f.arrayBuffer();

    let parsed: ParsedEmployee[];
    try {
      parsed = await parseConnecteamFile(content, f.name);
    } catch {
      const wb = await safeRead(content);
      const names = getSheetNames(wb);
      const ws = getSheet(wb, names[0]);
      if (!ws) return;
      const rows = safeSheetToJson<Record<string, any>>(ws, { defval: "" });
      parsed = rows.map(row => {
        const mapped: ParsedEmployee = {};
        CONNECTEAM_FIELDS.forEach(field => {
          mapped[field.key] = findCol(row, field.fileCol);
        });
        return mapped;
      }).filter(r => r.first_name || r.last_name);
    }

      const diffs: UpdateDiff[] = [];

      for (const row of parsed) {
        const existing = matchEmployee(row);
        if (!existing) {
          // For full mode, new employees show as "all fields are new"
          if (updateMode === "full") {
            const allChanges = CONNECTEAM_FIELDS
              .filter(field => row[field.key]?.trim())
              .map(field => ({
                field: field.key,
                label: field.label,
                oldVal: "—",
                newVal: row[field.key] ?? "",
              }));
            if (allChanges.length > 0) {
              diffs.push({
                employeeId: "__new__" + (row.connecteam_employee_id || row.phone_number || `${row.first_name}_${row.last_name}`),
                name: `${row.first_name ?? ""} ${row.last_name ?? ""} (NUEVO)`,
                changes: allChanges,
                selected: true,
              });
            }
          }
          continue;
        }

        const changes: UpdateDiff["changes"] = [];
        CONNECTEAM_FIELDS.forEach(field => {
          const newVal = (row[field.key] ?? "").trim();
          const oldVal = String(existing[field.key] ?? "").trim();

          if (updateMode === "full") {
            // Full mode: show all fields that will be set (even if same)
            if (newVal) {
              changes.push({
                field: field.key,
                label: field.label,
                oldVal: oldVal || "—",
                newVal,
              });
            }
          } else {
            // Diff mode: only changed fields
            if (newVal && newVal !== oldVal) {
              changes.push({
                field: field.key,
                label: field.label,
                oldVal: oldVal || "—",
                newVal,
              });
            }
          }
        });

        if (changes.length > 0) {
          diffs.push({
            employeeId: existing.id,
            name: `${existing.first_name} ${existing.last_name}`,
            changes,
            selected: true,
          });
        }
      }

      setUpdateDiffs(diffs);
      setUpdateStep("preview");
  }, [employees, updateMode]);

  const toggleDiffSelected = (idx: number) => {
    setUpdateDiffs(prev => prev.map((d, i) => i === idx ? { ...d, selected: !d.selected } : d));
  };

  const executeUpdateDiffs = async () => {
    setUpdating(true);
    const selected = updateDiffs.filter(d => d.selected);
    let updated = 0;
    let created = 0;

    for (const diff of selected) {
      const updateData: Record<string, any> = {};
      diff.changes.forEach(c => {
        updateData[c.field] = NAME_FIELDS.includes(c.field) ? toTitleCase(c.newVal) : (c.newVal || null);
      });

      if (diff.employeeId.startsWith("__new__")) {
        // Create new employee
        updateData.first_name = updateData.first_name || "";
        updateData.last_name = updateData.last_name || "";
        const { error } = await supabase.from("employees").insert({ ...updateData, company_id: selectedCompanyId } as any);
        if (!error) created++;
      } else {
        const { error } = await supabase.from("employees").update(updateData as any).eq("id", diff.employeeId);
        if (!error) updated++;
      }
    }

    setUpdateResult({ updated, skipped: updateDiffs.length - selected.length, created });
    setUpdateStep("done");
    setUpdating(false);
    fetchEmployees();
  };

  const resetUpdate = () => {
    setUpdateStep("upload");
    setUpdateDiffs([]);
    setUpdateResult(null);
  };

  // ---- EXPORT to Excel (excluding sensitive fields) ----
  const SENSITIVE_KEYS: string[] = [];

  const handleExport = async () => {
    const exportFields = CONNECTEAM_FIELDS.filter(f => !SENSITIVE_KEYS.includes(f.key));
    const rows = filtered.map(emp => {
      const row: Record<string, string> = {};
      exportFields.forEach(f => {
        row[f.label] = emp[f.key] ?? "";
      });
      row["Estado"] = emp.is_active ? "Activo" : "Inactivo";
      return row;
    });

    await writeExcelFile(rows, "Empleados", `empleados_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Exportado", description: `${rows.length} empleados exportados a Excel` });
  };

  // Derive unique roles and groups for filters
  const uniqueRoles = [...new Set(employees.map(e => e.employee_role).filter(Boolean))];
  const uniqueGroups = [...new Set(employees.map(e => e.groups).filter(Boolean))];

  const activeFilterCount = [filterStatus !== "all", filterRole !== "all", filterGroup !== "all"].filter(Boolean).length;

  const clearFilters = () => {
    setFilterStatus("all");
    setFilterRole("all");
    setFilterGroup("all");
  };

  const filtered = employees.filter((e) => {
    const matchesSearch = `${e.first_name} ${e.last_name} ${e.email ?? ""} ${e.phone_number ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || (filterStatus === "active" ? e.is_active : !e.is_active);
    const matchesRole = filterRole === "all" || e.employee_role === filterRole;
    const matchesGroup = filterGroup === "all" || e.groups === filterGroup;
    return matchesSearch && matchesStatus && matchesRole && matchesGroup;
  });

  const openDetailSheet = (emp: EmployeeRecord) => {
    setViewEmployee(emp);
    setIsEditing(false);
    const f: Record<string, string> = {};
    CONNECTEAM_FIELDS.forEach(field => { f[field.key] = emp[field.key] ?? ""; });
    setForm(f);
    // Audit log: track access to sensitive employee data
    if (isPrivileged && emp.id) {
      const sensitiveFields = ['access_pin', 'driver_licence']
        .filter(k => emp[k]);
      if (sensitiveFields.length > 0) {
        supabase.rpc('log_sensitive_access', {
          _table_name: 'employees',
          _record_id: emp.id,
          _fields: sensitiveFields,
        }).then();
      }
    }
  };

  const handleSaveFromSheet = async () => {
    if (!viewEmployee) return;
    setLoading(true);
    const { error } = await supabase.from("employees").update(buildInsertData(form) as any).eq("id", viewEmployee.id);
    if (error) {
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      toast({ title: "Empleado actualizado" });
      setIsEditing(false);
      fetchEmployees();
      // Update viewEmployee with new data
      const updated = { ...viewEmployee, ...buildInsertData(form) };
      setViewEmployee(updated);
    }
    setLoading(false);
  };

  const visibleFields = CONNECTEAM_FIELDS.filter(f =>
    isPrivileged || !SENSITIVE_FIELD_KEYS.has(f.key)
  );

  const EmployeeForm = ({ onSubmit, submitLabel }: { onSubmit: (e: React.FormEvent) => void; submitLabel: string }) => (
    <form onSubmit={onSubmit} className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      {visibleFields.map(f => (
        <FormField key={f.key} label={f.label} required={f.required} htmlFor={`emp-${f.key}`}>
          <Input
            id={`emp-${f.key}`}
            value={form[f.key] ?? ""}
            onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
            required={f.required}
            className="h-8 text-sm"
          />
        </FormField>
      ))}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : submitLabel}</Button>
    </form>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        variant="1"
        icon={Users}
        title="Empleados"
        subtitle={`${filtered.length} de ${employees.length} empleados`}
        rightSlot={<div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" />Exportar Excel
          </Button>
          {/* Update Dialog (diff + full) */}
          <Dialog open={updateOpen} onOpenChange={(v) => { setUpdateOpen(v); if (!v) resetUpdate(); }}>
            <DialogTrigger asChild>
              <Button variant="outline"><ArrowUpDown className="h-4 w-4 mr-2" />Actualizar datos</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Actualizar datos de empleados</DialogTitle>
                <DialogDescription>Sube un archivo Excel o CSV para actualizar la información (match por Connecteam ID, Teléfono o Nombre)</DialogDescription>
              </DialogHeader>

              {updateStep === "upload" && (
                <div className="space-y-4">
                  <Tabs defaultValue="full" onValueChange={(v) => setUpdateMode(v as "diff" | "full")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="full">Reemplazo completo</TabsTrigger>
                      <TabsTrigger value="diff">Solo cambios</TabsTrigger>
                    </TabsList>
                    <TabsContent value="full">
                      <p className="text-sm text-muted-foreground mb-3">
                        Reemplaza <strong>todos los campos</strong> del empleado con los datos del archivo. Los empleados nuevos también se crearán.
                      </p>
                    </TabsContent>
                    <TabsContent value="diff">
                      <p className="text-sm text-muted-foreground mb-3">
                        Solo actualiza los campos que sean <strong>diferentes</strong> entre el archivo y la base de datos.
                      </p>
                    </TabsContent>
                  </Tabs>

                  <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                    <RefreshCw className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground mb-1">
                      Sube el archivo con los datos actualizados
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Soporta Excel (.xlsx/.xls) y CSV de Connecteam
                    </p>
                    <input type="file" accept=".xls,.xlsx,.csv,.txt" onChange={handleUpdateFile}
                      className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer" />
                  </div>
                </div>
              )}

              {updateStep === "preview" && (
                <div className="space-y-4">
                  {updateDiffs.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
                      <p className="text-lg font-medium">No hay cambios</p>
                      <p className="text-sm text-muted-foreground">Todos los datos están actualizados</p>
                      <Button className="mt-4" onClick={() => { setUpdateOpen(false); resetUpdate(); }}>Cerrar</Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-3 text-sm items-center flex-wrap">
                        <Badge variant="outline" className="bg-chart-4/10 text-chart-4 border-chart-4/20">
                          {updateDiffs.filter(d => !d.employeeId.startsWith("__new__")).length} empleados a actualizar
                        </Badge>
                        {updateDiffs.some(d => d.employeeId.startsWith("__new__")) && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                            {updateDiffs.filter(d => d.employeeId.startsWith("__new__")).length} nuevos a crear
                          </Badge>
                        )}
                        <Badge variant="outline">
                          {updateDiffs.reduce((acc, d) => acc + d.changes.length, 0)} campos totales
                        </Badge>
                        <Badge variant="secondary">
                          Modo: {updateMode === "full" ? "Reemplazo completo" : "Solo cambios"}
                        </Badge>
                      </div>

                      <div className="max-h-[50vh] overflow-y-auto space-y-3">
                        {updateDiffs.map((diff, idx) => (
                          <div key={diff.employeeId} className={`border rounded-lg p-3 transition-opacity ${!diff.selected ? 'opacity-40' : ''}`}>
                            <div className="flex items-center gap-3 mb-2">
                              <Checkbox
                                checked={diff.selected}
                                onCheckedChange={() => toggleDiffSelected(idx)}
                              />
                              <span className="font-medium text-sm">{diff.name}</span>
                              <Badge variant="secondary" className="text-xs">{diff.changes.length} campos</Badge>
                              {diff.employeeId.startsWith("__new__") && (
                                <Badge className="bg-primary/10 text-primary text-xs">Nuevo</Badge>
                              )}
                            </div>
                            <div className="ml-7 space-y-1 max-h-32 overflow-y-auto">
                              {diff.changes.map(c => (
                                <div key={c.field} className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground w-28 shrink-0">{c.label}:</span>
                                  {c.oldVal !== "—" && (
                                    <>
                                      <span className="text-destructive/70 line-through max-w-[30%] truncate">{c.oldVal}</span>
                                      <span>→</span>
                                    </>
                                  )}
                                  <span className="text-primary font-medium max-w-[40%] truncate">{c.newVal}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <Button variant="outline" onClick={resetUpdate}>Cancelar</Button>
                        <Button onClick={executeUpdateDiffs} disabled={updating || updateDiffs.every(d => !d.selected)}>
                          {updating ? "Procesando..." : `Aplicar a ${updateDiffs.filter(d => d.selected).length} empleados`}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {updateStep === "done" && updateResult && (
                <div className="text-center py-6">
                  <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
                  <p className="text-lg font-medium">
                    {updateResult.updated > 0 && `${updateResult.updated} actualizados`}
                    {updateResult.updated > 0 && updateResult.created && updateResult.created > 0 && " · "}
                    {updateResult.created && updateResult.created > 0 && `${updateResult.created} creados`}
                  </p>
                  {updateResult.skipped > 0 && (
                    <p className="text-sm text-muted-foreground">{updateResult.skipped} omitidos</p>
                  )}
                  <Button className="mt-4" onClick={() => { setUpdateOpen(false); resetUpdate(); }}>Cerrar</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Import Dialog */}
          <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) resetImport(); }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="h-4 w-4 mr-2" />Importar nuevos</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Importar empleados nuevos</DialogTitle>
                <DialogDescription>Sube el archivo exportado de Connecteam (solo crea nuevos, no actualiza existentes)</DialogDescription>
              </DialogHeader>

              {importStep === "upload" && (
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">
                    Sube el archivo exportado de Connecteam (Excel o CSV)
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Se importarán solo empleados que no existan
                  </p>
                  <input type="file" accept=".xls,.xlsx,.csv,.txt" onChange={handleImportFile}
                    className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer" />
                </div>
              )}

              {importStep === "preview" && (
                <div className="space-y-4">
                  <div className="flex gap-3 text-sm">
                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
                      {importPreview.filter(r => !r.exists).length} nuevos
                    </span>
                    <span className="bg-muted text-muted-foreground px-3 py-1 rounded-full font-medium">
                      {importPreview.filter(r => r.exists).length} ya existen
                    </span>
                  </div>
                  <div className="max-h-60 overflow-y-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Nombre</TableHead>
                          <TableHead className="text-xs">Teléfono</TableHead>
                          <TableHead className="text-xs">Email</TableHead>
                          
                          <TableHead className="text-xs">Rol</TableHead>
                          <TableHead className="text-xs">Manager</TableHead>
                          <TableHead className="text-xs">Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.map((r, i) => (
                          <TableRow key={i} className={r.exists ? "opacity-50" : ""}>
                            <TableCell className="text-xs font-medium">{r.first_name} {r.last_name}</TableCell>
                            <TableCell className="text-xs">{r.phone_number || "—"}</TableCell>
                            <TableCell className="text-xs">{r.email || "—"}</TableCell>
                            
                            <TableCell className="text-xs">{r.employee_role || "—"}</TableCell>
                            <TableCell className="text-xs">{r.direct_manager || "—"}</TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${r.exists ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                                {r.exists ? "Existe" : "Nuevo"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resetImport}>Cancelar</Button>
                    <Button onClick={executeImport} disabled={importing || importPreview.every(r => r.exists)}>
                      {importing ? "Importando..." : `Importar ${importPreview.filter(r => !r.exists).length} empleados`}
                    </Button>
                  </div>
                </div>
              )}

              {importStep === "done" && importResult && (
                <div className="text-center py-6">
                  <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
                  <p className="text-lg font-medium">{importResult.created} empleados creados</p>
                  {importResult.skipped > 0 && (
                    <p className="text-sm text-muted-foreground">{importResult.skipped} omitidos (ya existían)</p>
                  )}
                  <Button className="mt-4" onClick={() => { setImportOpen(false); resetImport(); }}>Cerrar</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setForm(emptyForm()); }}>
            <DialogTrigger asChild>
              <Button disabled={atEmployeeLimit}><Plus className="h-4 w-4 mr-2" />Nuevo empleado</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nuevo empleado</DialogTitle>
                <DialogDescription>Ingresa los datos del nuevo empleado</DialogDescription>
              </DialogHeader>
              {atEmployeeLimit ? (
                <UpgradeBanner feature={`Límite de ${limits.maxEmployees} empleados alcanzado`} />
              ) : (
                <EmployeeForm onSubmit={handleCreate} submitLabel="Crear" />
              )}
            </DialogContent>
          </Dialog>
        </div>}
      />

      <div className="data-table-wrapper">
        <div className="p-4 border-b space-y-3">
          <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por nombre, email o teléfono..."
          >
            <Button
              variant={filtersOpen || activeFilterCount > 0 ? "secondary" : "outline"}
              size="sm"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtros
              {activeFilterCount > 0 && (
                <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">
                  {activeFilterCount}
                </Badge>
              )}
              <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="h-3 w-3 mr-1" />Limpiar
              </Button>
            )}
          </DataTableToolbar>

          {filtersOpen && (
            <div className="flex gap-3 flex-wrap animate-in slide-in-from-top-2 duration-200">
              <FormField label="Estado" className="space-y-1">
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="inactive">Inactivos</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              {uniqueRoles.length > 0 && (
                <FormField label="Rol" className="space-y-1">
                  <Select value={filterRole} onValueChange={setFilterRole}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los roles</SelectItem>
                      {uniqueRoles.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
              {uniqueGroups.length > 0 && (
                <FormField label="Grupo" className="space-y-1">
                  <Select value={filterGroup} onValueChange={setFilterGroup}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los grupos</SelectItem>
                      {uniqueGroups.map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            </div>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialLoading ? (
              <TableRow><TableCell colSpan={6} className="p-0"><PageSkeleton variant="table" className="border-0 shadow-none p-4" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="p-0">
                <EmptyState icon={Users} title="No hay empleados" description={search ? "Intenta con otro término de búsqueda" : "Agrega tu primer empleado para comenzar"} compact />
              </TableCell></TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id} className={`${!e.is_active ? "opacity-40" : ""} group hover:bg-accent/50 transition-colors`}>
                  <TableCell className="py-3">
                    <EmployeeAvatar firstName={e.first_name ?? ""} lastName={e.last_name ?? ""} size="md" />
                  </TableCell>
                  <TableCell className="py-3">
                    <button
                      onClick={() => openDetailSheet(e)}
                      className="text-left hover:text-primary transition-colors"
                    >
                      <span className="text-sm font-semibold">{formatPersonName(`${e.first_name} ${e.last_name}`)}</span>
                      {e.employee_role && (
                        <span className="block text-xs text-muted-foreground mt-0.5">{formatDisplayText(e.employee_role, "label")}</span>
                      )}
                      {/* Show contact info inline on mobile */}
                      <div className="sm:hidden mt-1 space-y-0.5">
                        {e.email && (
                          <span className="block text-[11px] text-muted-foreground truncate max-w-[200px]">{e.email}</span>
                        )}
                        {e.phone_number && (
                          <span className="block text-[11px] text-muted-foreground">{e.phone_number}</span>
                        )}
                      </div>
                    </button>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell py-3">
                    {e.email ? (
                      <a href={`mailto:${e.email}`} className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors">
                        <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate max-w-[180px]">{e.email}</span>
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell py-3">
                    {e.phone_number ? (
                      <a href={`tel:${e.phone_number}`} className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors">
                        <Phone className="h-3.5 w-3.5 shrink-0" />{e.phone_number}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                      e.is_active
                        ? "bg-earning/10 text-earning"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {e.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetailSheet(e)}>
                          <Eye className="h-4 w-4 mr-2" />Ver detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(e)}>
                          {e.is_active ? <UserX className="h-4 w-4 mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
                          {e.is_active ? "Desactivar" : "Activar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => { setDeleteTarget(e); setPasswordOpen(true); }}>
                          <Trash2 className="h-4 w-4 mr-2" />Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail + Edit Sheet */}
      <Sheet open={!!viewEmployee} onOpenChange={(v) => { if (!v) { setViewEmployee(null); setIsEditing(false); } }}>
        <SheetContent className="w-[400px] sm:w-[540px] p-0">
          <SheetHeader className="p-6 pb-4 border-b">
            <div className="flex items-center gap-4 pr-6">
              <EmployeeAvatar
                firstName={viewEmployee?.first_name ?? ""}
                lastName={viewEmployee?.last_name ?? ""}
                size="lg"
              />
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-lg">{formatPersonName(`${viewEmployee?.first_name} ${viewEmployee?.last_name}`)}</SheetTitle>
                <SheetDescription className="flex items-center gap-2 mt-0.5">
                  {formatDisplayText(viewEmployee?.employee_role, "label") || "Sin rol"}
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                    viewEmployee?.is_active ? "bg-earning/10 text-earning" : "bg-muted text-muted-foreground"
                  )}>
                    {viewEmployee?.is_active ? "Activo" : "Inactivo"}
                  </span>
                </SheetDescription>
              </div>
              <Button
                variant={isEditing ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (isEditing) { handleSaveFromSheet(); } else { setIsEditing(true); }
                }}
                disabled={loading}
                className="shrink-0"
              >
                {isEditing ? (loading ? "Guardando..." : "Guardar") : <><Pencil className="h-3 w-3 mr-1.5" />Editar</>}
              </Button>
            </div>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-140px)]">
            <div className="p-6 pt-4">
              {isEditing && (
                <div className="mb-3 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                    <X className="h-3 w-3 mr-1" />Cancelar
                  </Button>
                </div>
              )}
              <div className="space-y-0.5">
                {visibleFields.filter(f => !f.hidden).map(f => (
                  <div key={f.key} className="flex justify-between items-center py-2.5 border-b border-border/40 gap-3">
                    <span className="text-xs text-muted-foreground shrink-0 w-28">{f.label}</span>
                    {isEditing ? (
                      <Input
                        value={form[f.key] ?? ""}
                        onChange={ev => setForm(prev => ({ ...prev, [f.key]: ev.target.value }))}
                        className="h-8 text-sm flex-1"
                      />
                    ) : (
                      <span className="text-sm font-medium text-right max-w-[60%] break-words">
                        {viewEmployee?.[f.key] || <span className="text-muted-foreground/40">—</span>}
                      </span>
                    )}
                  </div>
              ))}

              {/* Availability Section */}
              {viewEmployee && (
                <div className="pt-4">
                  <Separator className="mb-4" />
                  <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                    📅 Disponibilidad
                  </p>
                  <EmployeeAvailabilitySection
                    employeeId={viewEmployee.id}
                    readOnly={!isEditing}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-6">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => { if (viewEmployee) toggleActive(viewEmployee); }}
                >
                  {viewEmployee?.is_active ? <><UserX className="h-3 w-3 mr-1.5" />Desactivar</> : <><UserCheck className="h-3 w-3 mr-1.5" />Activar</>}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => { if (viewEmployee) { setDeleteTarget(viewEmployee); setPasswordOpen(true); setViewEmployee(null); } }}
                >
                  <Trash2 className="h-3 w-3 mr-1.5" />Eliminar
                </Button>
              </div>
            </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Create Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditingEmployee(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar empleado</DialogTitle>
            <DialogDescription>Modifica los datos del empleado</DialogDescription>
          </DialogHeader>
          <EmployeeForm onSubmit={handleUpdate} submitLabel="Guardar cambios" />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation with Password */}
      <PasswordConfirmDialog
        open={passwordOpen}
        onOpenChange={(v) => { setPasswordOpen(v); if (!v) setDeleteTarget(null); }}
        title="Eliminar empleado"
        description={`Se eliminará permanentemente a ${deleteTarget?.first_name} ${deleteTarget?.last_name}. Confirma tu contraseña para continuar.`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
