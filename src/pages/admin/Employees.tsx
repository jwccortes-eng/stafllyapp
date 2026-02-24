import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Search, Upload, FileSpreadsheet, CheckCircle2, MoreHorizontal, Pencil, Trash2, UserX, UserCheck, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

// All Connecteam fields
const CONNECTEAM_FIELDS: { key: string; label: string; fileCol: string[]; required?: boolean }[] = [
  { key: "first_name", label: "Nombre", fileCol: ["First name"], required: true },
  { key: "last_name", label: "Apellido", fileCol: ["Last name"], required: true },
  { key: "email", label: "Email", fileCol: ["Email"] },
  { key: "phone_number", label: "Teléfono", fileCol: ["Mobile phone", "Phone"] },
  { key: "country_code", label: "Código país", fileCol: ["Country code"] },
  { key: "gender", label: "Género", fileCol: ["Gender"] },
  { key: "employer_identification", label: "Employer ID", fileCol: ["Employer identification"] },
  { key: "birthday", label: "Cumpleaños", fileCol: ["Birthday"] },
  { key: "address", label: "Dirección", fileCol: ["Address (street, apt.)"] },
  { key: "county", label: "Condado", fileCol: ["Condado"] },
  { key: "start_date", label: "Fecha inicio", fileCol: ["Start Date"] },
  { key: "english_level", label: "Nivel inglés", fileCol: ["English Level"] },
  { key: "employee_role", label: "Rol", fileCol: ["Role"] },
  { key: "qualify", label: "Calificación", fileCol: ["Qualify"] },
  { key: "social_security_number", label: "Social Security #", fileCol: ["Social security number"] },
  { key: "verification_ssn_ein", label: "SSN/EIN Verificación", fileCol: ["Verification SSN - EIN"] },
  { key: "recommended_by", label: "Recomendado por", fileCol: ["Recommended by?"] },
  { key: "direct_manager", label: "Manager directo", fileCol: ["Direct manager"] },
  { key: "has_car", label: "¿Tiene carro?", fileCol: ["You have car?"] },
  { key: "driver_licence", label: "Licencia", fileCol: ["Driver Licence"] },
  { key: "end_date", label: "Fecha fin", fileCol: ["End Date"] },
  { key: "kiosk_code", label: "Código kiosk", fileCol: ["Kiosk code"] },
  { key: "date_added", label: "Fecha agregado", fileCol: ["Date added"] },
  { key: "last_login", label: "Último login", fileCol: ["Last login"] },
  { key: "connecteam_employee_id", label: "Connecteam ID", fileCol: ["Connecteam User ID"] },
  { key: "added_via", label: "Agregado vía", fileCol: ["Added via"] },
  { key: "added_by", label: "Agregado por", fileCol: ["Added by"] },
  { key: "groups", label: "Grupos", fileCol: ["Groups"] },
  { key: "tags", label: "Tags", fileCol: ["Tags"] },
];

type EmployeeRecord = Record<string, any>;

interface ImportPreviewRow extends EmployeeRecord {
  exists: boolean;
}

