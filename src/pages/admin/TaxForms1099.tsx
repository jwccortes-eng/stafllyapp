import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

interface Form1099 {
  id: string;
  employee_id: string;
  tax_year: number;
  total_compensation: number;
  nonemployee_compensation: number;
  status: string;
  generated_at: string | null;
  employee?: { first_name: string; last_name: string };
  w9?: { legal_name: string; tin_last4: string | null; address_line1: string | null; city: string | null; state: string | null; zip_code: string | null; tax_classification: string };
}

const THRESHOLD = 600;

export default function TaxForms1099() {
  const { selectedCompanyId: companyId } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(String(currentYear - 1));
  const [forms, setForms] = useState<Form1099[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchForms = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tax_forms_1099")
      .select("*, employee:employees!tax_forms_1099_employee_id_fkey(first_name, last_name)")
      .eq("company_id", companyId)
      .eq("tax_year", Number(taxYear)) as any;

    // Enrich with W-9 data
    const empIds = (data || []).map((d: any) => d.employee_id);
    let w9Map: Record<string, any> = {};
    if (empIds.length > 0) {
      const { data: w9s } = await supabase
        .from("contractor_w9")
        .select("employee_id, legal_name, tin_last4, address_line1, city, state, zip_code, tax_classification")
        .eq("company_id", companyId)
        .in("employee_id", empIds);
      (w9s || []).forEach((w: any) => { w9Map[w.employee_id] = w; });
    }

    setForms((data || []).map((d: any) => ({ ...d, w9: w9Map[d.employee_id] })));
    setLoading(false);
  }, [companyId, taxYear]);

  useEffect(() => { fetchForms(); }, [fetchForms]);

  async function generateAll() {
    if (!companyId) return;
    setGenerating(true);

    // Get all employees with W-9 approved
    const { data: w9s } = await supabase
      .from("contractor_w9")
      .select("employee_id, legal_name")
      .eq("company_id", companyId)
      .eq("status", "approved");

    if (!w9s || w9s.length === 0) {
      toast({ title: "Sin W-9 aprobados", description: "Primero aprueba los formularios W-9 de los contractors", variant: "destructive" });
      setGenerating(false);
      return;
    }

    const year = Number(taxYear);

    // Calculate total compensation per employee for the tax year
    // Sum from period_base_pay + movements for periods in that year
    const { data: periods } = await supabase
      .from("pay_periods")
      .select("id, start_date, end_date")
      .eq("company_id", companyId)
      .gte("start_date", `${year}-01-01`)
      .lte("end_date", `${year}-12-31`);

    const periodIds = (periods || []).map(p => p.id);

    if (periodIds.length === 0) {
      toast({ title: "Sin periodos", description: `No se encontraron periodos de nómina para el año ${year}`, variant: "destructive" });
      setGenerating(false);
      return;
    }

    // Get base pay per employee
    const { data: basePays } = await supabase
      .from("period_base_pay")
      .select("employee_id, base_total_pay")
      .eq("company_id", companyId)
      .in("period_id", periodIds);

    // Get movements (extras)
    const { data: movements } = await supabase
      .from("movements")
      .select("employee_id, total_value, concept:concepts!movements_concept_id_fkey(category)")
      .eq("company_id", companyId)
      .in("period_id", periodIds) as any;

    // Aggregate per employee
    const totals: Record<string, number> = {};
    (basePays || []).forEach(bp => {
      totals[bp.employee_id] = (totals[bp.employee_id] || 0) + Number(bp.base_total_pay || 0);
    });
    (movements || []).forEach((m: any) => {
      const sign = m.concept?.category === "deduction" ? -1 : 1;
      totals[m.employee_id] = (totals[m.employee_id] || 0) + Number(m.total_value || 0) * sign;
    });

    // Filter to W-9 employees and threshold
    const w9EmpIds = new Set(w9s.map(w => w.employee_id));
    const qualifying = Object.entries(totals)
      .filter(([empId, total]) => w9EmpIds.has(empId) && total >= THRESHOLD);

    if (qualifying.length === 0) {
      toast({ title: "Sin contractors elegibles", description: `Ningún contractor con W-9 aprobado alcanzó los $${THRESHOLD} en ${year}` });
      setGenerating(false);
      return;
    }

    // Upsert 1099 records
    const rows = qualifying.map(([empId, total]) => ({
      company_id: companyId,
      employee_id: empId,
      tax_year: year,
      total_compensation: Math.round(total * 100) / 100,
      nonemployee_compensation: Math.round(total * 100) / 100,
      status: "draft",
      generated_at: new Date().toISOString(),
      generated_by: user?.id,
    }));

    const { error } = await supabase.from("tax_forms_1099").upsert(rows, {
      onConflict: "company_id,employee_id,tax_year",
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${qualifying.length} formularios 1099-NEC generados` });
    }

    setGenerating(false);
    fetchForms();
  }

  function exportPdf(form: Form1099) {
    const doc = new jsPDF();
    const w9 = form.w9;

    doc.setFontSize(16);
    doc.text("1099-NEC — Nonemployee Compensation", 14, 20);
    doc.setFontSize(10);
    doc.text(`Tax Year: ${form.tax_year}`, 14, 30);
    doc.text(`Generated: ${form.generated_at ? new Date(form.generated_at).toLocaleDateString() : "—"}`, 14, 36);

    doc.setFontSize(12);
    doc.text("RECIPIENT", 14, 50);
    doc.setFontSize(10);
    doc.text(`Name: ${w9?.legal_name || `${form.employee?.first_name} ${form.employee?.last_name}`}`, 14, 58);
    doc.text(`TIN: ***-**-${w9?.tin_last4 || "????"}`, 14, 64);
    doc.text(`Address: ${w9?.address_line1 || ""}`, 14, 70);
    doc.text(`${w9?.city || ""}, ${w9?.state || ""} ${w9?.zip_code || ""}`, 14, 76);

    doc.setFontSize(12);
    doc.text("AMOUNTS", 14, 92);

    autoTable(doc, {
      startY: 98,
      head: [["Box", "Description", "Amount"]],
      body: [
        ["1", "Nonemployee compensation", `$${form.nonemployee_compensation.toLocaleString("en-US", { minimumFractionDigits: 2 })}`],
        ["", "Total compensation", `$${form.total_compensation.toLocaleString("en-US", { minimumFractionDigits: 2 })}`],
      ],
    });

    doc.setFontSize(8);
    doc.text("This is an informational copy. For official IRS filing, use authorized tax software.", 14, 280);

    const filename = `1099-NEC_${form.tax_year}_${form.employee?.last_name || "employee"}.pdf`;
    doc.save(filename);
  }

  async function exportExcel() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("1099-NEC");
    ws.addRow(["Employee", "Legal Name", "TIN Last 4", "Tax Classification", "Address", "City", "State", "ZIP", "Total Compensation", "Status"]);

    forms.forEach(f => {
      ws.addRow([
        `${f.employee?.first_name || ""} ${f.employee?.last_name || ""}`,
        f.w9?.legal_name || "",
        f.w9?.tin_last4 || "",
        f.w9?.tax_classification || "",
        f.w9?.address_line1 || "",
        f.w9?.city || "",
        f.w9?.state || "",
        f.w9?.zip_code || "",
        f.nonemployee_compensation,
        f.status,
      ]);
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `1099-NEC_${taxYear}_export.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalComp = forms.reduce((s, f) => s + Number(f.nonemployee_compensation), 0);
  const drafts = forms.filter(f => f.status === "draft").length;
  const finalized = forms.filter(f => f.status === "finalized").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Formularios 1099-NEC" subtitle="Generación y exportación de formularios fiscales anuales" />

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={taxYear} onValueChange={setTaxYear}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[currentYear - 1, currentYear - 2, currentYear - 3, currentYear].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={generateAll} disabled={generating} size="sm">
          <RefreshCw className={`h-4 w-4 mr-1 ${generating ? "animate-spin" : ""}`} />
          {generating ? "Calculando..." : "Generar 1099s"}
        </Button>
        {forms.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="h-4 w-4 mr-1" /> Exportar Excel
          </Button>
        )}
      </div>

      {forms.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label="Contractors" value={forms.length} icon={<FileText className="h-5 w-5" />} />
          <KpiCard label="Compensación total" value={`$${totalComp.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} icon={<CheckCircle className="h-5 w-5" />} />
          <KpiCard label="Borradores / Finalizados" value={`${drafts} / ${finalized}`} icon={<AlertTriangle className="h-5 w-5" />} />
        </div>
      )}

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Cargando...</CardContent></Card>
      ) : forms.length === 0 ? (
        <EmptyState icon={FileText} title={`Sin 1099s para ${taxYear}`} description="Genera los formularios con el botón 'Generar 1099s'" />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contractor</TableHead>
                <TableHead>Nombre legal</TableHead>
                <TableHead>TIN</TableHead>
                <TableHead className="text-right">Compensación</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map(f => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.employee?.first_name} {f.employee?.last_name}</TableCell>
                  <TableCell>{f.w9?.legal_name || "—"}</TableCell>
                  <TableCell>{f.w9?.tin_last4 ? `***-**-${f.w9.tin_last4}` : "—"}</TableCell>
                  <TableCell className="text-right font-mono">
                    ${f.nonemployee_compensation.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.status === "finalized" ? "default" : "outline"}>
                      {f.status === "draft" ? "Borrador" : "Finalizado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => exportPdf(f)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
