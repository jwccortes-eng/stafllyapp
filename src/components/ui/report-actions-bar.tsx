import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Printer, Download, FileSpreadsheet, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReportActionsBarProps {
  /** Title shown in the print header */
  title: string;
  /** Subtitle / date range shown in the print header */
  subtitle?: string;
  /** Callback to generate CSV rows: returns [headers[], ...rows[]] */
  onExportCSV?: () => string[][] | Promise<string[][]>;
  /** Callback to generate XLSX — delegates to safe-xlsx */
  onExportXLSX?: () => void | Promise<void>;
  /** Optional: additional actions */
  children?: React.ReactNode;
  /** Applied filters summary for print header */
  filtersSummary?: string;
}

function downloadCSV(rows: string[][], filename: string) {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const escaped = String(cell ?? "").replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(","),
    )
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportActionsBar({
  title,
  subtitle,
  onExportCSV,
  onExportXLSX,
  children,
  filtersSummary,
}: ReportActionsBarProps) {
  const { toast } = useToast();

  const handlePrint = () => {
    // Inject a temporary print header
    const header = document.createElement("div");
    header.id = "print-header";
    header.className = "print-header";
    header.innerHTML = `
      <div style="padding: 16px 0; border-bottom: 2px solid #333; margin-bottom: 16px;">
        <h1 style="font-size: 18px; font-weight: 700; margin: 0;">${title}</h1>
        ${subtitle ? `<p style="font-size: 13px; color: #666; margin: 4px 0 0;">${subtitle}</p>` : ""}
        ${filtersSummary ? `<p style="font-size: 11px; color: #888; margin: 2px 0 0;">Filtros: ${filtersSummary}</p>` : ""}
        <p style="font-size: 10px; color: #999; margin: 4px 0 0;">Generado: ${new Date().toLocaleString("es-US")}</p>
      </div>
    `;

    const main = document.querySelector("main") || document.body;
    main.prepend(header);

    window.print();

    // Clean up after print
    setTimeout(() => {
      header.remove();
    }, 500);
  };

  const handleCSV = async () => {
    if (!onExportCSV) return;
    try {
      const rows = await onExportCSV();
      const filename = `${title.replace(/\s+/g, "_").toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCSV(rows, filename);
      toast({ title: "CSV exportado", description: `${rows.length - 1} filas` });
    } catch (err) {
      toast({ title: "Error al exportar", variant: "destructive" });
    }
  };

  const handleXLSX = async () => {
    if (!onExportXLSX) return;
    try {
      await onExportXLSX();
      toast({ title: "Excel exportado" });
    } catch (err) {
      toast({ title: "Error al exportar", variant: "destructive" });
    }
  };

  const hasExport = !!onExportCSV || !!onExportXLSX;

  return (
    <div className="flex items-center gap-2 flex-wrap print:hidden">
      <Button variant="outline" size="sm" onClick={handlePrint}>
        <Printer className="h-4 w-4 mr-1.5" />
        Imprimir
      </Button>

      {hasExport && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1.5" />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onExportCSV && (
              <DropdownMenuItem onClick={handleCSV}>
                <FileText className="h-4 w-4 mr-2" />
                CSV
              </DropdownMenuItem>
            )}
            {onExportXLSX && (
              <DropdownMenuItem onClick={handleXLSX}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel (.xlsx)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {children}
    </div>
  );
}