export default function Employees() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRecord | null>(null);
  const [viewEmployee, setViewEmployee] = useState<EmployeeRecord | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "done">("upload");
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const emptyForm = () => Object.fromEntries(CONNECTEAM_FIELDS.map(f => [f.key, ""]));

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("*").order("first_name");
    setEmployees((data as EmployeeRecord[]) ?? []);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const buildInsertData = (src: Record<string, string>) => {
    const data: Record<string, any> = {};
    CONNECTEAM_FIELDS.forEach(f => {
      const val = (src[f.key] ?? "").trim();
      data[f.key] = val || null;
    });
    // Ensure required fields
    data.first_name = data.first_name || "";
    data.last_name = data.last_name || "";
    return data;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("employees").insert(buildInsertData(form) as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Error al eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Empleado eliminado" });
      fetchEmployees();
    }
    setDeleteTarget(null);
  };

  const toggleActive = async (emp: EmployeeRecord) => {
    const { error } = await supabase.from("employees").update({ is_active: !emp.is_active }).eq("id", emp.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: emp.is_active ? "Empleado desactivado" : "Empleado activado" });
      fetchEmployees();
    }
  };

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

      const findCol = (row: Record<string, any>, candidates: string[]) => {
        const keys = Object.keys(row);
        for (const c of candidates) {
          const found = keys.find(k => k.toLowerCase().replace(/[_\s-]/g, "") === c.toLowerCase().replace(/[_\s-]/g, ""));
          if (found) return String(row[found]).trim();
        }
        return "";
      };

      const seen = new Set<string>();
      const preview: ImportPreviewRow[] = [];

      for (const row of rows) {
        const firstName = findCol(row, ["First name"]);
        const lastName = findCol(row, ["Last name"]);
        if (!firstName && !lastName) continue;

        const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const exists = employees.some(
          emp => emp.first_name.toLowerCase() === firstName.toLowerCase() &&
                 emp.last_name.toLowerCase() === lastName.toLowerCase()
        );

        const record: ImportPreviewRow = { exists };
        CONNECTEAM_FIELDS.forEach(f => {
          record[f.key] = findCol(row, f.fileCol as unknown as string[]);
        });
        preview.push(record);
      }

      setImportPreview(preview);
      setImportStep("preview");
    };
    reader.readAsBinaryString(f);
  }, [employees]);

  const executeImport = async () => {
    setImporting(true);
    const toCreate = importPreview.filter(r => !r.exists);
    let created = 0;

    for (const emp of toCreate) {
      const data: Record<string, any> = {};
      CONNECTEAM_FIELDS.forEach(f => {
        data[f.key] = emp[f.key] || null;
      });
      data.first_name = data.first_name || "";
      data.last_name = data.last_name || "";
      const { error } = await supabase.from("employees").insert(data as any);
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

  const filtered = employees.filter((e) =>
    `${e.first_name} ${e.last_name} ${e.email ?? ""} ${e.phone_number ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const EmployeeForm = ({ onSubmit, submitLabel }: { onSubmit: (e: React.FormEvent) => void; submitLabel: string }) => (
    <form onSubmit={onSubmit} className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      {CONNECTEAM_FIELDS.map(f => (
        <div key={f.key}>
          <Label className="text-xs">{f.label} {f.required && <span className="text-destructive">*</span>}</Label>
          <Input
            value={form[f.key] ?? ""}
            onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
            required={f.required}
            className="h-8 text-sm"
          />
        </div>
      ))}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : submitLabel}</Button>
    </form>
  );

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Empleados</h1>
          <p className="page-subtitle">Gestiona los empleados de nómina</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) resetImport(); }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="h-4 w-4 mr-2" />Importar</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Importar empleados</DialogTitle>
                <DialogDescription>Sube el archivo exportado de Connecteam</DialogDescription>
              </DialogHeader>

              {importStep === "upload" && (
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">
                    Sube el archivo exportado de Connecteam (Excel o CSV)
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Se importarán todos los campos automáticamente
                  </p>
                  <input type="file" accept=".xls,.xlsx,.csv" onChange={handleImportFile}
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
                          <TableHead className="text-xs">SSN/EIN</TableHead>
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
                            <TableCell className="text-xs font-mono">{r.verification_ssn_ein || "—"}</TableCell>
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
              <Button><Plus className="h-4 w-4 mr-2" />Nuevo empleado</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nuevo empleado</DialogTitle>
                <DialogDescription>Ingresa los datos del nuevo empleado</DialogDescription>
              </DialogHeader>
              <EmployeeForm onSubmit={handleCreate} submitLabel="Crear" />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="data-table-wrapper">
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empleado..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No hay empleados</TableCell></TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id} className={!e.is_active ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{e.first_name} {e.last_name}</TableCell>
                  <TableCell>{e.phone_number ?? "—"}</TableCell>
                  <TableCell>{e.email ?? "—"}</TableCell>
                  <TableCell className="text-xs">{e.employee_role ?? "—"}</TableCell>
                  <TableCell className="text-xs">{e.direct_manager ?? "—"}</TableCell>
                  <TableCell>
                    <span className={e.is_active ? "earning-badge" : "deduction-badge"}>
                      {e.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewEmployee(e)}>
                          <Eye className="h-4 w-4 mr-2" />Ver detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(e)}>
                          <Pencil className="h-4 w-4 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(e)}>
                          {e.is_active ? <UserX className="h-4 w-4 mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
                          {e.is_active ? "Desactivar" : "Activar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(e)}>
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

      {/* View Detail Sheet */}
      <Sheet open={!!viewEmployee} onOpenChange={(v) => { if (!v) setViewEmployee(null); }}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>{viewEmployee?.first_name} {viewEmployee?.last_name}</SheetTitle>
            <SheetDescription>Todos los datos del empleado</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4 pr-4">
            <div className="space-y-1">
              {CONNECTEAM_FIELDS.map(f => (
                <div key={f.key} className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">{f.label}</span>
                  <span className="text-sm font-medium text-right max-w-[60%] break-words">
                    {viewEmployee?.[f.key] || "—"}
                  </span>
                </div>
              ))}
              <Separator className="my-2" />
              <div className="flex justify-between py-2">
                <span className="text-xs text-muted-foreground">Connecteam ID</span>
                <span className="text-sm font-mono">{viewEmployee?.connecteam_employee_id || "—"}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-xs text-muted-foreground">Estado</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${viewEmployee?.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {viewEmployee?.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditingEmployee(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar empleado</DialogTitle>
            <DialogDescription>Modifica los datos del empleado</DialogDescription>
          </DialogHeader>
          <EmployeeForm onSubmit={handleUpdate} submitLabel="Guardar cambios" />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empleado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente a <strong>{deleteTarget?.first_name} {deleteTarget?.last_name}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
