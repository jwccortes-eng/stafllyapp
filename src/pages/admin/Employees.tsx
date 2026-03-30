import { useEffect, useState, useCallback } from "react";
import { usePageView } from "@/hooks/useAuditLog";
import AuditPanel from "@/components/audit/AuditPanel";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Search, Upload, FileSpreadsheet, CheckCircle2, MoreHorizontal, Pencil, Trash2, UserX, UserCheck, Eye, RefreshCw, ArrowUpDown, Users, Download, X, Phone, Mail, LayoutGrid, List, MessageCircle, Send, Loader2, Clock, Shield, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBlock } from "@/components/ui/error-block";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { parseConnecteamFile, type ParsedEmployee } from "@/lib/connecteam-parser";
import { safeRead, safeSheetToJson, getSheetNames, getSheet, writeExcelFile } from "@/lib/safe-xlsx";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";
import { EmployeeProfileTabs } from "@/components/employee/EmployeeProfileTabs";
import { BulkRateAssignment } from "@/components/employee/BulkRateAssignment";
import { EmployeeInviteDialog } from "@/components/employee/EmployeeInviteDialog";
import { useEmployeeInvitations } from "@/hooks/useEmployeeInvitations";
import { useSubscription } from "@/hooks/useSubscription";
import UpgradeBanner from "@/components/billing/UpgradeBanner";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import { es } from "date-fns/locale";

// Fields that only owner/admin can see
const SENSITIVE_FIELD_KEYS = new Set([
  "access_pin", "driver_licence", "has_car", "country_code", "english_level",
]);

