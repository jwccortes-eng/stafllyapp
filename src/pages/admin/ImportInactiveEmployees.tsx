import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface ParsedRow {
  first_name: string;
  last_name: string;
  email?: string;
  country_code?: string;
  phone_number?: string;
  gender?: string;
  start_date?: string;
  english_level?: string;
  employee_role?: string;
  qualify?: string;
  recommended_by?: string;
  direct_manager?: string;
  has_car?: string;
  driver_licence?: string;
  end_date?: string;
  connecteam_employee_id?: string;
  added_via?: string;
  added_by?: string;
  groups?: string;
  tags?: string;
}

function parseSemicolonCsv(text: string): ParsedRow[] {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  // Remove BOM
  let headerLine = lines[0].replace(/^\uFEFF/, "");
  
  const parseRow = (line: string): string[] => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ";" && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = parseRow(headerLine);

  const headerMap: Record<string, string> = {
    "First name": "first_name",
    "Last name": "last_name",
    "Email": "email",
    "Groups": "groups",
    "Tags": "tags",
    "Country code": "country_code",
    "Mobile phone": "phone_number",
    "Gender": "gender",
    "Start Date": "start_date",
    "English Level": "english_level",
    "Role": "employee_role",
    "Qualify": "qualify",
    "Recommended by?": "recommended_by",
    "Direct manager": "direct_manager",
    "You have car?": "has_car",
    "Driver Licence": "driver_licence",
    "End Date": "end_date",
    "Connecteam User ID": "connecteam_employee_id",
    "Added via": "added_via",
    "Added by": "added_by",
  };

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    const row: Record<string, string> = {};
    values.forEach((val, idx) => {
      const header = headers[idx];
      const dbKey = headerMap[header];
      if (dbKey) row[dbKey] = val;
    });
    if (row.first_name && row.last_name) {
      rows.push(row as unknown as ParsedRow);
    }
  }
  return rows;
}

function parseHtmlXls(html: string): ParsedRow[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return [];

  const headerCells = table.querySelectorAll("thead tr th");
  const headers: string[] = [];
  headerCells.forEach(th => headers.push(th.textContent?.trim() ?? ""));

  const headerMap: Record<string, string> = {
    "First name": "first_name",
    "Last name": "last_name",
    "Email": "email",
    "Groups": "groups",
    "Tags": "tags",
    "Country code": "country_code",
    "Mobile phone": "phone_number",
    "Gender": "gender",
    "Start Date": "start_date",
    "English Level": "english_level",
    "Role": "employee_role",
    "Qualify": "qualify",
    "Recommended by?": "recommended_by",
    "Direct manager": "direct_manager",
    "You have car?": "has_car",
    "Driver Licence": "driver_licence",
    "End Date": "end_date",
    "Connecteam User ID": "connecteam_employee_id",
    "Added via": "added_via",
    "Added by": "added_by",
  };

  const rows: ParsedRow[] = [];
  const bodyRows = table.querySelectorAll("tbody tr");

  bodyRows.forEach(tr => {
    const cells = tr.querySelectorAll("td");
    const row: Record<string, string> = {};

    cells.forEach((td, i) => {
      const header = headers[i];
      const dbKey = headerMap[header];
      if (dbKey) {
        row[dbKey] = td.textContent?.trim() ?? "";
      }
    });

    if (row.first_name && row.last_name) {
      rows.push(row as unknown as ParsedRow);
    }
  });

  return rows;
}

export default function ImportInactiveEmployees() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const html = evt.target?.result as string;
      const rows = parseHtmlXls(html);
      setParsedRows(rows);
      toast({
        title: `${rows.length} filas detectadas`,
        description: `Se encontraron ${rows.length} empleados en el archivo.`,
      });
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!selectedCompanyId || parsedRows.length === 0) return;
    setImporting(true);
    setResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("No autenticado");

      const res = await supabase.functions.invoke("import-inactive-employees", {
        body: {
          companyId: selectedCompanyId,
          rows: parsedRows,
        },
      });

      if (res.error) throw res.error;
      setResult(res.data);
      toast({
        title: "Importación completada",
        description: `${res.data.inserted} empleados inactivos creados.`,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Error al importar",
        variant: "destructive",
      });
    }
    setImporting(false);
  };

  const systemCount = parsedRows.filter(r =>
    r.first_name.toUpperCase() === "SYSTEM" || r.first_name.toUpperCase() === "CONECTEAM"
  ).length;

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Importar Empleados Inactivos" subtitle="Importar empleados archivados desde Connecteam como inactivos" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Subir archivo de empleados archivados (.xls)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="file"
            accept=".xls,.xlsx,.html"
            onChange={handleFileUpload}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
          />

          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                <p><strong>{parsedRows.length}</strong> filas totales encontradas</p>
                <p><strong>{systemCount}</strong> filas SYSTEM/CONECTEAM (se omitirán)</p>
                <p><strong>{parsedRows.length - systemCount}</strong> empleados a procesar</p>
              </div>

              <div className="border rounded-md overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Nombre</th>
                      <th className="p-2 text-left">Email</th>
                      <th className="p-2 text-left">Teléfono</th>
                      <th className="p-2 text-left">Connecteam ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 20).map((r, i) => (
                      <tr key={i} className={`border-t ${r.first_name.toUpperCase() === "SYSTEM" ? "opacity-40 line-through" : ""}`}>
                        <td className="p-2">{r.first_name} {r.last_name}</td>
                        <td className="p-2">{r.email}</td>
                        <td className="p-2">{r.phone_number}</td>
                        <td className="p-2">{r.connecteam_employee_id}</td>
                      </tr>
                    ))}
                    {parsedRows.length > 20 && (
                      <tr><td colSpan={4} className="p-2 text-center text-muted-foreground">... y {parsedRows.length - 20} más</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Button onClick={handleImport} disabled={importing} className="w-full">
                {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</> : `Importar ${parsedRows.length - systemCount} empleados como inactivos`}
              </Button>
            </div>
          )}

          {result && (
            <div className="rounded-md border p-4 space-y-2 bg-muted/50">
              <div className="flex items-center gap-2 text-sm font-medium">
                {result.success ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
                Resultado de la importación
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Insertados: <strong>{result.inserted}</strong></div>
                <div>SYSTEM omitidos: <strong>{result.skippedSystem}</strong></div>
                <div>Ya existentes: <strong>{result.skippedExisting}</strong></div>
                <div>Sin nombre: <strong>{result.skippedNoName}</strong></div>
                {result.errors > 0 && <div className="text-destructive">Errores: <strong>{result.errors}</strong></div>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
