import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string | null;
  connecteam_employee_id: string | null;
  verification_ssn_ein: string | null;
  is_active: boolean;
}

interface ImportPreviewRow {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  connecteam_employee_id: string;
  verification_ssn_ein: string;
  exists: boolean;
}

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone_number: "", email: "", connecteam_employee_id: "", verification_ssn_ein: "" });
  const [loading, setLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "done">("upload");
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("*").order("first_name");
    setEmployees((data as Employee[]) ?? []);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("employees").insert({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone_number: form.phone_number.trim() || null,
      email: form.email.trim() || null,
      connecteam_employee_id: form.connecteam_employee_id.trim() || null,
      verification_ssn_ein: form.verification_ssn_ein.trim() || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Empleado creado" });
      setOpen(false);
      setForm({ first_name: "", last_name: "", phone_number: "", email: "", connecteam_employee_id: "", verification_ssn_ein: "" });
      fetchEmployees();
    }
    setLoading(false);
  };

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

      // Try to find column mappings (case-insensitive)
      const findCol = (row: Record<string, any>, candidates: string[]) => {
        const keys = Object.keys(row);
        for (const c of candidates) {
          const found = keys.find(k => k.toLowerCase().replace(/[_\s-]/g, "") === c.toLowerCase().replace(/[_\s-]/g, ""));
          if (found) return String(row[found]).trim();
        }
        return "";
      };

      // Extract unique employees from the file
      const seen = new Set<string>();
      const preview: ImportPreviewRow[] = [];

      for (const row of rows) {
        const firstName = findCol(row, ["First name", "FirstName", "first_name", "Nombre"]);
        const lastName = findCol(row, ["Last name", "LastName", "last_name", "Apellido"]);
        if (!firstName && !lastName) continue;

        const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const exists = employees.some(
          emp => emp.first_name.toLowerCase() === firstName.toLowerCase() &&
                 emp.last_name.toLowerCase() === lastName.toLowerCase()
        );

        preview.push({
          first_name: firstName,
          last_name: lastName,
          email: findCol(row, ["Email", "email", "Correo"]),
          phone_number: findCol(row, ["Phone", "phone_number", "Teléfono", "Telefono"]),
          connecteam_employee_id: findCol(row, ["Employee ID", "Connecteam ID", "connecteam_employee_id"]),
          verification_ssn_ein: findCol(row, ["Verification SSN - EIN", "SSN", "EIN", "verification_ssn_ein"]),
          exists,
        });
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
      const { error } = await supabase.from("employees").insert({
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emp.email || null,
        phone_number: emp.phone_number || null,
        connecteam_employee_id: emp.connecteam_employee_id || null,
        verification_ssn_ein: emp.verification_ssn_ein || null,
      });
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
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(search.toLowerCase())
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
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Importar empleados</DialogTitle>
                <DialogDescription>Sube un archivo Excel con los datos de los empleados</DialogDescription>
              </DialogHeader>

              {importStep === "upload" && (
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    El archivo debe tener columnas: First name, Last name (mínimo)
                  </p>
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={handleImportFile}
                    className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer"
                  />
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
                          <TableHead className="text-xs">Email</TableHead>
                          <TableHead className="text-xs">SSN/EIN</TableHead>
                          <TableHead className="text-xs">Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.map((r, i) => (
                          <TableRow key={i} className={r.exists ? "opacity-50" : ""}>
                            <TableCell className="text-xs font-medium">{r.first_name} {r.last_name}</TableCell>
                            <TableCell className="text-xs">{r.email || "—"}</TableCell>
                            <TableCell className="text-xs font-mono">{r.verification_ssn_ein || "—"}</TableCell>
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

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nuevo empleado</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo empleado</DialogTitle>
                <DialogDescription>Ingresa los datos del nuevo empleado</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nombre</Label><Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} required /></div>
                  <div><Label>Apellido</Label><Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} required /></div>
                </div>
                <div><Label>Teléfono</Label><Input value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div><Label>Connecteam ID</Label><Input value={form.connecteam_employee_id} onChange={e => setForm(f => ({ ...f, connecteam_employee_id: e.target.value }))} /></div>
                <div><Label>SSN/EIN</Label><Input value={form.verification_ssn_ein} onChange={e => setForm(f => ({ ...f, verification_ssn_ein: e.target.value }))} /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : "Crear"}</Button>
              </form>
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
              <TableHead>Connecteam ID</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No hay empleados</TableCell></TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.first_name} {e.last_name}</TableCell>
                  <TableCell>{e.phone_number ?? "—"}</TableCell>
                  <TableCell>{e.email ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{e.connecteam_employee_id ?? "—"}</TableCell>
                  <TableCell>
                    <span className={e.is_active ? "earning-badge" : "deduction-badge"}>
                      {e.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}