const CONNECTEAM_FIELDS: { key: string; label: string; fileCol: string[]; required?: boolean; hidden?: boolean }[] = [
  { key: "first_name", label: "Nombre", fileCol: ["First name"], required: true },
  { key: "last_name", label: "Apellido", fileCol: ["Last name"], required: true },
  { key: "phone_number", label: "Teléfono", fileCol: ["Mobile phone", "Phone"] },
  { key: "country_code", label: "Código país", fileCol: ["Country code"] },
  { key: "email", label: "Email", fileCol: ["Email"] },
  { key: "birthday", label: "Cumpleaños", fileCol: ["Birthday", "Date of Birth"] },
  { key: "address", label: "Dirección", fileCol: ["Address"] },
  { key: "county", label: "Condado", fileCol: ["County"] },
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

/* ── Status badge — delegates to reusable component ── */
import { PortalAccessBadge } from "@/components/employee/PortalAccessBadge";
import type { InvitationMap } from "@/hooks/useEmployeeInvitations";

function EmpStatusBadge({ employee, showInvite, onInvite, invitation }: { employee: EmployeeRecord; showInvite?: boolean; onInvite?: () => void; invitation?: InvitationMap[string] | null }) {
  return <PortalAccessBadge employee={employee} invitation={invitation} showInviteAction={showInvite} onInvite={onInvite} />;
}

export default function Employees() {
  usePageView("Empleados");
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { role } = useAuth();
  const isPrivileged = role === 'developer' || role === 'owner' || role === 'admin';
  const { canAddEmployees, limits, plan } = useSubscription();
  const { invitations, logInvitation, refetch: refetchInvitations } = useEmployeeInvitations(selectedCompanyId ?? null);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<"active" | "inactive" | "pending" | "all">("active");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");
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
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [updateDiffs, setUpdateDiffs] = useState<UpdateDiff[]>([]);
  const [updateStep, setUpdateStep] = useState<"upload" | "preview" | "done">("upload");
  const [updateResult, setUpdateResult] = useState<{ updated: number; skipped: number; created?: number } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMode, setUpdateMode] = useState<"diff" | "full">("full");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkInviting, setBulkInviting] = useState(false);
  const { toast } = useToast();

  const handleBulkPortalInvite = async () => {
    if (!selectedCompanyId) return;
    setBulkInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-portal-invite", {
        body: { company_id: selectedCompanyId },
      });
      if (error) { toast({ title: "Error", description: "Error al enviar invitaciones", variant: "destructive" }); return; }
      if (data?.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({
        title: "Invitaciones enviadas ✅",
        description: `${data.processed} empleados activados, ${data.emails_sent} emails enviados${data.skipped > 0 ? `, ${data.skipped} omitidos` : ""}`,
      });
      fetchEmployees();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Error de conexión", variant: "destructive" });
    } finally {
      setBulkInviting(false);
    }
  };

  const emptyForm = () => Object.fromEntries(CONNECTEAM_FIELDS.map(f => [f.key, ""]));

  const fetchEmployees = async () => {
    if (!selectedCompanyId) return;
    setFetchError(false);
    try {
      const { data, error } = await supabase.from("employees").select("id, company_id, first_name, last_name, phone_number, email, employee_role, is_active, start_date, end_date, groups, tags, direct_manager, connecteam_employee_id, user_id, created_at, updated_at, avatar_url, country_code, date_added, driver_licence, english_level, gender, has_car, qualify, recommended_by, added_by, added_via, last_login, access_pin").eq("company_id", selectedCompanyId).order("first_name");
      if (error) throw error;
      setEmployees((data as EmployeeRecord[]) ?? []);
    } catch (err) {
      console.error("fetchEmployees error:", err);
      setFetchError(true);
    } finally {
      setInitialLoading(false);
    }
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

  const matchEmployee = (parsed: ParsedEmployee): EmployeeRecord | undefined => {
    if (parsed.connecteam_employee_id) {
      const match = employees.find(e => e.connecteam_employee_id === parsed.connecteam_employee_id);
      if (match) return match;
    }
    if (parsed.phone_number) {
      const phone = parsed.phone_number.replace(/\D/g, "");
      const match = employees.find(e => e.phone_number?.replace(/\D/g, "") === phone);
      if (match) return match;
    }
    if (parsed.first_name && parsed.last_name) {
      const match = employees.find(
        e => e.first_name?.toLowerCase().trim() === parsed.first_name?.toLowerCase().trim() &&
             e.last_name?.toLowerCase().trim() === parsed.last_name?.toLowerCase().trim()
      );
      if (match) return match;
    }
    return undefined;
  };

  // ---- IMPORT ----
  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        CONNECTEAM_FIELDS.forEach(field => { mapped[field.key] = findCol(row, field.fileCol); });
        return mapped;
      }).filter(r => r.first_name || r.last_name);
    }
    const seen = new Set<string>();
    const preview: ImportPreviewRow[] = [];
    for (const row of parsed) {
      const key = `${(row.first_name ?? "").toLowerCase()}|${(row.last_name ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      preview.push({ ...row, exists: !!matchEmployee(row) });
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

  const resetImport = () => { setImportStep("upload"); setImportPreview([]); setImportResult(null); };

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
        CONNECTEAM_FIELDS.forEach(field => { mapped[field.key] = findCol(row, field.fileCol); });
        return mapped;
      }).filter(r => r.first_name || r.last_name);
    }
    const diffs: UpdateDiff[] = [];
    for (const row of parsed) {
      const existing = matchEmployee(row);
      if (!existing) {
        if (updateMode === "full") {
          const allChanges = CONNECTEAM_FIELDS.filter(field => row[field.key]?.trim()).map(field => ({ field: field.key, label: field.label, oldVal: "—", newVal: row[field.key] ?? "" }));
          if (allChanges.length > 0) diffs.push({ employeeId: "__new__" + (row.connecteam_employee_id || row.phone_number || `${row.first_name}_${row.last_name}`), name: `${row.first_name ?? ""} ${row.last_name ?? ""} (NUEVO)`, changes: allChanges, selected: true });
        }
        continue;
      }
      const changes: UpdateDiff["changes"] = [];
      CONNECTEAM_FIELDS.forEach(field => {
        const newVal = (row[field.key] ?? "").trim();
        const oldVal = String(existing[field.key] ?? "").trim();
        if (updateMode === "full") { if (newVal) changes.push({ field: field.key, label: field.label, oldVal: oldVal || "—", newVal }); }
        else { if (newVal && newVal !== oldVal) changes.push({ field: field.key, label: field.label, oldVal: oldVal || "—", newVal }); }
      });
      if (changes.length > 0) diffs.push({ employeeId: existing.id, name: `${existing.first_name} ${existing.last_name}`, changes, selected: true });
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
    let updated = 0, created = 0;
    for (const diff of selected) {
      const updateData: Record<string, any> = {};
      diff.changes.forEach(c => { updateData[c.field] = NAME_FIELDS.includes(c.field) ? toTitleCase(c.newVal) : (c.newVal || null); });
      if (diff.employeeId.startsWith("__new__")) {
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

  const resetUpdate = () => { setUpdateStep("upload"); setUpdateDiffs([]); setUpdateResult(null); };

  const handleExport = async () => {
    const exportFields = CONNECTEAM_FIELDS;
    const rows = filtered.map(emp => {
      const row: Record<string, string> = {};
      exportFields.forEach(f => { row[f.label] = emp[f.key] ?? ""; });
      row["Estado"] = emp.is_active ? "Activo" : "Inactivo";
      return row;
    });
    await writeExcelFile(rows, "Empleados", `empleados_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Exportado", description: `${rows.length} empleados exportados a Excel` });
  };

  const uniqueRoles = [...new Set(employees.map(e => e.employee_role).filter(Boolean))];
  const uniqueGroups = [...new Set(employees.map(e => e.groups).filter(Boolean))];
  const activeFilterCount = [filterRole !== "all", filterGroup !== "all"].filter(Boolean).length;
  const clearFilters = () => { setFilterRole("all"); setFilterGroup("all"); };

  const statusCounts = {
    active: employees.filter(e => e.is_active !== false && !!e.user_id).length,
    inactive: employees.filter(e => e.is_active === false).length,
    pending: employees.filter(e => e.is_active !== false && !e.user_id).length,
    all: employees.length,
  };

  const filtered = employees.filter((e) => {
    const matchesSearch = `${e.first_name} ${e.last_name} ${e.email ?? ""} ${e.phone_number ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusTab === "all" ? true : statusTab === "active" ? (e.is_active !== false && !!e.user_id) : statusTab === "inactive" ? e.is_active === false : e.is_active !== false && !e.user_id;
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
    if (isPrivileged && emp.id) {
      const sensitiveFields = ['access_pin', 'driver_licence'].filter(k => emp[k]);
      if (sensitiveFields.length > 0) {
        supabase.rpc('log_sensitive_access', { _table_name: 'employees', _record_id: emp.id, _fields: sensitiveFields }).then();
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
      setViewEmployee(prev => prev ? { ...prev, ...buildInsertData(form) } : prev);
    }
    setLoading(false);
  };

  const visibleFields = CONNECTEAM_FIELDS.filter(f => isPrivileged || !SENSITIVE_FIELD_KEYS.has(f.key));
  const BOOLEAN_FIELDS = new Set(["has_car"]);

  const EmployeeForm = ({ onSubmit, submitLabel }: { onSubmit: (e: React.FormEvent) => void; submitLabel: string }) => (
    <form onSubmit={onSubmit} className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      {visibleFields.map(f => (
        <FormField key={f.key} label={f.label} required={f.required} htmlFor={`emp-${f.key}`}>
          {BOOLEAN_FIELDS.has(f.key) ? (
            <div className="flex items-center gap-2 h-8">
              <Checkbox id={`emp-${f.key}`} checked={form[f.key] === "Yes" || form[f.key] === "true" || form[f.key] === "Sí"} onCheckedChange={c => setForm(prev => ({ ...prev, [f.key]: c ? "Yes" : "No" }))} />
              <Label htmlFor={`emp-${f.key}`} className="text-xs font-normal cursor-pointer">{form[f.key] === "Yes" || form[f.key] === "true" || form[f.key] === "Sí" ? "Sí" : "No"}</Label>
            </div>
          ) : (
            <Input id={`emp-${f.key}`} value={form[f.key] ?? ""} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} required={f.required} className="h-8 text-sm" />
          )}
        </FormField>
      ))}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : submitLabel}</Button>
    </form>
  );

  return (
    <div className="space-y-3">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold font-heading tracking-tight">Empleados</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{employees.length} registrados · {statusCounts.active} activos · {statusCounts.pending > 0 ? <span className="text-primary font-medium">{statusCounts.pending} sin portal</span> : "0 pendientes"}</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {isPrivileged && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleBulkPortalInvite} disabled={bulkInviting}>
              {bulkInviting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Invitar todos
            </Button>
          )}
          <BulkRateAssignment />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Exportar
          </Button>
          {/* Update Dialog */}
          <Dialog open={updateOpen} onOpenChange={(v) => { setUpdateOpen(v); if (!v) resetUpdate(); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs"><ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />Actualizar</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Actualizar datos de empleados</DialogTitle>
                <DialogDescription>Sube un archivo Excel o CSV para actualizar la información</DialogDescription>
              </DialogHeader>
              {updateStep === "upload" && (
                <div className="space-y-4">
                  <Tabs defaultValue="full" onValueChange={(v) => setUpdateMode(v as "diff" | "full")}>
                    <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="full">Reemplazo completo</TabsTrigger><TabsTrigger value="diff">Solo cambios</TabsTrigger></TabsList>
                    <TabsContent value="full"><p className="text-sm text-muted-foreground mb-3">Reemplaza <strong>todos los campos</strong> del empleado con los datos del archivo.</p></TabsContent>
                    <TabsContent value="diff"><p className="text-sm text-muted-foreground mb-3">Solo actualiza los campos que sean <strong>diferentes</strong>.</p></TabsContent>
                  </Tabs>
                  <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                    <RefreshCw className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">Sube el archivo con los datos actualizados</p>
                    <input type="file" accept=".xls,.xlsx,.csv,.txt" onChange={handleUpdateFile} className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer" />
                  </div>
                </div>
              )}
              {updateStep === "preview" && (
                <div className="space-y-4">
                  {updateDiffs.length === 0 ? (
                    <div className="text-center py-8"><CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" /><p className="text-lg font-medium">No hay cambios</p><Button className="mt-4" onClick={() => { setUpdateOpen(false); resetUpdate(); }}>Cerrar</Button></div>
                  ) : (
                    <>
                      <div className="flex gap-2 text-sm items-center flex-wrap">
                        <Badge variant="outline" className="bg-chart-4/10 text-chart-4 border-chart-4/20">{updateDiffs.filter(d => !d.employeeId.startsWith("__new__")).length} a actualizar</Badge>
                        {updateDiffs.some(d => d.employeeId.startsWith("__new__")) && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{updateDiffs.filter(d => d.employeeId.startsWith("__new__")).length} nuevos</Badge>}
                      </div>
                      <div className="max-h-[50vh] overflow-y-auto space-y-3">
                        {updateDiffs.map((diff, idx) => (
                          <div key={diff.employeeId} className={`border rounded-lg p-3 transition-opacity ${!diff.selected ? 'opacity-40' : ''}`}>
                            <div className="flex items-center gap-3 mb-2">
                              <Checkbox checked={diff.selected} onCheckedChange={() => toggleDiffSelected(idx)} />
                              <span className="font-medium text-sm">{diff.name}</span>
                              <Badge variant="secondary" className="text-xs">{diff.changes.length} campos</Badge>
                            </div>
                            <div className="ml-7 space-y-1 max-h-32 overflow-y-auto">
                              {diff.changes.map(c => (
                                <div key={c.field} className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground w-28 shrink-0">{c.label}:</span>
                                  {c.oldVal !== "—" && <><span className="text-destructive/70 line-through max-w-[30%] truncate">{c.oldVal}</span><span>→</span></>}
                                  <span className="text-primary font-medium max-w-[40%] truncate">{c.newVal}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2"><Button variant="outline" onClick={resetUpdate}>Cancelar</Button><Button onClick={executeUpdateDiffs} disabled={updating || updateDiffs.every(d => !d.selected)}>{updating ? "Procesando..." : `Aplicar a ${updateDiffs.filter(d => d.selected).length}`}</Button></div>
                    </>
                  )}
                </div>
              )}
              {updateStep === "done" && updateResult && (
                <div className="text-center py-6"><CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" /><p className="text-lg font-medium">{updateResult.updated > 0 && `${updateResult.updated} actualizados`}{updateResult.created && updateResult.created > 0 && ` · ${updateResult.created} creados`}</p><Button className="mt-4" onClick={() => { setUpdateOpen(false); resetUpdate(); }}>Cerrar</Button></div>
              )}
            </DialogContent>
          </Dialog>
          {/* Import Dialog */}
          <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) resetImport(); }}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="h-8 text-xs"><Upload className="h-3.5 w-3.5 mr-1.5" />Importar</Button></DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Importar empleados</DialogTitle><DialogDescription>Solo crea nuevos, no actualiza existentes</DialogDescription></DialogHeader>
              {importStep === "upload" && (
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Sube el archivo exportado (Excel o CSV)</p>
                  <input type="file" accept=".xls,.xlsx,.csv,.txt" onChange={handleImportFile} className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer" />
                </div>
              )}
              {importStep === "preview" && (
                <div className="space-y-4">
                  <div className="flex gap-3 text-sm"><span className="bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">{importPreview.filter(r => !r.exists).length} nuevos</span><span className="bg-muted text-muted-foreground px-3 py-1 rounded-full font-medium">{importPreview.filter(r => r.exists).length} ya existen</span></div>
                  <div className="max-h-60 overflow-y-auto border rounded-lg"><Table><TableHeader><TableRow><TableHead className="text-xs">Nombre</TableHead><TableHead className="text-xs">Teléfono</TableHead><TableHead className="text-xs">Estado</TableHead></TableRow></TableHeader><TableBody>{importPreview.map((r, i) => (<TableRow key={i} className={r.exists ? "opacity-50" : ""}><TableCell className="text-xs font-medium">{r.first_name} {r.last_name}</TableCell><TableCell className="text-xs">{r.phone_number || "—"}</TableCell><TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${r.exists ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{r.exists ? "Existe" : "Nuevo"}</span></TableCell></TableRow>))}</TableBody></Table></div>
                  <div className="flex gap-2"><Button variant="outline" onClick={resetImport}>Cancelar</Button><Button onClick={executeImport} disabled={importing || importPreview.every(r => r.exists)}>{importing ? "Importando..." : `Importar ${importPreview.filter(r => !r.exists).length}`}</Button></div>
                </div>
              )}
              {importStep === "done" && importResult && (<div className="text-center py-6"><CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" /><p className="text-lg font-medium">{importResult.created} empleados creados</p><Button className="mt-4" onClick={() => { setImportOpen(false); resetImport(); }}>Cerrar</Button></div>)}
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setForm(emptyForm()); }}>
            <DialogTrigger asChild><Button disabled={atEmployeeLimit} size="sm" className="h-8 text-xs"><Plus className="h-3.5 w-3.5 mr-1.5" />Nuevo</Button></DialogTrigger>
            <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Nuevo empleado</DialogTitle><DialogDescription>Ingresa los datos del nuevo empleado</DialogDescription></DialogHeader>{atEmployeeLimit ? <UpgradeBanner feature={`Límite de ${limits.maxEmployees} empleados`} /> : <EmployeeForm onSubmit={handleCreate} submitLabel="Crear" />}</DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ─── Status Tabs ─── */}
      <div className="flex items-center gap-0.5 border-b border-border/40">
        {([
          { key: "active" as const, label: "Portal activo", count: statusCounts.active },
          { key: "pending" as const, label: "Sin portal", count: statusCounts.pending },
          { key: "inactive" as const, label: "Inactivos", count: statusCounts.inactive },
          { key: "all" as const, label: "Todos", count: statusCounts.all },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px",
              statusTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {tab.label}
            <span className={cn(
              "ml-1.5 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md",
              statusTab === tab.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              tab.key === "pending" && tab.count > 0 && statusTab !== tab.key && "bg-primary/10 text-primary"
            )}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ─── Search + Filters ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre, email, teléfono…" className="pl-8 h-8 text-xs" />
        </div>
        {uniqueRoles.length > 0 && (
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Rol" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos los roles</SelectItem>{uniqueRoles.map(r => (<SelectItem key={r} value={r}>{formatDisplayText(r, "label")}</SelectItem>))}</SelectContent>
          </Select>
        )}
        {uniqueGroups.length > 0 && (
          <Select value={filterGroup} onValueChange={setFilterGroup}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Grupo" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos los grupos</SelectItem>{uniqueGroups.map(g => (<SelectItem key={g} value={g}>{g}</SelectItem>))}</SelectContent>
          </Select>
        )}
        {activeFilterCount > 0 && <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground px-2" onClick={clearFilters}><X className="h-3 w-3 mr-1" />Limpiar</Button>}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground tabular-nums">{filtered.length}</span>
          <div className="flex items-center rounded-lg border border-border/30 overflow-hidden">
            <button className={cn("h-7 w-7 flex items-center justify-center transition-colors", viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground/40 hover:bg-muted/50")} onClick={() => setViewMode("list")}><List className="h-3 w-3" /></button>
            <button className={cn("h-7 w-7 flex items-center justify-center transition-colors", viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground/40 hover:bg-muted/50")} onClick={() => setViewMode("grid")}><LayoutGrid className="h-3 w-3" /></button>
          </div>
        </div>
      </div>

      {/* ─── Content ─── */}
      {initialLoading ? (
        <div className="space-y-1">{[1,2,3,4,5,6,7,8].map(i => <div key={i} className="animate-pulse bg-muted rounded-lg h-11" />)}</div>
      ) : fetchError ? (
        <ErrorBlock compact onRetry={fetchEmployees} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No hay empleados" description={search ? "Intenta con otro término" : "Agrega tu primer empleado"} />
      ) : viewMode === "grid" ? (
        /* ─── Grid View ─── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {filtered.map(e => {
            const phone = e.phone_number?.replace(/[^+\d]/g, "") ?? "";
            return (
              <div
                key={e.id}
                onClick={() => openDetailSheet(e)}
                className={cn(
                  "group relative rounded-xl border border-border/40 bg-card p-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer",
                  !e.is_active && "opacity-40"
                )}
              >
                <div className="flex items-start gap-3">
                  <EmployeeAvatar firstName={e.first_name ?? ""} lastName={e.last_name ?? ""} avatarUrl={e.avatar_url} gender={e.gender} size="lg" className="ring-2 ring-background shadow" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate leading-tight">{formatPersonName(`${e.first_name} ${e.last_name}`)}</p>
                    {e.employee_role && <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/8 text-primary">{formatDisplayText(e.employee_role, "label")}</span>}
                    <div className="mt-1.5 space-y-0.5">
                      {e.phone_number && <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{e.phone_number}</p>}
                      {e.email && <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{e.email}</p>}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <EmpStatusBadge employee={e} showInvite onInvite={() => { setViewEmployee(e); setInviteOpen(true); }} />
                  {e.access_pin && <span className="text-[9px] text-muted-foreground/50 font-mono">PIN: {e.access_pin}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── List View (Dense Table) ─── */
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 h-8">
                <TableHead className="w-8 pl-3 pr-0"></TableHead>
                <TableHead className="text-[10px]">Nombre</TableHead>
                <TableHead className="hidden sm:table-cell text-[10px]">Teléfono</TableHead>
                <TableHead className="hidden md:table-cell text-[10px]">Email</TableHead>
                <TableHead className="hidden lg:table-cell text-[10px]">Rol</TableHead>
                <TableHead className="hidden xl:table-cell text-[10px]">Grupo</TableHead>
                <TableHead className="text-[10px] w-[80px]">Estado</TableHead>
                <TableHead className="hidden lg:table-cell text-[10px] w-[80px]">Último login</TableHead>
                <TableHead className="w-8 pr-3"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow
                  key={e.id}
                  className={cn(
                    "group hover:bg-accent/30 transition-colors cursor-pointer h-10",
                    !e.is_active && "opacity-35"
                  )}
                  onClick={() => openDetailSheet(e)}
                >
                  <TableCell className="py-1 pl-3 pr-0">
                    <EmployeeAvatar firstName={e.first_name ?? ""} lastName={e.last_name ?? ""} avatarUrl={e.avatar_url} gender={e.gender} size="sm" />
                  </TableCell>
                  <TableCell className="py-1">
                    <div className="leading-none">
                      <span className="text-xs font-semibold">{formatPersonName(`${e.first_name} ${e.last_name}`)}</span>
                      <span className="sm:hidden block text-[10px] text-muted-foreground mt-0.5">{e.phone_number || e.email || ""}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell py-1">
                    {e.phone_number ? (
                      <a href={`tel:${e.phone_number}`} onClick={ev => ev.stopPropagation()} className="text-[11px] text-muted-foreground hover:text-primary transition-colors">{e.phone_number}</a>
                    ) : <span className="text-[11px] text-muted-foreground/25">—</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell py-1">
                    {e.email ? (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[160px] block">{e.email}</span>
                    ) : <span className="text-[11px] text-muted-foreground/25">—</span>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell py-1">
                    {e.employee_role ? (
                      <span className="text-[10px] text-muted-foreground">{formatDisplayText(e.employee_role, "label")}</span>
                    ) : <span className="text-[10px] text-muted-foreground/25">—</span>}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell py-1">
                    {e.groups ? <span className="text-[10px] text-muted-foreground truncate max-w-[100px] block">{e.groups.split(",")[0].trim()}</span> : <span className="text-[10px] text-muted-foreground/25">—</span>}
                  </TableCell>
                  <TableCell className="py-1">
                    <EmpStatusBadge employee={e} showInvite onInvite={() => { setViewEmployee(e); setInviteOpen(true); }} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell py-1">
                    {(() => {
                      if (!e.last_login) return <span className="text-[10px] text-muted-foreground/25">—</span>;
                      const d = parseISO(e.last_login);
                      return isValid(d)
                        ? <span className="text-[10px] text-muted-foreground/60">{formatDistanceToNow(d, { addSuffix: true, locale: es })}</span>
                        : <span className="text-[10px] text-muted-foreground/25">—</span>;
                    })()}
                  </TableCell>
                  <TableCell className="py-1 pr-3" onClick={ev => ev.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => openDetailSheet(e)} className="text-xs"><Eye className="h-3.5 w-3.5 mr-2" />Ver detalle</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setViewEmployee(e); setInviteOpen(true); }} className="text-xs"><Send className="h-3.5 w-3.5 mr-2" />Invitar</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => toggleActive(e)} className="text-xs">
                          {e.is_active ? <><UserX className="h-3.5 w-3.5 mr-2" />Desactivar</> : <><UserCheck className="h-3.5 w-3.5 mr-2" />Activar</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive text-xs" onClick={() => { setDeleteTarget(e); setPasswordOpen(true); }}><Trash2 className="h-3.5 w-3.5 mr-2" />Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── Detail Sheet — Premium ─── */}
      <Sheet open={!!viewEmployee} onOpenChange={(v) => { if (!v) { setViewEmployee(null); setIsEditing(false); } }}>
        <SheetContent className="w-[440px] sm:w-[560px] p-0 flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-br from-primary/[0.04] to-transparent border-b px-5 py-4">
            <div className="flex items-start gap-3.5 pr-8">
              <EmployeeAvatar firstName={viewEmployee?.first_name ?? ""} lastName={viewEmployee?.last_name ?? ""} avatarUrl={viewEmployee?.avatar_url} gender={viewEmployee?.gender} size="xl" className="ring-2 ring-background shadow-lg" />
              <div className="flex-1 min-w-0 pt-0.5">
                <SheetTitle className="text-base font-bold leading-tight">{formatPersonName(`${viewEmployee?.first_name} ${viewEmployee?.last_name}`)}</SheetTitle>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {viewEmployee?.employee_role && <Badge variant="secondary" className="text-[10px] py-0">{formatDisplayText(viewEmployee.employee_role, "label")}</Badge>}
                  {viewEmployee && <EmpStatusBadge employee={viewEmployee} />}
                </div>
                <SheetDescription className="mt-1 text-[11px] text-muted-foreground/70 flex items-center gap-3 flex-wrap">
                  {viewEmployee?.phone_number && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{viewEmployee.phone_number}</span>}
                  {viewEmployee?.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{viewEmployee.email}</span>}
                </SheetDescription>
              </div>
            </div>
            {/* Actions bar */}
            <div className="flex items-center gap-1.5 mt-3">
              <Button variant={isEditing ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => { if (isEditing) handleSaveFromSheet(); else setIsEditing(true); }} disabled={loading}>
                {isEditing ? (loading ? "Guardando…" : "✓ Guardar") : <><Pencil className="h-3 w-3 mr-1" />Editar</>}
              </Button>
              {isEditing && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(false)}>Cancelar</Button>}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setInviteOpen(true)}><Send className="h-3 w-3 mr-1" />Invitar</Button>
              <div className="ml-auto flex items-center gap-0.5">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { if (viewEmployee) toggleActive(viewEmployee); }}>
                  {viewEmployee?.is_active ? <><UserX className="h-3 w-3 mr-1" />Desactivar</> : <><UserCheck className="h-3 w-3 mr-1" />Activar</>}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => { if (viewEmployee) { setDeleteTarget(viewEmployee); setPasswordOpen(true); setViewEmployee(null); } }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              <EmployeeProfileTabs employee={viewEmployee!} companyId={selectedCompanyId!} isEditing={isEditing} form={form} setForm={setForm} isPrivileged={isPrivileged} onEmployeeUpdate={(updates) => setViewEmployee(prev => prev ? { ...prev, ...updates } : prev)} companyName={selectedCompany?.name} onInvite={() => setInviteOpen(true)} invitation={viewEmployee ? invitations[viewEmployee.id] ?? null : null} />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Invite Dialog */}
      {viewEmployee && <EmployeeInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} employee={viewEmployee} onInviteSent={(channel) => { logInvitation(viewEmployee.id, channel); refetchInvitations(); }} />}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditingEmployee(null); }}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Editar empleado</DialogTitle><DialogDescription>Modifica los datos del empleado</DialogDescription></DialogHeader><EmployeeForm onSubmit={handleUpdate} submitLabel="Guardar cambios" /></DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <PasswordConfirmDialog
        open={passwordOpen}
        onOpenChange={(v) => { setPasswordOpen(v); if (!v) setDeleteTarget(null); }}
        title="Eliminar empleado"
        description={`Se eliminará permanentemente a ${deleteTarget?.first_name} ${deleteTarget?.last_name}.`}
        onConfirm={handleDelete}
      />

      {/* Audit */}
      <div className="mt-6">
        <AuditPanel entityType="employee" title="Actividad de empleados" hideViews compact />
      </div>
    </div>
  );
}
